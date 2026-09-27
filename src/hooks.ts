import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { behindBy, closePR, errorMessage, merge } from "./gh.ts";
import type { MergeMethod, PR } from "./gh.ts";
import { C } from "./theme.ts";
import type { Flash } from "./theme.ts";

export type PendingKind = "merge" | "close";

interface Pending {
  kind: PendingKind;
  pr: PR;
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

const VERBS: Record<PendingKind, { doing: string; done: string }> = {
  close: { doing: "Closing", done: "Closed" },
  merge: { doing: "Merging", done: "Merged" },
};

// merge and close wait a few seconds before running, so they can be undone like Superhuman's undo send
export const usePendingAction = ({
  repo,
  method,
  delay,
  flash,
  setPrs,
}: {
  repo: string;
  method: MergeMethod;
  delay: number;
  flash: Flash;
  setPrs: Dispatch<SetStateAction<PR[] | null>>;
}) => {
  // only read from handlers, so it doesn't need to be state
  const pending = useRef<Pending | null>(null);

  const reinsert = (p: Pending) =>
    setPrs((cur) => {
      const next = [...(cur ?? [])];
      next.splice(Math.min(p.index, next.length), 0, p.pr);
      return next;
    });

  const run = async (p: Pending) => {
    pending.current = null;
    const verb = VERBS[p.kind];
    flash(`${verb.doing} #${p.pr.number}…`, C.yellow);
    try {
      await (p.kind === "merge"
        ? merge(repo, p.pr.number, method)
        : closePR(repo, p.pr.number));
      flash(`✓ ${verb.done} #${p.pr.number} ${p.pr.title}`, C.green);
    } catch (error) {
      reinsert(p);
      flash(`✗ #${p.pr.number}: ${errorMessage(error)}`, C.red);
    }
  };

  const queue = (kind: PendingKind, target: PR, all: PR[]) => {
    // a second action flushes the first immediately
    if (pending.current) {
      clearTimeout(pending.current.timer);
      run(pending.current);
    }
    const p: Pending = {
      index: all.indexOf(target),
      kind,
      pr: target,
      timer: setTimeout(() => run(p), delay * 1000),
    };
    pending.current = p;
    setPrs(all.filter((x) => x !== target));
    const how = kind === "merge" ? ` (${method})` : "";
    flash(
      `${VERBS[kind].doing} #${target.number} in ${delay}s${how} · z to undo`,
      C.yellow
    );
  };

  const undo = () => {
    const p = pending.current;
    if (!p) {
      flash("Nothing to undo", C.dim);
      return;
    }
    clearTimeout(p.timer);
    pending.current = null;
    reinsert(p);
    flash(`↶ Undid ${p.kind} of #${p.pr.number}`, C.cyan);
  };

  // quitting runs whatever is pending right away rather than dropping it
  const flush = async () => {
    const p = pending.current;
    if (p) {
      clearTimeout(p.timer);
      await run(p);
    }
  };

  const pendingNumber = () => pending.current?.pr.number;

  return { flush, pendingNumber, queue, undo };
};

const branchKey = (pr: PR) => `${pr.number}:${pr.headRefName}`;

// how far each PR's branch is behind its base, looked up once per PR as it's selected
export const useBehind = (repo: string, pr: PR | undefined) => {
  const [cache, setCache] = useState<Record<string, number>>({});
  const key = pr ? branchKey(pr) : "";

  useEffect(() => {
    if (!pr || key in cache) {
      return;
    }
    let live = true;
    const load = async () => {
      let n: number;
      try {
        n = await behindBy(repo, pr);
      } catch {
        // unknown; the sidebar just leaves the line out
        n = -1;
      }
      if (live) {
        setCache((c) => ({ ...c, [key]: n }));
      }
    };
    load();
    return () => {
      live = false;
    };
  }, [repo, pr, key, cache]);

  const markUpToDate = (p: PR) =>
    setCache((c) => ({ ...c, [branchKey(p)]: 0 }));

  return { behind: pr ? cache[key] : undefined, markUpToDate };
};

export interface DiffTarget {
  key: string;
  load: () => Promise<string>;
}

// loads a diff whenever the target changes; a diff for an old target reads as still loading
export const useDiff = (target: DiffTarget | null) => {
  const [diff, setDiff] = useState<{ key: string; lines: string[] } | null>(
    null
  );
  const key = target?.key;
  const load = useEffectEvent(() => target?.load() ?? Promise.resolve(""));

  useEffect(() => {
    if (!key) {
      return;
    }
    let live = true;
    const run = async () => {
      let lines: string[];
      try {
        const text = await load();
        lines = text.replaceAll("\t", "  ").split("\n");
      } catch (error) {
        lines = [`✗ ${errorMessage(error)}`];
      }
      if (live) {
        setDiff({ key, lines });
      }
    };
    run();
    return () => {
      live = false;
    };
  }, [key]);

  return diff && diff.key === key ? diff.lines : null;
};
