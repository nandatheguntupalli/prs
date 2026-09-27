import { listChecks } from "../github/checks.ts";
import { listActivity, listCommits, listFiles } from "../github/details.ts";
import type { PR } from "../github/prs.ts";
import { useLoader } from "../hooks/use-loader.ts";
import { prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import {
  age,
  checkIcon,
  checksStatus,
  cleanMarkdown,
  duration,
  fit,
  labelText,
  plural,
  reviewState,
  reviewStatus,
} from "./format.ts";
import type { Action } from "./keys.ts";
import { markdownStyle } from "./markdown.ts";
import { BOLD, Button, SectionTitle } from "./primitives.tsx";
import { isOpen, statusLook } from "./status.ts";
import type { Status } from "./status.ts";

export interface PRActions {
  handleMerge: Action;
  handleApprove: Action;
  handleUpdate: Action;
  handleClose: Action;
  handleOpen: Action;
}

const BehindLine = ({ pr, behind }: { pr: PR; behind: number | undefined }) => {
  if (behind === undefined) {
    return <text fg={C.faint}>… checking {pr.baseRefName}</text>;
  }
  if (behind < 0) {
    return null;
  }
  if (behind === 0) {
    return <text fg={C.dim}>✓ Up to date with {pr.baseRefName}</text>;
  }
  return (
    <text fg={C.yellow}>
      ↓ {plural(behind, "commit")} behind {pr.baseRefName}
    </text>
  );
};

const Reviewers = ({ pr, width }: { pr: PR; width: number }) => {
  const reviewed = pr.reviews.filter((r) => !r.author.endsWith("[bot]"));
  const waiting = pr.reviewRequests.filter(
    (who) => !reviewed.some((r) => r.author === who)
  );
  if (reviewed.length === 0 && waiting.length === 0) {
    return null;
  }
  return (
    <box flexDirection="column">
      <SectionTitle>Reviewers</SectionTitle>
      {reviewed.map((r) => {
        const st = reviewState(r.state);
        return (
          <text key={r.author} wrapMode="none">
            <span fg={st.color}>{`${st.icon} `}</span>
            <span fg={C.text}>{fit(r.author, width - 20)}</span>
            <span fg={C.faint}>{` ${st.label}`}</span>
          </text>
        );
      })}
      {waiting.map((who) => (
        <text key={who} wrapMode="none">
          <span fg={C.yellow}>○ </span>
          <span fg={C.text}>{fit(who, width - 20)}</span>
          <span fg={C.faint}> requested</span>
        </text>
      ))}
    </box>
  );
};

const StackList = ({
  pr,
  place,
  width,
}: {
  pr: PR;
  place: StackPlace;
  width: number;
}) => {
  const { members, native } = place.stack;
  return (
    <box flexDirection="column">
      <SectionTitle>
        {`Stack · ${members.length} PRs${native === null ? "" : ` · #${native} on GitHub`}`}
      </SectionTitle>
      {members.toReversed().map((member, i) => {
        const index = members.length - 1 - i;
        const current = prKey(member) === prKey(pr);
        return (
          <text key={prKey(member)} wrapMode="none">
            <span fg={C.blue}>{current ? "● " : "○ "}</span>
            <span
              fg={index <= place.index ? C.text : C.faint}
              attributes={current ? BOLD : 0}
            >
              {fit(`#${member.number} ${member.title}`, width - 6)}
            </span>
          </text>
        );
      })}
    </box>
  );
};

const LabelChips = ({ pr }: { pr: PR }) =>
  pr.labels.length === 0 ? null : (
    <box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
      {pr.labels.map((l) => (
        <text key={l.name} bg={`#${l.color}`} fg={labelText(l.color)}>
          {` ${l.name} `}
        </text>
      ))}
    </box>
  );

export type DetailTab =
  | "overview"
  | "activity"
  | "commits"
  | "checks"
  | "files";

export const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "commits", label: "Commits" },
  { id: "checks", label: "Checks" },
  { id: "files", label: "Files Changed" },
];

const Loading = ({ error }: { error: string }) => (
  <text fg={error ? C.red : C.faint}>{error || "Loading…"}</text>
);

const DetailHeader = ({
  pr,
  status,
  width,
  tab,
  onTab,
}: {
  pr: PR;
  status: Status;
  width: number;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
}) => {
  const association =
    pr.authorAssociation && pr.authorAssociation !== "NONE"
      ? ` · ${pr.authorAssociation.toLowerCase()}`
      : "";
  const look = statusLook(status);
  const pill = ` ${look.icon} ${look.label} `;
  return (
    <box flexDirection="column" flexShrink={0}>
      <box
        flexDirection="column"
        backgroundColor={C.panel}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={C.dim} wrapMode="none">
          <a href={pr.url}>{fit(`${pr.repo} · #${pr.number}`, width - 4)}</a>
        </text>
        <text fg={C.text} attributes={BOLD} wrapMode="word" marginTop={1}>
          {pr.title}
        </text>
      </box>
      <box flexDirection="column" paddingLeft={1} marginTop={1}>
        <text wrapMode="none">
          <span bg={look.color} fg={C.bg} attributes={BOLD}>
            {pill}
          </span>
          <span fg={C.dim}>
            {fit(
              `  ${pr.baseRefName} ← ${pr.headRefName}`,
              width - pill.length - 3
            )}
          </span>
        </text>
        <text wrapMode="none" marginTop={1}>
          <span fg={C.dim}>by </span>
          <span fg={C.text} attributes={BOLD}>{`@${pr.author}`}</span>
          <span
            fg={C.faint}
          >{` · ${age(pr.createdAt)} ago${association}`}</span>
        </text>
        <box flexDirection="row" gap={2} marginTop={1} height={1}>
          {DETAIL_TABS.map((t) => (
            <box key={t.id} onMouseDown={() => onTab(t.id)}>
              <text
                fg={t.id === tab ? C.accent : C.dim}
                attributes={t.id === tab ? BOLD : 0}
              >
                {t.label}
              </text>
            </box>
          ))}
        </box>
      </box>
      <text fg={C.border} wrapMode="none">
        {"─".repeat(Math.max(0, width))}
      </text>
    </box>
  );
};

const Actions = ({
  status,
  behind,
  conflicted,
  mergeCount,
  actions,
}: {
  status: Status;
  behind: number | undefined;
  conflicted: boolean;
  mergeCount: number;
  actions: PRActions;
}) => {
  if (!isOpen(status)) {
    return (
      <box flexDirection="row" columnGap={1} marginTop={1}>
        {status === "closed" ? (
          <Button
            label="Reopen"
            color={C.green}
            onPress={actions.handleClose}
          />
        ) : null}
        <Button label="Open" color={C.dim} onPress={actions.handleOpen} />
      </box>
    );
  }
  return (
    <box
      flexDirection="row"
      flexWrap="wrap"
      columnGap={1}
      rowGap={0}
      marginTop={1}
    >
      <Button
        label={mergeCount > 1 ? `Merge ${mergeCount}` : "Merge"}
        color={C.green}
        onPress={actions.handleMerge}
      />
      <Button label="Approve" color={C.blue} onPress={actions.handleApprove} />
      {behind && behind > 0 && !conflicted ? (
        <Button
          label="Update"
          color={C.yellow}
          onPress={actions.handleUpdate}
        />
      ) : null}
      <Button label="Close" color={C.red} onPress={actions.handleClose} />
      <Button label="Open" color={C.dim} onPress={actions.handleOpen} />
    </box>
  );
};

const LandedLine = ({ pr, status }: { pr: PR; status: Status }) => {
  const look = statusLook(status);
  const when = status === "merged" ? pr.mergedAt : pr.closedAt;
  return (
    <text fg={look.color}>
      {`${look.icon} ${look.label}`}
      <span fg={C.faint}>{when ? ` ${age(when)} ago` : ""}</span>
    </text>
  );
};

const Overview = ({
  pr,
  status,
  width,
  behind,
  stack,
  mergeCount,
  actions,
}: {
  pr: PR;
  status: Status;
  width: number;
  behind: number | undefined;
  stack: StackPlace | undefined;
  mergeCount: number;
  actions: PRActions;
}) => {
  const ci = checksStatus(pr.checks);
  const rv = reviewStatus(pr);
  const conflicted = pr.mergeable === "CONFLICTING";
  return (
    <box flexDirection="column">
      <LabelChips pr={pr} />
      <SectionTitle>Status</SectionTitle>
      {isOpen(status) ? null : <LandedLine pr={pr} status={status} />}
      <text fg={ci.color}>
        {`${ci.icon} ${ci.label}`}
        <span fg={C.faint}>{pr.checks === "none" ? "" : "  c to view"}</span>
      </text>
      <text fg={rv.color}>{`${rv.icon} ${rv.label}`}</text>
      {isOpen(status) ? <BehindLine pr={pr} behind={behind} /> : null}
      <text fg={C.dim}>
        <span fg={C.green}>+{pr.additions}</span>{" "}
        <span fg={C.red}>−{pr.deletions}</span>
        {` · ${plural(pr.changedFiles, "file")}`}
        {pr.comments > 0 ? ` · ${plural(pr.comments, "comment")}` : ""}
      </text>

      <Reviewers pr={pr} width={width} />
      {stack ? <StackList pr={pr} place={stack} width={width} /> : null}

      <Actions
        status={status}
        behind={behind}
        conflicted={conflicted}
        mergeCount={mergeCount}
        actions={actions}
      />

      <SectionTitle>Description</SectionTitle>
      <markdown
        content={cleanMarkdown(pr.body)}
        syntaxStyle={markdownStyle()}
        fg={C.dim}
        conceal
      />
    </box>
  );
};

const ACTION_COLORS: Record<string, () => string> = {
  approved: () => C.green,
  "requested changes": () => C.red,
};

const Activity = ({ pr }: { pr: PR }) => {
  const items = useLoader(`activity:${prKey(pr)}`, () => listActivity(pr));
  if (!items.value) {
    return <Loading error={items.error} />;
  }
  if (items.value.length === 0) {
    return <text fg={C.faint}>No comments or reviews yet.</text>;
  }
  return (
    <box flexDirection="column">
      {items.value.map((item) => (
        <box key={item.id} flexDirection="column" marginBottom={1}>
          <text wrapMode="none">
            <span fg={C.text} attributes={BOLD}>{`@${item.author}`}</span>
            <span
              fg={ACTION_COLORS[item.action]?.() ?? C.dim}
            >{` ${item.action}`}</span>
            <span fg={C.faint}>{` · ${age(item.createdAt)} ago`}</span>
          </text>
          {item.body.trim() ? (
            <markdown
              content={cleanMarkdown(item.body)}
              syntaxStyle={markdownStyle()}
              fg={C.dim}
              conceal
            />
          ) : null}
        </box>
      ))}
    </box>
  );
};

// a dot per commit, a ring for merge commits
const Commits = ({ pr, width }: { pr: PR; width: number }) => {
  const commits = useLoader(`commits:${prKey(pr)}:${pr.headRefOid}`, () =>
    listCommits(pr)
  );
  if (!commits.value) {
    return <Loading error={commits.error} />;
  }
  const last = commits.value.length - 1;
  return (
    <box flexDirection="column">
      {commits.value.map((c, i) => {
        const rail = i < last ? "│ " : "  ";
        return (
          <box key={c.sha} flexDirection="column">
            <text wrapMode="none">
              <span fg={C.accent}>{c.merge ? "◉ " : "● "}</span>
              <span fg={C.accent}>{`${c.sha} `}</span>
              <span fg={c.merge ? C.dim : C.text}>
                {fit(c.message, width - 11)}
              </span>
            </text>
            <text wrapMode="none">
              <span fg={C.accent}>{rail}</span>
              <span
                fg={C.faint}
              >{`        ${c.author} · ${age(c.date)} ago`}</span>
            </text>
            {i < last ? <text fg={C.accent}>│</text> : null}
          </box>
        );
      })}
    </box>
  );
};

const ChecksTab = ({ pr, width }: { pr: PR; width: number }) => {
  const checks = useLoader(`checks:${prKey(pr)}:${pr.headRefOid}`, () =>
    listChecks(pr)
  );
  if (!checks.value) {
    return <Loading error={checks.error} />;
  }
  if (checks.value.length === 0) {
    return <text fg={C.faint}>No checks on this PR.</text>;
  }
  return (
    <box flexDirection="column">
      {checks.value.map((c) => {
        const st = checkIcon(c.state);
        const time = duration(c.startedAt, c.completedAt);
        return (
          <text key={`${c.group}/${c.name}`} wrapMode="none">
            <span fg={st.color}>{`${st.icon} `}</span>
            <span fg={C.text}>{fit(c.name, Math.max(8, width - 24))}</span>
            <span fg={C.faint}>{`  ${fit(c.group, 12)} ${time}`}</span>
          </text>
        );
      })}
      <text fg={C.faint} marginTop={1}>
        c opens checks with steps and logs
      </text>
    </box>
  );
};

const FILE_STATUS: Record<string, { mark: string; color: () => string }> = {
  added: { color: () => C.green, mark: "A" },
  modified: { color: () => C.yellow, mark: "M" },
  removed: { color: () => C.red, mark: "D" },
  renamed: { color: () => C.blue, mark: "R" },
};

const Files = ({ pr, width }: { pr: PR; width: number }) => {
  const files = useLoader(`files:${prKey(pr)}:${pr.headRefOid}`, () =>
    listFiles(pr)
  );
  if (!files.value) {
    return <Loading error={files.error} />;
  }
  return (
    <box flexDirection="column">
      {files.value.map((f) => {
        const st = FILE_STATUS[f.status] ?? { color: () => C.dim, mark: "·" };
        const stats = `+${f.additions} −${f.deletions}`;
        return (
          <box
            key={f.path}
            height={1}
            flexDirection="row"
            justifyContent="space-between"
          >
            <text wrapMode="none">
              <span fg={st.color()}>{`${st.mark} `}</span>
              <span fg={C.text}>
                {fit(f.path, Math.max(8, width - stats.length - 4))}
              </span>
            </text>
            <text wrapMode="none">
              <span fg={C.green}>{`+${f.additions}`}</span>
              <span fg={C.red}>{` −${f.deletions}`}</span>
            </text>
          </box>
        );
      })}
      <text fg={C.faint} marginTop={1}>
        ⏎ opens the diff
      </text>
    </box>
  );
};

const TabContent = ({
  tab,
  pr,
  status,
  width,
  behind,
  stack,
  mergeCount,
  actions,
}: {
  tab: DetailTab;
  pr: PR;
  status: Status;
  width: number;
  behind: number | undefined;
  stack: StackPlace | undefined;
  mergeCount: number;
  actions: PRActions;
}) => {
  switch (tab) {
    case "activity": {
      return <Activity pr={pr} />;
    }
    case "commits": {
      return <Commits pr={pr} width={width} />;
    }
    case "checks": {
      return <ChecksTab pr={pr} width={width} />;
    }
    case "files": {
      return <Files pr={pr} width={width} />;
    }
    default: {
      return (
        <Overview
          pr={pr}
          status={status}
          width={width}
          behind={behind}
          stack={stack}
          mergeCount={mergeCount}
          actions={actions}
        />
      );
    }
  }
};

export const Sidebar = ({
  pr,
  status,
  width,
  behind,
  stack,
  mergeCount,
  tab,
  onTab,
  actions,
}: {
  pr: PR;
  status: Status;
  width: number;
  behind: number | undefined;
  stack: StackPlace | undefined;
  // merging takes everything below it in the stack too
  mergeCount: number;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  actions: PRActions;
}) => {
  const inner = width - 3;
  return (
    <box width={width} flexDirection="column" overflow="hidden">
      <DetailHeader
        pr={pr}
        status={status}
        width={width}
        tab={tab}
        onTab={onTab}
      />
      <scrollbox
        flexGrow={1}
        scrollY
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        verticalScrollbarOptions={{ visible: false }}
      >
        <TabContent
          tab={tab}
          pr={pr}
          status={status}
          width={inner}
          behind={behind}
          stack={stack}
          mergeCount={mergeCount}
          actions={actions}
        />
      </scrollbox>
    </box>
  );
};
