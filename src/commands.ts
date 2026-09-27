// The keymap, command palette, help screen and hint bar are all built from one list of commands.

import type { Hint } from "./ui/chrome.tsx";
import type { HelpSection } from "./ui/modals.tsx";

export type Screen = "list" | "diff" | "checks" | "job";

export interface Cmd {
  id: string;
  label: string;
  // "g g" is a two-key sequence
  keys: string[];
  section: "Pull requests" | "Moving around" | "Diff" | "Checks" | "App";
  screens: Screen[];
  run: () => unknown;
  paletteHidden?: boolean;
}

const KEY_LABELS: Record<string, string> = {
  " ": "space",
  down: "↓",
  escape: "esc",
  left: "←",
  return: "⏎",
  right: "→",
  "shift+tab": "⇧tab",
  up: "↑",
};

export const keyLabel = (key: string) =>
  KEY_LABELS[key] ?? key.replace("ctrl+", "^").replace("g g", "gg");

export const keymapFor = (commands: Cmd[], screen: Screen) =>
  new Map(
    commands
      .filter((c) => c.screens.includes(screen))
      .flatMap((c) => c.keys.map((k) => [k, c.run] as const))
  );

export const hintsFor = (commands: Cmd[], ids: string[]): Hint[] =>
  ids.flatMap((id) => {
    const cmd = commands.find((c) => c.id === id);
    const [first] = cmd?.keys ?? [];
    return cmd && first
      ? [{ keys: keyLabel(first), label: cmd.label.toLowerCase() }]
      : [];
  });

const SECTIONS: Cmd["section"][] = [
  "Pull requests",
  "Moving around",
  "Diff",
  "Checks",
  "App",
];

export const helpSections = (commands: Cmd[]): HelpSection[] =>
  SECTIONS.map((title) => ({
    keys: commands
      .filter((c) => c.section === title)
      .map((c) => ({ keys: c.keys.map(keyLabel).join(" "), label: c.label })),
    title,
  })).filter((s) => s.keys.length > 0);
