// Finds stacked PRs: chains where one PR's base branch is another PR's head branch, the way
// gh-stack, Graphite and friends build them, or GitHub's own native stacks when a repo has them.

import type { PR } from "./gh.ts";

export interface Stack {
  // bottom (closest to the trunk) first
  members: PR[];
  // GitHub's stack number, when this is a native stack
  native: number | null;
}

export interface StackPlace {
  stack: Stack;
  // 0 is the bottom
  index: number;
}

// PR numbers are only unique within a repo, and a list can mix repos
export const prKey = (pr: PR) => `${pr.repo}#${pr.number}`;

// branches are only unique within a repo too
const branchKey = (repo: string, branch: string) => `${repo}\u0000${branch}`;

const parentOf = (pr: PR, byHead: Map<string, PR>) => {
  const parent = byHead.get(branchKey(pr.repo, pr.baseRefName));
  return parent && parent !== pr ? parent : undefined;
};

// the chain from a PR down to the bottom of its stack, top first
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

// branches in forks can't be the base of another PR here, so only same-repo heads count
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
      // deeper in the chain is higher in the stack
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
      // stack numbers are per repo too
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

// every stack among these PRs, keyed by PR number; native stacks win over inferred chains
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

// stacks shown together, top first, where their first member would have appeared
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

// what merging a PR takes with it: the PR and everything below it in its stack, top first
export const mergePlan = (pr: PR, places: Map<string, StackPlace>) => {
  const place = places.get(prKey(pr));
  if (!place) {
    return [pr];
  }
  return place.stack.members.slice(0, place.index + 1).toReversed();
};
