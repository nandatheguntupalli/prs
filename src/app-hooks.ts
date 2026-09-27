// The app's state, grouped by concern, so the App component itself only wires them together.

import { useRenderer } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

import type { Screen } from "./commands.ts";
import type { Config } from "./config.ts";
import { showCommit } from "./git.ts";
import { isErrorLine, jobLog, jobSteps, listChecks } from "./github/checks.ts";
import type { Check } from "./github/checks.ts";
import { listThreads } from "./github/comments.ts";
import { getDiff } from "./github/prs.ts";
import type { PR } from "./github/prs.ts";
import type { GraphState } from "./graph-view.tsx";
import type { Commit } from "./graph.ts";
import { useLoader } from "./hooks.ts";
import { clampSize, DEFAULT_SIZES, saveSizes } from "./layout.ts";
import type { PaneSizes } from "./layout.ts";
import { findStacks, groupStacks, prKey } from "./stacks.ts";
import { applyTheme, resolveTheme } from "./theme.ts";
import type { ThemeChoice } from "./theme.ts";
import { parseDiff, withThreads } from "./ui/diff-model.ts";

// the chosen theme, a preview while picking one, and the terminal's light / dark appearance
export const useTheme = (config: Config) => {
  const renderer = useRenderer();
  const [choice, setChoice] = useState<ThemeChoice>(config.theme);
  const [preview, setPreview] = useState<ThemeChoice | null>(null);
  const [appearance, setAppearance] = useState(renderer.themeMode);
  useEffect(() => {
    const onMode = (mode: "dark" | "light") => setAppearance(mode);
    renderer.on("theme_mode", onMode);
    return () => {
      renderer.off("theme_mode", onMode);
    };
  }, [renderer]);
  const name = resolveTheme(preview ?? choice, appearance);
  // colors are read straight from the shared palette, so it's set before anything draws
  applyTheme(name);
  return { choice, name, setChoice, setPreview };
};

export type Resizing = keyof PaneSizes | null;

// the graph pane's width in cells; the PR pane gets the rest
export const graphCells = (width: number, shown: boolean, size: number) =>
  shown ? Math.min(width - 50, Math.max(24, Math.round(width * size))) : 0;

export const sidebarCells = (width: number, shown: boolean, size: number) =>
  shown ? Math.min(width - 30, Math.max(28, Math.round(width * size))) : 0;

// pane sizes: dragged or nudged, and saved once they settle
export const usePaneSizes = (
  initial: PaneSizes,
  width: number,
  graphPane: boolean
) => {
  const [sizes, setSizes] = useState(initial);
  const [resizing, setResizing] = useState<Resizing>(null);
  // only write the layout file once the user has actually resized something
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!changed) {
      return;
    }
    // dragging fires many updates; save once it settles
    const timer = setTimeout(() => saveSizes(sizes), 400);
    return () => clearTimeout(timer);
  }, [sizes, changed]);

  const resize = (pane: keyof PaneSizes, fraction: number) => {
    setChanged(true);
    setSizes((s) => ({ ...s, [pane]: clampSize(pane, fraction) }));
  };

  const reset = () => {
    setChanged(true);
    setSizes(DEFAULT_SIZES);
  };

  // while a divider is held, every drag anywhere resizes its pane
  const dragTo = (x: number) => {
    if (resizing === "graph") {
      resize("graph", x / width);
    } else if (resizing === "sidebar") {
      const paneW =
        width - graphCells(width, graphPane, sizes.graph) - (graphPane ? 1 : 0);
      resize("sidebar", (width - x - 1) / paneW);
    }
  };

  // the save waits for dragging to settle; quitting shouldn't lose it
  const saveNow = () => (changed ? saveSizes(sizes) : Promise.resolve());

  return { dragTo, reset, resize, resizing, saveNow, setResizing, sizes };
};

// what's listed: the queue's PRs, minus hidden ones and filter misses, with stacks together
export const useSelection = ({
  lists,
  tab,
  filter,
  hidden,
  scope,
  cursor,
}: {
  lists: Record<string, PR[]> | null;
  tab: string;
  filter: string;
  hidden: ReadonlySet<string>;
  scope: string;
  cursor: number;
}) => {
  // every word typed has to appear somewhere in the PR's number, title, author, branch, or repo
  const terms = filter.toLowerCase().split(/\s+/u).filter(Boolean);
  const matches = (p: PR) => {
    const text =
      `#${p.number} ${p.title} ${p.author} ${p.headRefName} ${p.repo}`.toLowerCase();
    return terms.every((t) => text.includes(t));
  };
  const source = lists?.[tab] ?? [];
  const visible = source.filter((p) => !hidden.has(prKey(p)) && matches(p));
  // stacks come from every open PR in the repo, so a stack shows whole in a filtered view
  const places = findStacks(scope ? (lists?.all ?? []) : source);
  const list = groupStacks(visible, places);
  const pr = list[Math.min(cursor, list.length - 1)];
  return { list, places, pr, source };
};

// where the diff comes from: a commit picked in the graph, or the selected PR
const diffKeyFor = (
  screen: Screen,
  pr: PR | undefined,
  commit: Commit | undefined
) => {
  if (screen !== "diff") {
    return null;
  }
  if (commit) {
    return `commit:${commit.hash}`;
  }
  return pr ? `pr:${prKey(pr)}:${pr.headRefOid}` : null;
};

// the diff and its review threads, as rows ready to draw
export const useDiffData = ({
  screen,
  pr,
  commit,
  graph,
  moved,
  width,
}: {
  screen: Screen;
  pr: PR | undefined;
  commit: Commit | undefined;
  graph: GraphState;
  // where the user has moved the cursor to, or null to start on the first line of code
  moved: number | null;
  width: number;
}) => {
  const diff = useLoader(diffKeyFor(screen, pr, commit), async () => {
    if (commit && graph.source) {
      return parseDiff(await showCommit(graph.source, commit.hash));
    }
    return parseDiff(pr ? await getDiff(pr) : "");
  });
  const threads = useLoader(
    screen === "diff" && !commit && pr ? `threads:${prKey(pr)}` : null,
    () => (pr ? listThreads(pr) : Promise.resolve([]))
  );
  const rows = useMemo(
    () => withThreads(diff.value?.rows ?? [], threads.value ?? [], width - 32),
    [diff.value, threads.value, width]
  );
  const cursor =
    moved ??
    Math.max(
      0,
      rows.findIndex((r) => r.kind === "line")
    );
  return { cursor, diff, rows, threads };
};

const firstError = (log: string[] | null) =>
  Math.max(
    0,
    (log ?? []).findIndex((line) => isErrorLine(line))
  );

// the PR's checks, and the steps and log of the job being looked at
export const useChecksData = ({
  screen,
  pr,
  job,
  logCursor,
}: {
  screen: Screen;
  pr: PR | undefined;
  job: Check | null;
  logCursor: number | null;
}) => {
  const active = screen === "checks" || screen === "job";
  const checks = useLoader(
    active && pr ? `checks:${prKey(pr)}:${pr.headRefOid}` : null,
    () => (pr ? listChecks(pr) : Promise.resolve([]))
  );
  const jobId = screen === "job" ? (job?.jobId ?? null) : null;
  const steps = useLoader(jobId ? `steps:${jobId}` : null, () =>
    pr && jobId ? jobSteps(pr.repo, jobId) : Promise.resolve([])
  );
  const log = useLoader(jobId ? `log:${jobId}` : null, () =>
    pr && jobId ? jobLog(pr.repo, jobId) : Promise.resolve([])
  );
  // until the user moves, the log opens on its first error
  const logAt = logCursor ?? firstError(log.value);
  return { checks, log, logAt, steps };
};
