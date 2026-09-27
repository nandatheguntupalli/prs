import type { Screen } from "../commands.ts";
import { isErrorLine, jobLog, jobSteps, listChecks } from "../github/checks.ts";
import type { Check } from "../github/checks.ts";
import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";
import { useLoader } from "./use-loader.ts";

const firstError = (log: string[] | null) =>
  Math.max(
    0,
    (log ?? []).findIndex((line) => isErrorLine(line))
  );

export const useChecksData = ({
  screen,
  pr,
  job,
  logCursor,
}: {
  screen: Screen;
  pr: PR | undefined;
  job: Check | null;
  logCursor: number | null;
}) => {
  const active = screen === "checks" || screen === "job";
  const checks = useLoader(
    active && pr ? `checks:${prKey(pr)}:${pr.headRefOid}` : null,
    () => (pr ? listChecks(pr) : Promise.resolve([]))
  );
  const jobId = screen === "job" ? (job?.jobId ?? null) : null;
  const steps = useLoader(jobId ? `steps:${jobId}` : null, () =>
    pr && jobId ? jobSteps(pr.repo, jobId) : Promise.resolve([])
  );
  const log = useLoader(jobId ? `log:${jobId}` : null, () =>
    pr && jobId ? jobLog(pr.repo, jobId) : Promise.resolve([])
  );
  // open the log on its first error
  const logAt = logCursor ?? firstError(log.value);
  return { checks, log, logAt, steps };
};
