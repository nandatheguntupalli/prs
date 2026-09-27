import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { C } from "../theme.ts";
import { fit } from "./format.ts";
import type { Action } from "./keys.ts";

export const { BOLD } = TextAttributes;

export const Button = ({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: Action;
}) => (
  <box height={1} onMouseDown={onPress}>
    <text fg={C.bg} bg={color} attributes={BOLD}>
      {` ${label} `}
    </text>
  </box>
);

export const KeyHint = ({ keys, label }: { keys: string; label: string }) => (
  <text wrapMode="none">
    <span fg={C.accent} bg={C.accentSoft} attributes={BOLD}>
      {` ${keys} `}
    </span>
    <span fg={C.dim}>{` ${label}`}</span>
  </text>
);

export const Centered = ({ children }: { children: ReactNode }) => (
  <box
    flexGrow={1}
    alignItems="center"
    justifyContent="center"
    flexDirection="column"
  >
    {children}
  </box>
);

export const SectionTitle = ({ children }: { children: string }) => (
  <text fg={C.faint} attributes={BOLD} marginTop={1}>
    {children.toUpperCase()}
  </text>
);

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

export const Spinner = ({ color }: { color?: string }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % FRAMES.length),
      80
    );
    return () => clearInterval(timer);
  }, []);
  return <span fg={color ?? C.accent}>{FRAMES[frame]}</span>;
};

export const Modal = ({
  title,
  width,
  height,
  children,
  footer,
}: {
  title: string;
  width: number;
  height?: number;
  children: ReactNode;
  footer?: string;
}) => {
  const dims = useTerminalDimensions();
  const w = Math.min(width, dims.width - 4);
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width={dims.width}
      height={dims.height}
      zIndex={10}
      alignItems="center"
      justifyContent="center"
    >
      <box
        width={w}
        height={height ? Math.min(height, dims.height - 2) : undefined}
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={C.accent}
        backgroundColor={C.panel}
        title={` ${title} `}
        titleColor={C.accent}
        paddingLeft={1}
        paddingRight={1}
      >
        {children}
        {footer ? (
          <text fg={C.faint} marginTop={1} wrapMode="none" truncate>
            {footer}
          </text>
        ) : null}
      </box>
    </box>
  );
};

export interface ListItem {
  key: string;
  label: string;
  hint?: string;
  color?: string;
  mark?: string;
  markColor?: string;
}

export const PickList = ({
  items,
  cursor,
  height,
  width,
  onPick,
}: {
  items: ListItem[];
  cursor: number;
  height: number;
  width: number;
  onPick?: (i: number) => void;
}) => {
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), items.length - height)
  );
  if (items.length === 0) {
    return <text fg={C.faint}>Nothing matches.</text>;
  }
  return (
    <box flexDirection="column" height={Math.min(height, items.length)}>
      {items.slice(start, start + height).map((item, i) => {
        const on = start + i === cursor;
        const hintW = item.hint ? item.hint.length + 2 : 0;
        const markW = item.mark ? 2 : 0;
        return (
          <box
            key={item.key}
            height={1}
            flexDirection="row"
            justifyContent="space-between"
            backgroundColor={on ? C.selected : C.panel}
            onMouseDown={() => onPick?.(start + i)}
          >
            <text wrapMode="none">
              <span fg={C.accent}>{on ? "› " : "  "}</span>
              {item.mark ? (
                <span fg={item.markColor ?? C.accent}>{`${item.mark} `}</span>
              ) : null}
              <span
                fg={item.color ?? (on ? C.text : C.dim)}
                attributes={on ? BOLD : 0}
              >
                {fit(item.label, Math.max(4, width - 4 - hintW - markW))}
              </span>
            </text>
            {item.hint ? <text fg={C.faint}>{item.hint}</text> : null}
          </box>
        );
      })}
    </box>
  );
};

// fuzzy: every character of the query, in order
export const fuzzy = (query: string, text: string) => {
  const q = query.toLowerCase().replaceAll(" ", "");
  const t = text.toLowerCase();
  let at = 0;
  for (const ch of q) {
    at = t.indexOf(ch, at);
    if (at === -1) {
      return false;
    }
    at += 1;
  }
  return true;
};
