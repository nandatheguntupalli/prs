import { TextAttributes } from "@opentui/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { C } from "../theme.ts";
import { fit } from "./format.ts";
import { ICONS } from "./icons.ts";
import type { Action } from "./keys.ts";

export const { BOLD } = TextAttributes;

// Spans, so it can sit inside a <text>. The caps take the color of whatever is behind them.
// Takes label.length + 2 columns.
export const Pill = ({
  label,
  fg,
  bg,
  bold = true,
}: {
  label: string;
  fg: string;
  bg: string;
  bold?: boolean;
}) => (
  <>
    <span fg={bg}>{ICONS.capL}</span>
    <span fg={fg} bg={bg} attributes={bold ? BOLD : 0}>
      {label}
    </span>
    <span fg={bg}>{ICONS.capR}</span>
  </>
);

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
    <text wrapMode="none">
      <Pill label={` ${label} `} fg={C.bg} bg={color} />
    </text>
  </box>
);

export const KeyHint = ({ keys, label }: { keys: string; label: string }) => (
  <text wrapMode="none">
    <Pill label={keys} fg={C.accent} bg={C.accentSoft} />
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
  // `width` is what the caller laid out for, with one column of padding a side
  const w = Math.min(width + 2, dims.width - 4);
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
        borderColor={C.faint}
        backgroundColor={C.panel}
        title={` ${title} `}
        titleColor={C.accent}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
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

export interface Choice {
  name: string;
  // shown right-aligned, like a key or a count
  hint?: string;
}

// OpenTUI's <select>. When a search box above it has focus, the parent drives `index`.
export const Choices = ({
  choices,
  index,
  height,
  width,
  focused = false,
  onChange,
  onSelect,
}: {
  choices: Choice[];
  index?: number;
  height: number;
  width: number;
  focused?: boolean;
  onChange?: (i: number) => void;
  onSelect?: (i: number) => void;
}) => {
  if (choices.length === 0) {
    return <text fg={C.faint}>Nothing matches.</text>;
  }
  // the indicator and padding take 4 columns
  const room = width - 4;
  const options = choices.map((c) => {
    const hint = c.hint ? ` ${c.hint}` : "";
    const name = fit(c.name, Math.max(4, room - hint.length));
    return { description: "", name: name + hint.padStart(room - name.length) };
  });
  return (
    // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- a terminal widget, not a DOM control
    <select
      options={options}
      selectedIndex={index}
      focused={focused}
      width={width}
      height={Math.min(height, choices.length)}
      showDescription={false}
      showScrollIndicator
      backgroundColor={C.panel}
      focusedBackgroundColor={C.panel}
      textColor={C.dim}
      focusedTextColor={C.dim}
      selectedBackgroundColor={C.selected}
      selectedTextColor={C.text}
      onChange={(i) => onChange?.(i)}
      onSelect={(i) => onSelect?.(i)}
    />
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

// a <scrollbox> of equal-height rows that keeps the cursor's row near the middle
export const ScrollList = ({
  cursor,
  rowHeight = 1,
  height,
  children,
}: {
  cursor: number;
  rowHeight?: number;
  height: number;
  children: ReactNode;
}) => {
  const ref = useRef<ScrollBoxRenderable>(null);
  useEffect(() => {
    const above = Math.floor((Math.floor(height / rowHeight) - 1) / 2);
    ref.current?.scrollTo(Math.max(0, cursor - above) * rowHeight);
  }, [cursor, rowHeight, height]);
  return (
    <scrollbox
      ref={ref}
      height={height}
      scrollY
      verticalScrollbarOptions={{ visible: false }}
    >
      {children}
      {/* so scrolling to the very end still lands on a row boundary */}
      <box height={height % rowHeight} />
    </scrollbox>
  );
};
