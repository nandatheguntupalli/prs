import type { KeyEvent } from "@opentui/core";

// keys that OpenTUI reports by name; everything else is matched by the character typed
const NAMED_KEYS = new Set([
  "backspace",
  "down",
  "end",
  "escape",
  "home",
  "left",
  "pagedown",
  "pageup",
  "return",
  "right",
  "space",
  "tab",
  "up",
]);

export const keyId = (key: KeyEvent) => {
  if (key.ctrl) {
    return `ctrl+${key.name}`;
  }
  if (NAMED_KEYS.has(key.name)) {
    if (key.name === "space") {
      return " ";
    }
    return key.shift ? `shift+${key.name}` : key.name;
  }
  return key.sequence;
};

export type Action = () => unknown;

export const bind = (keys: string[], action: Action) =>
  keys.map((k) => [k, action] as const);

// two-key sequences like "g g" fire when the second key follows within this window
const SEQUENCE_MS = 600;

export const sequence = () => {
  let last = { at: 0, id: "" };
  return (id: string) => {
    const now = Date.now();
    const combo = now - last.at < SEQUENCE_MS ? `${last.id} ${id}` : "";
    last = { at: now, id };
    return combo;
  };
};
