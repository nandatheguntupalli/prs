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

// a tab of your own: a title and a GitHub search, like "is:open is:pr label:bug"
export interface Section {
  title: string;
  filter: string;
}

// across every repo, each queue is a GitHub search
const GLOBAL_QUERIES: Record<string, string> = {
  closed: "is:pr is:closed is:unmerged author:@me archived:false",
  involved: "is:open is:pr involves:@me archived:false",
  merged: "is:pr is:merged author:@me archived:false",
  mine: "is:open is:pr author:@me archived:false",
  review: "is:open is:pr review-requested:@me archived:false",
};

const REPO_QUEUES: Queue[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
];

const GLOBAL_QUEUES: Queue[] = [
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
  { id: "involved", label: "Involved" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
];

// a section's search, kept to this repo when there is one, and to PRs
const sectionQuery = (section: Section, scope: string) => {
  const parts = [section.filter];
  if (!/\bis:pr\b/u.test(section.filter)) {
    parts.push("is:pr");
  }
  if (scope && !/\brepo:/u.test(section.filter)) {
    parts.push(`repo:${scope}`);
  }
  return parts.join(" ");
};

const fetchQueues = async (scope: string, sections: Section[]) => {
  const custom = sections.map((s) => searchPRs(sectionQuery(s, scope)));
  if (scope) {
    const [open, merged, closed, ...rest] = await Promise.all([
      listRepoPRs(scope),
      listRepoPRs(scope, "MERGED"),
      listRepoPRs(scope, "CLOSED"),
      ...custom,
    ]);
    return {
      all: open ?? [],
      closed: closed ?? [],
      merged: merged ?? [],
      ...Object.fromEntries(rest.map((list, i) => [`section-${i}`, list])),
    };
  }
  const lists = await Promise.all([
    ...GLOBAL_QUEUES.map((q) => searchPRs(GLOBAL_QUERIES[q.id] ?? "")),
    ...custom,
  ]);
  return Object.fromEntries([
    ...GLOBAL_QUEUES.map((q, i) => [q.id, lists[i] ?? []]),
    ...sections.map((_, i) => [
      `section-${i}`,
      lists[GLOBAL_QUEUES.length + i] ?? [],
    ]),
  ]) as Record<string, PR[]>;
};

// the PRs in each queue: a repo's PRs by state and who they involve, or GitHub searches, plus
// any sections of your own
export const useQueues = (
  scope: string,
  me: string,
  flash: Flash,
  sections: Section[]
) => {
  const [data, setData] = useState<Record<string, PR[]> | null>(null);
  const [busy, setBusy] = useState(true);

  const fetchAll = async () => {
    try {
      setData(await fetchQueues(scope, sections));
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
      ...data,
      mine: all.filter((p) => p.author === me),
      review: all.filter((p) => p.reviewRequests.includes(me)),
    };
  }
  const queues = [
    ...(scope ? REPO_QUEUES : GLOBAL_QUEUES),
    ...sections.map((s, i) => ({ id: `section-${i}`, label: s.title })),
  ];
  return { busy, lists, queues, refresh };
};

export type PendingKind = "merge" | "close";

// what's happening to a PR you've merged or closed: underway (and undoable), then done
export type Landing = "merging" | "closing" | "merged" | "closed";

export interface Landed {
  state: Landing;
  pr: PR;
  // where it sat, so it keeps its place after a reload drops it from the open list
  queue: string;
  index: number;
}

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
// undo send. The PRs stay where they are, marked as merging or closing and then merged or
// closed, like on GitHub, until the next manual refresh.
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
  const [landed, setLanded] = useState<ReadonlyMap<string, Landed>>(new Map());

  const mark = (
    prs: PR[],
    state: Landing | null,
    where?: (pr: PR) => { queue: string; index: number }
  ) =>
    setLanded((current) => {
      const next = new Map(current);
      for (const pr of prs) {
        const key = prKey(pr);
        if (state === null) {
          next.delete(key);
        } else {
          const prior = next.get(key);
          const place = where?.(pr) ?? {
            index: prior?.index ?? 0,
            queue: prior?.queue ?? "",
          };
          next.set(key, { ...place, pr, state });
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
      mark(p.prs, p.kind === "merge" ? "merged" : "closed");
      flash(
        `✓ ${verb.done} ${describe(p.prs)} ${p.prs[0]?.title ?? ""}`,
        C.green
      );
    } catch (error) {
      mark(p.prs, null);
      flash(`✗ ${describe(p.prs)}: ${errorMessage(error)}`, C.red);
    }
    onSettled();
  };

  const queue = (
    kind: PendingKind,
    prs: PR[],
    nativeStack: number | null,
    where: (pr: PR) => { queue: string; index: number }
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
    mark(prs, kind === "merge" ? "merging" : "closing", where);
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
    mark(p.prs, null);
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

  // a manual refresh lets finished merges and closes drop out; ones still underway stay
  const clearLanded = () =>
    setLanded(
      (current) =>
        new Map(
          [...current].filter(
            ([, l]) => l.state === "merging" || l.state === "closing"
          )
        )
    );

  // a reopened PR is open again, whatever happened to it here
  const forget = (pr: PR) => mark([pr], null);

  return { clearLanded, flush, forget, landed, queue, undo };
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
