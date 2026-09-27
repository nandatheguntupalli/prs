// Draws graph rows as pixels, for terminals that can show images: anti-aliased lanes that run
// through the commit dots and rounded curves where branches fork and merge, like VS Code.

import type { GraphRow, Link } from "./graph.ts";

export interface Pixels {
  data: Uint8Array;
  width: number;
  height: number;
}

// drawing is clipped to one row at a time, so lines from neighboring rows never overlap
interface Canvas extends Pixels {
  clipTop: number;
  clipBottom: number;
}

type RGB = [number, number, number];
type Point = [number, number];

const rgb = (hex: string): RGB => {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  return [channel(1), channel(3), channel(5)];
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// straight-alpha "over" blend of one pixel
const blend = (px: Canvas, x: number, y: number, color: RGB, alpha: number) => {
  if (
    alpha <= 0 ||
    x < 0 ||
    x >= px.width ||
    y < px.clipTop ||
    y >= px.clipBottom
  ) {
    return;
  }
  const i = (y * px.width + x) * 4;
  const dst = (px.data[i + 3] ?? 0) / 255;
  const out = alpha + dst * (1 - alpha);
  for (const [k, c] of color.entries()) {
    const d = px.data[i + k] ?? 0;
    px.data[i + k] = Math.round((c * alpha + d * dst * (1 - alpha)) / out);
  }
  px.data[i + 3] = Math.round(out * 255);
};

const distToSegment = (p: Point, a: Point, b: Point) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

// strokes a polyline in one pass, taking the nearest segment per pixel so joints don't double up
const stroke = (px: Canvas, points: Point[], width: number, color: RGB) => {
  const half = width / 2;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - half - 1));
  const x1 = Math.min(px.width - 1, Math.ceil(Math.max(...xs) + half + 1));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - half - 1));
  const y1 = Math.min(px.height - 1, Math.ceil(Math.max(...ys) + half + 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const p: Point = [x + 0.5, y + 0.5];
      let d = Number.POSITIVE_INFINITY;
      let prev: Point | undefined;
      for (const point of points) {
        if (prev) {
          d = Math.min(d, distToSegment(p, prev, point));
        }
        prev = point;
      }
      blend(px, x, y, color, clamp01(half + 0.5 - d));
    }
  }
};

// a filled disc, or a ring when `ring` gives its line width
const circle = (
  px: Canvas,
  [cx, cy]: Point,
  r: number,
  color: RGB,
  ring?: number
) => {
  const reach = r + (ring ?? 0) + 1;
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y += 1) {
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover =
        ring === undefined
          ? clamp01(r + 0.5 - d)
          : clamp01(ring / 2 + 0.5 - Math.abs(d - r));
      blend(px, x, y, color, cover);
    }
  }
};

const fillRect = (
  px: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGB
) => {
  for (
    let y = Math.max(0, Math.round(y0));
    y < Math.min(px.height, Math.round(y1));
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.round(x0));
      x < Math.min(px.width, Math.round(x1));
      x += 1
    ) {
      blend(px, x, y, color, 1);
    }
  }
};

// a quarter curve from `from` to `to`, bending through the corner at `corner`
const curve = (from: Point, corner: Point, to: Point, steps = 10): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * from[0] + 2 * u * t * corner[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * corner[1] + t * t * to[1],
    ];
  });

export interface DrawOptions {
  cellW: number;
  cellH: number;
  // width of the image in terminal cells
  cols: number;
  selected: number;
  bg: string;
  selectedBg: string;
}

// the path from a commit's dot out to another lane on the same row
const linkPath = (
  link: Link,
  node: Point,
  laneX: number,
  top: number,
  bottom: number,
  radius: number
): Point[] => {
  const dir = Math.sign(laneX - node[0]);
  const bend: Point = [laneX - dir * radius, node[1]];
  const corner: Point = [laneX, node[1]];
  // a lane that ends here comes down from above and turns in toward the dot
  if (link.joins) {
    return [
      [laneX, top],
      [laneX, node[1] - radius],
      ...curve([laneX, node[1] - radius], corner, bend),
      node,
    ];
  }
  // otherwise the dot sends a line out that turns down into the lane below
  return [
    node,
    bend,
    ...curve(bend, corner, [laneX, node[1] + radius]),
    [laneX, bottom],
  ];
};

export const drawGraph = (rows: GraphRow[], opts: DrawOptions): Pixels => {
  const { cellW, cellH } = opts;
  const width = Math.max(1, Math.round(opts.cols * cellW));
  const height = Math.max(1, Math.round(rows.length * cellH));
  const px: Canvas = {
    clipBottom: 0,
    clipTop: 0,
    data: new Uint8Array(width * height * 4),
    height,
    width,
  };

  const lineW = Math.max(1.5, cellH / 12);
  const dotR = Math.min(cellW * 0.95, cellH * 0.2);
  const radius = Math.min(cellW * 1.5, cellH / 2);
  const bg = rgb(opts.bg);
  const laneX = (i: number) => (i * 2 + 0.5) * cellW;

  for (const [r, row] of rows.entries()) {
    const rowTop = r * cellH;
    const rowBottom = rowTop + cellH;
    px.clipTop = Math.round(rowTop);
    px.clipBottom = Math.round(rowBottom);
    // lines run past the row's edges so their end caps are clipped away and rows join seamlessly
    const top = rowTop - lineW;
    const bottom = rowBottom + lineW;
    const cy = rowTop + cellH / 2;
    const g = row.geometry;
    const color = (i: number) => rgb(g.colors[i] || "#888888");
    // an opaque background, so terminals that handle transparency poorly (sixel) still look right
    const rowBg = r === opts.selected ? rgb(opts.selectedBg) : bg;
    fillRect(px, 0, rowTop, width, rowBottom, rowBg);

    // lanes passing straight through this row (a lane that ends here isn't "below")
    for (let i = 0; i < g.above.length; i += 1) {
      if (i !== g.col && g.above[i] && g.below[i]) {
        stroke(
          px,
          [
            [laneX(i), top],
            [laneX(i), bottom],
          ],
          lineW,
          color(i)
        );
      }
    }

    const node: Point = [laneX(g.col), cy];
    // the commit's own lane, running into and out of the dot
    if (g.above[g.col]) {
      stroke(px, [[node[0], top], node], lineW, color(g.col));
    }
    if (g.below[g.col]) {
      stroke(px, [node, [node[0], bottom]], lineW, color(g.col));
    }
    for (const link of g.links) {
      stroke(
        px,
        linkPath(link, node, laneX(link.col), top, bottom, radius),
        lineW,
        color(link.col)
      );
    }

    // merges and HEAD are rings with the background showing inside, like VS Code
    const c = color(g.col);
    if (g.kind === "commit") {
      circle(px, node, dotR, c);
    } else {
      circle(px, node, dotR + lineW / 2, rowBg);
      circle(px, node, dotR, c, lineW);
      if (g.kind === "merge") {
        circle(px, node, dotR * 0.4, c);
      }
    }
  }
  return px;
};
