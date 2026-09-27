// The app's commands. App supplies the actions; this decides the names, keys, and where each works.

import type { Cmd, Screen } from "./commands.ts";
import type { PR } from "./github/prs.ts";
import type { Queue } from "./hooks.ts";
import type { PaneSizes } from "./layout.ts";

type OnPR = (fn: (p: PR) => unknown) => () => unknown;

export interface CommandContext {
  queues: Queue[];
  sizes: PaneSizes;
  // how far ctrl+d / ctrl+u move in the list, and half a screen elsewhere
  page: number;
  half: number;
  onPRs: OnPR;
  // pull requests
  merge: (p: PR) => unknown;
  approve: (p: PR) => unknown;
  review: (p: PR) => unknown;
  update: (p: PR) => unknown;
  close: (p: PR) => unknown;
  toggleDraft: (p: PR) => unknown;
  labels: (p: PR) => unknown;
  checks: (p: PR) => unknown;
  copy: (p: PR) => unknown;
  edit: (p: PR) => unknown;
  checkout: (p: PR) => unknown;
  undo: () => unknown;
  open: () => unknown;
  // the list
  move: (n: number) => unknown;
  top: () => unknown;
  bottom: () => unknown;
  cycleQueue: (dir: 1 | -1) => unknown;
  showQueue: (id: string) => unknown;
  filter: () => unknown;
  openDiff: () => unknown;
  toggleSidebar: () => unknown;
  // the details pane's tabs: Overview, Activity, Commits, Checks, Files Changed
  nextDetailTab: (dir: 1 | -1) => unknown;
  resize: (pane: keyof PaneSizes, fraction: number) => unknown;
  resetSizes: () => unknown;
  back: () => unknown;
  // the diff
  moveDiff: (n: number) => unknown;
  diffTop: () => unknown;
  diffBottom: () => unknown;
  nextFile: (dir: 1 | -1) => unknown;
  files: () => unknown;
  nextThread: (dir: 1 | -1) => unknown;
  comment: () => unknown;
  toggleRange: () => unknown;
  movePR: (n: number) => unknown;
  // checks
  moveChecks: (n: number) => unknown;
  openCheck: () => unknown;
  moveLog: (n: number) => unknown;
  nextError: (dir: 1 | -1) => unknown;
  // app
  palette: () => unknown;
  help: () => unknown;
  theme: () => unknown;
  refresh: () => unknown;
  quit: () => unknown;
}

const L: Screen[] = ["list"];
const D: Screen[] = ["diff"];
const LD: Screen[] = ["list", "diff"];
const CH: Screen[] = ["checks"];
const JOB: Screen[] = ["job"];
const ALL: Screen[] = ["list", "diff", "checks", "job"];

export const buildCommands = (x: CommandContext): Cmd[] => {
  const prs = "Pull requests" as const;
  const nav = "Moving around" as const;
  return [
    {
      id: "merge",
      keys: ["m"],
      label: "Merge",
      run: x.onPRs(x.merge),
      screens: LD,
      section: prs,
    },
    {
      id: "approve",
      keys: ["a"],
      label: "Approve",
      run: x.onPRs(x.approve),
      screens: LD,
      section: prs,
    },
    {
      id: "review",
      keys: ["R"],
      label: "Review…",
      run: x.onPRs(x.review),
      screens: LD,
      section: prs,
    },
    {
      id: "update",
      keys: ["u"],
      label: "Update branch",
      run: x.onPRs(x.update),
      screens: L,
      section: prs,
    },
    {
      id: "close",
      keys: ["x"],
      label: "Close or reopen",
      run: x.onPRs(x.close),
      screens: LD,
      section: prs,
    },
    {
      id: "undo",
      keys: ["z"],
      label: "Undo merge or close",
      run: x.undo,
      screens: ALL,
      section: prs,
    },
    {
      id: "draft",
      keys: ["s"],
      label: "Toggle draft",
      run: x.onPRs(x.toggleDraft),
      screens: LD,
      section: prs,
    },
    {
      id: "labels",
      keys: ["L"],
      label: "Labels…",
      run: x.onPRs(x.labels),
      screens: LD,
      section: prs,
    },
    {
      id: "checks",
      keys: ["c"],
      label: "Checks",
      run: x.onPRs(x.checks),
      screens: LD,
      section: prs,
    },
    {
      id: "copy",
      keys: ["y"],
      label: "Copy…",
      run: x.onPRs(x.copy),
      screens: LD,
      section: prs,
    },
    {
      id: "edit",
      keys: ["e"],
      label: "Open in editor",
      run: x.onPRs(x.edit),
      screens: LD,
      section: prs,
    },
    {
      id: "checkout",
      keys: ["B"],
      label: "Check out branch",
      run: x.onPRs(x.checkout),
      screens: LD,
      section: prs,
    },
    {
      id: "open",
      keys: ["o"],
      label: "Open in browser",
      run: x.open,
      screens: ALL,
      section: prs,
    },

    {
      id: "down",
      keys: ["j", "down"],
      label: "Down",
      paletteHidden: true,
      run: () => x.move(1),
      screens: L,
      section: nav,
    },
    {
      id: "up",
      keys: ["k", "up"],
      label: "Up",
      paletteHidden: true,
      run: () => x.move(-1),
      screens: L,
      section: nav,
    },
    {
      id: "top",
      keys: ["g g"],
      label: "Top",
      run: x.top,
      screens: L,
      section: nav,
    },
    {
      id: "bottom",
      keys: ["G"],
      label: "Bottom",
      run: x.bottom,
      screens: L,
      section: nav,
    },
    {
      id: "page-down",
      keys: ["ctrl+d"],
      label: "Page down",
      paletteHidden: true,
      run: () => x.move(x.page),
      screens: L,
      section: nav,
    },
    {
      id: "page-up",
      keys: ["ctrl+u"],
      label: "Page up",
      paletteHidden: true,
      run: () => x.move(-x.page),
      screens: L,
      section: nav,
    },
    {
      id: "next-queue",
      keys: ["tab"],
      label: "Next queue",
      run: () => x.cycleQueue(1),
      screens: L,
      section: nav,
    },
    {
      id: "prev-queue",
      keys: ["shift+tab"],
      label: "Previous queue",
      run: () => x.cycleQueue(-1),
      screens: L,
      section: nav,
    },
    ...x.queues.map((q, i) => ({
      id: `queue-${q.id}`,
      keys: [String(i + 1)],
      label: `Show ${q.label}`,
      run: () => x.showQueue(q.id),
      screens: L,
      section: nav,
    })),
    {
      id: "filter",
      keys: ["/"],
      label: "Filter",
      run: x.filter,
      screens: L,
      section: nav,
    },
    {
      id: "open-diff",
      keys: ["return", "d"],
      label: "Diff",
      run: x.openDiff,
      screens: L,
      section: nav,
    },
    {
      id: "toggle-sidebar",
      keys: ["p"],
      label: "Toggle details",
      run: x.toggleSidebar,
      screens: L,
      section: nav,
    },
    {
      id: "next-detail-tab",
      keys: ["]"],
      label: "Next details tab",
      run: () => x.nextDetailTab(1),
      screens: L,
      section: nav,
    },
    {
      id: "prev-detail-tab",
      keys: ["["],
      label: "Previous details tab",
      run: () => x.nextDetailTab(-1),
      screens: L,
      section: nav,
    },
    {
      id: "side-smaller",
      keys: ["{"],
      label: "Narrower details",
      run: () => x.resize("sidebar", x.sizes.sidebar - 0.03),
      screens: L,
      section: nav,
    },
    {
      id: "side-bigger",
      keys: ["}"],
      label: "Wider details",
      run: () => x.resize("sidebar", x.sizes.sidebar + 0.03),
      screens: L,
      section: nav,
    },
    {
      id: "reset-sizes",
      keys: ["="],
      label: "Reset pane sizes",
      run: x.resetSizes,
      screens: L,
      section: nav,
    },
    {
      id: "back",
      keys: ["escape"],
      label: "Back",
      run: x.back,
      screens: ALL,
      section: nav,
    },

    {
      id: "diff-down",
      keys: ["j", "down"],
      label: "Down",
      paletteHidden: true,
      run: () => x.moveDiff(1),
      screens: D,
      section: "Diff",
    },
    {
      id: "diff-up",
      keys: ["k", "up"],
      label: "Up",
      paletteHidden: true,
      run: () => x.moveDiff(-1),
      screens: D,
      section: "Diff",
    },
    {
      id: "diff-page-down",
      keys: ["ctrl+d", " "],
      label: "Page down",
      paletteHidden: true,
      run: () => x.moveDiff(x.half),
      screens: D,
      section: "Diff",
    },
    {
      id: "diff-page-up",
      keys: ["ctrl+u", "b"],
      label: "Page up",
      paletteHidden: true,
      run: () => x.moveDiff(-x.half),
      screens: D,
      section: "Diff",
    },
    {
      id: "diff-top",
      keys: ["g g"],
      label: "Top",
      paletteHidden: true,
      run: x.diffTop,
      screens: D,
      section: "Diff",
    },
    {
      id: "diff-bottom",
      keys: ["G"],
      label: "Bottom",
      paletteHidden: true,
      run: x.diffBottom,
      screens: D,
      section: "Diff",
    },
    {
      id: "next-file",
      keys: ["]"],
      label: "Next file",
      run: () => x.nextFile(1),
      screens: D,
      section: "Diff",
    },
    {
      id: "prev-file",
      keys: ["["],
      label: "Previous file",
      run: () => x.nextFile(-1),
      screens: D,
      section: "Diff",
    },
    {
      id: "files",
      keys: ["f"],
      label: "Files…",
      run: x.files,
      screens: D,
      section: "Diff",
    },
    {
      id: "next-thread",
      keys: ["n"],
      label: "Next comment",
      run: () => x.nextThread(1),
      screens: D,
      section: "Diff",
    },
    {
      id: "prev-thread",
      keys: ["p"],
      label: "Previous comment",
      run: () => x.nextThread(-1),
      screens: D,
      section: "Diff",
    },
    {
      id: "comment",
      keys: ["return"],
      label: "Comment / reply",
      run: x.comment,
      screens: D,
      section: "Diff",
    },
    {
      id: "range",
      keys: ["v"],
      label: "Select lines",
      run: x.toggleRange,
      screens: D,
      section: "Diff",
    },
    {
      id: "next-pr",
      keys: ["J"],
      label: "Next PR",
      run: () => x.movePR(1),
      screens: D,
      section: "Diff",
    },
    {
      id: "prev-pr",
      keys: ["K"],
      label: "Previous PR",
      run: () => x.movePR(-1),
      screens: D,
      section: "Diff",
    },

    {
      id: "checks-down",
      keys: ["j", "down"],
      label: "Down",
      paletteHidden: true,
      run: () => x.moveChecks(1),
      screens: CH,
      section: "Checks",
    },
    {
      id: "checks-up",
      keys: ["k", "up"],
      label: "Up",
      paletteHidden: true,
      run: () => x.moveChecks(-1),
      screens: CH,
      section: "Checks",
    },
    {
      id: "open-check",
      keys: ["return"],
      label: "Steps and log",
      run: x.openCheck,
      screens: CH,
      section: "Checks",
    },
    {
      id: "log-down",
      keys: ["j", "down"],
      label: "Down",
      paletteHidden: true,
      run: () => x.moveLog(1),
      screens: JOB,
      section: "Checks",
    },
    {
      id: "log-up",
      keys: ["k", "up"],
      label: "Up",
      paletteHidden: true,
      run: () => x.moveLog(-1),
      screens: JOB,
      section: "Checks",
    },
    {
      id: "log-page-down",
      keys: ["ctrl+d", " "],
      label: "Page down",
      paletteHidden: true,
      run: () => x.moveLog(x.half),
      screens: JOB,
      section: "Checks",
    },
    {
      id: "log-page-up",
      keys: ["ctrl+u", "b"],
      label: "Page up",
      paletteHidden: true,
      run: () => x.moveLog(-x.half),
      screens: JOB,
      section: "Checks",
    },
    {
      id: "next-error",
      keys: ["n"],
      label: "Next error",
      run: () => x.nextError(1),
      screens: JOB,
      section: "Checks",
    },
    {
      id: "prev-error",
      keys: ["p"],
      label: "Previous error",
      run: () => x.nextError(-1),
      screens: JOB,
      section: "Checks",
    },

    {
      id: "palette",
      keys: ["ctrl+p"],
      label: "Command palette",
      run: x.palette,
      screens: ALL,
      section: "App",
    },
    {
      id: "help",
      keys: ["?"],
      label: "Help",
      run: x.help,
      screens: ALL,
      section: "App",
    },
    {
      id: "theme",
      keys: ["t"],
      label: "Theme…",
      run: x.theme,
      screens: L,
      section: "App",
    },
    {
      id: "refresh",
      keys: ["r"],
      label: "Refresh",
      run: x.refresh,
      screens: ["list", "diff", "checks"],
      section: "App",
    },
    {
      id: "quit",
      keys: ["q"],
      label: "Quit",
      run: x.quit,
      screens: ALL,
      section: "App",
    },
  ];
};

// the keys worth showing at the bottom of each screen
export const HINTS: Record<string, string[]> = {
  checks: ["open-check", "open", "refresh", "back"],
  diff: ["comment", "next-file", "files", "next-thread", "range", "back"],
  job: ["next-error", "prev-error", "open", "back"],
  list: [
    "open-diff",
    "next-detail-tab",
    "merge",
    "approve",
    "update",
    "close",
    "checks",
    "review",
    "palette",
  ],
};
