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

const parentOf = (pr: PR, byHead: Map<string, PR>) => {
  const parent = byHead.get(pr.baseRefName);
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
    prs.filter((p) => !p.isCrossRepository).map((p) => [p.headRefName, p])
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
  const byNumber = new Map<number, PR[]>();
  for (const pr of prs) {
    if (pr.stackNumber !== null) {
      byNumber.set(pr.stackNumber, [
        ...(byNumber.get(pr.stackNumber) ?? []),
        pr,
      ]);
    }
  }
  return [...byNumber.entries()].map(([native, members]) => ({
    members: members.toSorted(
      (a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)
    ),
    native,
  }));
};

// every stack among these PRs, keyed by PR number; native stacks win over inferred chains
export const findStacks = (prs: PR[]): Map<number, StackPlace> => {
  const places = new Map<number, StackPlace>();
  for (const stack of [...nativeStacks(prs), ...chainStacks(prs)]) {
    if (stack.members.some((m) => places.has(m.number))) {
      continue;
    }
    for (const [index, pr] of stack.members.entries()) {
      places.set(pr.number, { index, stack });
    }
  }
  return places;
};

// stacks shown together, top first, where their first member would have appeared
export const groupStacks = (prs: PR[], places: Map<number, StackPlace>) => {
  const out: PR[] = [];
  const shown = new Set<number>();
  for (const pr of prs) {
    if (shown.has(pr.number)) {
      continue;
    }
    const place = places.get(pr.number);
    const group = place ? place.stack.members.toReversed() : [pr];
    for (const member of group) {
      if (prs.includes(member)) {
        out.push(member);
        shown.add(member.number);
      }
    }
  }
  return out;
};

// what merging a PR takes with it: the PR and everything below it in its stack, top first
export const mergePlan = (pr: PR, places: Map<number, StackPlace>) => {
  const place = places.get(pr.number);
  if (!place) {
    return [pr];
  }
  return place.stack.members.slice(0, place.index + 1).toReversed();
};
