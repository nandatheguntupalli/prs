import type { MergeMethod, PR, UpdateMethod } from "../github/prs.ts";
import { C } from "../theme.ts";
import { fit } from "./format.ts";
import { BOLD, KeyHint, Spinner } from "./primitives.tsx";

export const Header = ({
  scope,
  busy,
  dryRun,
  method,
  updateMethod,
}: {
  // empty when looking across every repo
  scope: string;
  busy: boolean;
  dryRun: boolean;
  method: MergeMethod;
  updateMethod: UpdateMethod;
}) => {
  const [owner, name] = scope.split("/");
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      height={1}
      paddingLeft={1}
      paddingRight={1}
    >
      <text wrapMode="none">
        <span fg={C.accent} attributes={BOLD}>
          ◆ prs
        </span>
        <span fg={C.faint}>{"  "}</span>
        {scope ? (
          <span>
            <span fg={C.dim}>{`${owner} / `}</span>
            <span fg={C.text} attributes={BOLD}>
              {name}
            </span>
          </span>
        ) : (
          <span fg={C.text} attributes={BOLD}>
            All repos
          </span>
        )}
        {busy ? <span fg={C.faint}>{"  "}</span> : null}
        {busy ? <Spinner /> : null}
      </text>
      <text wrapMode="none">
        {dryRun ? (
          <span fg={C.bg} bg={C.yellow} attributes={BOLD}>
            {" DRY RUN "}
          </span>
        ) : null}
        <span fg={C.faint}>{"  m "}</span>
        <span fg={C.dim}>{method}</span>
        <span fg={C.faint}>{" · u "}</span>
        <span fg={C.dim}>{updateMethod}</span>
      </text>
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
    paddingLeft={1}
    paddingRight={1}
    marginTop={1}
  >
    <box flexDirection="row" gap={1}>
      {tabs.map((t, i) => {
        const on = t.id === active;
        return (
          <box key={t.id} onMouseDown={() => onSelect(t.id)}>
            <text
              wrapMode="none"
              fg={on ? C.accent : C.dim}
              bg={on ? C.accentSoft : C.bg}
              attributes={on ? BOLD : 0}
            >
              {` ${i + 1} ${t.label} `}
              <span fg={on ? C.text : C.faint}>
                {t.count === undefined ? "" : `${t.count} `}
              </span>
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
    width - 2 - (help.keys.length + help.label.length + 5)
  );
  return (
    <box flexDirection="column" height={2} paddingLeft={1} paddingRight={1}>
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
