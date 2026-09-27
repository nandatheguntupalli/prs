import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { ThemeChoice } from "./theme.ts";
import type { IconStyle } from "./ui/icons.ts";

export interface Config {
  theme: ThemeChoice;
  icons?: IconStyle;
  // {{repo}} {{owner}} {{name}} {{number}} {{headRef}} {{baseRef}} {{author}} {{url}} {{repoPath}}
  editorCommand?: string;
  repoPaths?: Record<string, string>;
  sections?: { title: string; filter: string }[];
}

const DEFAULTS: Config = { theme: "system" };

export const configDir = () =>
  path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "prs"
  );

const file = () => path.join(configDir(), "config.json");

export const loadConfig = async (): Promise<Config> => {
  try {
    return { ...DEFAULTS, ...(await Bun.file(file()).json()) };
  } catch {
    return DEFAULTS;
  }
};

// merge into what's on disk so hand-written keys survive
export const saveConfig = async (changes: Partial<Config>) => {
  let current: Record<string, unknown> = {};
  try {
    current = await Bun.file(file()).json();
  } catch {
    // no file yet
  }
  await mkdir(configDir(), { recursive: true });
  await Bun.write(
    file(),
    `${JSON.stringify({ ...current, ...changes }, null, 2)}\n`
  );
};

const expandHome = (p: string) =>
  p.startsWith("~") ? path.join(homedir(), p.slice(1)) : p;

export const repoPath = (config: Config, repo: string): string | null => {
  const paths = config.repoPaths ?? {};
  const [owner = "", name = ""] = repo.split("/");
  const exact = paths[repo];
  if (exact) {
    return expandHome(exact);
  }
  const ownerWide = paths[`${owner}/*`];
  if (ownerWide) {
    return expandHome(ownerWide.replaceAll("*", name));
  }
  const template = paths[":owner/:repo"];
  if (template) {
    return expandHome(
      template.replaceAll(":owner", owner).replaceAll(":repo", name)
    );
  }
  return null;
};
