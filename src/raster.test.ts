import { describe, expect, test } from "bun:test";

import { layout } from "./graph.ts";
import type { Commit } from "./graph.ts";
import { drawGraph } from "./raster.ts";

const commit = (hash: string, parents: string[]): Commit => ({
  author: "a",
  date: "",
  hash,
  parents,
  refs: [],
  short: hash,
  subject: hash,
});

const opts = {
  bg: "#000000",
  cellH: 20,
  cellW: 10,
  cols: 4,
  selected: -1,
  selectedBg: "#18181f",
};

const pixel = (px: ReturnType<typeof drawGraph>, x: number, y: number) => {
  const i = (y * px.width + x) * 4;
  return [...px.data.subarray(i, i + 4)];
};

describe("drawGraph", () => {
  // a straight line: c -> b -> a, all in lane 0
  const line = layout([
    commit("c", ["b"]),
    commit("b", ["a"]),
    commit("a", []),
  ]);

  test("sizes the image to whole cells", () => {
    const px = drawGraph(line, opts);
    expect([px.width, px.height]).toEqual([40, 60]);
  });

  test("the lane runs unbroken across row boundaries", () => {
    const px = drawGraph(line, opts);
    // lane 0's center is x = 5; rows meet at y = 20 and y = 40
    const alphas = [18, 19, 20, 21, 38, 39, 40, 41].map(
      (y) => pixel(px, 5, y)[3]
    );
    expect(alphas.every((a) => a === 255)).toBe(true);
    const colors = [19, 20, 39, 40].map((y) => pixel(px, 5, y).join(","));
    expect(new Set(colors).size).toBe(1);
  });

  test("the background is opaque and the selected row is highlighted", () => {
    const px = drawGraph(line, { ...opts, selected: 1 });
    expect(pixel(px, 35, 5)).toEqual([0, 0, 0, 255]);
    expect(pixel(px, 35, 25)).toEqual([0x18, 0x18, 0x1f, 255]);
  });
});
