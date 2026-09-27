import { NativeImage, TextAttributes } from "@opentui/core";
import type { ImageRenderProtocol } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { errorMessage } from "./gh.ts";
import { ensureCache, fetchLatest, loadCommits } from "./git.ts";
import type { Source } from "./git.ts";
import { layout } from "./graph.ts";
import type { Cell, Commit, GraphRow } from "./graph.ts";
import { drawGraph } from "./raster.ts";
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
  cells,
  selected,
  width,
  onSelect,
}: {
  row: GraphRow;
  // the text-drawn lanes; empty when the graph is drawn as an image beside the rows
  cells: Cell[];
  selected: boolean;
  width: number;
  onSelect: () => void;
}) => {
  const { commit } = row;
  const isHead = commit.refs.some((r) => r.startsWith("HEAD"));
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

export interface CellPixels {
  w: number;
  h: number;
  protocol: ImageRenderProtocol;
}

// the terminal's cell size in pixels, when it can show images (kitty graphics or sixel)
export const useCellPixels = (enabled: boolean): CellPixels | null => {
  const renderer = useRenderer();
  const [cell, setCell] = useState<CellPixels | null>(null);

  // the renderer learns the pixel size asynchronously and again after resizes, without an event
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const check = () => {
      const caps = renderer.capabilities;
      const res = renderer.resolution;
      const protocol: ImageRenderProtocol = caps?.kitty_graphics
        ? "kitty"
        : "sixel";
      const next =
        (caps?.kitty_graphics || caps?.sixel) &&
        res &&
        renderer.terminalWidth > 0
          ? {
              h: res.height / renderer.terminalHeight,
              protocol,
              w: res.width / renderer.terminalWidth,
            }
          : null;
      setCell((prev) =>
        prev?.w === next?.w &&
        prev?.h === next?.h &&
        prev?.protocol === next?.protocol
          ? prev
          : next
      );
    };
    check();
    const timer = setInterval(check, 300);
    return () => clearInterval(timer);
  }, [enabled, renderer]);

  return enabled ? cell : null;
};

const PixelGraph = ({
  rows,
  start,
  count,
  cols,
  selected,
  cell,
}: {
  rows: GraphRow[];
  start: number;
  count: number;
  cols: number;
  selected: number;
  cell: CellPixels;
}) => {
  const image = useMemo(() => {
    const px = drawGraph(rows.slice(start, start + count), {
      bg: C.bg,
      cellH: cell.h,
      cellW: cell.w,
      cols,
      selected,
      selectedBg: C.selected,
    });
    return NativeImage.fromRgba(px.data, px.width, px.height);
  }, [rows, start, count, cols, selected, cell]);

  // the image renderable keeps its own reference, so ours can go when it's replaced
  useEffect(() => () => image.dispose(), [image]);

  return (
    <image
      source={image}
      fit="fill"
      protocol={cell.protocol}
      width={cols}
      height={Math.min(count, rows.length - start)}
    />
  );
};

export const GraphView = ({
  rows,
  status,
  cursor,
  focused,
  cell,
  width,
  height,
  onSelect,
}: {
  rows: GraphRow[] | null;
  status: string;
  cursor: number;
  focused: boolean;
  // set when the terminal can show images; the graph is then drawn as pixels
  cell: CellPixels | null;
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
  const listH = height - 1;
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(listH / 2), rows.length - listH)
  );
  const visible = rows.slice(start, start + listH);
  // wide graphs get clipped so the subjects stay readable
  const maxW = Math.floor(inner * 0.4);
  const selected = focused ? cursor - start : -1;

  if (cell) {
    const cols = Math.min(
      maxW,
      Math.max(...visible.map((r) => trimCells(r.cells).length))
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
        <box flexDirection="row">
          <PixelGraph
            rows={rows}
            start={start}
            count={listH}
            cols={cols}
            selected={selected}
            cell={cell}
          />
          <box flexDirection="column" flexGrow={1}>
            {visible.map((row, i) => (
              <CommitRow
                key={row.commit.hash}
                row={row}
                cells={[]}
                selected={i === selected}
                width={inner - cols}
                onSelect={() => onSelect(start + i)}
              />
            ))}
          </box>
        </box>
      </box>
    );
  }

  return (
    <box
      width={width}
      flexDirection="column"
      border={["right"]}
      borderColor={C.border}
      paddingLeft={1}
    >
      {header}
      {visible.map((row, i) => (
        <CommitRow
          key={row.commit.hash}
          row={row}
          // like VS Code, the text starts right after this row's own lanes
          cells={trimCells(row.cells).slice(0, maxW)}
          selected={i === selected}
          width={inner}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

export const commitTitle = (commit: Commit) =>
  `${commit.short} ${commit.subject}`;
