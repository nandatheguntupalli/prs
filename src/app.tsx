import { TextAttributes } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  approve,
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

function age(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) {
    return `${Math.max(1, Math.floor(s / 60))}m`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)}h`;
  }
  if (s < 86_400 * 30) {
    return `${Math.floor(s / 86400)}d`;
  }
  return `${Math.floor(s / (86_400 * 30))}mo`;
}

const pad = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s.padEnd(n);

const CHECKS: Record<
  PR["checks"],
  { icon: string; label: string; color: string }
> = {
  fail: { color: C.red, icon: "●", label: "Checks failing" },
  none: { color: C.faint, icon: "·", label: "No checks" },
  pass: { color: C.green, icon: "●", label: "Checks passing" },
  pending: { color: C.yellow, icon: "◌", label: "Checks running" },
};

function review(pr: PR): { short: string; label: string; color: string } {
  if (pr.mergeable === "CONFLICTING") {
    return { short: "conflict", label: "Merge conflicts", color: C.red };
  }
  if (pr.isDraft) {
    return { short: "draft", label: "Draft", color: C.dim };
  }
  switch (pr.reviewDecision) {
    case "APPROVED": {
      return { short: "approved", label: "Approved", color: C.green };
    }
    case "CHANGES_REQUESTED": {
      return { short: "changes", label: "Changes requested", color: C.red };
    }
    case "REVIEW_REQUIRED": {
      return { short: "review", label: "Review required", color: C.yellow };
    }
    default: {
      return { short: "", label: "No review required", color: C.dim };
    }
  }
}

function diffColor(line: string) {
  if (line.startsWith("diff --git")) {
    return { fg: C.accent, attributes: BOLD };
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
}

// PR bodies are full of bot badges and HTML; keep just the readable text
function cleanBody(body: string) {
  const text = (body ?? "")
    .replaceAll("\r", "")
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("	", "  ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
  return text || "No description.";
}

function Button({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
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
}

function Sidebar({
  pr,
  width,
  onMerge,
  onApprove,
  onOpen,
}: {
  pr: PR;
  width: number;
  onMerge: () => void;
  onApprove: () => void;
  onOpen: () => void;
}) {
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
}

export function App({
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
}) {
  const { width, height } = useTerminalDimensions();
  const [prs, setPrs] = useState<PR[] | null>(null);
  const [me, setMe] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<"list" | "diff">("list");
  const [sidebar, setSidebar] = useState(true);
  const [diff, setDiff] = useState<string[] | null>(null);
  const [scroll, setScroll] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const flash = (text: string, color = C.text) => setToast({ color, text });

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const list = await listPRs(repo);
      const skip = pendingRef.current?.pr.number;
      setPrs(list.filter((p) => p.number !== skip));
    } catch (error: any) {
      flash(`✗ ${error.message}`, C.red);
      setPrs((p) => p ?? []);
    } finally {
      setBusy(false);
    }
  }, [repo]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(
    () =>
      void viewer()
        .then(setMe)
        .catch(() => {}),
    []
  );

  const all = prs ?? [];
  const tabs: Record<Tab, PR[]> = {
    all,
    mine: all.filter((p) => p.author === me),
    review: all.filter((p) => p.reviewRequests.includes(me)),
  };
  const list = tabs[tab];
  const pr = list[Math.min(cursor, list.length - 1)];

  // load the diff whenever the diff view points at a new PR
  useEffect(() => {
    if (view !== "diff" || !pr) {
      return;
    }
    let live = true;
    setDiff(null);
    setScroll(0);
    getDiff(repo, pr.number)
      .then((d) => live && setDiff(d.replaceAll("	", "  ").split("\n")))
      .catch((error) => live && setDiff([`✗ ${error.message}`]));
    return () => void (live = false);
  }, [view, pr?.number, repo]);

  const reinsert = (p: Pending) =>
    setPrs((cur) => {
      const next = [...(cur ?? [])];
      next.splice(Math.min(p.index, next.length), 0, p.pr);
      return next;
    });

  const doMerge = async (p: Pending) => {
    setPending(null);
    flash(`Merging #${p.pr.number}…`, C.yellow);
    try {
      await merge(repo, p.pr.number, method);
      flash(`✓ Merged #${p.pr.number} ${p.pr.title}`, C.green);
    } catch (error: any) {
      reinsert(p);
      flash(`✗ #${p.pr.number}: ${error.message}`, C.red);
    }
  };

  const queueMerge = (target: PR) => {
    // a second merge flushes the first immediately
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      void doMerge(pendingRef.current);
    }
    const index = all.indexOf(target);
    const p: Pending = {
      index,
      pr: target,
      timer: setTimeout(() => void doMerge(p), delay * 1000),
    };
    setPending(p);
    setPrs(all.filter((x) => x !== target));
    setCursor((c) => Math.max(0, Math.min(c, list.length - 2)));
    setView("list");
    flash(
      `Merging #${target.number} in ${delay}s (${method}) · z to undo`,
      C.yellow
    );
  };

  const undo = () => {
    const p = pendingRef.current;
    if (!p) {
      return flash("Nothing to undo", C.dim);
    }
    clearTimeout(p.timer);
    setPending(null);
    reinsert(p);
    flash(`↶ Undid merge of #${p.pr.number}`, C.cyan);
  };

  const quit = async () => {
    const p = pendingRef.current;
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
      void refresh();
    } catch (error: any) {
      flash(`✗ ${error.message}`, C.red);
    }
  };

  const selectTab = (t: Tab) => {
    setTab(t);
    setCursor(0);
  };

  const cycleTab = (dir: 1 | -1) => {
    const i = TABS.findIndex((t) => t.id === tab);
    selectTab(TABS[(i + dir + TABS.length) % TABS.length]!.id);
  };

  const bodyH = height - 6; // header, tabs, gap, table header, toast, footer
  const diffH = height - 7;
  const maxScroll = Math.max(0, (diff?.length ?? 0) - diffH);

  useKeyboard((key: KeyEvent) => {
    const ch = key.sequence;
    if (key.ctrl && key.name === "c") {
      return void quit();
    }
    if (ch === "z") {
      return undo();
    }
    if (ch === "r") {
      return void refresh();
    }

    if (view === "list") {
      if (ch === "q") {
        return void quit();
      }
      if (ch === "j" || key.name === "down") {
        setCursor((c) => Math.min(c + 1, list.length - 1));
      } else if (ch === "k" || key.name === "up") {
        setCursor((c) => Math.max(c - 1, 0));
      } else if (ch === "g") {
        setCursor(0);
      } else if (ch === "G") {
        setCursor(list.length - 1);
      } else if (key.name === "tab") {
        cycleTab(key.shift ? -1 : 1);
      } else if (ch === "1" || ch === "2" || ch === "3") {
        selectTab(TABS[Number(ch) - 1]!.id);
      } else if (ch === "p") {
        setSidebar((s) => !s);
      } else if (!pr) {
        return;
      } else if (key.name === "return" || ch === "d") {
        setView("diff");
      } else if (ch === "m") {
        queueMerge(pr);
      } else if (ch === "a") {
        void doApprove(pr);
      } else if (ch === "o") {
        openInBrowser(pr.url);
      }
      return;
    }

    if (
      key.name === "escape" ||
      ch === "q" ||
      ch === "h" ||
      key.name === "left"
    ) {
      setView("list");
    } else if (ch === "j" || key.name === "down") {
      setScroll((s) => Math.min(s + 1, maxScroll));
    } else if (ch === "k" || key.name === "up") {
      setScroll((s) => Math.max(s - 1, 0));
    } else if (ch === " " || key.name === "pagedown") {
      setScroll((s) => Math.min(s + diffH - 2, maxScroll));
    } else if (ch === "b" || ch === "u" || key.name === "pageup") {
      setScroll((s) => Math.max(s - (diffH - 2), 0));
    } else if (ch === "g") {
      setScroll(0);
    } else if (ch === "G") {
      setScroll(maxScroll);
    } else if (ch === "J") {
      setCursor((c) => Math.min(c + 1, list.length - 1));
    } else if (ch === "K") {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (pr && ch === "m") {
      queueMerge(pr);
    } else if (pr && ch === "a") {
      void doApprove(pr);
    } else if (pr && ch === "o") {
      openInBrowser(pr.url);
    }
  });

  const header = (
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

  const tabBar = (
    <box flexDirection="row" height={1} paddingLeft={1} gap={3}>
      {TABS.map((t, i) => {
        const active = t.id === tab;
        return (
          <box key={t.id} onMouseDown={() => selectTab(t.id)}>
            <text fg={active ? C.accent : C.dim} attributes={active ? BOLD : 0}>
              {i + 1} {t.label}{" "}
              <span fg={active ? C.text : C.faint}>
                {prs ? tabs[t.id].length : ""}
              </span>
            </text>
          </box>
        );
      })}
    </box>
  );

  const footer = (
    <box flexDirection="column" height={2} paddingLeft={1} paddingRight={1}>
      <text fg={toast?.color ?? C.dim} wrapMode="none" truncate>
        {toast?.text ?? " "}
      </text>
      <text fg={C.faint} wrapMode="none" truncate>
        {view === "list"
          ? "j/k move · ⏎ diff · m merge · a approve · o open · z undo · tab switch · p sidebar · r refresh · q quit"
          : "j/k scroll · space/b page · J/K next/prev · m merge · a approve · o open · esc back"}
      </text>
    </box>
  );

  const sideW = sidebar ? Math.max(36, Math.floor(width * 0.38)) : 0;
  const tableW = width - sideW;

  let body: ReactNode;
  if (!prs) {
    body = (
      <box flexGrow={1} alignItems="center" justifyContent="center">
        <text fg={C.dim}>Loading pull requests…</text>
      </box>
    );
  } else if (view === "diff" && pr) {
    body = (
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
        {(diff ?? ["Loading diff…"])
          .slice(scroll, scroll + diffH)
          .map((line, i) => (
            <text
              key={scroll + i}
              wrapMode="none"
              truncate
              {...diffColor(line)}
            >
              {line || " "}
            </text>
          ))}
      </box>
    );
  } else if (list.length) {
    const authorW = 16;
    const titleW = Math.max(
      12,
      tableW - 2 - 7 - 2 - authorW - 5 - 3 - 9 - 15 - 1
    );
    const start = Math.max(
      0,
      Math.min(cursor - Math.floor(bodyH / 2), list.length - bodyH)
    );
    body = (
      <box flexGrow={1} flexDirection="row">
        <box width={tableW} flexDirection="column">
          <text fg={C.faint} wrapMode="none" truncate>
            {"  " +
              "#".padEnd(7) +
              pad("Title", titleW) +
              "  " +
              pad("Author", authorW) +
              " Age " +
              "CI " +
              "Review".padEnd(9) +
              "Diff".padStart(15)}
          </text>
          {list.slice(start, start + bodyH).map((p, i) => {
            const selected = start + i === cursor;
            const ci = CHECKS[p.checks];
            const rv = review(p);
            return (
              <box
                key={p.number}
                height={1}
                backgroundColor={selected ? C.selected : C.bg}
                onMouseDown={() => setCursor(start + i)}
              >
                <text wrapMode="none" truncate>
                  <span fg={C.accent}>{selected ? "▌ " : "  "}</span>
                  <span fg={C.dim}>{`#${p.number}`.padEnd(7)}</span>
                  <span
                    fg={p.isDraft ? C.dim : C.text}
                    attributes={selected ? BOLD : 0}
                  >
                    {pad(p.title, titleW)}{" "}
                  </span>
                  <span fg={C.blue}>{pad(p.author, authorW)}</span>
                  <span fg={C.dim}>{age(p.createdAt).padStart(4)} </span>
                  <span fg={ci.color}>{` ${ci.icon} `}</span>
                  <span fg={rv.color}>{pad(rv.short, 9)}</span>
                  <span fg={C.green}>{`+${p.additions}`.padStart(7)}</span>
                  <span fg={C.red}>{` −${p.deletions}`.padStart(8)}</span>
                </text>
              </box>
            );
          })}
        </box>
        {sidebar && pr ? (
          <Sidebar
            pr={pr}
            width={sideW}
            onMerge={() => queueMerge(pr)}
            onApprove={() => void doApprove(pr)}
            onOpen={() => openInBrowser(pr.url)}
          />
        ) : null}
      </box>
    );
  } else {
    body = (
      <box
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <text fg={C.green} attributes={BOLD}>
          Inbox zero.
        </text>
        <text fg={C.dim}>
          Nothing in {TABS.find((t) => t.id === tab)!.label}.
        </text>
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={C.bg}
    >
      {header}
      {tabBar}
      <box flexGrow={1} flexDirection="column" marginTop={1}>
        {body}
      </box>
      {footer}
    </box>
  );
}
