// A stack is a chain where one PR's base is another's head (gh-stack, Graphite),
// or one of GitHub's native stacks.

import type { PR } from "./github/prs.ts";

export interface Stack {
  // bottom first
  members: PR[];
  native: number | null;
}

export interface StackPlace {
  stack: Stack;
  index: number;
}

// numbers and branches are only unique per repo
export const prKey = (pr: PR) => `${pr.repo}#${pr.number}`;

const branchKey = (repo: string, branch: string) => `${repo}\u0000${branch}`;

const parentOf = (pr: PR, byHead: Map<string, PR>) => {
  const parent = byHead.get(branchKey(pr.repo, pr.baseRefName));
  return parent && parent !== pr ? parent : undefined;
};

export const ancestry = (pr: PR, byHead: Map<string, PR>) => {
  const chain = [pr];
  const seen = new Set([pr.number]);
  let parent = parentOf(pr, byHead);
  while (parent && !seen.has(parent.number)) {
    chain.push(parent);
    seen.add(parent.number);
    parent = parentOf(parent, byHead);
  }
  return chain;
};

// a fork's branch can't be the base of a PR here
export const headIndex = (prs: PR[]) =>
  new Map(
    prs
      .filter((p) => !p.isCrossRepository)
      .map((p) => [branchKey(p.repo, p.headRefName), p])
  );

const chainStacks = (prs: PR[]): Stack[] => {
  const byHead = headIndex(prs);
  const bottoms = new Map<number, PR[]>();
  for (const pr of prs) {
    const chain = ancestry(pr, byHead);
    const bottom = chain.at(-1) ?? pr;
    const members = bottoms.get(bottom.number) ?? [];
    members.push(pr);
    bottoms.set(bottom.number, members);
  }
  return [...bottoms.values()]
    .filter((members) => members.length > 1)
    .map((members) => ({
      members: members.toSorted(
        (a, b) => ancestry(a, byHead).length - ancestry(b, byHead).length
      ),
      native: null,
    }));
};

const nativeStacks = (prs: PR[]): Stack[] => {
  const byNumber = new Map<string, PR[]>();
  for (const pr of prs) {
    if (pr.stackNumber !== null) {
      const key = `${pr.repo}#${pr.stackNumber}`;
      byNumber.set(key, [...(byNumber.get(key) ?? []), pr]);
    }
  }
  return [...byNumber.values()].map((members) => ({
    members: members.toSorted(
      (a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)
    ),
    native: members[0]?.stackNumber ?? null,
  }));
};

// native stacks win over inferred chains
export const findStacks = (prs: PR[]): Map<string, StackPlace> => {
  const places = new Map<string, StackPlace>();
  for (const stack of [...nativeStacks(prs), ...chainStacks(prs)]) {
    if (stack.members.some((m) => places.has(prKey(m)))) {
      continue;
    }
    for (const [index, pr] of stack.members.entries()) {
      places.set(prKey(pr), { index, stack });
    }
  }
  return places;
};

export const groupStacks = (prs: PR[], places: Map<string, StackPlace>) => {
  const out: PR[] = [];
  const shown = new Set<string>();
  for (const pr of prs) {
    if (shown.has(prKey(pr))) {
      continue;
    }
    const place = places.get(prKey(pr));
    const group = place ? place.stack.members.toReversed() : [pr];
    for (const member of group) {
      if (prs.includes(member)) {
        out.push(member);
        shown.add(prKey(member));
      }
    }
  }
  return out;
};

export const mergePlan = (pr: PR, places: Map<string, StackPlace>) => {
  const place = places.get(prKey(pr));
  if (!place) {
    return [pr];
  }
  return place.stack.members.slice(0, place.index + 1).toReversed();
};
