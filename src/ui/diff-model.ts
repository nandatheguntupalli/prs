import type { Side, Thread } from "../github/comments.ts";

export type Row =
  | { kind: "meta"; text: string }
  | { kind: "file"; path: string; additions: number; deletions: number }
  | { kind: "hunk"; text: string }
  | {
      kind: "line";
      path: string;
      sign: "+" | "-" | " ";
      text: string;
      old: number | null;
      new: number | null;
    }
  | {
      kind: "comment";
      thread: Thread;
      part: "head" | "body";
      // first row of the thread; n and p jump here
      first: boolean;
      text: string;
      author: string;
      createdAt: string;
      outdated: boolean;
    };

export interface ParsedDiff {
  rows: Row[];
  files: { path: string; additions: number; deletions: number }[];
}

const pathOf = (header: string) => {
  const match = / b\/(?<path>.+)$/u.exec(header);
  return match?.groups?.path ?? header;
};

const HUNK = /^@@ -(?<old>\d+)(?:,\d+)? \+(?<new>\d+)(?:,\d+)? @@/u;

const NOISE =
  /^(?:index |--- |\+\+\+ |similarity index|rename from|rename to|new file mode|deleted file mode|old mode|new mode)/u;

export const parseDiff = (text: string): ParsedDiff => {
  const rows: Row[] = [];
  const files: ParsedDiff["files"] = [];
  let path = "";
  let oldLine = 0;
  let newLine = 0;
  let file: { path: string; additions: number; deletions: number } | null =
    null;

  for (const raw of text.replaceAll("\t", "  ").split("\n")) {
    if (raw.startsWith("diff --git")) {
      path = pathOf(raw);
      file = { additions: 0, deletions: 0, path };
      files.push(file);
      rows.push({ kind: "file", ...file });
      continue;
    }
    const hunk = HUNK.exec(raw);
    if (hunk) {
      oldLine = Number(hunk.groups?.old);
      newLine = Number(hunk.groups?.new);
      rows.push({ kind: "hunk", text: raw });
      continue;
    }
    if (!file || NOISE.test(raw)) {
      // a commit diff starts with its message; keep it
      if (!file) {
        rows.push({ kind: "meta", text: raw });
      }
      continue;
    }
    const [sign] = raw;
    if (sign === "+") {
      file.additions += 1;
      rows.push({
        kind: "line",
        new: newLine,
        old: null,
        path,
        sign: "+",
        text: raw.slice(1),
      });
      newLine += 1;
    } else if (sign === "-") {
      file.deletions += 1;
      rows.push({
        kind: "line",
        new: null,
        old: oldLine,
        path,
        sign: "-",
        text: raw.slice(1),
      });
      oldLine += 1;
    } else if (sign === " ") {
      rows.push({
        kind: "line",
        new: newLine,
        old: oldLine,
        path,
        sign: " ",
        text: raw.slice(1),
      });
      oldLine += 1;
      newLine += 1;
    } else if (raw) {
      rows.push({ kind: "meta", text: raw });
    }
  }
  for (const row of rows) {
    if (row.kind === "file") {
      const f = files.find((x) => x.path === row.path);
      row.additions = f?.additions ?? 0;
      row.deletions = f?.deletions ?? 0;
    }
  }
  return { files, rows };
};

export const anchorOf = (
  row: Row
): { path: string; line: number; side: Side } | null => {
  if (row.kind !== "line") {
    return null;
  }
  if (row.sign === "-" && row.old !== null) {
    return { line: row.old, path: row.path, side: "LEFT" };
  }
  return row.new === null
    ? null
    : { line: row.new, path: row.path, side: "RIGHT" };
};

const wrap = (text: string, width: number) => {
  const out: string[] = [];
  for (const para of text.replaceAll("\r", "").split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (line && line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
};

const threadRows = (thread: Thread, width: number, outdated: boolean): Row[] =>
  thread.comments.flatMap((c, i): Row[] => {
    const base = {
      author: c.author,
      createdAt: c.createdAt,
      kind: "comment" as const,
      outdated,
      thread,
    };
    return [
      { ...base, first: i === 0, part: "head", text: "" },
      ...wrap(c.body, Math.max(20, width)).map((text) => ({
        ...base,
        first: false,
        part: "body" as const,
        text,
      })),
    ];
  });

// outdated threads have no line anymore, so they go under the file header
export const withThreads = (
  rows: Row[],
  threads: Thread[],
  width: number
): Row[] => {
  const byAnchor = new Map<string, Thread[]>();
  const outdated = new Map<string, Thread[]>();
  for (const t of threads) {
    if (t.line === null) {
      outdated.set(t.path, [...(outdated.get(t.path) ?? []), t]);
    } else {
      const key = `${t.path}:${t.side}:${t.line}`;
      byAnchor.set(key, [...(byAnchor.get(key) ?? []), t]);
    }
  }
  return rows.flatMap((row): Row[] => {
    if (row.kind === "file") {
      const old = outdated.get(row.path) ?? [];
      return [row, ...old.flatMap((t) => threadRows(t, width, true))];
    }
    const anchor = anchorOf(row);
    const here = anchor
      ? byAnchor.get(`${anchor.path}:${anchor.side}:${anchor.line}`)
      : undefined;
    return here
      ? [row, ...here.flatMap((t) => threadRows(t, width, false))]
      : [row];
  });
};

// test files, specs, snapshots and fixtures, across the common layouts
const TEST_PATH =
  /(?:^|\/)(?:__tests__|__snapshots__|__mocks__|tests?|specs?|e2e|fixtures|testdata)\/|(?:^|\/)test_[^/]+\.py$|[._-](?:test|spec)s?\.[^/]+$|_test\.go$|\.snap$/u;

export const isTestPath = (path: string) => TEST_PATH.test(path);

// Code first, the way Linear does it: tests are hidden until you ask for them.
export const withoutTests = (diff: ParsedDiff): ParsedDiff => {
  const rows: Row[] = [];
  let keep = true;
  for (const row of diff.rows) {
    if (row.kind === "file") {
      keep = !isTestPath(row.path);
    }
    if (keep) {
      rows.push(row);
    }
  }
  return { files: diff.files.filter((f) => !isTestPath(f.path)), rows };
};
