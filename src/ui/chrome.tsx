import type { MergeMethod, PR, UpdateMethod } from "../github/prs.ts";
import { C } from "../theme.ts";
import { fit } from "./format.ts";
import { ICONS } from "./icons.ts";
import type { Action } from "./keys.ts";
import { BOLD, Button, KeyHint, Pill, Spinner } from "./primitives.tsx";

// github.com/pulls when looking across every repo
export const pullsUrl = (scope: string) =>
  scope ? `https://github.com/${scope}/pulls` : "https://github.com/pulls";

export const Header = ({
  scope,
  busy,
  dryRun,
  method,
  updateMethod,
  onOpenPulls,
}: {
  // empty when looking across every repo
  scope: string;
  busy: boolean;
  dryRun: boolean;
  method: MergeMethod;
  updateMethod: UpdateMethod;
  onOpenPulls: Action;
}) => {
  const [owner, name] = scope.split("/");
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      height={3}
      flexShrink={0}
      backgroundColor={C.panel}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
    >
      <text wrapMode="none">
        <span fg={C.text}>{`${ICONS.github}  `}</span>
        {scope ? (
          <a href={`https://github.com/${scope}`}>
            <span fg={C.dim}>{`${owner} / `}</span>
            <span fg={C.text} attributes={BOLD}>
              {name}
            </span>
          </a>
        ) : (
          <span fg={C.text} attributes={BOLD}>
            All repos
          </span>
        )}
        <span fg={C.faint}>{"   ◆ prs"}</span>
        {busy ? <span fg={C.faint}>{"  "}</span> : null}
        {busy ? <Spinner /> : null}
      </text>
      <box flexDirection="row" gap={2}>
        <text wrapMode="none">
          {dryRun ? <Pill label="dry run" fg={C.bg} bg={C.yellow} /> : null}
          <span fg={C.faint}>{dryRun ? "  m " : "m "}</span>
          <span fg={C.dim}>{method}</span>
          <span fg={C.faint}>{" · u "}</span>
          <span fg={C.dim}>{updateMethod}</span>
        </text>
        <Button
          label="Pull requests ↗"
          color={C.accent}
          onPress={onOpenPulls}
        />
      </box>
    </box>
  );
};

export interface Tab {
  id: string;
  label: string;
  count: number | undefined;
}

export const TabBar = ({
  tabs,
  active,
  filter,
  filtering,
  onSelect,
  onFilter,
}: {
  tabs: Tab[];
  active: string;
  filter: string;
  filtering: boolean;
  onSelect: (id: string) => void;
  onFilter: (value: string) => void;
}) => (
  <box
    flexDirection="row"
    justifyContent="space-between"
    height={1}
    paddingLeft={2}
    paddingRight={2}
    marginTop={1}
  >
    <box flexDirection="row" gap={1}>
      {tabs.map((t, i) => {
        const on = t.id === active;
        return (
          <box key={t.id} onMouseDown={() => onSelect(t.id)}>
            <text wrapMode="none">
              <span fg={on ? C.accentSoft : C.bg}>{ICONS.capL}</span>
              <span fg={C.faint} bg={on ? C.accentSoft : C.bg}>
                {`${i + 1} `}
              </span>
              <span
                fg={on ? C.accent : C.dim}
                bg={on ? C.accentSoft : C.bg}
                attributes={on ? BOLD : 0}
              >
                {`${t.label} `}
              </span>
              <span fg={on ? C.text : C.faint} bg={on ? C.accentSoft : C.bg}>
                {t.count === undefined ? "" : `${t.count}`}
              </span>
              <span fg={on ? C.accentSoft : C.bg}>{ICONS.capR}</span>
            </text>
          </box>
        );
      })}
    </box>
    {filtering || filter ? (
      <box flexDirection="row" width={34}>
        <text fg={C.accent}>/ </text>
        {filtering ? (
          <input
            focused
            value={filter}
            placeholder="filter by title, author, branch…"
            width={30}
            textColor={C.text}
            placeholderColor={C.faint}
            backgroundColor={C.bg}
            focusedBackgroundColor={C.bg}
            onInput={onFilter}
          />
        ) : (
          <text fg={C.text}>
            {fit(filter, 26)}
            <span fg={C.faint}> esc clears</span>
          </text>
        )}
      </box>
    ) : null}
  </box>
);

export interface Hint {
  keys: string;
  label: string;
}

export interface Toast {
  text: string;
  color: string;
}

const fitHints = (hints: Hint[], room: number) => {
  const shown: Hint[] = [];
  let used = 0;
  for (const h of hints) {
    used += h.keys.length + h.label.length + 5;
    if (used > room) {
      break;
    }
    shown.push(h);
  }
  return shown;
};

export const Footer = ({
  toast,
  hints,
  width,
}: {
  toast: Toast | null;
  hints: Hint[];
  width: number;
}) => {
  const help = { keys: "?", label: "help" };
  const shown = fitHints(
    hints,
    width - 4 - (help.keys.length + help.label.length + 5)
  );
  return (
    <box flexDirection="column" height={2} paddingLeft={2} paddingRight={2}>
      <text fg={toast?.color ?? C.dim} wrapMode="none" truncate>
        {toast?.text ?? " "}
      </text>
      <box flexDirection="row" gap={2} height={1}>
        {[...shown, help].map((h) => (
          <KeyHint key={h.keys} keys={h.keys} label={h.label} />
        ))}
      </box>
    </box>
  );
};

export const PRTitle = ({ pr, showRepo }: { pr: PR; showRepo: boolean }) => (
  <text wrapMode="none" truncate>
    <span fg={C.accent}>
      {showRepo ? `${pr.repo}#${pr.number} ` : `#${pr.number} `}
    </span>
    <span fg={C.text} attributes={BOLD}>
      {pr.title}
    </span>
    <span fg={C.green}>{`  +${pr.additions}`}</span>
    <span fg={C.red}>{` −${pr.deletions}`}</span>
  </text>
);
