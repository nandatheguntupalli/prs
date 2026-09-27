import type { PR } from "../github/prs.ts";
import { findStacks, groupStacks, prKey } from "../stacks.ts";
import type { Landed } from "./use-pending-action.ts";

// Put back PRs merged or closed here that GitHub has since dropped from the queue, so
// they don't vanish until the next manual refresh.
const withLanded = (
  source: PR[],
  tab: string,
  landed: ReadonlyMap<string, Landed>
) => {
  const out = [...source];
  const present = new Set(source.map(prKey));
  const gone = [...landed.values()]
    .filter((l) => l.queue === tab && !present.has(prKey(l.pr)))
    .toSorted((a, b) => a.index - b.index);
  for (const l of gone) {
    out.splice(Math.min(l.index, out.length), 0, l.pr);
  }
  return out;
};

export const useSelection = ({
  lists,
  tab,
  filter,
  landed,
  scope,
  cursor,
}: {
  lists: Record<string, PR[]>;
  tab: string;
  filter: string;
  landed: ReadonlyMap<string, Landed>;
  scope: string;
  cursor: number;
}) => {
  const terms = filter.toLowerCase().split(/\s+/u).filter(Boolean);
  const matches = (p: PR) => {
    const text =
      `#${p.number} ${p.title} ${p.author} ${p.headRefName} ${p.repo}`.toLowerCase();
    return terms.every((t) => text.includes(t));
  };
  const source = withLanded(lists[tab] ?? [], tab, landed);
  const visible = source.filter(matches);
  // use every open PR so a stack shows whole even when filtered
  const places = findStacks(
    (scope ? (lists.all ?? []) : source).filter((p) => p.state === "OPEN")
  );
  const list = groupStacks(visible, places);
  const pr = list[Math.min(cursor, list.length - 1)];
  return { list, places, pr, source };
};
