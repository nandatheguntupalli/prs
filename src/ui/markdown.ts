import { SyntaxStyle } from "@opentui/core";

import { C } from "../theme.ts";

// SyntaxStyle is native, so build one per palette and reuse it
const cache = new Map<string, SyntaxStyle>();

export const markdownStyle = () => {
  const key = `${C.text}${C.accent}${C.dim}${C.cyan}${C.blue}${C.faint}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const style = SyntaxStyle.fromStyles({
    conceal: { fg: C.faint },
    default: { fg: C.dim },
    "markup.heading": { bold: true, fg: C.text },
    "markup.heading.1": { bold: true, fg: C.accent },
    "markup.italic": { fg: C.dim, italic: true },
    "markup.link": { fg: C.blue },
    "markup.link.label": { fg: C.blue, underline: true },
    "markup.link.url": { fg: C.faint },
    "markup.list": { fg: C.accent },
    "markup.quote": { fg: C.faint, italic: true },
    "markup.raw": { fg: C.cyan },
    "markup.raw.block": { fg: C.cyan },
    "markup.strikethrough": { dim: true, fg: C.faint },
    "markup.strong": { bold: true, fg: C.text },
  });
  cache.set(key, style);
  return style;
};
