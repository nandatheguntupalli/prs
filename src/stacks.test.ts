import { describe, expect, test } from "bun:test";

import type { PR } from "./gh.ts";
import { findStacks, groupStacks, mergePlan } from "./stacks.ts";

const pr = (
  number: number,
  head: string,
  base = "main",
  extra: Partial<PR> = {}
): PR => ({
  additions: 0,
  author: "a",
  baseRefName: base,
  body: "",
  changedFiles: 0,
  checks: "none",
  createdAt: "",
  deletions: 0,
  headOwner: "o",
  headRefName: head,
  id: `PR_${number}`,
  isCrossRepository: false,
  isDraft: false,
  mergeable: "MERGEABLE",
  number,
  reviewDecision: "",
  reviewRequests: [],
  stackNumber: null,
  stackPosition: null,
  title: head,
  url: "",
  ...extra,
});

// main <- models (#1) <- api (#2) <- ui (#3), plus an unrelated #4
const models = pr(1, "models");
const api = pr(2, "api", "models");
const ui = pr(3, "ui", "api");
const fix = pr(4, "fix");
const numbers = (prs: PR[]) => prs.map((p) => p.number);

describe("stacks", () => {
  test("a chain of base branches is one stack, bottom first", () => {
    const places = findStacks([ui, fix, api, models]);
    expect(numbers(places.get(2)?.stack.members ?? [])).toEqual([1, 2, 3]);
    expect(places.get(2)?.index).toBe(1);
    expect(places.has(4)).toBe(false);
  });

  test("stacks are grouped top first where their first member appeared", () => {
    const list = [fix, api, models, ui];
    expect(numbers(groupStacks(list, findStacks(list)))).toEqual([4, 3, 2, 1]);
  });

  test("merging a PR takes everything below it, top first", () => {
    const places = findStacks([models, api, ui]);
    expect(numbers(mergePlan(api, places))).toEqual([2, 1]);
    expect(numbers(mergePlan(ui, places))).toEqual([3, 2, 1]);
    expect(numbers(mergePlan(models, places))).toEqual([1]);
    expect(numbers(mergePlan(fix, places))).toEqual([4]);
  });

  test("a native stack uses GitHub's order even without a base chain", () => {
    const a = pr(10, "a", "main", { stackNumber: 7, stackPosition: 2 });
    const b = pr(11, "b", "main", { stackNumber: 7, stackPosition: 1 });
    const place = findStacks([a, b]).get(10);
    expect(place?.stack.native).toBe(7);
    expect(numbers(place?.stack.members ?? [])).toEqual([11, 10]);
  });

  test("a fork's branch with the same name doesn't make a stack", () => {
    const forked = pr(5, "models", "main", { isCrossRepository: true });
    const onFork = pr(6, "feature", "models");
    expect(findStacks([forked, onFork]).size).toBe(0);
  });
});
