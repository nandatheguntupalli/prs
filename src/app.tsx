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
  merge,
  openInBrowser,
  viewer,
} from "./gh.ts";
import type { MergeMethod, PR } from "./gh.ts";

const C = {
  accent: "#a78bfa",
  bg: "#000000",
  blue: "#60a5fa",
  border: "#262626",
  cyan: "#67e8f9",
  dim: "#737373",
  faint: "#3f3f46",
  green: "#4ade80",
  red: "#f87171",
  selected: "#18181f",
  text: "#e5e5e5",
  yellow: "#fbbf24",
};

const { BOLD } = TextAttributes;

type Tab = "all" | "mine" | "review";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
];

interface Toast {
  text: string;
  color: string;
}
interface Pending {
  pr: PR;
  index: number;
  timer: ReturnType<typeof setTimeout>;
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

const Sidebar = ({
  pr,
  width,
  onMerge,
  onApprove,
  onOpen,
}: {
  pr: PR;
  width: number;
  onMerge: Action;
  onApprove: Action;
  onOpen: Action;
}) => {
  const ci = CHECKS[pr.checks];
  const rv = review(pr);
  return (
    <box
      width={width}
      flexDirection="column"
      border={["left"]}
      borderColor={C.border}
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
          <text fg={C.dim}>
            <span fg={C.green}>+{pr.additions}</span>{" "}
            <span fg={C.red}>−{pr.deletions}</span> · {pr.changedFiles} files
          </text>
        </box>

        <box flexDirection="row" gap={1} marginTop={1}>
          <Button label="Merge" color={C.green} onPress={onMerge} />
          <Button label="Approve" color={C.blue} onPress={onApprove} />
          <Button label="Open" color={C.dim} onPress={onOpen} />
        </box>

        <text fg={C.border} marginTop={1}>
          {"─".repeat(Math.max(0, width - 3))}
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
  counts: Record<Tab, number> | null;
  onSelect: (t: Tab) => void;
}) => (
  <box flexDirection="row" height={1} paddingLeft={1} gap={3}>
    {TABS.map((t, i) => {
      const active = t.id === tab;
      return (
        <box key={t.id} onMouseDown={() => onSelect(t.id)}>
          <text fg={active ? C.accent : C.dim} attributes={active ? BOLD : 0}>
            {i + 1} {t.label}{" "}
            <span fg={active ? C.text : C.faint}>{counts?.[t.id] ?? ""}</span>
          </text>
        </box>
      );
    })}
  </box>
);

const HINTS = {
  diff: "j/k scroll · space/b page · J/K next/prev · m merge · a approve · o open · esc back",
  list: "j/k move · ⏎ diff · m merge · a approve · o open · z undo · tab switch · p sidebar · r refresh · q quit",
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

const DiffView = ({
  pr,
  lines,
  scroll,
  height,
  width,
}: {
  pr: PR;
  lines: string[] | null;
  scroll: number;
  height: number;
  width: number;
}) => (
  <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
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

const PRRow = ({
  pr,
  selected,
  titleW,
  onSelect,
}: {
  pr: PR;
  selected: boolean;
  titleW: number;
  onSelect: Action;
}) => {
  const ci = CHECKS[pr.checks];
  const rv = review(pr);
  return (
    <box
      height={1}
      backgroundColor={selected ? C.selected : C.bg}
      onMouseDown={onSelect}
    >
      <text wrapMode="none" truncate>
        <span fg={C.accent}>{selected ? "▌ " : "  "}</span>
        <span fg={C.dim}>{`#${pr.number}`.padEnd(7)}</span>
        <span fg={pr.isDraft ? C.dim : C.text} attributes={selected ? BOLD : 0}>
          {`${pad(pr.title, titleW)}  `}
        </span>
        <span fg={C.blue}>{pad(pr.author, AUTHOR_W)}</span>
        <span fg={C.dim}>{age(pr.createdAt).padStart(4)} </span>
        <span fg={ci.color}>{` ${ci.icon} `}</span>
        <span fg={rv.color}>{pad(rv.short, 9)}</span>
        <span fg={C.green}>{`+${pr.additions}`.padStart(7)}</span>
        <span fg={C.red}>{` −${pr.deletions}`.padStart(8)}</span>
      </text>
    </box>
  );
};

const PRTable = ({
  list,
  cursor,
  width,
  height,
  onSelect,
}: {
  list: PR[];
  cursor: number;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  const titleW = Math.max(
    12,
    width - 2 - 7 - 2 - AUTHOR_W - 5 - 3 - 9 - 15 - 1
  );
  // keep the cursor roughly centered once the list is taller than the screen
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), list.length - height)
  );
  const columns = `  ${"#".padEnd(7)}${pad("Title", titleW)}  ${pad("Author", AUTHOR_W)} Age CI ${"Review".padEnd(9)}${"Diff".padStart(15)}`;
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
          titleW={titleW}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

export const App = ({
  repo,
  method,
  delay,
  dryRun,
  onQuit,
}: {
  repo: string;
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
  const [view, setView] = useState<"list" | "diff">("list");
  const [sidebar, setSidebar] = useState(true);
  const [diff, setDiff] = useState<{ number: number; lines: string[] } | null>(
    null
  );
  const [scroll, setScroll] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(true);
  // only read from handlers, so it doesn't need to be state
  const pending = useRef<Pending | null>(null);

  const flash = (text: string, color = C.text) => setToast({ color, text });

  const fetchPRs = async () => {
    try {
      const fetched = await listPRs(repo);
      const skip = pending.current?.pr.number;
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
    loadPRs();
  }, []);

  useEffect(() => {
    const load = async () => setMe(await viewer());
    load();
  }, []);

  const all = prs ?? [];
  const tabs: Record<Tab, PR[]> = {
    all,
    mine: all.filter((p) => p.author === me),
    review: all.filter((p) => p.reviewRequests.includes(me)),
  };
  const list = tabs[tab];
  const pr = list[Math.min(cursor, list.length - 1)];
  const prNumber = pr?.number;

  // load the diff whenever the diff view points at a new PR
  useEffect(() => {
    if (view !== "diff" || prNumber === undefined) {
      return;
    }
    let live = true;
    const load = async () => {
      let lines: string[];
      try {
        const text = await getDiff(repo, prNumber);
        lines = text.replaceAll("\t", "  ").split("\n");
      } catch (error) {
        lines = [`✗ ${errorMessage(error)}`];
      }
      if (live) {
        setDiff({ lines, number: prNumber });
      }
    };
    load();
    return () => {
      live = false;
    };
  }, [view, prNumber, repo]);

  // a diff for a different PR is stale; show loading until the new one lands
  const diffLines = diff && diff.number === prNumber ? diff.lines : null;

  const reinsert = (p: Pending) =>
    setPrs((cur) => {
      const next = [...(cur ?? [])];
      next.splice(Math.min(p.index, next.length), 0, p.pr);
      return next;
    });

  const doMerge = async (p: Pending) => {
    pending.current = null;
    flash(`Merging #${p.pr.number}…`, C.yellow);
    try {
      await merge(repo, p.pr.number, method);
      flash(`✓ Merged #${p.pr.number} ${p.pr.title}`, C.green);
    } catch (error) {
      reinsert(p);
      flash(`✗ #${p.pr.number}: ${errorMessage(error)}`, C.red);
    }
  };

  const queueMerge = (target: PR) => {
    // a second merge flushes the first immediately
    if (pending.current) {
      clearTimeout(pending.current.timer);
      doMerge(pending.current);
    }
    const p: Pending = {
      index: all.indexOf(target),
      pr: target,
      timer: setTimeout(() => doMerge(p), delay * 1000),
    };
    pending.current = p;
    setPrs(all.filter((x) => x !== target));
    setCursor((c) => Math.max(0, Math.min(c, list.length - 2)));
    setView("list");
    flash(
      `Merging #${target.number} in ${delay}s (${method}) · z to undo`,
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
    flash(`↶ Undid merge of #${p.pr.number}`, C.cyan);
  };

  const quit = async () => {
    const p = pending.current;
    if (p) {
      clearTimeout(p.timer);
      await doMerge(p);
    }
    onQuit();
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

  const selectTab = (t: Tab) => {
    setTab(t);
    setCursor(0);
  };

  const cycleTab = (dir: 1 | -1) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + dir + TABS.length) % TABS.length];
    if (next) {
      selectTab(next.id);
    }
  };

  const moveCursor = (dir: 1 | -1) =>
    setCursor((c) => Math.max(0, Math.min(c + dir, list.length - 1)));

  const openDiff = () => {
    setScroll(0);
    setView("diff");
  };

  const movePR = (dir: 1 | -1) => {
    setScroll(0);
    moveCursor(dir);
  };

  // header, tabs, gap, table header, toast, footer
  const bodyH = height - 6;
  const diffH = height - 7;
  const maxScroll = Math.max(0, (diffLines?.length ?? 0) - diffH);
  const scrollBy = (n: number) =>
    setScroll((s) => Math.max(0, Math.min(s + n, maxScroll)));

  const onMerge = () => pr && queueMerge(pr);
  const onApprove = () => pr && doApprove(pr);
  const onOpen = () => pr && openInBrowser(pr.url);

  // built per keypress, from the handler, so the actions only ever run outside render
  const keymap = (id: string) => {
    const globalKeys = new Map([
      ...bind(["ctrl+c"], quit),
      ...bind(["z"], undo),
      ...bind(["r"], refresh),
      ...bind(["m"], onMerge),
      ...bind(["a"], onApprove),
      ...bind(["o"], onOpen),
    ]);

    const listKeys = new Map([
      ...bind(["q"], quit),
      ...bind(["j", "down"], () => moveCursor(1)),
      ...bind(["k", "up"], () => moveCursor(-1)),
      ...bind(["g"], () => setCursor(0)),
      ...bind(["G"], () => setCursor(list.length - 1)),
      ...bind(["tab"], () => cycleTab(1)),
      ...bind(["shift+tab"], () => cycleTab(-1)),
      ...TABS.flatMap((t, i) => bind([String(i + 1)], () => selectTab(t.id))),
      ...bind(["p"], () => setSidebar((s) => !s)),
      ...bind(["return", "d"], () => pr && openDiff()),
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

  const sideW = sidebar ? Math.max(36, Math.floor(width * 0.38)) : 0;

  let body: ReactNode;
  if (!prs) {
    body = (
      <Centered>
        <text fg={C.dim}>Loading pull requests…</text>
      </Centered>
    );
  } else if (view === "diff" && pr) {
    body = (
      <DiffView
        pr={pr}
        lines={diffLines}
        scroll={scroll}
        height={diffH}
        width={width}
      />
    );
  } else if (pr) {
    body = (
      <box flexGrow={1} flexDirection="row">
        <PRTable
          list={list}
          cursor={cursor}
          width={width - sideW}
          height={bodyH}
          onSelect={setCursor}
        />
        {sidebar ? (
          <Sidebar
            pr={pr}
            width={sideW}
            onMerge={onMerge}
            onApprove={onApprove}
            onOpen={onOpen}
          />
        ) : null}
      </box>
    );
  } else {
    body = (
      <Centered>
        <text fg={C.green} attributes={BOLD}>
          Inbox zero.
        </text>
        <text fg={C.dim}>
          Nothing in {TABS.find((t) => t.id === tab)?.label}.
        </text>
      </Centered>
    );
  }

  const counts = prs
    ? {
        all: tabs.all.length,
        mine: tabs.mine.length,
        review: tabs.review.length,
      }
    : null;

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={C.bg}
    >
      <Header repo={repo} busy={busy} dryRun={dryRun} method={method} />
      <TabBar tab={tab} counts={counts} onSelect={selectTab} />
      <box flexGrow={1} flexDirection="column" marginTop={1}>
        {body}
      </box>
      <Footer toast={toast} view={view} />
    </box>
  );
};
