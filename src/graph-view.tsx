import { TextAttributes } from "@opentui/core";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { errorMessage } from "./gh.ts";
import { ensureCache, fetchLatest, loadCommits } from "./git.ts";
import type { Source } from "./git.ts";
import { layout } from "./graph.ts";
import type { Cell, Commit, GraphRow } from "./graph.ts";
import { C } from "./theme.ts";

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
  // the first time for a repo without a local clone, history has to be downloaded
  const [status, setStatus] = useState(
    local ? "" : `Getting ${repo} history (first time only)…`
  );
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

const trimCells = (cells: Cell[]) => {
  let end = cells.length;
  while (end > 0 && cells[end - 1]?.ch === " ") {
    end -= 1;
  }
  return cells.slice(0, end);
};

const pillText = (pill: Badge | null, room: number) => {
  if (!pill) {
    return "";
  }
  const more = pill.more > 0 ? ` +${pill.more}` : "";
  return fit(` ${pill.label}${more} `, Math.max(6, Math.min(22, room)));
};

// graph, then the branch pill right next to the commit, then subject and author
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
  const isHead = commit.refs.some((r) => r.startsWith("HEAD"));
  // like VS Code, the text starts right after this row's own lanes
  const cells = trimCells(row.cells).slice(0, graphW);
  const room = Math.max(8, width - cells.length - 1);
  const pill = pillText(badge(commit.refs), Math.floor(room / 2));
  const textW = Math.max(4, room - pill.length - (pill ? 1 : 0));
  const subject = fit(commit.subject, textW);
  // the author only shows when the whole subject fits
  const author =
    subject === commit.subject
      ? fit(` ${commit.author}`, textW - subject.length)
      : "";

  return (
    <box
      height={1}
      backgroundColor={selected ? C.selected : C.bg}
      onMouseDown={onSelect}
    >
      <text wrapMode="none">
        {runs(cells).map((cell) => (
          <span key={cell.at} fg={cell.color || C.bg}>
            {cell.ch}
          </span>
        ))}
        <span> </span>
        {pill ? (
          <span bg={row.color} fg="#ffffff" attributes={BOLD}>
            {pill}
          </span>
        ) : null}
        {pill ? <span> </span> : null}
        <span fg={C.text} attributes={isHead || selected ? BOLD : 0}>
          {subject}
        </span>
        <span fg={C.dim}>{author}</span>
      </text>
    </box>
  );
};

export const GraphView = ({
  rows,
  status,
  cursor,
  focused,
  width,
  height,
  onSelect,
}: {
  rows: GraphRow[] | null;
  status: string;
  cursor: number;
  focused: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  const count = rows?.length ? `${rows.length} commits` : "";
  const header = (
    <text wrapMode="none" truncate>
      <span fg={focused ? C.accent : C.dim} attributes={BOLD}>
        Graph
      </span>
      <span fg={C.faint}> {status || count}</span>
    </text>
  );
  if (!rows?.length) {
    return (
      <box
        width={width}
        flexDirection="column"
        border={["right"]}
        borderColor={C.border}
        paddingLeft={1}
      >
        {header}
        <text fg={C.dim} marginTop={1} wrapMode="word">
          {status || "Loading history…"}
        </text>
      </box>
    );
  }
  // inside the pane: left padding and the right border
  const inner = width - 2;
  const widest = Math.max(...rows.map((r) => r.cells.length));
  // wide graphs get clipped so the subjects stay readable
  const graphW = Math.min(widest, Math.floor(inner * 0.4));
  const listH = height - 1;
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(listH / 2), rows.length - listH)
  );
  return (
    <box
      width={width}
      flexDirection="column"
      border={["right"]}
      borderColor={C.border}
      paddingLeft={1}
    >
      {header}
      {rows.slice(start, start + listH).map((row, i) => (
        <CommitRow
          key={row.commit.hash}
          row={row}
          selected={focused && start + i === cursor}
          graphW={graphW}
          width={inner}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

export const commitTitle = (commit: Commit) =>
  `${commit.short} ${commit.subject}`;
