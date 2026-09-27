import { useMemo } from "react";

import type { Screen } from "../commands.ts";
import { listThreads } from "../github/comments.ts";
import { getDiff } from "../github/prs.ts";
import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import { parseDiff, withoutTests, withThreads } from "../ui/diff-model.ts";
import { useLoader } from "./use-loader.ts";

export const useDiffData = ({
  screen,
  pr,
  moved,
  width,
  showTests,
}: {
  screen: Screen;
  pr: PR | undefined;
  // null until the user moves; until then the cursor sits on the first line of code
  moved: number | null;
  width: number;
  showTests: boolean;
}) => {
  const open = screen === "diff" && pr;
  const diff = useLoader(
    open ? `pr:${prKey(pr)}:${pr.headRefOid}` : null,
    async () => parseDiff(pr ? await getDiff(pr) : "")
  );
  const threads = useLoader(open ? `threads:${prKey(pr)}` : null, () =>
    pr ? listThreads(pr) : Promise.resolve([])
  );
  const shown = useMemo(
    () => (diff.value && !showTests ? withoutTests(diff.value) : diff.value),
    [diff.value, showTests]
  );
  const hiddenTests =
    (diff.value?.files.length ?? 0) - (shown?.files.length ?? 0);
  const rows = useMemo(
    () => withThreads(shown?.rows ?? [], threads.value ?? [], width - 32),
    [shown, threads.value, width]
  );
  const cursor =
    moved ??
    Math.max(
      0,
      rows.findIndex((r) => r.kind === "line")
    );
  return { cursor, diff, hiddenTests, rows, shown, threads };
};
