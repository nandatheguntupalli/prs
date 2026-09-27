import { TextAttributes } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  approve,
  errorMessage,
  getDiff,
  listPRs,
  openInBrowser,
  updateBranch,
  viewer,
} from "./gh.ts";
import type { MergeMethod, PR } from "./gh.ts";
import { showCommit } from "./git.ts";
import type { Source } from "./git.ts";
import { GraphView, useCellPixels, useGraph } from "./graph-view.tsx";
import type { CellPixels, GraphState } from "./graph-view.tsx";
import type { Commit } from "./graph.ts";
import { useBehind, useDiff, usePendingAction } from "./hooks.ts";
import type { DiffTarget, PendingKind } from "./hooks.ts";
import { clampSize, DEFAULT_SIZES, saveSizes } from "./layout.ts";
import type { PaneSizes } from "./layout.ts";
import { C } from "./theme.ts";

const { BOLD } = TextAttributes;

type Tab = "all" | "mine" | "review";
type Focus = "prs" | "graph";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
];

interface Toast {
  text: string;
  color: string;
}
interface Status {
  color: string;
  label: string;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const MONTH = DAY * 30;

const age = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < HOUR) {
    return `${Math.max(1, Math.floor(s / MINUTE))}m`;
  }
  if (s < DAY) {
    return `${Math.floor(s / HOUR)}h`;
  }
  if (s < MONTH) {
    return `${Math.floor(s / DAY)}d`;
  }
  return `${Math.floor(s / MONTH)}mo`;
};

const pad = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s.padEnd(n);

const CHECKS: Record<PR["checks"], Status & { icon: string }> = {
  fail: { color: C.red, icon: "●", label: "Checks failing" },
  none: { color: C.faint, icon: "·", label: "No checks" },
  pass: { color: C.green, icon: "●", label: "Checks passing" },
  pending: { color: C.yellow, icon: "◌", label: "Checks running" },
};

const REVIEWS: Record<string, Status & { short: string }> = {
  APPROVED: { color: C.green, label: "Approved", short: "approved" },
  CHANGES_REQUESTED: {
    color: C.red,
    label: "Changes requested",
    short: "changes",
  },
  REVIEW_REQUIRED: {
    color: C.yellow,
    label: "Review required",
    short: "review",
  },
};

const review = (pr: PR): Status & { short: string } => {
  if (pr.mergeable === "CONFLICTING") {
    return { color: C.red, label: "Merge conflicts", short: "conflict" };
  }
  if (pr.isDraft) {
    return { color: C.dim, label: "Draft", short: "draft" };
  }
  return (
    REVIEWS[pr.reviewDecision] ?? {
      color: C.dim,
      label: "No review required",
      short: "",
    }
  );
};

const diffColor = (line: string) => {
  if (line.startsWith("diff --git")) {
    return { attributes: BOLD, fg: C.accent };
  }
  if (
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("index ")
  ) {
    return { fg: C.faint };
  }
  if (line.startsWith("@@")) {
    return { fg: C.cyan };
  }
  if (line.startsWith("+")) {
    return { fg: C.green };
  }
  if (line.startsWith("-")) {
    return { fg: C.red };
  }
  return { fg: C.text };
};

// PR bodies are full of bot badges and HTML; keep just the readable text
const cleanBody = (body: string) => {
  const text = (body ?? "")
    .replaceAll("\r", "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .replaceAll(/<[^>]+>/gu, "")
    .replaceAll("\t", "  ")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
  return text || "No description.";
};

// keys that OpenTUI reports by name; everything else is matched by the character typed
const NAMED_KEYS = new Set([
  "down",
  "escape",
  "left",
  "pagedown",
  "pageup",
  "return",
  "right",
  "tab",
  "up",
]);

const keyId = (key: KeyEvent) => {
  if (key.ctrl) {
    return `ctrl+${key.name}`;
  }
  if (NAMED_KEYS.has(key.name)) {
    return key.shift ? `shift+${key.name}` : key.name;
  }
  return key.sequence;
};

type Action = () => unknown;
const bind = (keys: string[], action: Action) =>
  keys.map((k) => [k, action] as const);

const Button = ({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: Action;
}) => (
  <box
    border
    borderStyle="rounded"
    borderColor={color}
    paddingLeft={1}
    paddingRight={1}
    height={3}
    onMouseDown={onPress}
  >
    <text fg={color} attributes={BOLD}>
      {label}
    </text>
  </box>
);

const BehindLine = ({ pr, behind }: { pr: PR; behind: number | undefined }) => {
  if (behind === undefined) {
    return <text fg={C.faint}>… Checking {pr.baseRefName}</text>;
  }
  if (behind < 0) {
    return null;
  }
  if (behind === 0) {
    return <text fg={C.dim}>✓ Up to date with {pr.baseRefName}</text>;
  }
  return (
    <text fg={C.yellow}>
      ↓ {behind} {behind === 1 ? "commit" : "commits"} behind {pr.baseRefName}
    </text>
  );
};

interface PRActions {
  handleMerge: Action;
  handleApprove: Action;
  handleUpdate: Action;
  handleClose: Action;
  handleOpen: Action;
}

const Sidebar = ({
  pr,
  width,
  behind,
  actions,
}: {
  pr: PR;
  width: number;
  behind: number | undefined;
  actions: PRActions;
}) => {
  const ci = CHECKS[pr.checks];
  const rv = review(pr);
  return (
    <box
      width={width}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={1}
      overflow="hidden"
    >
      {/* the description can be huge, so only it may shrink; everything above keeps its height */}
      <box flexDirection="column" flexShrink={0}>
        <text fg={C.text} attributes={BOLD} wrapMode="word">
          {pr.title}
        </text>
        <text fg={C.dim} marginTop={1} wrapMode="none" truncate>
          <span fg={C.accent}>#{pr.number}</span> ·{" "}
          <span fg={C.blue}>{pr.author}</span> · {age(pr.createdAt)} ago
        </text>
        <text fg={C.dim} wrapMode="none" truncate>
          {pr.baseRefName} ← {pr.headRefName}
        </text>

        <box flexDirection="column" marginTop={1}>
          <text fg={ci.color}>
            {ci.icon} {ci.label}
          </text>
          <text fg={rv.color}>
            {rv.color === C.green ? "✓" : "○"} {rv.label}
          </text>
          <BehindLine pr={pr} behind={behind} />
          <text fg={C.dim}>
            <span fg={C.green}>+{pr.additions}</span>{" "}
            <span fg={C.red}>−{pr.deletions}</span> · {pr.changedFiles} files
          </text>
        </box>

        <box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
          <Button label="Merge" color={C.green} onPress={actions.handleMerge} />
          <Button
            label="Approve"
            color={C.blue}
            onPress={actions.handleApprove}
          />
          {behind && behind > 0 ? (
            <Button
              label="Update"
              color={C.yellow}
              onPress={actions.handleUpdate}
            />
          ) : null}
          <Button label="Close" color={C.red} onPress={actions.handleClose} />
          <Button label="Open" color={C.dim} onPress={actions.handleOpen} />
        </box>

        <text fg={C.border} marginTop={1}>
          {"─".repeat(Math.max(0, width - 4))}
        </text>
      </box>
      <text fg={C.dim} wrapMode="word" flexShrink={1}>
        {cleanBody(pr.body)}
      </text>
    </box>
  );
};

const Header = ({
  repo,
  busy,
  dryRun,
  method,
}: {
  repo: string;
  busy: boolean;
  dryRun: boolean;
  method: MergeMethod;
}) => (
  <box
    flexDirection="row"
    justifyContent="space-between"
    height={1}
    paddingLeft={1}
    paddingRight={1}
  >
    <text>
      <span fg={C.accent} attributes={BOLD}>
        prs
      </span>
      <span fg={C.text}> {repo}</span>
      <span fg={C.dim}>{busy ? "  ⟳" : ""}</span>
    </text>
    <text fg={C.dim}>
      {dryRun ? <span fg={C.yellow}>dry run · </span> : null}
      {method}
    </text>
  </box>
);

const TabBar = ({
  tab,
  counts,
  onSelect,
}: {
  tab: Tab;
  counts: Partial<Record<Tab, number>>;
  onSelect: (t: Tab) => void;
}) => (
  <box flexDirection="row" height={1} paddingLeft={1} gap={3}>
    {TABS.map((t, i) => {
      const active = t.id === tab;
      return (
        <box key={t.id} onMouseDown={() => onSelect(t.id)}>
          <text fg={active ? C.accent : C.dim} attributes={active ? BOLD : 0}>
            {i + 1} {t.label}{" "}
            <span fg={active ? C.text : C.faint}>{counts[t.id] ?? ""}</span>
          </text>
        </box>
      );
    })}
  </box>
);

const HINTS = {
  diff: "j/k scroll · space/b page · J/K next/prev · m merge · a approve · x close · o open · esc back",
  graph:
    "j/k move · h/l switch pane · ⏎ show commit · o open on GitHub · r fetch · v hide graph · q quit",
  list: "j/k move · h/l switch pane · ⏎ diff · m merge · a approve · u update · x close · o open · z undo · tab switch · v graph · p sidebar · [ ] { } resize · q quit",
};

const Footer = ({
  toast,
  view,
}: {
  toast: Toast | null;
  view: keyof typeof HINTS;
}) => (
  <box flexDirection="column" height={2} paddingLeft={1} paddingRight={1}>
    <text fg={toast?.color ?? C.dim} wrapMode="none" truncate>
      {toast?.text ?? " "}
    </text>
    <text fg={C.faint} wrapMode="none" truncate>
      {HINTS[view]}
    </text>
  </box>
);

const Centered = ({ children }: { children: ReactNode }) => (
  <box
    flexGrow={1}
    alignItems="center"
    justifyContent="center"
    flexDirection="column"
  >
    {children}
  </box>
);

const PRTitle = ({ pr }: { pr: PR }) => (
  <text wrapMode="none" truncate>
    <span fg={C.accent}>#{pr.number} </span>
    <span fg={C.text} attributes={BOLD}>
      {pr.title}
    </span>
    <span fg={C.dim}> </span>
    <span fg={C.green}>+{pr.additions} </span>
    <span fg={C.red}>−{pr.deletions}</span>
    <span fg={C.dim}> · {pr.changedFiles} files</span>
  </text>
);

const DiffView = ({
  title,
  lines,
  scroll,
  height,
  width,
}: {
  title: ReactNode;
  lines: string[] | null;
  scroll: number;
  height: number;
  width: number;
}) => (
  <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
    {title}
    <text fg={C.border}>{"─".repeat(Math.max(0, width - 2))}</text>
    {(lines ?? ["Loading diff…"])
      .slice(scroll, scroll + height)
      .map((line, i) => (
        <text key={scroll + i} wrapMode="none" truncate {...diffColor(line)}>
          {line || " "}
        </text>
      ))}
  </box>
);

const AUTHOR_W = 16;

// below this width the table drops the author, age, and diff columns
const COMPACT_W = 90;

const PRRow = ({
  pr,
  selected,
  focused,
  compact,
  titleW,
  onSelect,
}: {
  pr: PR;
  selected: boolean;
  focused: boolean;
  compact: boolean;
  titleW: number;
  onSelect: Action;
}) => {
  const ci = CHECKS[pr.checks];
  const rv = review(pr);
  const lit = selected && focused;
  return (
    <box
      height={1}
      backgroundColor={lit ? C.selected : C.bg}
      onMouseDown={onSelect}
    >
      <text wrapMode="none" truncate>
        <span fg={focused ? C.accent : C.faint}>{selected ? "▌ " : "  "}</span>
        <span fg={C.dim}>{`#${pr.number}`.padEnd(7)}</span>
        <span fg={pr.isDraft ? C.dim : C.text} attributes={lit ? BOLD : 0}>
          {`${pad(pr.title, titleW)}  `}
        </span>
        {compact ? null : <span fg={C.blue}>{pad(pr.author, AUTHOR_W)}</span>}
        {compact ? null : (
          <span fg={C.dim}>{age(pr.createdAt).padStart(4)} </span>
        )}
        <span fg={ci.color}>{` ${ci.icon} `}</span>
        <span fg={rv.color}>{pad(rv.short, 9)}</span>
        {compact ? null : (
          <span fg={C.green}>{`+${pr.additions}`.padStart(7)}</span>
        )}
        {compact ? null : (
          <span fg={C.red}>{` −${pr.deletions}`.padStart(8)}</span>
        )}
      </text>
    </box>
  );
};

const PRTable = ({
  list,
  cursor,
  focused,
  width,
  height,
  onSelect,
}: {
  list: PR[];
  cursor: number;
  focused: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  const compact = width < COMPACT_W;
  const fixed = compact
    ? 2 + 7 + 2 + 3 + 9 + 1
    : 2 + 7 + 2 + AUTHOR_W + 5 + 3 + 9 + 15 + 1;
  const titleW = Math.max(12, width - fixed);
  // keep the cursor roughly centered once the list is taller than the screen
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), list.length - height)
  );
  const columns = compact
    ? `  ${"#".padEnd(7)}${pad("Title", titleW)}  CI ${"Review".padEnd(9)}`
    : `  ${"#".padEnd(7)}${pad("Title", titleW)}  ${pad("Author", AUTHOR_W)} Age CI ${"Review".padEnd(9)}${"Diff".padStart(15)}`;
  return (
    <box width={width} flexDirection="column">
      <text fg={C.faint} wrapMode="none" truncate>
        {columns}
      </text>
      {list.slice(start, start + height).map((p, i) => (
        <PRRow
          key={p.number}
          pr={p}
          selected={start + i === cursor}
          focused={focused}
          compact={compact}
          titleW={titleW}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

const CommitTitle = ({ commit }: { commit: Commit }) => (
  <text wrapMode="none" truncate>
    <span fg={C.accent}>{commit.short} </span>
    <span fg={C.text} attributes={BOLD}>
      {commit.subject}
    </span>
    <span fg={C.dim}> {commit.author}</span>
  </text>
);

// what the diff view should load: a PR's diff, or a commit from the graph
const diffTarget = (
  repo: string,
  pr: PR | undefined,
  commit: Commit | undefined,
  source: Source | null
): DiffTarget | null => {
  if (commit && source) {
    return {
      key: `commit:${commit.hash}`,
      load: () => showCommit(source, commit.hash),
    };
  }
  if (pr) {
    return { key: `pr:${pr.number}`, load: () => getDiff(repo, pr.number) };
  }
  return null;
};

const hintMode = (view: "list" | "diff", inGraph: boolean) => {
  if (view === "diff") {
    return "diff";
  }
  return inGraph ? "graph" : "list";
};

const diffTitle = (pr: PR | undefined, commit: Commit | undefined) => {
  if (commit) {
    return <CommitTitle commit={commit} />;
  }
  return pr ? <PRTitle pr={pr} /> : null;
};

// the line between two panes. Grabbing it starts a resize; the drag itself is handled at the
// app's root, since terminals report motion a cell at a time and the pointer leaves a 1-cell line at once
const Divider = ({ active, onGrab }: { active: boolean; onGrab: Action }) => {
  const [hot, setHot] = useState(false);
  return (
    <box
      width={1}
      flexShrink={0}
      border={["left"]}
      borderColor={hot || active ? C.accent : C.border}
      onMouseOver={() => setHot(true)}
      onMouseOut={() => setHot(false)}
      onMouseDown={onGrab}
    />
  );
};

type Resizing = keyof PaneSizes | null;

// the graph pane's width in cells; the PR pane gets the rest
const graphCells = (width: number, graphPane: boolean, size: number) =>
  graphPane ? Math.min(width - 50, Math.max(24, Math.round(width * size))) : 0;

// the PR table with its detail sidebar, or a loading / empty message in its place
const PRPane = ({
  prs,
  list,
  pr,
  cursor,
  focused,
  onSelect,
  sidebar,
  behind,
  actions,
  emptyLabel,
  sidebarSize,
  resizing,
  onGrabDivider,
  width,
  height,
}: {
  prs: PR[] | null;
  list: PR[];
  pr: PR | undefined;
  cursor: number;
  focused: boolean;
  onSelect: (i: number) => void;
  sidebar: boolean;
  behind: number | undefined;
  actions: PRActions;
  emptyLabel: string;
  sidebarSize: number;
  resizing: Resizing;
  onGrabDivider: Action;
  width: number;
  height: number;
}) => {
  if (!prs) {
    return (
      <Centered>
        <text fg={C.dim}>Loading pull requests…</text>
      </Centered>
    );
  }
  if (!pr) {
    return (
      <Centered>
        <text fg={C.green} attributes={BOLD}>
          Inbox zero.
        </text>
        <text fg={C.dim}>Nothing in {emptyLabel}.</text>
      </Centered>
    );
  }
  const sideW = sidebar
    ? Math.min(width - 30, Math.max(28, Math.round(width * sidebarSize)))
    : 0;
  return (
    <box flexGrow={1} flexDirection="row">
      <PRTable
        list={list}
        cursor={cursor}
        focused={focused}
        width={width - sideW - (sidebar ? 1 : 0)}
        height={height}
        onSelect={onSelect}
      />
      {sidebar ? (
        <Divider active={resizing === "sidebar"} onGrab={onGrabDivider} />
      ) : null}
      {sidebar ? (
        <Sidebar pr={pr} width={sideW} behind={behind} actions={actions} />
      ) : null}
    </box>
  );
};

// graph on the left, PRs on the right; or a full-width diff
const MainView = ({
  view,
  focus,
  graphPane,
  graph,
  graphCursor,
  onSelectCommit,
  cell,
  pr,
  commit,
  diffLines,
  scroll,
  graphSize,
  resizing,
  onGrabDivider,
  width,
  height,
  prPane,
}: {
  view: "list" | "diff";
  focus: Focus;
  graphPane: boolean;
  graph: GraphState;
  graphCursor: number;
  onSelectCommit: (i: number) => void;
  cell: CellPixels | null;
  pr: PR | undefined;
  commit: Commit | undefined;
  diffLines: string[] | null;
  scroll: number;
  graphSize: number;
  resizing: Resizing;
  onGrabDivider: Action;
  width: number;
  height: number;
  prPane: (width: number, height: number) => ReactNode;
}) => {
  // header, tabs, gap, table header, toast, footer
  const bodyH = height - 6;
  const title = diffTitle(pr, commit);
  if (view === "diff" && title) {
    return (
      <DiffView
        title={title}
        lines={diffLines}
        scroll={scroll}
        height={bodyH - 1}
        width={width}
      />
    );
  }
  const graphW = graphCells(width, graphPane, graphSize);
  return (
    <box flexGrow={1} flexDirection="row">
      {graphPane ? (
        <GraphView
          rows={graph.rows}
          status={graph.status}
          cursor={graphCursor}
          focused={focus === "graph"}
          cell={cell}
          width={graphW}
          height={bodyH + 1}
          onSelect={onSelectCommit}
        />
      ) : null}
      {graphPane ? (
        <Divider active={resizing === "graph"} onGrab={onGrabDivider} />
      ) : null}
      {prPane(width - graphW - (graphPane ? 1 : 0), bodyH)}
    </box>
  );
};

export const App = ({
  repo,
  local,
  method,
  delay,
  dryRun,
  textGraph,
  initialSizes,
  onQuit,
}: {
  repo: string;
  initialSizes: PaneSizes;
  local: string | null;
  // draw the graph with characters even when the terminal can show images
  textGraph: boolean;
  method: MergeMethod;
  delay: number;
  dryRun: boolean;
  onQuit: () => void;
}) => {
  const { width, height } = useTerminalDimensions();
  const [prs, setPrs] = useState<PR[] | null>(null);
  const [me, setMe] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [cursor, setCursor] = useState(0);
  const [graphCursor, setGraphCursor] = useState(0);
  const [focus, setFocus] = useState<Focus>("prs");
  const [graphPane, setGraphPane] = useState(true);
  const [sizes, setSizes] = useState(initialSizes);
  const [resizing, setResizing] = useState<Resizing>(null);
  // only write the layout file once the user has actually resized something
  const resized = useRef(false);

  useEffect(() => {
    if (!resized.current) {
      return;
    }
    // dragging fires many updates; save once it settles
    const timer = setTimeout(() => saveSizes(sizes), 400);
    return () => clearTimeout(timer);
  }, [sizes]);

  const resize = (pane: keyof PaneSizes, fraction: number) => {
    resized.current = true;
    setSizes((s) => ({ ...s, [pane]: clampSize(pane, fraction) }));
  };

  const nudge = (pane: keyof PaneSizes, delta: number) =>
    resize(pane, sizes[pane] + delta);

  const resetSizes = () => {
    resized.current = true;
    setSizes(DEFAULT_SIZES);
  };
  const [view, setView] = useState<"list" | "diff">("list");
  const [sidebar, setSidebar] = useState(true);
  const [scroll, setScroll] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(true);

  const flash = (text: string, color = C.text) => setToast({ color, text });
  const pending = usePendingAction({ delay, flash, method, repo, setPrs });

  const fetchPRs = async () => {
    try {
      const fetched = await listPRs(repo);
      const skip = pending.pendingNumber();
      setPrs(fetched.filter((p) => p.number !== skip));
    } catch (error) {
      flash(`✗ ${errorMessage(error)}`, C.red);
      setPrs((p) => p ?? []);
    }
    setBusy(false);
  };

  const refresh = () => {
    setBusy(true);
    fetchPRs();
  };

  // repo is fixed for the life of the app, so these only run once
  const loadPRs = useEffectEvent(fetchPRs);
  useEffect(() => {
    const load = async () => {
      await loadPRs();
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => setMe(await viewer());
    load();
  }, []);

  const inGraph = graphPane && focus === "graph";
  const graph = useGraph(repo, local, graphPane);
  const cell = useCellPixels(graphPane && !textGraph);
  const commits = graph.rows ?? [];

  const all = prs ?? [];
  const tabs: Record<Tab, PR[]> = {
    all,
    mine: all.filter((p) => p.author === me),
    review: all.filter((p) => p.reviewRequests.includes(me)),
  };
  const list = tabs[tab];
  const pr = list[Math.min(cursor, list.length - 1)];
  const commit = inGraph
    ? commits[Math.min(graphCursor, commits.length - 1)]?.commit
    : undefined;

  const { behind, markUpToDate } = useBehind(repo, pr);
  const diffLines = useDiff(
    view === "diff" ? diffTarget(repo, pr, commit, graph.source) : null
  );

  const queue = (kind: PendingKind, target: PR) => {
    pending.queue(kind, target, all);
    setCursor((c) => Math.max(0, Math.min(c, list.length - 2)));
    setView("list");
  };

  const doApprove = async (target: PR) => {
    flash(`Approving #${target.number}…`, C.yellow);
    try {
      await approve(repo, target.number);
      flash(`✓ Approved #${target.number}`, C.green);
      refresh();
    } catch (error) {
      flash(`✗ ${errorMessage(error)}`, C.red);
    }
  };

  const doUpdate = async (target: PR) => {
    flash(`Updating #${target.number} with ${target.baseRefName}…`, C.yellow);
    try {
      await updateBranch(repo, target.number);
      markUpToDate(target);
      flash(`✓ Updated #${target.number} with ${target.baseRefName}`, C.green);
      refresh();
    } catch (error) {
      flash(`✗ #${target.number}: ${errorMessage(error)}`, C.red);
    }
  };

  const quit = async () => {
    await pending.flush();
    // the resize save waits for dragging to settle; don't lose it by quitting first
    if (resized.current) {
      await saveSizes(sizes);
    }
    onQuit();
  };

  const selectTab = (t: Tab) => {
    setTab(t);
    setCursor(0);
    setFocus("prs");
    setView("list");
  };

  const toggleGraph = () => {
    setGraphPane((g) => !g);
    setFocus("prs");
  };

  const focusGraph = () => graphPane && setFocus("graph");

  const selectCommit = (i: number) => {
    setGraphCursor(i);
    setFocus("graph");
  };

  const selectPR = (i: number) => {
    setCursor(i);
    setFocus("prs");
  };

  const cycleTab = (dir: 1 | -1) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + dir + TABS.length) % TABS.length];
    if (next) {
      selectTab(next.id);
    }
  };

  const count = inGraph ? commits.length : list.length;
  const setActiveCursor = inGraph ? setGraphCursor : setCursor;
  const moveCursor = (dir: 1 | -1) =>
    setActiveCursor((c) => Math.max(0, Math.min(c + dir, count - 1)));

  const openDiff = () => {
    setScroll(0);
    setView("diff");
  };

  const movePR = (dir: 1 | -1) => {
    setScroll(0);
    moveCursor(dir);
  };

  // header, tabs, gap, title, rule, toast, footer
  const diffH = height - 7;
  const maxScroll = Math.max(0, (diffLines?.length ?? 0) - diffH);
  const scrollBy = (n: number) =>
    setScroll((s) => Math.max(0, Math.min(s + n, maxScroll)));

  const prActions: PRActions = {
    handleApprove: () => pr && doApprove(pr),
    handleClose: () => pr && queue("close", pr),
    handleMerge: () => pr && queue("merge", pr),
    handleOpen: () => pr && openInBrowser(pr.url),
    handleUpdate: () => pr && doUpdate(pr),
  };

  // PR keys do nothing while browsing the graph; the sidebar's buttons still work
  const onPRs = (fn: Action) => () => !inGraph && fn();

  const openCommit = () =>
    commit && openInBrowser(`https://github.com/${repo}/commit/${commit.hash}`);

  const refreshAll = () => {
    refresh();
    graph.reload();
  };

  // built per keypress, from the handler, so the actions only ever run outside render
  const keymap = (id: string) => {
    const globalKeys = new Map([
      ...bind(["ctrl+c"], quit),
      ...bind(["z"], pending.undo),
      ...bind(["r"], refreshAll),
      ...bind(["m"], onPRs(prActions.handleMerge)),
      ...bind(["a"], onPRs(prActions.handleApprove)),
      ...bind(["x"], onPRs(prActions.handleClose)),
      ...bind(["o"], inGraph ? openCommit : prActions.handleOpen),
    ]);

    const listKeys = new Map([
      ...bind(["q"], quit),
      ...bind(["j", "down"], () => moveCursor(1)),
      ...bind(["k", "up"], () => moveCursor(-1)),
      ...bind(["g"], () => setActiveCursor(0)),
      ...bind(["G"], () => setActiveCursor(count - 1)),
      ...bind(["tab"], () => cycleTab(1)),
      ...bind(["shift+tab"], () => cycleTab(-1)),
      ...TABS.flatMap((t, i) => bind([String(i + 1)], () => selectTab(t.id))),
      ...bind(["p"], () => setSidebar((s) => !s)),
      ...bind(["v"], toggleGraph),
      ...bind(["["], () => nudge("graph", -0.03)),
      ...bind(["]"], () => nudge("graph", 0.03)),
      ...bind(["{"], () => nudge("sidebar", -0.03)),
      ...bind(["}"], () => nudge("sidebar", 0.03)),
      ...bind(["="], resetSizes),
      ...bind(["h", "left"], focusGraph),
      ...bind(["l", "right"], () => setFocus("prs")),
      ...bind(["u"], onPRs(prActions.handleUpdate)),
      ...bind(["return", "d"], () => (pr || commit) && openDiff()),
    ]);

    const diffKeys = new Map([
      ...bind(["escape", "q", "h", "left"], () => setView("list")),
      ...bind(["j", "down"], () => scrollBy(1)),
      ...bind(["k", "up"], () => scrollBy(-1)),
      ...bind([" ", "pagedown"], () => scrollBy(diffH - 2)),
      ...bind(["b", "u", "pageup"], () => scrollBy(-(diffH - 2))),
      ...bind(["g"], () => setScroll(0)),
      ...bind(["G"], () => setScroll(maxScroll)),
      ...bind(["J"], () => movePR(1)),
      ...bind(["K"], () => movePR(-1)),
    ]);

    const keys = view === "list" ? listKeys : diffKeys;
    return keys.get(id) ?? globalKeys.get(id);
  };

  useKeyboard((key: KeyEvent) => keymap(keyId(key))?.());

  const prPane = (paneW: number, paneH: number) => (
    <PRPane
      prs={prs}
      list={list}
      pr={pr}
      cursor={cursor}
      focused={!inGraph}
      onSelect={selectPR}
      sidebar={sidebar}
      behind={behind}
      actions={prActions}
      emptyLabel={TABS.find((t) => t.id === tab)?.label ?? ""}
      sidebarSize={sizes.sidebar}
      resizing={resizing}
      onGrabDivider={() => setResizing("sidebar")}
      width={paneW}
      height={paneH}
    />
  );

  const main = (
    <MainView
      view={view}
      focus={inGraph ? "graph" : "prs"}
      graphPane={graphPane}
      graph={graph}
      graphCursor={graphCursor}
      onSelectCommit={selectCommit}
      cell={cell}
      pr={pr}
      commit={commit}
      diffLines={diffLines}
      scroll={scroll}
      graphSize={sizes.graph}
      resizing={resizing}
      onGrabDivider={() => setResizing("graph")}
      width={width}
      height={height}
      prPane={prPane}
    />
  );

  // while a divider is held, every drag anywhere resizes its pane
  const dragTo = (x: number) => {
    if (resizing === "graph") {
      resize("graph", x / width);
    } else if (resizing === "sidebar") {
      // the PR pane runs to the right edge, so the sidebar gets everything right of the pointer
      const paneW = width - graphCells(width, graphPane, sizes.graph) - 1;
      resize("sidebar", (width - x - 1) / paneW);
    }
  };

  const counts = prs
    ? {
        all: tabs.all.length,
        mine: tabs.mine.length,
        review: tabs.review.length,
      }
    : {};

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={C.bg}
      onMouseDrag={(event) => dragTo(event.x)}
      onMouseUp={() => setResizing(null)}
    >
      <Header repo={repo} busy={busy} dryRun={dryRun} method={method} />
      <TabBar tab={tab} counts={counts} onSelect={selectTab} />
      <box flexGrow={1} flexDirection="column" marginTop={1}>
        {main}
      </box>
      <Footer toast={toast} view={hintMode(view, inGraph)} />
    </box>
  );
};
