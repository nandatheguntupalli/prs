import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import pkg from "../package.json";
import type { PR } from "./github/prs.ts";

// The last lists fetched for a scope, shown on launch while fresh ones load.
// Keyed by query, so a section whose filter changed doesn't show the old results.
export type ListCache = Record<string, PR[]>;

interface CacheFile {
  // the PR shape can change between releases
  version: string;
  lists: ListCache;
}

const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const dir = () =>
  path.join(
    process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"),
    "prs",
    "lists"
  );

// owners can't contain dots, so owner.repo can't collide; "@" can't start either
const file = (scope: string) =>
  path.join(dir(), `${scope ? scope.replace("/", ".") : "@all"}.json`);

export const loadCache = async (scope: string): Promise<ListCache> => {
  try {
    const saved: CacheFile = await Bun.file(file(scope)).json();
    return saved.version === pkg.version ? saved.lists : {};
  } catch {
    return {};
  }
};

const prune = async () => {
  const cutoff = Date.now() - PRUNE_AFTER_MS;
  const names = await readdir(dir());
  await Promise.all(
    names.map(async (name) => {
      const full = path.join(dir(), name);
      const { mtimeMs } = await stat(full);
      if (mtimeMs < cutoff) {
        await rm(full, { force: true });
      }
    })
  );
};

export const saveCache = async (scope: string, lists: ListCache) => {
  try {
    await mkdir(dir(), { recursive: true });
    const saved: CacheFile = { lists, version: pkg.version };
    await Bun.write(file(scope), JSON.stringify(saved));
    await prune();
  } catch {
    // the cache only speeds up launch, so losing it is fine
  }
};
