import { useRef, useState } from "react";

import { errorMessage } from "../github/client.ts";
import { closePR, merge } from "../github/prs.ts";
import type { MergeMethod, PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import { C } from "../theme.ts";
import type { Flash } from "../theme.ts";

export type PendingKind = "merge" | "close";

export type Landing = "merging" | "closing" | "merged" | "closed";

export interface Landed {
  state: Landing;
  pr: PR;
  // where it sat, so it keeps its place after a reload drops it
  queue: string;
  index: number;
}

interface Pending {
  kind: PendingKind;
  // top first
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

// Merges and closes wait `delay` seconds so they can be undone. The PR stays listed as
// merging/closing, then merged/closed, until the next manual refresh.
export const usePendingAction = ({
  method,
  delay,
  flash,
  onSettled,
}: {
  method: MergeMethod;
  delay: number;
  flash: Flash;
  onSettled: () => void;
}) => {
  // only read from handlers, so a ref is enough
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
    // a second action runs the first one now
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

  const flush = async () => {
    const p = pending.current;
    if (p) {
      clearTimeout(p.timer);
      await run(p);
    }
  };

  // keep ones still in flight
  const clearLanded = () =>
    setLanded(
      (current) =>
        new Map(
          [...current].filter(
            ([, l]) => l.state === "merging" || l.state === "closing"
          )
        )
    );

  const forget = (pr: PR) => mark([pr], null);

  return { clearLanded, flush, forget, landed, queue, undo };
};
