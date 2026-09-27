// Where a PR stands, for its icon and badge: open or draft, on its way to merged or closed after
// you acted on it here, or merged or closed on GitHub.

import type { PR } from "../github/prs.ts";
import type { Landed, Landing } from "../hooks.ts";
import { prKey } from "../stacks.ts";
import { C } from "../theme.ts";
import { ICONS } from "./icons.ts";

export type Status = "open" | "draft" | Landing;

export const statusOf = (
  pr: PR,
  landed: ReadonlyMap<string, Landed>
): Status => {
  const mine = landed.get(prKey(pr))?.state;
  if (mine) {
    return mine;
  }
  if (pr.state === "MERGED") {
    return "merged";
  }
  if (pr.state === "CLOSED") {
    return "closed";
  }
  return pr.isDraft ? "draft" : "open";
};

// only open PRs can be merged, approved, updated and so on
export const isOpen = (status: Status) =>
  status === "open" || status === "draft";

export const statusLook = (status: Status) => {
  switch (status) {
    case "merging": {
      return { color: C.yellow, icon: ICONS.merged, label: "Merging…" };
    }
    case "closing": {
      return { color: C.yellow, icon: ICONS.closed, label: "Closing…" };
    }
    case "merged": {
      return { color: C.purple, icon: ICONS.merged, label: "Merged" };
    }
    case "closed": {
      return { color: C.red, icon: ICONS.closed, label: "Closed" };
    }
    case "draft": {
      return { color: C.faint, icon: ICONS.draft, label: "Draft" };
    }
    default: {
      return { color: C.blue, icon: ICONS.pr, label: "Open" };
    }
  }
};
