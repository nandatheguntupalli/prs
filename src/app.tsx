import type { KeyEvent } from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { useEffect, useEffectEvent, useState } from "react";
import type { ReactNode } from "react";

import { buildCommands, HINTS } from "./app-commands.ts";
import {
  sidebarCells,
  useChecksData,
  useDiffData,
  usePaneSizes,
  useSelection,
  useTheme,
} from "./app-hooks.ts";
import type { Resizing } from "./app-hooks.ts";
import { helpSections, hintsFor, keymapFor } from "./commands.ts";
import type { Cmd, Screen } from "./commands.ts";
import type { Config } from "./config.ts";
import { saveConfig } from "./config.ts";
import { isErrorLine } from "./github/checks.ts";
import type { Check } from "./github/checks.ts";
import { errorMessage, openInBrowser, viewer } from "./github/client.ts";
import { addComment, reply } from "./github/comments.ts";
import {
  setDraft,
  setLabels,
  submitReview,
  updateBranch,
} from "./github/prs.ts";
import type { MergeMethod, PR, UpdateMethod } from "./github/prs.ts";
import { useBehind, useLoader, usePendingAction, useQueues } from "./hooks.ts";
import type { PendingKind } from "./hooks.ts";
import type { PaneSizes } from "./layout.ts";
import { copyText, editorCommand, runInTerminal } from "./local.ts";
import { mergePlan, prKey } from "./stacks.ts";
import type { StackPlace } from "./stacks.ts";
import { C } from "./theme.ts";
import type { ThemeChoice } from "./theme.ts";
import { ChecksView, JobView } from "./ui/checks.tsx";
import { Footer, Header, TabBar } from "./ui/chrome.tsx";
import type { Toast } from "./ui/chrome.tsx";
import { anchorOf } from "./ui/diff-model.ts";
import type { ParsedDiff } from "./ui/diff-model.ts";
import { DiffView, fileAt, jump } from "./ui/diff.tsx";
import { fit, plural } from "./ui/format.ts";
import { keyId, sequence } from "./ui/keys.ts";
import type { Action } from "./ui/keys.ts";
import {
  CommandPalette,
  ComposeModal,
  CopyModal,
  FilesModal,
  HelpModal,
  LabelsModal,
  ReviewModal,
  ThemeModal,
} from "./ui/modals.tsx";
import { PRTable, pageSize, tableContentWidth } from "./ui/pr-list.tsx";
import { BOLD, Centered } from "./ui/primitives.tsx";
import { Sidebar } from "./ui/sidebar.tsx";
import type { PRActions } from "./ui/sidebar.tsx";

type ModalState =
  | { kind: "palette" }
  | { kind: "help" }
  | { kind: "theme" }
  | { kind: "files" }
  | { kind: "labels"; pr: PR }
  | { kind: "review"; pr: PR }
  | { kind: "copy"; pr: PR }
  | {
      kind: "compose";
      title: string;
      context: string;
      handleSubmit: (body: string) => unknown;
    };

// "g g" and friends; there's one app, so one tracker
const readSequence = sequence();

// the line between two panes. Grabbing it starts a resize; the drag itself is handled at the
// app's root, since terminals report motion a cell at a time and the pointer leaves a 1-cell line at once
const Divider = ({ active, onGrab }: { active: boolean; onGrab: Action }) => {
  const [hot, setHot] = useState(false);
  return (
    <box
      width={1}
      flexShrink={0}
      border={["left"]}
      borderColor={hot || active ? C.accent : C.border}
      onMouseOver={() => setHot(true)}
      onMouseOut={() => setHot(false)}
      onMouseDown={onGrab}
    />
  );
};

const PRTitle = ({ pr, showRepo }: { pr: PR; showRepo: boolean }) => (
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

const EmptyList = ({
  prs,
  emptyLabel,
  filter,
}: {
  prs: PR[] | null;
  emptyLabel: string;
  filter: string;
}) => {
  if (!prs) {
    return (
      <Centered>
        <text fg={C.dim}>Loading pull requests…</text>
      </Centered>
    );
  }
  return (
    <Centered>
      <text fg={C.green} attributes={BOLD}>
        {filter ? "No matches." : "Inbox zero."}
      </text>
      <text fg={C.dim}>
        {filter
          ? `Nothing in ${emptyLabel} matches “${filter}”.`
          : `Nothing in ${emptyLabel}.`}
      </text>
    </Centered>
  );
};

interface ListProps {
  prs: PR[] | null;
  list: PR[];
  places: Map<string, StackPlace>;
  pr: PR | undefined;
  cursor: number;
  showRepo: boolean;
  handleSelectPR: (i: number) => void;
  sidebar: boolean;
  behind: number | undefined;
  actions: PRActions;
  emptyLabel: string;
  filter: string;
  sizes: PaneSizes;
  resizing: Resizing;
  handleGrab: (pane: keyof PaneSizes) => void;
  width: number;
  height: number;
}

// the PR table and the selected PR's details
const ListScreen = (p: ListProps) => {
  const paneW = p.width;
  // the table never needs to be wider than its content; any extra width goes to the details
  const tableW = tableContentWidth(p.list, p.showRepo);
  const sideW = p.sidebar
    ? Math.max(sidebarCells(paneW, true, p.sizes.sidebar), paneW - 1 - tableW)
    : 0;
  const showSidebar = Boolean(p.pr) && p.sidebar;
  return (
    <box flexGrow={1} flexDirection="row">
      {p.pr ? (
        <PRTable
          list={p.list}
          places={p.places}
          cursor={p.cursor}
          focused
          showRepo={p.showRepo}
          width={paneW - sideW - (p.sidebar ? 1 : 0)}
          height={p.height}
          onSelect={p.handleSelectPR}
        />
      ) : (
        <EmptyList prs={p.prs} emptyLabel={p.emptyLabel} filter={p.filter} />
      )}
      {showSidebar ? (
        <Divider
          active={p.resizing === "sidebar"}
          onGrab={() => p.handleGrab("sidebar")}
        />
      ) : null}
      {showSidebar && p.pr ? (
        <Sidebar
          pr={p.pr}
          width={sideW}
          behind={p.behind}
          stack={p.places.get(prKey(p.pr))}
          mergeCount={mergePlan(p.pr, p.places).length}
          showRepo={p.showRepo}
          actions={p.actions}
        />
      ) : null}
    </box>
  );
};

const diffSubtitle = (
  diff: ParsedDiff | null,
  threadCount: number,
  where: string,
  selecting: boolean
) =>
  [
    plural(diff?.files.length ?? 0, "file"),
    threadCount ? plural(threadCount, "comment thread") : "",
    where ? fit(where, 60) : "",
    selecting ? "selecting lines, ⏎ to comment" : "",
  ]
    .filter(Boolean)
    .join(" · ");

// the dialog that's open, if any
const ModalHost = ({
  modal,
  commands,
  screen,
  themeChoice,
  files,
  onClose,
  onTheme,
  onPreview,
  onJumpFile,
  onLabels,
  onReview,
  onCopy,
}: {
  modal: ModalState | null;
  commands: Cmd[];
  screen: Screen;
  themeChoice: ThemeChoice;
  files: ParsedDiff["files"];
  onClose: () => void;
  onTheme: (choice: ThemeChoice) => void;
  onPreview: (choice: ThemeChoice | null) => void;
  onJumpFile: (path: string) => void;
  onLabels: (pr: PR, names: string[]) => void;
  onReview: (
    pr: PR,
    event: Parameters<typeof submitReview>[1],
    body: string
  ) => void;
  onCopy: (label: string, value: string) => void;
}) => {
  switch (modal?.kind) {
    case "palette": {
      return (
        <CommandPalette
          commands={commands
            .filter((c) => !c.paletteHidden && c.screens.includes(screen))
            .map((c) => ({
              id: c.id,
              keys: c.keys.map((k) => k.replace("return", "⏎")).join(" "),
              label: c.label,
              run: c.run,
            }))}
          onClose={onClose}
        />
      );
    }
    case "help": {
      return (
        <HelpModal
          sections={helpSections(commands.filter((c) => !c.paletteHidden))}
          onClose={onClose}
        />
      );
    }
    case "theme": {
      return (
        <ThemeModal
          current={themeChoice}
          onPreview={onPreview}
          onChoose={onTheme}
          onClose={() => {
            onPreview(null);
            onClose();
          }}
        />
      );
    }
    case "files": {
      return <FilesModal files={files} onJump={onJumpFile} onClose={onClose} />;
    }
    case "labels": {
      const { pr } = modal;
      return (
        <LabelsModal
          pr={pr}
          onApply={(names) => onLabels(pr, names)}
          onClose={onClose}
        />
      );
    }
    case "review": {
      const { pr } = modal;
      return (
        <ReviewModal
          pr={pr}
          onSubmit={(event, body) => onReview(pr, event, body)}
          onClose={onClose}
        />
      );
    }
    case "copy": {
      return (
        <CopyModal
          pr={modal.pr}
          onCopy={(choice) => onCopy(choice.label, choice.value)}
          onClose={onClose}
        />
      );
    }
    case "compose": {
      return (
        <ComposeModal
          title={modal.title}
          context={modal.context}
          onSubmit={modal.handleSubmit}
          onClose={onClose}
        />
      );
    }
    default: {
      return null;
    }
  }
};

export const App = ({
  scope,
  local,
  method,
  updateMethod,
  delay,
  dryRun,
  initialSizes,
  config,
  onQuit,
}: {
  // "owner/repo", or "" to look across every repo
  scope: string;
  local: string | null;
  method: MergeMethod;
  updateMethod: UpdateMethod;
  delay: number;
  dryRun: boolean;
  initialSizes: PaneSizes;
  config: Config;
  onQuit: () => void;
}) => {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const theme = useTheme(config);

  const [toast, setToast] = useState<Toast | null>(null);
  // toasts are one line; a line break would spill into the key hints below
  const flash = (text: string, color = C.text) =>
    setToast({ color, text: text.replaceAll(/\s+/gu, " ").trim() });

  // ── data ──────────────────────────────────────────────────────────────
  const me = useLoader("viewer", viewer);
  const { busy, lists, queues, refresh } = useQueues(
    scope,
    me.value ?? "",
    flash
  );
  const [settled, setSettled] = useState(0);
  const pending = usePendingAction({
    delay,
    flash,
    method,
    // after a merge GitHub may have re-pointed PRs, so reload what it says now
    onSettled: () => setSettled((n) => n + 1),
  });
  const reloadAfterAction = useEffectEvent(refresh);
  useEffect(() => {
    if (settled > 0) {
      reloadAfterAction();
    }
  }, [settled]);

  // ── view state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState(scope ? "all" : "mine");
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [screen, setScreen] = useState<Screen>("list");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [sidebar, setSidebar] = useState(true);
  // null until the user moves: the diff then opens on its first line of code
  const [diffMoved, setDiffMoved] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [checksCursor, setChecksCursor] = useState(0);
  const [jobCheck, setJobCheck] = useState<Check | null>(null);
  const [logCursor, setLogCursor] = useState<number | null>(null);

  const panes = usePaneSizes(initialSizes, width);
  const { list, places, pr, source } = useSelection({
    cursor,
    filter,
    hidden: pending.hidden,
    lists,
    scope,
    tab,
  });
  const showRepo = !scope;

  const { behind, markUpToDate } = useBehind(pr);
  const {
    cursor: diffCursor,
    diff,
    rows,
    threads,
  } = useDiffData({
    moved: diffMoved,
    pr,
    screen,
    width,
  });
  const { checks, log, logAt, steps } = useChecksData({
    job: jobCheck,
    logCursor,
    pr,
    screen,
  });

  // ── actions ───────────────────────────────────────────────────────────
  const withPR = (fn: (p: PR) => unknown) => () =>
    pr ? fn(pr) : flash("No pull request selected", C.dim);
  const onPRs = withPR;

  const attempt = async (
    doing: string,
    done: string,
    work: () => Promise<unknown>
  ) => {
    flash(`${doing}…`, C.yellow);
    try {
      await work();
      flash(`✓ ${done}`, C.green);
      refresh();
    } catch (error) {
      flash(`✗ ${errorMessage(error)}`, C.red);
    }
  };

  // merging a stacked PR takes everything below it with it, like `gh stack merge`
  const queue = (kind: PendingKind, target: PR) => {
    const plan = kind === "merge" ? mergePlan(target, places) : [target];
    const native =
      kind === "merge"
        ? (places.get(prKey(target))?.stack.native ?? null)
        : null;
    pending.queue(kind, plan, native);
    setCursor((c) => Math.max(0, Math.min(c, list.length - plan.length - 1)));
    setScreen("list");
  };

  const update = (target: PR) => {
    // GitHub can't rebase or merge a branch that conflicts with its base
    if (target.mergeable === "CONFLICTING") {
      flash(
        `#${target.number} conflicts with ${target.baseRefName}; resolve it locally, then push`,
        C.red
      );
      return;
    }
    const verb = updateMethod === "rebase" ? "Rebasing" : "Updating";
    attempt(
      `${verb} #${target.number} onto ${target.baseRefName}`,
      `Updated #${target.number}`,
      async () => {
        await updateBranch(target, updateMethod);
        markUpToDate(target);
      }
    );
  };

  const edit = async (target: PR) => {
    const command = editorCommand(
      config,
      target,
      scope === target.repo ? local : null
    );
    if (!command) {
      flash(
        "Set editorCommand in ~/.config/prs/config.json, or $EDITOR",
        C.yellow
      );
      return;
    }
    const code = await runInTerminal(renderer, command);
    flash(
      code === 0 ? "Back from the editor" : `Editor exited with ${code}`,
      C.dim
    );
  };

  const openThing = () => {
    const check = checks.value?.[checksCursor];
    if (screen === "job" && jobCheck) {
      openInBrowser(jobCheck.url);
    } else if (screen === "checks" && check) {
      openInBrowser(check.url);
    } else if (pr) {
      openInBrowser(pr.url);
    }
  };

  const approve = (p: PR) =>
    attempt(`Approving #${p.number}`, `Approved #${p.number}`, () =>
      submitReview(p, "APPROVE")
    );

  const toggleDraft = (p: PR) =>
    attempt(
      p.isDraft ? "Marking ready" : "Converting to draft",
      p.isDraft
        ? `#${p.number} is ready for review`
        : `#${p.number} is a draft`,
      () => setDraft(p, !p.isDraft)
    );

  const prActions: PRActions = {
    handleApprove: withPR(approve),
    handleClose: withPR((p) => queue("close", p)),
    handleMerge: withPR((p) => queue("merge", p)),
    handleOpen: withPR((p) => openInBrowser(p.url)),
    handleUpdate: withPR(update),
  };

  // ── moving around ─────────────────────────────────────────────────────
  const move = (n: number) =>
    setCursor((c) => Math.max(0, Math.min(c + n, list.length - 1)));

  const showQueue = (id: string) => {
    setTab(id);
    setCursor(0);
    setScreen("list");
  };
  const cycleQueue = (dir: 1 | -1) => {
    const i = queues.findIndex((q) => q.id === tab);
    const next = queues[(i + dir + queues.length) % queues.length];
    if (next) {
      showQueue(next.id);
    }
  };

  const openDiff = () => {
    if (!pr) {
      return;
    }
    setDiffMoved(null);
    setRangeStart(null);
    setScreen("diff");
  };

  const back = () => {
    if (screen === "job") {
      setScreen("checks");
    } else if (screen === "diff" && rangeStart !== null) {
      setRangeStart(null);
    } else if (screen === "list" && filter) {
      setFilter("");
    } else {
      setScreen("list");
    }
  };

  const quit = async () => {
    await pending.flush();
    await panes.saveNow();
    onQuit();
  };

  // diff: the row under the cursor gets a new comment, or a reply if it's a comment
  const comment = () => {
    const row = rows[diffCursor];
    if (!pr || !row) {
      return;
    }
    if (row.kind === "comment") {
      setModal({
        context: `replying to ${row.thread.comments[0]?.author ?? ""} on ${row.thread.path}`,
        handleSubmit: (body) =>
          attempt("Replying", "Replied", async () => {
            await reply(pr, row.thread.id, body);
            threads.reload();
          }),
        kind: "compose",
        title: "Reply",
      });
      return;
    }
    const end = anchorOf(row);
    if (!end) {
      flash("Pick a line of code to comment on", C.dim);
      return;
    }
    const startRow = rangeStart === null ? undefined : rows[rangeStart];
    const start = startRow ? anchorOf(startRow) : null;
    const range =
      start && start.path === end.path && start.side === end.side
        ? start
        : null;
    const lo = range ? Math.min(range.line, end.line) : end.line;
    const hi = range ? Math.max(range.line, end.line) : end.line;
    setModal({
      context: `${end.path}:${lo === hi ? lo : `${lo}-${hi}`}`,
      handleSubmit: (body) =>
        attempt("Commenting", "Commented", async () => {
          await addComment(pr, {
            body,
            line: hi,
            path: end.path,
            side: end.side,
            startLine: lo,
          });
          setRangeStart(null);
          threads.reload();
        }),
      kind: "compose",
      title: "Comment",
    });
  };

  const moveDiff = (n: number) =>
    setDiffMoved(Math.max(0, Math.min(diffCursor + n, rows.length - 1)));

  const nextError = (dir: 1 | -1) => {
    const lines = log.value ?? [];
    for (let i = logAt + dir; i >= 0 && i < lines.length; i += dir) {
      if (isErrorLine(lines[i] ?? "")) {
        setLogCursor(i);
        return;
      }
    }
  };

  const openCheck = () => {
    const check = checks.value?.[checksCursor];
    if (check?.jobId) {
      setJobCheck(check);
      setLogCursor(null);
      setScreen("job");
    } else if (check) {
      openInBrowser(check.url);
    }
  };

  const half = Math.floor(height / 2);
  const commands = buildCommands({
    approve,
    back,
    bottom: () => setCursor(list.length - 1),
    checks: () => {
      setChecksCursor(0);
      setScreen("checks");
    },
    close: (p) => queue("close", p),
    comment,
    copy: (p) => setModal({ kind: "copy", pr: p }),
    cycleQueue,
    diffBottom: () => setDiffMoved(rows.length - 1),
    diffTop: () => setDiffMoved(0),
    edit,
    files: () => setModal({ kind: "files" }),
    filter: () => setFiltering(true),
    half,
    help: () => setModal({ kind: "help" }),
    labels: (p) => setModal({ kind: "labels", pr: p }),
    merge: (p) => queue("merge", p),
    move,
    moveChecks: (n) =>
      setChecksCursor((c) =>
        Math.max(0, Math.min(c + n, (checks.value?.length ?? 1) - 1))
      ),
    moveDiff,
    moveLog: (n) =>
      setLogCursor(
        Math.max(0, Math.min(logAt + n, (log.value?.length ?? 1) - 1))
      ),
    movePR: (n) => {
      setDiffMoved(null);
      setRangeStart(null);
      move(n);
    },
    nextError,
    nextFile: (dir) =>
      setDiffMoved(jump(rows, diffCursor, dir, (r) => r.kind === "file")),
    nextThread: (dir) =>
      setDiffMoved(
        jump(rows, diffCursor, dir, (r) => r.kind === "comment" && r.first)
      ),
    onPRs,
    open: openThing,
    openCheck,
    openDiff,
    page: pageSize(height - 7),
    palette: () => setModal({ kind: "palette" }),
    queues,
    quit: () => (screen === "list" ? quit() : back()),
    refresh: () => {
      refresh();
      threads.reload();
      checks.reload();
    },
    resetSizes: panes.reset,
    resize: panes.resize,
    review: (p) => setModal({ kind: "review", pr: p }),
    showQueue,
    sizes: panes.sizes,
    theme: () => setModal({ kind: "theme" }),
    toggleDraft,
    toggleRange: () => setRangeStart((r) => (r === null ? diffCursor : null)),
    toggleSidebar: () => setSidebar((s) => !s),
    top: () => setCursor(0),
    undo: pending.undo,
    update,
  });

  // ── keys ──────────────────────────────────────────────────────────────
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "ctrl+c") {
      quit();
      return;
    }
    if (modal) {
      return;
    }
    if (filtering) {
      if (id === "escape") {
        setFilter("");
        setFiltering(false);
      } else if (id === "return") {
        setFiltering(false);
      } else if (id === "down" || id === "up") {
        move(id === "down" ? 1 : -1);
      }
      return;
    }
    const keys = keymapFor(commands, screen);
    const combo = readSequence(id);
    const action = (combo ? keys.get(combo) : undefined) ?? keys.get(id);
    action?.();
  });

  // ── what to draw ──────────────────────────────────────────────────────
  const bodyH = height - (screen === "list" ? 7 : 5);
  const title: ReactNode = pr ? <PRTitle pr={pr} showRepo={showRepo} /> : null;

  const main = (): ReactNode => {
    if (screen === "diff") {
      return (
        <DiffView
          title={title}
          subtitle={diffSubtitle(
            diff.value,
            threads.value?.length ?? 0,
            fileAt(rows, diffCursor),
            rangeStart !== null
          )}
          rows={rows}
          cursor={Math.min(diffCursor, Math.max(0, rows.length - 1))}
          rangeStart={rangeStart}
          width={width}
          height={bodyH}
          loading={!diff.loaded}
        />
      );
    }
    if (screen === "checks") {
      return (
        <ChecksView
          title={title}
          checks={checks.loaded ? (checks.value ?? []) : null}
          cursor={checksCursor}
          width={width}
          height={bodyH}
        />
      );
    }
    if (screen === "job" && jobCheck) {
      return (
        <JobView
          title={title}
          check={jobCheck}
          steps={steps.value}
          log={log.value}
          cursor={logAt}
          width={width}
          height={bodyH}
        />
      );
    }
    return (
      <ListScreen
        prs={lists ? source : null}
        list={list}
        places={places}
        pr={pr}
        cursor={Math.min(cursor, Math.max(0, list.length - 1))}
        showRepo={showRepo}
        handleSelectPR={setCursor}
        sidebar={sidebar}
        behind={behind}
        actions={prActions}
        emptyLabel={queues.find((q) => q.id === tab)?.label ?? ""}
        filter={filter}
        sizes={panes.sizes}
        resizing={panes.resizing}
        handleGrab={panes.setResizing}
        width={width}
        height={bodyH}
      />
    );
  };

  const counted = (id: string) =>
    lists?.[id]?.filter((p) => !pending.hidden.has(prKey(p))).length;

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={C.bg}
      onMouseDrag={(event) => panes.dragTo(event.x)}
      onMouseUp={() => panes.setResizing(null)}
    >
      <Header
        scope={scope}
        busy={busy}
        dryRun={dryRun}
        method={method}
        updateMethod={updateMethod}
      />
      {screen === "list" ? (
        <TabBar
          tabs={queues.map((q) => ({
            count: counted(q.id),
            id: q.id,
            label: q.label,
          }))}
          active={tab}
          filter={filter}
          filtering={filtering}
          onSelect={showQueue}
          onFilter={(value) => {
            setFilter(value);
            setCursor(0);
          }}
        />
      ) : null}
      <box flexGrow={1} flexDirection="column" marginTop={1}>
        {main()}
      </box>
      <Footer
        toast={toast}
        hints={hintsFor(commands, HINTS[screen] ?? [])}
        width={width}
      />
      <ModalHost
        modal={modal}
        commands={commands}
        screen={screen}
        themeChoice={theme.choice}
        files={diff.value?.files ?? []}
        onClose={() => setModal(null)}
        onPreview={(choice) => theme.setPreview(choice)}
        onTheme={(choice) => {
          theme.setPreview(null);
          theme.setChoice(choice);
          saveConfig({ theme: choice });
        }}
        onJumpFile={(path) =>
          setDiffMoved(
            Math.max(
              0,
              rows.findIndex((r) => r.kind === "file" && r.path === path)
            )
          )
        }
        onLabels={(p, names) =>
          attempt("Saving labels", `Labels saved on #${p.number}`, () =>
            setLabels(p, names)
          )
        }
        onReview={(p, event, body) =>
          attempt("Submitting review", `Reviewed #${p.number}`, () =>
            submitReview(p, event, body)
          )
        }
        onCopy={async (label, value) => {
          const ok = await copyText(renderer, value);
          flash(
            ok
              ? `Copied ${label.toLowerCase()}: ${value}`
              : "Couldn't reach a clipboard",
            ok ? C.green : C.red
          );
        }}
      />
    </box>
  );
};
