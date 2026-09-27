import { memo } from "react";
import type { ReactNode } from "react";

import { C } from "../theme.ts";
import type { ParsedDiff, Row } from "./diff-model.ts";
import { age, fit, plural } from "./format.ts";
import { BOLD, ScrollList } from "./primitives.tsx";

// old line, new line, sign
const GUTTER = 11;

const num = (n: number | null) => (n === null ? "" : String(n)).padStart(4);

const DiffRow = ({
  row,
  width,
  cursor,
  inRange,
}: {
  row: Row;
  width: number;
  cursor: boolean;
  inRange: boolean;
}) => {
  const marker = <span fg={C.accent}>{cursor ? "▌" : " "}</span>;
  if (row.kind === "file") {
    const stats = ` +${row.additions} −${row.deletions} `;
    return (
      <box height={1} backgroundColor={cursor ? C.selected : C.panel}>
        <text wrapMode="none">
          {marker}
          <span fg={C.accent} attributes={BOLD}>
            {` ${fit(row.path, width - stats.length - 4)}`}
          </span>
          <span fg={C.green}>{` +${row.additions}`}</span>
          <span fg={C.red}>{` −${row.deletions}`}</span>
        </text>
      </box>
    );
  }
  if (row.kind === "hunk") {
    return (
      <box height={1} backgroundColor={cursor ? C.selected : C.bg}>
        <text wrapMode="none" fg={C.cyan}>
          {marker}
          {fit(`${" ".repeat(GUTTER - 1)}${row.text}`, width - 1)}
        </text>
      </box>
    );
  }
  if (row.kind === "comment") {
    const indent = " ".repeat(GUTTER);
    const bar = <span fg={row.outdated ? C.faint : C.yellow}>{"│ "}</span>;
    return (
      <box height={1} backgroundColor={cursor ? C.selected : C.panel}>
        <text wrapMode="none">
          {marker}
          <span>{indent}</span>
          {bar}
          {row.part === "head" ? (
            <span>
              <span fg={C.text} attributes={BOLD}>
                {row.author}
              </span>
              <span fg={C.faint}>
                {` · ${age(row.createdAt)}${row.outdated ? " · outdated" : ""}`}
              </span>
            </span>
          ) : (
            <span fg={C.dim}>{fit(row.text, width - GUTTER - 4)}</span>
          )}
        </text>
      </box>
    );
  }
  if (row.kind === "meta") {
    return (
      <box height={1} backgroundColor={cursor ? C.selected : C.bg}>
        <text wrapMode="none" fg={C.faint}>
          {marker}
          {fit(` ${row.text}`, width - 1)}
        </text>
      </box>
    );
  }
  const tint = { " ": C.bg, "+": C.addBg, "-": C.delBg }[row.sign];
  const signColor = { " ": C.faint, "+": C.green, "-": C.red }[row.sign];
  let bg = tint;
  if (inRange) {
    bg = C.accentSoft;
  }
  if (cursor) {
    bg = C.selected;
  }
  return (
    <box height={1} backgroundColor={bg}>
      <text wrapMode="none">
        {marker}
        <span fg={C.faint}>{`${num(row.old)} ${num(row.new)} `}</span>
        <span fg={signColor}>{row.sign}</span>
        <span fg={C.text}>{` ${fit(row.text, width - GUTTER - 3)}`}</span>
      </text>
    </box>
  );
};

// only the rows whose cursor or range state changed re-render
const RowView = memo(DiffRow);

export const DiffView = ({
  title,
  subtitle,
  rows,
  cursor,
  rangeStart,
  width,
  height,
  loading,
}: {
  title: ReactNode;
  subtitle: string;
  rows: Row[];
  cursor: number;
  rangeStart: number | null;
  width: number;
  height: number;
  loading: boolean;
}) => {
  const bodyH = height - 2;
  const [lo, hi] =
    rangeStart === null
      ? [-1, -1]
      : [Math.min(rangeStart, cursor), Math.max(rangeStart, cursor)];
  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
      {title}
      <text fg={C.faint} wrapMode="none" truncate>
        {subtitle}
      </text>
      {loading ? (
        <text fg={C.dim} marginTop={1}>
          Loading diff…
        </text>
      ) : (
        <ScrollList cursor={cursor} height={bodyH}>
          {rows.map((row, i) => (
            <RowView
              // oxlint-disable-next-line react/no-array-index-key -- rows are positional
              key={i}
              row={row}
              width={width - 2}
              cursor={i === cursor}
              inRange={i >= lo && i <= hi}
            />
          ))}
        </ScrollList>
      )}
    </box>
  );
};

export const jump = (
  rows: Row[],
  from: number,
  dir: 1 | -1,
  test: (row: Row) => boolean
) => {
  for (let i = from + dir; i >= 0 && i < rows.length; i += dir) {
    const row = rows[i];
    if (row && test(row)) {
      return i;
    }
  }
  return from;
};

export const fileAt = (rows: Row[], at: number) => {
  for (let i = Math.min(at, rows.length - 1); i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.kind === "file") {
      return row.path;
    }
  }
  return "";
};

export const diffSubtitle = (
  diff: ParsedDiff | null,
  threadCount: number,
  where: string,
  selecting: boolean
) =>
  [
    plural(diff?.files.length ?? 0, "file"),
    threadCount ? plural(threadCount, "comment thread") : "",
    where ? fit(where, 60) : "",
    selecting ? "selecting lines, ⏎ to comment" : "",
  ]
    .filter(Boolean)
    .join(" · ");
