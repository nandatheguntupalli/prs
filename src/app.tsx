import type { KeyEvent } from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { useEffect, useEffectEvent, useState } from "react";
import type { ReactNode } from "react";

import { buildCommands, HINTS } from "./bindings.ts";
import type { ListCache } from "./cache.ts";
import { hintsFor, keymapFor } from "./commands.ts";
import type { Screen } from "./commands.ts";
import type { Config } from "./config.ts";
import { repoPath, saveConfig } from "./config.ts";
import { isErrorLine } from "./github/checks.ts";
import type { Check } from "./github/checks.ts";
import { errorMessage, openInBrowser, viewer } from "./github/client.ts";
import { addComment, reply } from "./github/comments.ts";
import {
  reopenPR,
  setDraft,
  setLabels,
  submitReview,
  updateBranch,
} from "./github/prs.ts";
import type { MergeMethod, PR, UpdateMethod } from "./github/prs.ts";
import { useBehind } from "./hooks/use-behind.ts";
import { useChecksData } from "./hooks/use-checks-data.ts";
import { useDiffData } from "./hooks/use-diff-data.ts";
import { useLoader } from "./hooks/use-loader.ts";
import { usePaneSizes } from "./hooks/use-pane-sizes.ts";
import { usePendingAction } from "./hooks/use-pending-action.ts";
import type { PendingKind } from "./hooks/use-pending-action.ts";
import { useQueues } from "./hooks/use-queues.ts";
import { useSelection } from "./hooks/use-selection.ts";
import { useTheme } from "./hooks/use-theme.ts";
import type { PaneSizes } from "./layout.ts";
import {
  checkoutBranch,
  copyText,
  editorCommand,
  runInTerminal,
} from "./local.ts";
import { mergePlan, prKey } from "./stacks.ts";
import { C } from "./theme.ts";
import { ChecksView, JobView } from "./ui/checks.tsx";
import { Footer, Header, PRTitle, TabBar } from "./ui/chrome.tsx";
import type { Toast } from "./ui/chrome.tsx";
import { anchorOf } from "./ui/diff-model.ts";
import { diffSubtitle, DiffView, fileAt, jump } from "./ui/diff.tsx";
import { keyId, sequence } from "./ui/keys.ts";
import { ListScreen } from "./ui/list-screen.tsx";
import { ModalHost } from "./ui/modal-host.tsx";
import type { ModalState } from "./ui/modal-host.tsx";
import { pageSize } from "./ui/pr-list.tsx";
import { DETAIL_TABS } from "./ui/sidebar.tsx";
import type { DetailTab, PRActions } from "./ui/sidebar.tsx";
import { isOpen, statusLook, statusOf } from "./ui/status.ts";

// tracks two-key sequences like "g g"
const readSequence = sequence();

export const App = ({
  scope,
  local,
  method,
  updateMethod,
  delay,
  dryRun,
  initialSizes,
  cached,
  config,
  onQuit,
}: {
  // "" means every repo
  scope: string;
  local: string | null;
  method: MergeMethod;
  updateMethod: UpdateMethod;
  delay: number;
  dryRun: boolean;
  initialSizes: PaneSizes;
  cached: ListCache;
  config: Config;
  onQuit: () => void;
}) => {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const theme = useTheme(config);

  const [toast, setToast] = useState<Toast | null>(null);
  // toasts are one line; a newline would spill into the hints
  const flash = (text: string, color = C.text) =>
    setToast({ color, text: text.replaceAll(/\s+/gu, " ").trim() });

  const me = useLoader("viewer", viewer);
  const { busy, lists, queues, refresh } = useQueues(
    scope,
    me.value ?? "",
    flash,
    config.sections ?? [],
    cached
  );
  const [settled, setSettled] = useState(0);
  const pending = usePendingAction({
    delay,
    flash,
    method,
    // a merge can retarget other PRs' bases, so reload
    onSettled: () => setSettled((n) => n + 1),
  });
  const reloadAfterAction = useEffectEvent(refresh);
  useEffect(() => {
    if (settled > 0) {
      reloadAfterAction();
    }
  }, [settled]);

  const [tab, setTab] = useState(scope ? "all" : "mine");
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [screen, setScreen] = useState<Screen>("list");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [diffMoved, setDiffMoved] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [showTests, setShowTests] = useState(false);
  const [expandFiles, setExpandFiles] = useState(false);
  const [checksCursor, setChecksCursor] = useState(0);
  const [jobCheck, setJobCheck] = useState<Check | null>(null);
  const [logCursor, setLogCursor] = useState<number | null>(null);

  const panes = usePaneSizes(initialSizes, width);
  const { list, places, pr, source } = useSelection({
    cursor,
    filter,
    landed: pending.landed,
    lists,
    scope,
    tab,
  });
  const showRepo = !scope;

  const { behind, markUpToDate } = useBehind(pr);
  const {
    cursor: diffCursor,
    diff,
    hiddenTests,
    rows,
    shown,
    threads,
  } = useDiffData({
    moved: diffMoved,
    pr,
    screen,
    showTests,
    width,
  });
  const { checks, log, logAt, steps } = useChecksData({
    job: jobCheck,
    logCursor,
    pr,
    screen,
  });

  const withPR = (fn: (p: PR) => unknown) => () =>
    pr ? fn(pr) : flash("No pull request selected", C.dim);
  const statusFor = (p: PR) => statusOf(p, pending.landed);
  const stillOpen = (p: PR) => {
    const status = statusFor(p);
    if (!isOpen(status)) {
      flash(`#${p.number} is ${statusLook(status).label.toLowerCase()}`, C.dim);
    }
    return isOpen(status);
  };
  const whenOpen =
    <A extends unknown[]>(fn: (p: PR, ...rest: A) => unknown) =>
    (p: PR, ...rest: A) =>
      stillOpen(p) && fn(p, ...rest);

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

  const placeOf = (p: PR) => ({
    index: Math.max(
      0,
      source.findIndex((s) => prKey(s) === prKey(p))
    ),
    queue: tab,
  });

  // merging a stacked PR merges everything below it too
  const queue = whenOpen((target: PR, kind: PendingKind = "merge") => {
    const plan = kind === "merge" ? mergePlan(target, places) : [target];
    const native =
      kind === "merge"
        ? (places.get(prKey(target))?.stack.native ?? null)
        : null;
    pending.queue(kind, plan, native, placeOf);
    // it stays in the list, so step past it
    setCursor((c) => Math.min(c + 1, list.length - 1));
    setScreen("list");
  });
  const mergeIt = (p: PR) => queue(p, "merge");

  const reopen = (p: PR) =>
    attempt(`Reopening #${p.number}`, `Reopened #${p.number}`, async () => {
      await reopenPR(p);
      pending.forget(p);
    });

  const closeOrReopen = (p: PR) =>
    statusFor(p) === "closed" ? reopen(p) : queue(p, "close");

  const checkout = async (target: PR) => {
    const dir =
      repoPath(config, target.repo) ?? (scope === target.repo ? local : null);
    if (!dir) {
      flash(
        `No clone of ${target.repo}; add it to repoPaths in ~/.config/prs/config.json`,
        C.yellow
      );
      return;
    }
    if (dryRun) {
      flash(`Would check out ${target.headRefName} in ${dir}`, C.dim);
      return;
    }
    flash(`Checking out ${target.headRefName}…`, C.yellow);
    try {
      await checkoutBranch(target, dir);
      flash(`✓ On ${target.headRefName} in ${dir}`, C.green);
    } catch (error) {
      flash(`✗ ${errorMessage(error)}`, C.red);
    }
  };

  const update = (target: PR) => {
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
    handleApprove: withPR(whenOpen(approve)),
    handleClose: withPR(closeOrReopen),
    handleMerge: withPR(mergeIt),
    handleOpen: withPR((p) => openInBrowser(p.url)),
    handleUpdate: withPR(whenOpen(update)),
  };

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
    approve: whenOpen(approve),
    back,
    bottom: () => setCursor(list.length - 1),
    checkout,
    checks: () => {
      setChecksCursor(0);
      setScreen("checks");
    },
    close: closeOrReopen,
    comment,
    copy: (p) => setModal({ kind: "copy", pr: p }),
    cycleQueue,
    diffBottom: () => setDiffMoved(rows.length - 1),
    diffTop: () => setDiffMoved(0),
    edit,
    expandFiles: () => {
      // the first press just shows the tab, expanded
      setExpandFiles((e) => detailTab !== "files" || !e);
      setDetailTab("files");
      setSidebar(true);
    },
    files: () => setModal({ kind: "files" }),
    filter: () => setFiltering(true),
    half,
    help: () => setModal({ kind: "help" }),
    labels: (p) => setModal({ kind: "labels", pr: p }),
    merge: mergeIt,
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
    nextDetailTab: (dir) => {
      const i = DETAIL_TABS.findIndex((t) => t.id === detailTab);
      const next =
        DETAIL_TABS[(i + dir + DETAIL_TABS.length) % DETAIL_TABS.length];
      if (next) {
        setDetailTab(next.id);
        setSidebar(true);
      }
    },
    nextError,
    nextFile: (dir) =>
      setDiffMoved(jump(rows, diffCursor, dir, (r) => r.kind === "file")),
    nextThread: (dir) =>
      setDiffMoved(
        jump(rows, diffCursor, dir, (r) => r.kind === "comment" && r.first)
      ),
    open: openThing,
    openCheck,
    openDiff,
    page: pageSize(height - 7),
    palette: () => setModal({ kind: "palette" }),
    queues,
    quit: () => (screen === "list" ? quit() : back()),
    refresh: () => {
      pending.clearLanded();
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
    toggleDraft: whenOpen(toggleDraft),
    toggleRange: () => setRangeStart((r) => (r === null ? diffCursor : null)),
    toggleSidebar: () => setSidebar((s) => !s),
    toggleTests: () => {
      setShowTests((s) => !s);
      setDiffMoved(null);
      setRangeStart(null);
    },
    top: () => setCursor(0),
    undo: pending.undo,
    update: whenOpen(update),
    withPR,
  });

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

  const bodyH = height - (screen === "list" ? 7 : 5);
  const title: ReactNode = pr ? <PRTitle pr={pr} showRepo={showRepo} /> : null;

  const main = (): ReactNode => {
    if (screen === "diff") {
      return (
        <DiffView
          title={title}
          subtitle={diffSubtitle(
            shown ?? null,
            hiddenTests,
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
          empty={
            hiddenTests
              ? "Only tests changed in this PR. T shows them."
              : "No changes."
          }
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
        prs={lists[tab] ? source : null}
        list={list}
        places={places}
        statusOf={statusFor}
        pr={pr}
        cursor={Math.min(cursor, Math.max(0, list.length - 1))}
        handleSelectPR={setCursor}
        sidebar={sidebar}
        behind={behind}
        actions={prActions}
        emptyLabel={queues.find((q) => q.id === tab)?.label ?? ""}
        filter={filter}
        sizes={panes.sizes}
        resizing={panes.resizing}
        handleGrab={panes.setResizing}
        detailTab={detailTab}
        handleDetailTab={setDetailTab}
        expandFiles={expandFiles}
        width={width}
        height={bodyH}
      />
    );
  };

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={C.bg}
      onMouseDrag={(event) => panes.dragTo(event.x)}
      // we capture the mouse, so clicks on OSC 8 links have to be opened by hand
      onMouseDown={(event) => {
        const url = renderer.getLinkAt(event.x, event.y);
        if (url) {
          openInBrowser(url);
        }
      }}
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
            count: lists[q.id]?.length,
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
        files={shown?.files ?? []}
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
