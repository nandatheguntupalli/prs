// Lays out a commit graph the way VS Code's Source Control graph does: one row per commit,
// colored lanes, and rounded connectors where branches fork off and merge back.

export interface Commit {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  refs: string[];
  subject: string;
  date: string;
}

export interface Cell {
  ch: string;
  color: string;
}

export type NodeKind = "head" | "merge" | "commit";

// the same row as lines and curves rather than characters, for drawing it as pixels
export interface Geometry {
  col: number;
  kind: NodeKind;
  // lanes with a line coming in from the row above / going on to the row below
  above: boolean[];
  below: boolean[];
  links: Link[];
  colors: string[];
}

export interface GraphRow {
  commit: Commit;
  // two cells per lane: the lane itself, then the gap to its right
  cells: Cell[];
  color: string;
  geometry: Geometry;
}

// VS Code's graph palette
export const LANE_COLORS = [
  "#4c9df3",
  "#f2b53b",
  "#e0457b",
  "#4fb3a4",
  "#b77df4",
  "#c96f2d",
  "#3fb950",
  "#e3743f",
];

const BLANK = { ch: " ", color: "" };

const nodeKind = (commit: Commit): NodeKind => {
  if (commit.refs.some((r) => r.startsWith("HEAD"))) {
    return "head";
  }
  return commit.parents.length > 1 ? "merge" : "commit";
};

const NODE_GLYPHS: Record<NodeKind, string> = {
  commit: "●",
  head: "○",
  merge: "◉",
};

export interface Link {
  col: number;
  // the lane already existed above this row, so its vertical line runs through
  through: boolean;
  // this lane ends here, joining the commit from above
  joins: boolean;
}

const linkGlyph = (link: Link, col: number) => {
  const right = link.col > col;
  if (link.joins) {
    return right ? "╯" : "╰";
  }
  if (link.through) {
    return right ? "┤" : "├";
  }
  return right ? "╮" : "╭";
};

interface Lanes {
  // which commit each lane is waiting for, and its color
  hashes: (string | null)[];
  colors: string[];
}

// a horizontal connector between two lanes; where it crosses a lane it draws ┼ so the line stays unbroken
const paintConnector = (cells: Cell[], a: number, b: number, color: string) => {
  const [from, to] = a < b ? [a, b] : [b, a];
  for (let x = from * 2 + 1; x < to * 2; x += 1) {
    const crossing = x % 2 === 0 && ["│", "┼"].includes(cells[x]?.ch ?? "");
    cells[x] = { ch: crossing ? "┼" : "─", color };
  }
};

const paintRow = (
  commit: Commit,
  col: number,
  links: Link[],
  above: boolean[],
  lanes: Lanes
): Cell[] => {
  const width = Math.max(above.length, lanes.hashes.length);
  const cells: Cell[] = Array.from({ length: width * 2 }, () => BLANK);
  const colorOf = (i: number) => lanes.colors[i] ?? "";

  for (let i = 0; i < width; i += 1) {
    if (above[i] || lanes.hashes[i]) {
      cells[i * 2] = { ch: "│", color: colorOf(i) };
    }
  }
  // farthest first, so nearer connectors paint over them
  const byDistance = links.toSorted(
    (a, b) => Math.abs(b.col - col) - Math.abs(a.col - col)
  );
  for (const link of byDistance) {
    paintConnector(cells, col, link.col, colorOf(link.col));
  }
  for (const link of links) {
    cells[link.col * 2] = {
      ch: linkGlyph(link, col),
      color: colorOf(link.col),
    };
  }
  cells[col * 2] = { ch: NODE_GLYPHS[nodeKind(commit)], color: colorOf(col) };
  return cells;
};

export const layout = (commits: Commit[]): GraphRow[] => {
  const lanes: Lanes = { colors: [], hashes: [] };
  let nextColor = 0;

  const open = (hash: string, taken: Set<number>) => {
    let i = lanes.hashes.findIndex((l, j) => l === null && !taken.has(j));
    if (i === -1) {
      i = lanes.hashes.length;
    }
    lanes.hashes[i] = hash;
    lanes.colors[i] = LANE_COLORS[nextColor % LANE_COLORS.length] ?? "";
    nextColor += 1;
    return i;
  };

  return commits.map((commit) => {
    const above = lanes.hashes.map((l) => l !== null);
    const waiting = lanes.hashes.flatMap((l, i) =>
      l === commit.hash ? [i] : []
    );
    // nobody was waiting for this commit, so it's the tip of a branch
    const col = waiting[0] ?? open(commit.hash, new Set());

    // every other lane waiting for this commit forked from it, and ends here
    const links: Link[] = waiting
      .slice(1)
      .map((c) => ({ col: c, joins: true, through: true }));
    const taken = new Set(waiting);

    lanes.hashes[col] = commit.parents[0] ?? null;
    for (const parent of commit.parents.slice(1)) {
      const existing = lanes.hashes.indexOf(parent);
      if (existing === -1 || existing === col) {
        const c = open(parent, taken);
        taken.add(c);
        links.push({ col: c, joins: false, through: false });
      } else {
        links.push({ col: existing, joins: false, through: true });
      }
    }
    for (const link of links.filter((l) => l.joins)) {
      lanes.hashes[link.col] = null;
    }

    const cells = paintRow(commit, col, links, above, lanes);
    const color = lanes.colors[col] ?? "";
    const geometry: Geometry = {
      above,
      below: lanes.hashes.map((l) => l !== null),
      col,
      colors: [...lanes.colors],
      kind: nodeKind(commit),
      links,
    };

    // drop lanes that have ended off the right edge
    while (lanes.hashes.length > 0 && lanes.hashes.at(-1) === null) {
      lanes.hashes.pop();
      lanes.colors.pop();
    }

    return { cells, color, commit, geometry };
  });
};
