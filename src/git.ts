import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { Commit } from "./graph.ts";

const run = async (cmd: string[]): Promise<string> => {
  const proc = Bun.spawn(cmd, {
    stderr: "pipe",
    stdin: "ignore",
    stdout: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(err.trim().split("\n")[0] || `${cmd[0]} exited ${code}`);
  }
  return out;
};

const git = (dir: string, args: string[]) => run(["git", "-C", dir, ...args]);

// the working copy we were started in, if it's a clone of the repo we're showing
export const localCheckout = async (): Promise<string | null> => {
  try {
    const out = await git(process.cwd(), ["rev-parse", "--show-toplevel"]);
    return out.trim();
  } catch {
    return null;
  }
};

const cacheDir = (repo: string) =>
  path.join(
    process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"),
    "prs",
    `${repo}.git`
  );

export interface Source {
  dir: string;
  // a bare clone we manage, as opposed to the user's own checkout
  cached: boolean;
}

// a bare, blobless clone: all the history for the graph, file contents only fetched for diffs
export const ensureCache = async (repo: string): Promise<Source> => {
  const dir = cacheDir(repo);
  if (!(await Bun.file(path.join(dir, "HEAD")).exists())) {
    await mkdir(path.dirname(dir), { recursive: true });
    await run([
      "gh",
      "repo",
      "clone",
      repo,
      dir,
      "--",
      "--bare",
      "--filter=blob:none",
      "--quiet",
    ]);
  }
  return { cached: true, dir };
};

export const fetchLatest = (source: Source) =>
  source.cached
    ? git(source.dir, [
        "fetch",
        "--prune",
        "--quiet",
        "origin",
        "+refs/heads/*:refs/heads/*",
      ])
    : git(source.dir, ["fetch", "--prune", "--quiet"]);

const FIELD = "\u001F";
const RECORD = "\u001E";

export const loadCommits = async (source: Source, limit = 500) => {
  const out = await git(source.dir, [
    "log",
    "--branches",
    "--remotes",
    "--tags",
    "HEAD",
    "--topo-order",
    `-n${limit}`,
    `--format=%H${FIELD}%h${FIELD}%P${FIELD}%an${FIELD}%D${FIELD}%s${FIELD}%cr${RECORD}`,
  ]);
  return out
    .split(RECORD)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((record): Commit => {
      const [
        hash = "",
        short = "",
        parents = "",
        author = "",
        refs = "",
        subject = "",
        date = "",
      ] = record.split(FIELD);
      return {
        author,
        date,
        hash,
        parents: parents ? parents.split(" ") : [],
        refs: refs ? refs.split(", ") : [],
        short,
        subject,
      };
    });
};

export const showCommit = (source: Source, hash: string) =>
  git(source.dir, [
    "show",
    "--stat",
    "--patch",
    "--format=%H%n%an <%ae>%n%ad%n%n%B",
    hash,
  ]);
