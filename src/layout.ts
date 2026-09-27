import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

// fraction of the window
export interface PaneSizes {
  sidebar: number;
}

export const DEFAULT_SIZES: PaneSizes = { sidebar: 0.36 };

const LIMITS: Record<keyof PaneSizes, [number, number]> = {
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
