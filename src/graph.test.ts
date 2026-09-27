import { describe, expect, test } from "bun:test";

import { layout } from "./graph.ts";
import type { Commit } from "./graph.ts";

const commit = (
  hash: string,
  parents: string[],
  refs: string[] = []
): Commit => ({
  author: "a",
  date: "",
  hash,
  parents,
  refs,
  short: hash,
  subject: hash,
});

// renders just the graph characters, trimmed, one line per commit
const draw = (commits: Commit[]) =>
  layout(commits).map(
    (row) =>
      `${row.cells
        .map((c) => c.ch)
        .join("")
        .trimEnd()} ${row.commit.hash}`
  );

describe("layout", () => {
  test("a straight line of commits stays in one lane", () => {
    expect(
      draw([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])])
    ).toEqual(["● c", "● b", "● a"]);
  });

  test("a merge opens a lane for the second parent, which joins back where it forked", () => {
    // m merges feature (f2 -> f1) into main (b), both forked from a
    expect(
      draw([
        commit("m", ["b", "f2"]),
        commit("f2", ["f1"]),
        commit("f1", ["a"]),
        commit("b", ["a"]),
        commit("a", []),
      ])
    ).toEqual(["◉─╮ m", "│ ● f2", "│ ● f1", "● │ b", "●─╯ a"]);
  });

  test("a branch tip gets its own lane and joins its fork point", () => {
    expect(
      draw([commit("b", ["a"]), commit("x", ["a"]), commit("a", [])])
    ).toEqual(["● b", "│ ● x", "●─╯ a"]);
  });

  test("a connector crossing another lane stays unbroken", () => {
    // y and v both come off z; w's lane (waiting for q) sits between them when v joins z
    expect(
      draw([
        commit("y", ["z"]),
        commit("w", ["q"]),
        commit("v", ["z"]),
        commit("z", []),
        commit("q", []),
      ])
    ).toEqual(["● y", "│ ● w", "│ │ ● v", "●─┼─╯ z", "  ● q"]);
  });

  test("HEAD is drawn hollow", () => {
    expect(draw([commit("c", [], ["HEAD -> main"])])).toEqual(["○ c"]);
  });

  test("lanes get distinct colors", () => {
    const rows = layout([
      commit("b", ["a"]),
      commit("x", ["a"]),
      commit("a", []),
    ]);
    expect(rows[0]?.color).not.toBe(rows[1]?.color);
  });
});
