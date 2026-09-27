import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import { age, checksStatus, pad, reviewStatus } from "./format.ts";
import { BOLD } from "./primitives.tsx";

// joins a stack's rows, top first: ╭ at the top, ├ in the middle, ╰ at the bottom
const stackGlyph = (place: StackPlace | undefined) => {
  if (!place) {
    return "  ";
  }
  if (place.index === place.stack.members.length - 1) {
    return "╭ ";
  }
  return place.index === 0 ? "╰ " : "├ ";
};

// one line per PR, in columns: marker and stack, number, title, author, age, checks, review, size
const LEAD_W = 4;
const AUTHOR_W = 16;
const AGE_W = 5;
const CI_W = 2;
const REVIEW_W = 11;
const SIZE_W = 15;
const TAIL_W = AUTHOR_W + AGE_W + CI_W + REVIEW_W + SIZE_W + 1;

// the number column, which carries the repo too when looking across repos
const numberWidth = (showRepo: boolean) => (showRepo ? 24 : 7);

const numberText = (pr: PR, showRepo: boolean) =>
  showRepo ? `${pr.repo.split("/")[1]}#${pr.number}` : `#${pr.number}`;

// how wide the table ever needs to be: only as wide as the longest title, so on a wide screen
// each PR's details stay next to its title instead of drifting to the far edge
export const tableContentWidth = (list: PR[], showRepo: boolean) => {
  const longest = Math.max(0, ...list.map((p) => p.title.length));
  return LEAD_W + numberWidth(showRepo) + longest + 2 + TAIL_W;
};

const titleWidth = (width: number, showRepo: boolean) =>
  Math.max(12, width - LEAD_W - numberWidth(showRepo) - 2 - TAIL_W);

const Header = ({ width, showRepo }: { width: number; showRepo: boolean }) => (
  <text fg={C.faint} wrapMode="none">
    {[
      " ".repeat(LEAD_W),
      pad(showRepo ? "Repo" : "#", numberWidth(showRepo)),
      pad("Title", titleWidth(width, showRepo) + 2),
      pad("Author", AUTHOR_W),
      "Age".padStart(AGE_W - 1),
      "  CI",
      " Review".padEnd(REVIEW_W - 1),
      "+/−".padStart(SIZE_W - 1),
    ].join("")}
  </text>
);

const PRRow = ({
  pr,
  stack,
  selected,
  focused,
  showRepo,
  width,
  onSelect,
}: {
  pr: PR;
  stack: StackPlace | undefined;
  selected: boolean;
  focused: boolean;
  showRepo: boolean;
  width: number;
  onSelect: () => void;
}) => {
  const lit = selected && focused;
  const ci = checksStatus(pr.checks);
  const rv = reviewStatus(pr);
  return (
    <box
      height={1}
      backgroundColor={lit ? C.selected : C.bg}
      onMouseDown={onSelect}
    >
      <text wrapMode="none">
        <span fg={focused ? C.accent : C.faint}>{selected ? "▌ " : "  "}</span>
        <span fg={C.blue}>{stackGlyph(stack)}</span>
        <span fg={C.dim}>
          {pad(numberText(pr, showRepo), numberWidth(showRepo))}
        </span>
        <span fg={pr.isDraft ? C.dim : C.text} attributes={lit ? BOLD : 0}>
          {pad(pr.title, titleWidth(width, showRepo))}
        </span>
        <span>{"  "}</span>
        <span fg={C.blue}>{pad(pr.author, AUTHOR_W)}</span>
        <span fg={C.faint}>{age(pr.updatedAt).padStart(AGE_W - 1)} </span>
        <span fg={ci.color}>{`${ci.icon} `}</span>
        <span fg={rv.color}>
          {pad(rv.short ? `${rv.icon} ${rv.short}` : "", REVIEW_W)}
        </span>
        <span fg={C.green}>{`+${pr.additions}`.padStart(7)}</span>
        <span fg={C.red}>{` −${pr.deletions}`.padStart(8)}</span>
      </text>
    </box>
  );
};

export const PRTable = ({
  list,
  places,
  cursor,
  focused,
  showRepo,
  width,
  height,
  onSelect,
}: {
  list: PR[];
  places: Map<string, StackPlace>;
  cursor: number;
  focused: boolean;
  showRepo: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  const rowW = Math.min(width, tableContentWidth(list, showRepo));
  // the header takes a line
  const visible = Math.max(1, height - 1);
  // keep the cursor roughly centered once the list is taller than the screen
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(visible / 2), list.length - visible)
  );
  return (
    <box width={width} flexDirection="column" overflow="hidden">
      <Header width={rowW} showRepo={showRepo} />
      {list.slice(start, start + visible).map((p, i) => (
        <PRRow
          key={prKey(p)}
          pr={p}
          stack={places.get(prKey(p))}
          selected={start + i === cursor}
          focused={focused}
          showRepo={showRepo}
          width={rowW}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

// how many rows a page is, for ctrl+d / ctrl+u
export const pageSize = (height: number) => Math.max(1, height - 2);
