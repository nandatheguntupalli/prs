import { TextAttributes } from "@opentui/core";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { errorMessage } from "./gh.ts";
import { ensureCache, fetchLatest, loadCommits } from "./git.ts";
import type { Source } from "./git.ts";
import { layout } from "./graph.ts";
import type { Cell, Commit, GraphRow } from "./graph.ts";

const { BOLD } = TextAttributes;

export interface GraphState {
  rows: GraphRow[] | null;
  status: string;
  source: Source | null;
  reload: () => void;
}

// loads history the first time the graph is shown, then fetches in the background
export const useGraph = (
  repo: string,
  local: string | null,
  active: boolean
): GraphState => {
  const [rows, setRows] = useState<GraphRow[] | null>(null);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const started = useRef(false);

  const read = async (src: Source) => {
    const commits = await loadCommits(src);
    setRows(layout(commits));
  };

  const refetch = async (src: Source) => {
    setStatus("Fetching…");
    try {
      await fetchLatest(src);
      await read(src);
      setStatus("");
    } catch (error) {
      setStatus(`Couldn't fetch: ${errorMessage(error)}`);
    }
  };

  const start = useEffectEvent(async () => {
    try {
      const src = local
        ? { cached: false, dir: local }
        : await ensureCache(repo);
      setSource(src);
      await read(src);
      await refetch(src);
    } catch (error) {
      setStatus(`✗ ${errorMessage(error)}`);
      setRows((r) => r ?? []);
    }
  });

  // runs once, the first time the tab opens
  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      start();
    }
  }, [active]);

  const reload = () => {
    if (source) {
      refetch(source);
    }
  };

  return { reload, rows, source, status };
};

interface Badge {
  label: string;
  more: number;
}

// VS Code shows one pill per commit: the checked-out branch first, then local, remote, tags
const badge = (refs: string[]): Badge | null => {
  const names = refs
    .map((r) => r.replace(/^HEAD -> /u, ""))
    .filter((r) => r !== "HEAD" && !r.endsWith("/HEAD"));
  if (names.length === 0) {
    return null;
  }
  const head = refs.find((r) => r.startsWith("HEAD -> "))?.slice(8);
  const tags = names.filter((r) => r.startsWith("tag: "));
  const remotes = names.filter((r) => r.startsWith("origin/"));
  const local = names.find((r) => !tags.includes(r) && !remotes.includes(r));
  const synced = (name: string) => remotes.includes(`origin/${name}`);

  let label: string;
  if (head) {
    label = `◎ ${head}${synced(head) ? " ☁" : ""}`;
  } else if (local) {
    label = `⎇ ${local}${synced(local) ? " ☁" : ""}`;
  } else if (remotes[0]) {
    label = `☁ ${remotes[0]}`;
  } else {
    label = `◇ ${tags[0]?.slice(5) ?? ""}`;
  }
  // a local branch and its remote count as one pill
  const shown = 1 + (head || local ? Number(synced(head ?? local ?? "")) : 0);
  return { label, more: names.length - shown };
};

const BADGE_W = 22;

const fit = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;

// merges runs of same-colored cells so each row is a handful of spans
const runs = (cells: Cell[]) => {
  const out: (Cell & { at: number })[] = [];
  for (const [at, cell] of cells.entries()) {
    const last = out.at(-1);
    if (last && last.color === cell.color) {
      last.ch += cell.ch;
    } else {
      out.push({ ...cell, at });
    }
  }
  return out;
};

const CommitRow = ({
  row,
  selected,
  graphW,
  width,
  onSelect,
}: {
  row: GraphRow;
  selected: boolean;
  graphW: number;
  width: number;
  onSelect: () => void;
}) => {
  const { commit } = row;
  const pill = badge(commit.refs);
  const isHead = commit.refs.some((r) => r.startsWith("HEAD"));
  const textW = Math.max(10, width - graphW - BADGE_W - 3);
  const subject = fit(commit.subject, textW);
  const author = fit(` ${commit.author}`, textW - subject.length);
  const pillText = pill
    ? fit(` ${pill.label}${pill.more > 0 ? ` +${pill.more}` : ""} `, BADGE_W)
    : "";

  return (
    <box
      height={1}
      flexDirection="row"
      backgroundColor={selected ? "#18181f" : "#000000"}
      onMouseDown={onSelect}
    >
      <text wrapMode="none">
        {runs(row.cells.slice(0, graphW)).map((cell) => (
          <span key={cell.at} fg={cell.color || "#000000"}>
            {cell.ch}
          </span>
        ))}
      </text>
      <text wrapMode="none" flexGrow={1}>
        <span fg="#e5e5e5" attributes={isHead || selected ? BOLD : 0}>
          {` ${subject}`}
        </span>
        <span fg="#737373">{author}</span>
      </text>
      {pill ? (
        <text wrapMode="none" bg={row.color} fg="#ffffff" attributes={BOLD}>
          {pillText}
        </text>
      ) : null}
      <text> </text>
    </box>
  );
};

export const GraphView = ({
  rows,
  status,
  cursor,
  width,
  height,
  onSelect,
}: {
  rows: GraphRow[] | null;
  status: string;
  cursor: number;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  if (!rows?.length) {
    return (
      <box flexGrow={1} alignItems="center" justifyContent="center">
        <text fg="#737373">{status || "Loading history…"}</text>
      </box>
    );
  }
  const widest = Math.max(...rows.map((r) => r.cells.length));
  // wide graphs get clipped so the subjects stay readable
  const graphW = Math.min(widest, Math.floor(width * 0.35));
  const listH = height - 1;
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(listH / 2), rows.length - listH)
  );
  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1}>
      <text fg="#3f3f46" wrapMode="none" truncate>
        {status || `${rows.length} commits`}
      </text>
      {rows.slice(start, start + listH).map((row, i) => (
        <CommitRow
          key={row.commit.hash}
          row={row}
          selected={start + i === cursor}
          graphW={graphW}
          width={width - 1}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

export const commitTitle = (commit: Commit) =>
  `${commit.short} ${commit.subject}`;
