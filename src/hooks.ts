import { useEffect, useEffectEvent, useRef, useState } from "react";

import { errorMessage } from "./github/client.ts";
import {
  behindBy,
  closePR,
  listRepoPRs,
  merge,
  searchPRs,
} from "./github/prs.ts";
import type { MergeMethod, PR } from "./github/prs.ts";
import { prKey } from "./stacks.ts";
import { C } from "./theme.ts";
import type { Flash } from "./theme.ts";

// loads something async for `key` (null skips); a value for an old key reads as not loaded yet
export const useLoader = <T>(key: string | null, load: () => Promise<T>) => {
  const [state, setState] = useState<{
    key: string;
    value: T | null;
    error: string;
  } | null>(null);
  const [nonce, setNonce] = useState(0);
  const run = useEffectEvent(load);
  // bumping the counter reloads the same key
  const request = key === null ? null : `${key}\u0000${nonce}`;

  useEffect(() => {
    if (request === null || key === null) {
      return;
    }
    let live = true;
    const go = async () => {
      try {
        const value = await run();
        if (live) {
          setState({ error: "", key, value });
        }
      } catch (error) {
        if (live) {
          setState({ error: errorMessage(error), key, value: null });
        }
      }
    };
    go();
    return () => {
      live = false;
    };
  }, [key, request]);

  const current = state && state.key === key ? state : null;
  return {
    error: current?.error ?? "",
    loaded: current !== null,
    // keeps showing what it has while a reload is in flight
    reload: () => setNonce((n) => n + 1),
    value: current?.value ?? null,
  };
};

export interface Queue {
  id: string;
  label: string;
}

export const REPO_QUEUES: Queue[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
];

// across every repo, each queue is a GitHub search
const GLOBAL_QUERIES: Record<string, string> = {
  involved: "is:open is:pr involves:@me archived:false",
  mine: "is:open is:pr author:@me archived:false",
  review: "is:open is:pr review-requested:@me archived:false",
};

export const GLOBAL_QUEUES: Queue[] = [
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
  { id: "involved", label: "Involved" },
];

// the PRs in each queue: one repo's open PRs split by who they involve, or GitHub searches
export const useQueues = (scope: string, me: string, flash: Flash) => {
  const [data, setData] = useState<Record<string, PR[]> | null>(null);
  const [busy, setBusy] = useState(true);

  const fetchAll = async () => {
    try {
      if (scope) {
        setData({ all: await listRepoPRs(scope) });
      } else {
        const lists = await Promise.all(
          GLOBAL_QUEUES.map((q) => searchPRs(GLOBAL_QUERIES[q.id] ?? ""))
        );
        setData(
          Object.fromEntries(
            GLOBAL_QUEUES.map((q, i) => [q.id, lists[i] ?? []])
          )
        );
      }
    } catch (error) {
      flash(`✗ ${errorMessage(error)}`, C.red);
      setData((d) => d ?? {});
    }
    setBusy(false);
  };

  const refresh = () => {
    setBusy(true);
    fetchAll();
  };

  const loadOnce = useEffectEvent(fetchAll);
  useEffect(() => {
    const go = async () => {
      await loadOnce();
    };
    go();
  }, []);

  let lists: Record<string, PR[]> | null = data;
  if (scope && data) {
    const all = data.all ?? [];
    lists = {
      all,
      mine: all.filter((p) => p.author === me),
      review: all.filter((p) => p.reviewRequests.includes(me)),
    };
  }
  return {
    busy,
    lists,
    queues: scope ? REPO_QUEUES : GLOBAL_QUEUES,
    refresh,
  };
};

export type PendingKind = "merge" | "close";

interface Pending {
  kind: PendingKind;
  // for a stack merge, the PR and everything below it, top first
  prs: PR[];
  nativeStack: number | null;
  timer: ReturnType<typeof setTimeout>;
}

const VERBS: Record<PendingKind, { doing: string; done: string }> = {
  close: { doing: "Closing", done: "Closed" },
  merge: { doing: "Merging", done: "Merged" },
};

const describe = (prs: PR[]) => {
  const [top] = prs;
  const below = prs.length - 1;
  return below > 0
    ? `#${top?.number} and ${below} below it`
    : `#${top?.number}`;
};

// merge and close wait a few seconds before running, so they can be undone like Superhuman's
// undo send. Until then the PRs are just hidden, so undo is instant.
export const usePendingAction = ({
  method,
  delay,
  flash,
  onSettled,
}: {
  method: MergeMethod;
  delay: number;
  flash: Flash;
  // runs after an action lands or fails, to reload what GitHub now says
  onSettled: () => void;
}) => {
  // only read from handlers, so it doesn't need to be state
  const pending = useRef<Pending | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const setShown = (prs: PR[], shown: boolean) =>
    setHidden((h) => {
      const next = new Set(h);
      for (const pr of prs) {
        if (shown) {
          next.delete(prKey(pr));
        } else {
          next.add(prKey(pr));
        }
      }
      return next;
    });

  const run = async (p: Pending) => {
    pending.current = null;
    const verb = VERBS[p.kind];
    flash(`${verb.doing} ${describe(p.prs)}…`, C.yellow);
    try {
      const [first] = p.prs;
      if (p.kind === "merge") {
        await merge(p.prs, method, p.nativeStack);
      } else if (first) {
        await closePR(first);
      }
      flash(
        `✓ ${verb.done} ${describe(p.prs)} ${p.prs[0]?.title ?? ""}`,
        C.green
      );
    } catch (error) {
      setShown(p.prs, true);
      flash(`✗ ${describe(p.prs)}: ${errorMessage(error)}`, C.red);
    }
    onSettled();
  };

  const queue = (
    kind: PendingKind,
    prs: PR[],
    nativeStack: number | null = null
  ) => {
    // a second action flushes the first immediately
    if (pending.current) {
      clearTimeout(pending.current.timer);
      run(pending.current);
    }
    const p: Pending = {
      kind,
      nativeStack,
      prs,
      timer: setTimeout(() => run(p), delay * 1000),
    };
    pending.current = p;
    setShown(prs, false);
    const how = kind === "merge" ? ` (${method})` : "";
    flash(
      `${VERBS[kind].doing} ${describe(prs)} in ${delay}s${how} · z to undo`,
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
    setShown(p.prs, true);
    flash(`↶ Undid ${p.kind} of ${describe(p.prs)}`, C.cyan);
  };

  // quitting runs whatever is pending right away rather than dropping it
  const flush = async () => {
    const p = pending.current;
    if (p) {
      clearTimeout(p.timer);
      await run(p);
    }
  };

  return { flush, hidden, queue, undo };
};

const branchKey = (pr: PR) => `${prKey(pr)}:${pr.headRefName}`;

// how far each PR's branch is behind its base, looked up once per PR as it's selected
export const useBehind = (pr: PR | undefined) => {
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
        n = await behindBy(pr);
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
  }, [pr, key, cache]);

  const markUpToDate = (p: PR) =>
    setCache((c) => ({ ...c, [branchKey(p)]: 0 }));

  return { behind: pr ? cache[key] : undefined, markUpToDate };
};
