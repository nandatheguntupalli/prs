import type { ReactNode } from "react";

import { isErrorLine } from "../github/checks.ts";
import type { Check, Step } from "../github/checks.ts";
import { C } from "../theme.ts";
import { checkIcon, duration, fit } from "./format.ts";
import { BOLD, Centered, ScrollList } from "./primitives.tsx";

export const ChecksView = ({
  title,
  checks,
  cursor,
  width,
  height,
}: {
  title: ReactNode;
  checks: Check[] | null;
  cursor: number;
  width: number;
  height: number;
}) => {
  const bodyH = height - 2;
  const failing = checks?.filter((c) => c.state === "fail").length ?? 0;
  const summary = checks
    ? `${checks.length} checks${failing ? ` · ${failing} failing` : ""} · ⏎ steps & logs for Actions jobs`
    : "";
  if (!checks) {
    return (
      <Centered>
        <text fg={C.dim}>Loading checks…</text>
      </Centered>
    );
  }
  if (checks.length === 0) {
    return (
      <Centered>
        <text fg={C.dim}>No checks on this PR.</text>
      </Centered>
    );
  }
  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
      {title}
      <text fg={C.faint}>{summary}</text>
      <ScrollList cursor={cursor} height={bodyH}>
        {checks.map((check, i) => {
          const on = i === cursor;
          const st = checkIcon(check.state);
          const time = duration(check.startedAt, check.completedAt);
          return (
            <box
              key={`${check.group}/${check.name}/${i}`}
              height={1}
              flexDirection="row"
              justifyContent="space-between"
              backgroundColor={on ? C.selected : C.bg}
            >
              <text wrapMode="none">
                <span fg={C.accent}>{on ? "▌ " : "  "}</span>
                <span fg={st.color}>{`${st.icon} `}</span>
                <span fg={C.text} attributes={on ? BOLD : 0}>
                  {fit(check.name, Math.max(10, width - 40))}
                </span>
                <span fg={C.faint}>
                  {check.group ? `  ${fit(check.group, 20)}` : ""}
                </span>
              </text>
              <text fg={C.faint}>
                {`${check.jobId ? "›" : "↗"} ${time}`.padStart(10)}
              </text>
            </box>
          );
        })}
      </ScrollList>
    </box>
  );
};

export const JobView = ({
  title,
  check,
  steps,
  log,
  cursor,
  width,
  height,
}: {
  title: ReactNode;
  check: Check;
  steps: Step[] | null;
  log: string[] | null;
  cursor: number;
  width: number;
  height: number;
}) => {
  const stepRows = Math.min(steps?.length ?? 1, Math.floor(height * 0.35));
  const logH = Math.max(3, height - stepRows - 4);
  const st = checkIcon(check.state);
  return (
    <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
      {title}
      <text wrapMode="none">
        <span fg={st.color}>{`${st.icon} `}</span>
        <span fg={C.text} attributes={BOLD}>
          {check.name}
        </span>
        <span fg={C.faint}>
          {`  ${check.group} · ${st.label} · ${duration(check.startedAt, check.completedAt)}`}
        </span>
      </text>
      <box flexDirection="column" height={stepRows} marginTop={1}>
        {(steps ?? []).slice(0, stepRows).map((s) => {
          const icon = checkIcon(s.state);
          return (
            <text key={s.number} wrapMode="none">
              <span fg={icon.color}>{`  ${icon.icon} `}</span>
              <span fg={s.state === "fail" ? C.red : C.dim}>
                {fit(`${s.number}. ${s.name}`, width - 20)}
              </span>
              <span
                fg={C.faint}
              >{`  ${duration(s.startedAt, s.completedAt)}`}</span>
            </text>
          );
        })}
      </box>
      <text fg={C.border}>{"─".repeat(Math.max(0, width - 2))}</text>
      {log ? (
        <ScrollList cursor={cursor} height={logH}>
          {log.map((line, i) => {
            const on = i === cursor;
            const bad = isErrorLine(line);
            return (
              <box
                // oxlint-disable-next-line react/no-array-index-key -- log lines are positional
                key={i}
                height={1}
                backgroundColor={on ? C.selected : C.bg}
              >
                <text wrapMode="none" fg={bad ? C.red : C.dim}>
                  <span fg={C.accent}>{on ? "▌" : " "}</span>
                  {fit(
                    line.replace(/^##\[(?:group|endgroup|error)\]/u, ""),
                    width - 3
                  )}
                </text>
              </box>
            );
          })}
        </ScrollList>
      ) : (
        <text fg={C.dim}>Loading log…</text>
      )}
    </box>
  );
};
