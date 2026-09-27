import { api, split } from "./client.ts";
import type { PR } from "./prs.ts";

export type CheckState =
  | "pass"
  | "fail"
  | "running"
  | "queued"
  | "skipped"
  | "neutral";

export interface Check {
  name: string;
  group: string;
  state: CheckState;
  startedAt: string | null;
  completedAt: string | null;
  url: string;
  // only Actions jobs have steps and logs we can fetch
  jobId: number | null;
}

export interface Step {
  number: number;
  name: string;
  state: CheckState;
  startedAt: string | null;
  completedAt: string | null;
}

interface RawContext {
  __typename: "CheckRun" | "StatusContext";
  databaseId?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  detailsUrl?: string | null;
  checkSuite?: {
    app: { name: string } | null;
    workflowRun: { workflow: { name: string } } | null;
  } | null;
  context?: string;
  state?: string;
  targetUrl?: string | null;
  createdAt?: string;
}

const FAILED = new Set([
  "FAILURE",
  "ERROR",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

// check runs and commit statuses report state differently; this is both
export const checkState = (
  status: string | undefined,
  conclusion: string | null | undefined
): CheckState => {
  const s = (status ?? "").toUpperCase();
  const c = (conclusion ?? "").toUpperCase();
  if (s && s !== "COMPLETED") {
    return s === "IN_PROGRESS" ? "running" : "queued";
  }
  if (FAILED.has(c)) {
    return "fail";
  }
  if (c === "SKIPPED") {
    return "skipped";
  }
  if (c === "NEUTRAL" || c === "STALE") {
    return "neutral";
  }
  return "pass";
};

const statusState = (state: string | undefined): CheckState => {
  switch ((state ?? "").toUpperCase()) {
    case "SUCCESS": {
      return "pass";
    }
    case "FAILURE":
    case "ERROR": {
      return "fail";
    }
    default: {
      return "running";
    }
  }
};

const ORDER: Record<CheckState, number> = {
  fail: 0,
  neutral: 4,
  pass: 5,
  queued: 3,
  running: 2,
  skipped: 6,
};

export const listChecks = async (pr: PR): Promise<Check[]> => {
  const octokit = await api();
  const data = await octokit.graphql<{
    repository: {
      pullRequest: {
        commits: {
          nodes: {
            commit: {
              statusCheckRollup: { contexts: { nodes: RawContext[] } } | null;
            };
          }[];
        };
      };
    };
  }>(
    `query ($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
            __typename
            ... on CheckRun {
              databaseId name status conclusion startedAt completedAt detailsUrl
              checkSuite { app { name } workflowRun { workflow { name } } }
            }
            ... on StatusContext { context state targetUrl createdAt }
          } } } } } }
        }
      }
    }`,
    { ...split(pr.repo), number: pr.number }
  );
  const contexts =
    data.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
      ?.contexts.nodes ?? [];
  const checks = contexts.map((c): Check => {
    if (c.__typename === "CheckRun") {
      const workflow = c.checkSuite?.workflowRun?.workflow.name;
      return {
        completedAt: c.completedAt ?? null,
        group: workflow ?? c.checkSuite?.app?.name ?? "",
        jobId: workflow ? (c.databaseId ?? null) : null,
        name: c.name ?? "",
        startedAt: c.startedAt ?? null,
        state: checkState(c.status, c.conclusion),
        url: c.detailsUrl ?? pr.url,
      };
    }
    return {
      completedAt: null,
      group: "status",
      jobId: null,
      name: c.context ?? "",
      startedAt: c.createdAt ?? null,
      state: statusState(c.state),
      url: c.targetUrl ?? pr.url,
    };
  });
  return checks.toSorted(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name)
  );
};

export const jobSteps = async (
  repo: string,
  jobId: number
): Promise<Step[]> => {
  const octokit = await api();
  const { data } = await octokit.rest.actions.getJobForWorkflowRun({
    ...split(repo),
    job_id: jobId,
  });
  return (data.steps ?? []).map((s) => ({
    completedAt: s.completed_at ?? null,
    name: s.name,
    number: s.number,
    startedAt: s.started_at ?? null,
    state: checkState(s.status, s.conclusion),
  }));
};

// GitHub prefixes every log line with a timestamp
export const jobLog = async (
  repo: string,
  jobId: number
): Promise<string[]> => {
  const octokit = await api();
  const { data } = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
    ...split(repo),
    job_id: jobId,
  });
  return String(data)
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /u, ""));
};

export const isErrorLine = (line: string) =>
  line.startsWith("##[error]") || /\b(?:error|failed|failure)\b/iu.test(line);
