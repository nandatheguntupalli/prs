import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import { age, checksStatus, compact, fit } from "./format.ts";
import { ICONS } from "./icons.ts";
import { BOLD } from "./primitives.tsx";

// the columns on the right of each PR's first line
const COLUMNS = [
  { label: "Cmts", width: 6 },
  { label: "Rev", width: 5 },
  { label: "CI", width: 4 },
  { label: "+/−", width: 14 },
  { label: "Upd", width: 5 },
  { label: "Age", width: 5 },
];
const RIGHT_W = COLUMNS.reduce((sum, c) => sum + c.width, 0) + 1;

// the review column: a verdict, a conflict, or who still has to look
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
  stack,
  selected,
  focused,
  width,
  onSelect,
}: {
  pr: PR;
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
  const stackTag = stack
    ? `  stack ${stack.index + 1}/${stack.stack.members.length}`
    : "";
  const meta = `${pr.repo} #${pr.number} by @${pr.author}`;
  const room = width - 4 - RIGHT_W;
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
          <span fg={pr.isDraft ? C.faint : C.blue}>
            {` ${pr.isDraft ? ICONS.draft : ICONS.pr}  `}
          </span>
          <span fg={C.dim}>
            {fit(meta, Math.max(8, room - stackTag.length))}
          </span>
          <span fg={C.blue}>{stackTag}</span>
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
          <span fg={pr.isDraft ? C.dim : C.text} attributes={BOLD}>
            {fit(pr.isDraft ? `${pr.title}  (draft)` : pr.title, width - 6)}
          </span>
        </text>
      </box>
      <text fg={C.border} wrapMode="none">
        {"─".repeat(Math.max(0, width))}
      </text>
    </box>
  );
};

// each PR takes its two lines and a separator
const BLOCK_H = 3;

export const PRTable = ({
  list,
  places,
  cursor,
  focused,
  width,
  height,
  onSelect,
}: {
  list: PR[];
  places: Map<string, StackPlace>;
  cursor: number;
  focused: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  // the header and the line under it take two lines
  const visible = Math.max(1, Math.floor((height - 2) / BLOCK_H));
  // keep the cursor roughly centered once the list is taller than the screen
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(visible / 2), list.length - visible)
  );
  return (
    <box width={width} flexDirection="column" overflow="hidden">
      <Header width={width} />
      <text fg={C.border} wrapMode="none">
        {"─".repeat(Math.max(0, width))}
      </text>
      {list.slice(start, start + visible).map((p, i) => (
        <PRBlock
          key={prKey(p)}
          pr={p}
          stack={places.get(prKey(p))}
          selected={start + i === cursor}
          focused={focused}
          width={width}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

// how many PRs a page is, for ctrl+d / ctrl+u
export const pageSize = (height: number) =>
  Math.max(1, Math.floor((height - 2) / BLOCK_H) - 1);
