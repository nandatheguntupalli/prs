import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

// pane widths as fractions: the graph of the whole window, the sidebar of what's right of the graph
export interface PaneSizes {
  graph: number;
  sidebar: number;
}

export const DEFAULT_SIZES: PaneSizes = { graph: 0.4, sidebar: 0.42 };

const LIMITS: Record<keyof PaneSizes, [number, number]> = {
  graph: [0.15, 0.7],
  sidebar: [0.2, 0.7],
};

export const clampSize = (pane: keyof PaneSizes, fraction: number) => {
  const [min, max] = LIMITS[pane];
  return Math.min(max, Math.max(min, fraction));
};

const file = () =>
  path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "prs",
    "layout.json"
  );

export const loadSizes = async (): Promise<PaneSizes> => {
  try {
    const saved: Partial<PaneSizes> = await Bun.file(file()).json();
    return {
      graph: clampSize("graph", saved.graph ?? DEFAULT_SIZES.graph),
      sidebar: clampSize("sidebar", saved.sidebar ?? DEFAULT_SIZES.sidebar),
    };
  } catch {
    return DEFAULT_SIZES;
  }
};

export const saveSizes = async (sizes: PaneSizes) => {
  await mkdir(path.dirname(file()), { recursive: true });
  await Bun.write(file(), `${JSON.stringify(sizes, null, 2)}\n`);
};
