import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import { age, checksStatus, compact, fit } from "./format.ts";
import { BOLD, ScrollList } from "./primitives.tsx";
import { isOpen, statusLook } from "./status.ts";
import type { Status } from "./status.ts";

const COLUMNS = [
  { label: "Cmts", width: 6 },
  { label: "Rev", width: 5 },
  { label: "CI", width: 4 },
  { label: "+/−", width: 14 },
  { label: "Upd", width: 5 },
  { label: "Age", width: 5 },
];
const RIGHT_W = COLUMNS.reduce((sum, c) => sum + c.width, 0) + 1;

const reviewMark = (pr: PR): { icon: string; color: string } => {
  if (pr.mergeable === "CONFLICTING") {
    return { color: C.red, icon: "⚠" };
  }
  switch (pr.reviewDecision) {
    case "APPROVED": {
      return { color: C.green, icon: "✓" };
    }
    case "CHANGES_REQUESTED": {
      return { color: C.red, icon: "±" };
    }
    case "REVIEW_REQUIRED": {
      return { color: C.yellow, icon: "○" };
    }
    default: {
      return { color: C.faint, icon: "·" };
    }
  }
};

const cell = (text: string, width: number) =>
  text.padStart(width - 1).padEnd(width);

const Header = ({ width }: { width: number }) => (
  <box
    height={1}
    flexDirection="row"
    justifyContent="space-between"
    width={width}
  >
    <text fg={C.faint} wrapMode="none">
      {"    Title"}
    </text>
    <text fg={C.faint} wrapMode="none">
      {`${COLUMNS.map((c) => cell(c.label, c.width)).join("")} `}
    </text>
  </box>
);

const PRBlock = ({
  pr,
  status,
  stack,
  selected,
  focused,
  width,
  onSelect,
}: {
  pr: PR;
  status: Status;
  stack: StackPlace | undefined;
  selected: boolean;
  focused: boolean;
  width: number;
  onSelect: () => void;
}) => {
  const lit = selected && focused;
  const bg = lit ? C.selected : C.bg;
  const marker = (
    <span fg={focused ? C.accent : C.faint}>{selected ? "▌" : " "}</span>
  );
  const ci = checksStatus(pr.checks);
  const rv = reviewMark(pr);
  const look = statusLook(status);
  const open = isOpen(status);
  let tag = "";
  if (!open) {
    tag = `  ${look.label}`;
  } else if (stack) {
    tag = `  stack ${stack.index + 1}/${stack.stack.members.length}`;
  }
  const meta = `${pr.repo} #${pr.number} by @${pr.author}`;
  const room = width - 4 - RIGHT_W;
  const title = pr.isDraft && open ? `${pr.title}  (draft)` : pr.title;
  return (
    <box flexDirection="column" onMouseDown={onSelect}>
      <box
        height={1}
        backgroundColor={bg}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text wrapMode="none">
          {marker}
          <span fg={look.color}>{` ${look.icon}  `}</span>
          <span fg={C.dim}>{fit(meta, Math.max(8, room - tag.length))}</span>
          <span fg={open ? C.blue : look.color} attributes={open ? 0 : BOLD}>
            {tag}
          </span>
        </text>
        <text wrapMode="none">
          <span fg={C.faint}>
            {cell(pr.comments ? String(pr.comments) : "", 6)}
          </span>
          <span fg={rv.color}>{cell(rv.icon, 5)}</span>
          <span fg={ci.color}>
            {cell(pr.checks === "none" ? "" : ci.icon, 4)}
          </span>
          <span fg={C.green}>{`+${compact(pr.additions)}`.padStart(7)}</span>
          <span fg={C.red}>{` −${compact(pr.deletions)}`.padEnd(7)}</span>
          <span fg={C.faint}>{cell(age(pr.updatedAt), 5)}</span>
          <span fg={C.faint}>{cell(age(pr.createdAt), 5)}</span>
          <span> </span>
        </text>
      </box>
      <box height={1} backgroundColor={bg}>
        <text wrapMode="none">
          {marker}
          <span>{"    "}</span>
          <span fg={pr.isDraft || !open ? C.dim : C.text} attributes={BOLD}>
            {fit(title, width - 6)}
          </span>
        </text>
      </box>
      <text fg={C.border} wrapMode="none">
        {"─".repeat(Math.max(0, width))}
      </text>
    </box>
  );
};

// two lines plus a separator
const BLOCK_H = 3;

export const PRTable = ({
  list,
  places,
  statusOf,
  cursor,
  focused,
  width,
  height,
  onSelect,
}: {
  list: PR[];
  places: Map<string, StackPlace>;
  statusOf: (pr: PR) => Status;
  cursor: number;
  focused: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => (
  <box width={width} flexDirection="column" overflow="hidden">
    <Header width={width} />
    <text fg={C.border} wrapMode="none">
      {"─".repeat(Math.max(0, width))}
    </text>
    <ScrollList cursor={cursor} rowHeight={BLOCK_H} height={height - 2}>
      {list.map((p, i) => (
        <PRBlock
          key={prKey(p)}
          pr={p}
          status={statusOf(p)}
          stack={places.get(prKey(p))}
          selected={i === cursor}
          focused={focused}
          width={width}
          onSelect={() => onSelect(i)}
        />
      ))}
    </ScrollList>
  </box>
);

export const pageSize = (height: number) =>
  Math.max(1, Math.floor((height - 2) / BLOCK_H) - 1);
