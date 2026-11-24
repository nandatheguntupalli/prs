import { describe, expect, test } from "bun:test";

import type { Thread } from "../github/comments.ts";
import {
  anchorOf,
  isTestPath,
  parseDiff,
  withoutTests,
  withThreads,
} from "./diff-model.ts";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ export const a
 keep
-old line
+new line
 tail
diff --git a/README.md b/README.md
new file mode 100644
@@ -0,0 +1 @@
+hello`;

const thread = (
  path: string,
  line: number | null,
  side: "LEFT" | "RIGHT" = "RIGHT"
): Thread => ({
  comments: [{ author: "ann", body: "looks off", createdAt: "", id: 1 }],
  id: 1,
  line,
  path,
  side,
  startLine: null,
});

describe("parseDiff", () => {
  const { files, rows } = parseDiff(DIFF);

  test("finds each file with its counts", () => {
    expect(files).toEqual([
      { additions: 1, deletions: 1, path: "src/a.ts" },
      { additions: 1, deletions: 0, path: "README.md" },
    ]);
  });

  test("numbers lines on both sides and drops index / --- / +++ noise", () => {
    const lines = rows.filter((r) => r.kind === "line");
    expect(
      lines.map((r) => r.kind === "line" && [r.sign, r.old, r.new])
    ).toEqual([
      [" ", 1, 1],
      ["-", 2, null],
      ["+", null, 2],
      [" ", 3, 3],
      ["+", null, 1],
    ]);
    expect(
      rows.some((r) => r.kind === "meta" && r.text.startsWith("index"))
    ).toBe(false);
  });

  test("a removed line anchors on the old side, everything else on the new", () => {
    const [keep, removed, added] = rows.filter((r) => r.kind === "line");
    expect(keep && anchorOf(keep)).toEqual({
      line: 1,
      path: "src/a.ts",
      side: "RIGHT",
    });
    expect(removed && anchorOf(removed)).toEqual({
      line: 2,
      path: "src/a.ts",
      side: "LEFT",
    });
    expect(added && anchorOf(added)).toEqual({
      line: 2,
      path: "src/a.ts",
      side: "RIGHT",
    });
  });
});

describe("withThreads", () => {
  const { rows } = parseDiff(DIFF);

  test("puts a thread right under its line", () => {
    const out = withThreads(rows, [thread("src/a.ts", 2)], 40);
    const at = out.findIndex((r) => r.kind === "comment");
    const before = out[at - 1];
    expect(before?.kind === "line" && before.sign).toBe("+");
    const [head, body] = [out[at], out[at + 1]];
    expect(head?.kind === "comment" && head.part).toBe("head");
    expect(body?.kind === "comment" && body.text).toBe("looks off");
  });

  test("an outdated thread goes under its file's header", () => {
    const out = withThreads(rows, [thread("README.md", null)], 40);
    const header = out.findIndex(
      (r) => r.kind === "file" && r.path === "README.md"
    );
    const next = out[header + 1];
    expect(next?.kind === "comment" && next.outdated).toBe(true);
  });
});

describe("tests", () => {
  test("spots test files across layouts", () => {
    for (const path of [
      "src/a.test.ts",
      "src/a.spec.tsx",
      "pkg/a_test.go",
      "tests/test_a.py",
      "app/__tests__/a.js",
      "test/helper.rb",
      "src/__snapshots__/a.snap",
    ]) {
      expect(isTestPath(path)).toBe(true);
    }
    for (const path of [
      "src/a.ts",
      "src/testing.ts",
      "README.md",
      "latest.ts",
    ]) {
      expect(isTestPath(path)).toBe(false);
    }
  });

  test("withoutTests drops test files and their lines", () => {
    const diff = parseDiff(`${DIFF}
diff --git a/src/a.test.ts b/src/a.test.ts
@@ -1 +1 @@
-expect(1)
+expect(2)`);
    const { files, rows } = withoutTests(diff);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "README.md"]);
    expect(rows.some((r) => "path" in r && r.path === "src/a.test.ts")).toBe(
      false
    );
    expect(rows.at(-1)).toMatchObject({ kind: "line", text: "hello" });
  });
});
