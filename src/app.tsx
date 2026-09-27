import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { approve, getDiff, listPRs, merge, openInBrowser, type MergeMethod, type PR } from "./gh.ts";

type Toast = { text: string; color: string };
type Pending = { pr: PR; index: number; timer: ReturnType<typeof setTimeout> };

function useSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns, rows: stdout.rows });
    stdout.on("resize", onResize);
    return () => void stdout.off("resize", onResize);
  }, [stdout]);
  return size;
}

function age(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 30))}mo`;
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

const CHECKS: Record<PR["checks"], [string, string]> = {
  pass: ["● CI", "green"],
  fail: ["● CI", "red"],
  pending: ["◌ CI", "yellow"],
  none: ["  --", "gray"],
};

function review(pr: PR): [string, string] {
  if (pr.mergeable === "CONFLICTING") return ["conflict", "red"];
  if (pr.isDraft) return ["draft", "gray"];
  switch (pr.reviewDecision) {
    case "APPROVED": return ["approved", "green"];
    case "CHANGES_REQUESTED": return ["changes", "red"];
    case "REVIEW_REQUIRED": return ["review", "yellow"];
    default: return ["--", "gray"];
  }
}

function diffColor(line: string): { color?: string; bold?: boolean; dim?: boolean } {
  if (line.startsWith("diff --git")) return { color: "magenta", bold: true };
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ")) return { dim: true };
  if (line.startsWith("@@")) return { color: "cyan" };
  if (line.startsWith("+")) return { color: "green" };
  if (line.startsWith("-")) return { color: "red" };
  return {};
}

// PR bodies are full of bot badges and HTML; keep just the readable text
function cleanBody(body: string) {
  const text = (body ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\t/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.split("\n") : ["(no description)"];
}

function Row({ pr, selected, cols }: { pr: PR; selected: boolean; cols: number }) {
  const [ci, ciColor] = CHECKS[pr.checks];
  const [rv, rvColor] = review(pr);
  const num = `#${pr.number}`.padEnd(6);
  const right = 17 + 5 + 5 + 10 + 16; // author, age, ci, review, diffstat
  const titleW = Math.max(10, cols - 2 - 6 - right - 2);
  return (
    <Box>
      <Text color="cyan">{selected ? "▌ " : "  "}</Text>
      <Text dimColor>{num}</Text>
      <Text bold={selected} dimColor={pr.isDraft} inverse={false}>{pad(pr.title, titleW)}  </Text>
      <Text color="blue">{pad(pr.author, 16)} </Text>
      <Text dimColor>{age(pr.createdAt).padStart(4)} </Text>
      <Text color={ciColor}>{ci} </Text>
      <Text color={rvColor}>{pad(rv, 10)}</Text>
      <Text color="green">{`+${pr.additions}`.padStart(7)}</Text>
      <Text color="red">{` −${pr.deletions}`.padStart(8)}</Text>
    </Box>
  );
}

export function App({ repo, method, delay }: { repo: string; method: MergeMethod; delay: number }) {
  const { exit } = useApp();
  const { cols, rows } = useSize();
  const [prs, setPrs] = useState<PR[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<"list" | "detail">("list");
  const [diff, setDiff] = useState<string[] | null>(null);
  const [scroll, setScroll] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const flash = (text: string, color = "white") => setToast({ text, color });

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const list = await listPRs(repo);
      const skip = pendingRef.current?.pr.number;
      setPrs(list.filter((p) => p.number !== skip));
    } catch (e: any) {
      flash(`✗ ${e.message}`, "red");
      setPrs((p) => p ?? []);
    } finally {
      setBusy(false);
    }
  }, [repo]);

  useEffect(() => void refresh(), [refresh]);

  const list = prs ?? [];
  const pr = list[Math.min(cursor, list.length - 1)];

  // load diff whenever the detail view points at a new PR
  useEffect(() => {
    if (view !== "detail" || !pr) return;
    let live = true;
    setDiff(null);
    setScroll(0);
    getDiff(repo, pr.number)
      .then((d) => live && setDiff(d.replace(/\t/g, "  ").split("\n")))
      .catch((e) => live && setDiff([`✗ ${e.message}`]));
    return () => void (live = false);
  }, [view, pr?.number, repo]);

  const doMerge = async (p: Pending) => {
    setPending(null);
    flash(`Merging #${p.pr.number}…`, "yellow");
    try {
      await merge(repo, p.pr.number, method);
      flash(`✓ Merged #${p.pr.number} ${p.pr.title}`, "green");
    } catch (e: any) {
      setPrs((cur) => {
        const next = [...(cur ?? [])];
        next.splice(Math.min(p.index, next.length), 0, p.pr);
        return next;
      });
      flash(`✗ #${p.pr.number}: ${e.message}`, "red");
    }
  };

  const queueMerge = (target: PR) => {
    // a second merge flushes the first immediately
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      void doMerge(pendingRef.current);
    }
    const index = list.indexOf(target);
    const p: Pending = { pr: target, index, timer: setTimeout(() => void doMerge(p), delay * 1000) };
    setPending(p);
    setPrs(list.filter((x) => x !== target));
    setCursor((c) => Math.min(c, list.length - 2));
    setView("list");
    flash(`Merging #${target.number} in ${delay}s (${method})  ·  z to undo`, "yellow");
  };

  const undo = () => {
    const p = pendingRef.current;
    if (!p) return flash("Nothing to undo", "gray");
    clearTimeout(p.timer);
    setPending(null);
    setPrs((cur) => {
      const next = [...(cur ?? [])];
      next.splice(Math.min(p.index, next.length), 0, p.pr);
      return next;
    });
    setCursor(p.index);
    flash(`↶ Undid merge of #${p.pr.number}`, "cyan");
  };

  const quit = async () => {
    const p = pendingRef.current;
    if (p) {
      clearTimeout(p.timer);
      await doMerge(p);
    }
    exit();
  };

  const doApprove = async (target: PR) => {
    flash(`Approving #${target.number}…`, "yellow");
    try {
      await approve(repo, target.number);
      flash(`✓ Approved #${target.number}`, "green");
      void refresh();
    } catch (e: any) {
      flash(`✗ ${e.message}`, "red");
    }
  };

  const bodyH = rows - 4;
  const detailLines = pr
    ? [
        ...cleanBody(pr.body),
        "",
        ...(diff ?? ["Loading diff…"]),
      ]
    : [];
  const maxScroll = Math.max(0, detailLines.length - (bodyH - 3));

  useInput((input, key) => {
    if (input === "z" || (view === "list" && input === "u")) return undo();
    if (input === "q" && view === "list") return void quit();
    if (key.ctrl && input === "c") return void quit();
    if (input === "r") return void refresh();

    if (view === "list") {
      if (input === "j" || key.downArrow) setCursor((c) => Math.min(c + 1, list.length - 1));
      else if (input === "k" || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      else if (input === "g") setCursor(0);
      else if (input === "G") setCursor(list.length - 1);
      else if (!pr) return;
      else if (key.return || input === "l" || key.rightArrow) setView("detail");
      else if (input === "m") queueMerge(pr);
      else if (input === "a") void doApprove(pr);
      else if (input === "o") openInBrowser(pr.url);
      return;
    }

    // detail view
    if (key.escape || input === "q" || input === "h" || key.leftArrow) setView("list");
    else if (input === "j" || key.downArrow) setScroll((s) => Math.min(s + 1, maxScroll));
    else if (input === "k" || key.upArrow) setScroll((s) => Math.max(s - 1, 0));
    else if (input === " " || input === "d" || key.pageDown) setScroll((s) => Math.min(s + bodyH - 4, maxScroll));
    else if (input === "b" || input === "u" || key.pageUp) setScroll((s) => Math.max(s - (bodyH - 4), 0));
    else if (input === "g") setScroll(0);
    else if (input === "G") setScroll(maxScroll);
    else if (input === "J") setCursor((c) => Math.min(c + 1, list.length - 1));
    else if (input === "K") setCursor((c) => Math.max(c - 1, 0));
    else if (pr && input === "m") queueMerge(pr);
    else if (pr && input === "a") void doApprove(pr);
    else if (pr && input === "o") openInBrowser(pr.url);
  });

  const header = (
    <Box justifyContent="space-between">
      <Text>
        <Text bold color="cyan">prs </Text>
        <Text bold>{repo}</Text>
        <Text dimColor>  {prs ? `${list.length} open` : ""}{busy ? "  ⟳" : ""}</Text>
      </Text>
      <Text dimColor>{method}</Text>
    </Box>
  );

  const footer = (
    <Box flexDirection="column">
      <Text color={toast?.color ?? "gray"} wrap="truncate">{toast?.text ?? " "}</Text>
      <Text dimColor wrap="truncate">
        {view === "list"
          ? "j/k move · ⏎ open · m merge · a approve · o browser · z undo · r refresh · q quit"
          : "j/k scroll · space/b page · J/K next/prev PR · m merge · a approve · o browser · esc back"}
      </Text>
    </Box>
  );

  let body: React.ReactNode;
  if (!prs) {
    body = <Text dimColor>Loading pull requests…</Text>;
  } else if (!list.length) {
    body = (
      <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <Text bold color="green">Inbox zero.</Text>
        <Text dimColor>No open pull requests in {repo}.</Text>
      </Box>
    );
  } else if (view === "list") {
    const visible = bodyH;
    const start = Math.max(0, Math.min(cursor - Math.floor(visible / 2), list.length - visible));
    body = (
      <Box flexDirection="column">
        {list.slice(start, start + visible).map((p, i) => (
          <Row key={p.number} pr={p} selected={start + i === cursor} cols={cols} />
        ))}
      </Box>
    );
  } else {
    const [ci, ciColor] = CHECKS[pr!.checks];
    const [rv, rvColor] = review(pr!);
    body = (
      <Box flexDirection="column">
        <Text bold wrap="truncate">
          <Text dimColor>#{pr!.number} </Text>
          {pr!.title}
        </Text>
        <Text wrap="truncate">
          <Text color="blue">{pr!.author}</Text>
          <Text dimColor>  {pr!.baseRefName} ← {pr!.headRefName}  {age(pr!.createdAt)} ago  </Text>
          <Text color={ciColor}>{ci}  </Text>
          <Text color={rvColor}>{rv}  </Text>
          <Text color="green">+{pr!.additions} </Text>
          <Text color="red">−{pr!.deletions} </Text>
          <Text dimColor>{pr!.changedFiles} files</Text>
        </Text>
        <Text dimColor>{"─".repeat(cols)}</Text>
        {detailLines.slice(scroll, scroll + bodyH - 3).map((line, i) => (
          <Text key={scroll + i} wrap="truncate" {...diffColor(line)}>
            {line || " "}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      {header}
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {body}
      </Box>
      {footer}
    </Box>
  );
}
