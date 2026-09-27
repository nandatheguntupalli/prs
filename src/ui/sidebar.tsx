import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import {
  age,
  checksStatus,
  fit,
  labelText,
  plural,
  cleanMarkdown,
  reviewState,
  reviewStatus,
} from "./format.ts";
import type { Action } from "./keys.ts";
import { markdownStyle } from "./markdown.ts";
import { BOLD, Button, SectionTitle } from "./primitives.tsx";

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

// who has reviewed, and who's still been asked to
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

// the PR's whole stack, top first; everything from it down merges with it
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

export const Sidebar = ({
  pr,
  width,
  behind,
  stack,
  mergeCount,
  showRepo,
  actions,
}: {
  pr: PR;
  width: number;
  behind: number | undefined;
  stack: StackPlace | undefined;
  // how many PRs merging this one takes: it and everything below it in its stack
  mergeCount: number;
  showRepo: boolean;
  actions: PRActions;
}) => {
  const ci = checksStatus(pr.checks);
  const rv = reviewStatus(pr);
  const inner = width - 3;
  const conflicted = pr.mergeable === "CONFLICTING";
  return (
    <box
      width={width}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={1}
      overflow="hidden"
    >
      {/* the description can be huge, so only it may shrink; everything above keeps its height */}
      <box flexDirection="column" flexShrink={0}>
        <text fg={C.text} attributes={BOLD} wrapMode="word">
          {pr.title}
        </text>
        <text fg={C.dim} wrapMode="none">
          <span fg={C.accent}>
            {showRepo ? `${pr.repo}#${pr.number}` : `#${pr.number}`}
          </span>
          <span>
            {fit(
              ` · ${pr.author} · opened ${age(pr.createdAt)} ago`,
              Math.max(8, inner - (showRepo ? pr.repo.length : 0) - 6)
            )}
          </span>
        </text>
        <text fg={C.faint} wrapMode="none" truncate>
          {fit(`${pr.baseRefName} ← ${pr.headRefName}`, inner)}
        </text>
        <LabelChips pr={pr} />

        <SectionTitle>Status</SectionTitle>
        <text fg={ci.color}>
          {`${ci.icon} ${ci.label}`}
          <span fg={C.faint}>{pr.checks === "none" ? "" : "  c to view"}</span>
        </text>
        <text fg={rv.color}>{`${rv.icon} ${rv.label}`}</text>
        <BehindLine pr={pr} behind={behind} />
        <text fg={C.dim}>
          <span fg={C.green}>+{pr.additions}</span>{" "}
          <span fg={C.red}>−{pr.deletions}</span>
          {` · ${plural(pr.changedFiles, "file")}`}
          {pr.comments > 0 ? ` · ${plural(pr.comments, "comment")}` : ""}
        </text>

        <Reviewers pr={pr} width={inner} />
        {stack ? <StackList pr={pr} place={stack} width={inner} /> : null}

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
          <Button
            label="Approve"
            color={C.blue}
            onPress={actions.handleApprove}
          />
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

        <SectionTitle>Description</SectionTitle>
      </box>
      <box flexDirection="column" flexShrink={1} overflow="hidden">
        <markdown
          content={cleanMarkdown(pr.body)}
          syntaxStyle={markdownStyle()}
          fg={C.dim}
          conceal
        />
      </box>
    </box>
  );
};
