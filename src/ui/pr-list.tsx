import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import { age, checksStatus, fit, labelText, reviewStatus } from "./format.ts";
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

// the stack line continues down the second row of every member but the bottom one
const stackRail = (place: StackPlace | undefined) =>
  place && place.index > 0 ? "│ " : "  ";

// checks and review state, on the right of the first line
const STATUS_W = 13;
// size, on the right of the second line (or the first, in compact rows)
const SIZE_W = 15;

const Status = ({ pr }: { pr: PR }) => {
  const ci = checksStatus(pr.checks);
  const rv = reviewStatus(pr);
  return (
    <text wrapMode="none">
      <span fg={ci.color}>{`${ci.icon} `}</span>
      <span fg={rv.color}>
        {`${rv.short ? rv.icon : " "} ${rv.short}`.padEnd(STATUS_W - 2)}
      </span>
    </text>
  );
};

const Size = ({ pr }: { pr: PR }) => (
  <text wrapMode="none">
    <span fg={C.green}>{`+${pr.additions}`.padStart(7)}</span>
    <span fg={C.red}>{` −${pr.deletions}`.padStart(8)}</span>
  </text>
);

// as many of a PR's labels as fit in `room` columns
const fitLabels = (labels: PR["labels"], room: number) => {
  const shown: PR["labels"] = [];
  let used = 0;
  for (const label of labels) {
    used += label.name.length + 3;
    if (used > room) {
      break;
    }
    shown.push(label);
  }
  return shown;
};

const Labels = ({ pr, room }: { pr: PR; room: number }) => (
  <>
    {fitLabels(pr.labels, room).map((l) => (
      <span key={l.name}>
        <span> </span>
        <span bg={`#${l.color}`} fg={labelText(l.color)}>{` ${l.name} `}</span>
      </span>
    ))}
  </>
);

const PRRow = ({
  pr,
  stack,
  selected,
  focused,
  compact,
  showRepo,
  width,
  onSelect,
}: {
  pr: PR;
  stack: StackPlace | undefined;
  selected: boolean;
  focused: boolean;
  // one line per PR, for views where the author is always the same
  compact: boolean;
  showRepo: boolean;
  width: number;
  onSelect: () => void;
}) => {
  const lit = selected && focused;
  const bg = lit ? C.selected : C.bg;
  const marker = selected ? "▌ " : "  ";
  const markerColor = focused ? C.accent : C.faint;
  // compact rows carry the number (and, across repos, the repo) up front
  const numberW = showRepo ? 22 : 7;
  const titleW = Math.max(
    10,
    width - 6 - STATUS_W - (compact ? SIZE_W + numberW : 0)
  );
  const number = showRepo ? `${pr.repo}#${pr.number}` : `#${pr.number}`;
  const meta = [number, pr.author, pr.headRefName, age(pr.updatedAt)];
  if (pr.comments > 0) {
    meta.push(`${pr.comments} comments`);
  }
  const metaText = fit(meta.join(" · "), Math.max(10, width - 5 - SIZE_W));

  return (
    <box flexDirection="column" backgroundColor={bg} onMouseDown={onSelect}>
      <box
        height={1}
        width={width}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text wrapMode="none">
          <span fg={markerColor}>{marker}</span>
          <span fg={C.blue}>{stackGlyph(stack)}</span>
          {compact ? (
            <span fg={C.dim}>
              {`${showRepo ? pr.repo.split("/")[1] : ""}#${pr.number}`.padEnd(
                numberW
              )}
            </span>
          ) : null}
          <span fg={pr.isDraft ? C.dim : C.text} attributes={lit ? BOLD : 0}>
            {fit(pr.title, titleW)}
          </span>
        </text>
        <box flexDirection="row" paddingRight={1}>
          <Status pr={pr} />
          {compact ? <Size pr={pr} /> : null}
        </box>
      </box>
      {compact ? null : (
        <box
          height={1}
          width={width}
          flexDirection="row"
          justifyContent="space-between"
        >
          <text wrapMode="none">
            <span fg={markerColor}>{marker}</span>
            <span fg={C.blue}>{stackRail(stack)}</span>
            <span fg={C.faint}>{metaText}</span>
            <Labels pr={pr} room={width - 6 - SIZE_W - metaText.length} />
          </text>
          <box paddingRight={1}>
            <Size pr={pr} />
          </box>
        </box>
      )}
    </box>
  );
};

// how wide the table ever needs to be: rows are only as wide as the longest title, so on a wide
// screen each PR's status stays next to its title instead of drifting to the far edge
export const tableContentWidth = (
  list: PR[],
  compact: boolean,
  showRepo: boolean
) => {
  const numberW = showRepo ? 22 : 7;
  const fixed = 6 + STATUS_W + (compact ? SIZE_W + numberW : 0);
  const longest = Math.max(0, ...list.map((p) => p.title.length));
  return fixed + longest + 2;
};

export const PRTable = ({
  list,
  places,
  cursor,
  focused,
  compact,
  showRepo,
  width,
  height,
  onSelect,
}: {
  list: PR[];
  places: Map<string, StackPlace>;
  cursor: number;
  focused: boolean;
  compact: boolean;
  showRepo: boolean;
  width: number;
  height: number;
  onSelect: (i: number) => void;
}) => {
  const rowH = compact ? 1 : 2;
  const rowW = Math.min(width, tableContentWidth(list, compact, showRepo));
  const visible = Math.max(1, Math.floor(height / rowH));
  // keep the cursor roughly centered once the list is taller than the screen
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(visible / 2), list.length - visible)
  );
  return (
    <box width={width} flexDirection="column" overflow="hidden">
      {list.slice(start, start + visible).map((p, i) => (
        <PRRow
          key={prKey(p)}
          pr={p}
          stack={places.get(prKey(p))}
          selected={start + i === cursor}
          focused={focused}
          compact={compact}
          showRepo={showRepo}
          width={rowW}
          onSelect={() => onSelect(start + i)}
        />
      ))}
    </box>
  );
};

// how many rows a page is, for ctrl+d / ctrl+u
export const pageSize = (height: number, compact: boolean) =>
  Math.max(1, Math.floor(height / (compact ? 1 : 2)) - 1);
