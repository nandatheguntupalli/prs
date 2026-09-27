import { useMemo } from "react";

import type { Screen } from "../commands.ts";
import { listThreads } from "../github/comments.ts";
import { getDiff } from "../github/prs.ts";
import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import { parseDiff, withThreads } from "../ui/diff-model.ts";
import { useLoader } from "./use-loader.ts";

export const useDiffData = ({
  screen,
  pr,
  moved,
  width,
}: {
  screen: Screen;
  pr: PR | undefined;
  // null until the user moves; until then the cursor sits on the first line of code
  moved: number | null;
  width: number;
}) => {
  const open = screen === "diff" && pr;
  const diff = useLoader(
    open ? `pr:${prKey(pr)}:${pr.headRefOid}` : null,
    async () => parseDiff(pr ? await getDiff(pr) : "")
  );
  const threads = useLoader(open ? `threads:${prKey(pr)}` : null, () =>
    pr ? listThreads(pr) : Promise.resolve([])
  );
  const rows = useMemo(
    () => withThreads(diff.value?.rows ?? [], threads.value ?? [], width - 32),
    [diff.value, threads.value, width]
  );
  const cursor =
    moved ??
    Math.max(
      0,
      rows.findIndex((r) => r.kind === "line")
    );
  return { cursor, diff, rows, threads };
};
