import { Octokit } from "@octokit/rest";

export type Checks = "pass" | "fail" | "pending" | "none";
export type MergeMethod = "squash" | "merge" | "rebase";
export type UpdateMethod = "merge" | "rebase";

export interface PR {
  // GraphQL node id, for mutations
  id: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  reviewDecision: string;
  mergeable: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  body: string;
  checks: Checks;
  reviewRequests: string[];
  headOwner: string;
  // the branch lives in a fork, so merging shouldn't try to delete it
  isCrossRepository: boolean;
  // set when the PR is part of one of GitHub's native stacks
  stackNumber: number | null;
  stackPosition: number | null;
}

const run = async (
  cmd: string[],
  env: Record<string, string> = {}
): Promise<string> => {
  const proc = Bun.spawn(cmd, {
    env: { ...process.env, ...env },
    stderr: "pipe",
    stdin: "ignore",
    stdout: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    // gh and its extensions prefix errors with their own ✗
    const reason = err
      .trim()
      .split("\n")[0]
      ?.replace(/^✗\s*/u, "");
    throw new Error(reason || `${cmd[0]} exited ${code}`);
  }
  return out;
};

// a token from the environment, or else the one the gh CLI is logged in with
const token = async () => {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const out = await run(["gh", "auth", "token"]);
    return out.trim();
  } catch {
    throw new Error(
      "Not logged in to GitHub. Run `gh auth login`, or set GITHUB_TOKEN."
    );
  }
};

// Octokit logs failed requests to the console, which would scribble over the TUI
const quiet = () => null;

const createClient = async () =>
  new Octokit({
    auth: await token(),
    log: { debug: quiet, error: quiet, info: quiet, warn: quiet },
    userAgent: "prs",
  });

let client: Promise<Octokit> | null = null;
const api = () => {
  client ??= createClient();
  return client;
};

const split = (repo: string) => {
  const [owner = "", name = ""] = repo.split("/");
  return { owner, repo: name };
};

interface ErrorBody {
  message?: string;
  errors?: (string | { message?: string })[];
}

// GitHub's own reason, without the wrapping Octokit adds: REST errors carry it in the response
// body, GraphQL errors in `errors`, behind a "Request failed due to following response errors" line
export const errorMessage = (error: unknown) => {
  const graphql = (error as { errors?: { message?: string }[] }).errors?.[0]
    ?.message;
  const body = (error as { response?: { data?: ErrorBody } }).response?.data;
  const [first] = body?.errors ?? [];
  const reason =
    graphql ?? (typeof first === "string" ? first : first?.message);
  const message =
    reason ??
    body?.message ??
    (error instanceof Error ? error.message : String(error));
  return message.replace(/ - https:\/\/docs\.github\.com\S*$/u, "");
};

export const currentRepo = async (): Promise<string> => {
  const out = await run([
    "gh",
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "-q",
    ".nameWithOwner",
  ]);
  return out.trim();
};

// the Mine and Review requested tabs just stay empty if this fails
export const viewer = async (): Promise<string> => {
  try {
    const octokit = await api();
    const { data } = await octokit.rest.users.getAuthenticated();
    return data.login;
  } catch {
    return "";
  }
};

const LIST_QUERY = `
  query ($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes {
          id number title createdAt headRefName baseRefName isDraft reviewDecision mergeable
          additions deletions changedFiles url body isCrossRepository
          author { login }
          headRepositoryOwner { login }
          stack { number }
          stackEntry { position }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
          reviewRequests(first: 20) {
            nodes { requestedReviewer { ... on User { login } ... on Team { slug } } }
          }
        }
      }
    }
  }
`;

interface ListResponse {
  repository: {
    pullRequests: {
      nodes: (Omit<
        PR,
        | "author"
        | "checks"
        | "reviewRequests"
        | "headOwner"
        | "stackNumber"
        | "stackPosition"
      > & {
        stack: { number: number } | null;
        stackEntry: { position: number } | null;
        author: { login: string } | null;
        headRepositoryOwner: { login: string } | null;
        reviewDecision: string | null;
        commits: {
          nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
        };
        reviewRequests: {
          nodes: {
            requestedReviewer: { login?: string; slug?: string } | null;
          }[];
        };
      })[];
    };
  };
}

// GitHub's combined state for all of the head commit's checks and statuses
const CHECK_STATES: Record<string, Checks> = {
  ERROR: "fail",
  EXPECTED: "pending",
  FAILURE: "fail",
  PENDING: "pending",
  SUCCESS: "pass",
};

export const listPRs = async (repo: string): Promise<PR[]> => {
  const octokit = await api();
  const data = await octokit.graphql<ListResponse>(LIST_QUERY, split(repo));
  return data.repository.pullRequests.nodes.map(
    ({
      commits,
      headRepositoryOwner,
      reviewRequests,
      stack,
      stackEntry,
      ...p
    }) => {
      const rollup = commits.nodes[0]?.commit.statusCheckRollup;
      return {
        ...p,
        author: p.author?.login ?? "ghost",
        checks: rollup ? (CHECK_STATES[rollup.state] ?? "none") : "none",
        headOwner: headRepositoryOwner?.login ?? "",
        reviewDecision: p.reviewDecision ?? "",
        reviewRequests: reviewRequests.nodes
          .map(
            (r) => r.requestedReviewer?.login ?? r.requestedReviewer?.slug ?? ""
          )
          .filter(Boolean),
        stackNumber: stack?.number ?? null,
        stackPosition: stackEntry?.position ?? null,
      };
    }
  );
};

export const getDiff = async (repo: string, n: number) => {
  const octokit = await api();
  const { data } = await octokit.rest.pulls.get({
    ...split(repo),
    mediaType: { format: "diff" },
    pull_number: n,
  });
  // with the diff media type the body is the raw diff text
  return data as unknown as string;
};

export const dryRun = { enabled: false };

// merges one PR into its base, then deletes its branch like `gh pr merge --delete-branch`,
// first pointing any open PRs stacked on that branch at the base instead
const mergeOne = async (
  octokit: Octokit,
  repo: string,
  pr: PR,
  method: MergeMethod
) => {
  await octokit.rest.pulls.merge({
    ...split(repo),
    merge_method: method,
    pull_number: pr.number,
  });
  if (pr.isCrossRepository) {
    return;
  }
  const { data: dependents } = await octokit.rest.pulls.list({
    ...split(repo),
    base: pr.headRefName,
    state: "open",
  });
  await Promise.all(
    dependents.map((dependent) =>
      octokit.rest.pulls.update({
        ...split(repo),
        base: pr.baseRefName,
        pull_number: dependent.number,
      })
    )
  );
  try {
    await octokit.rest.git.deleteRef({
      ...split(repo),
      ref: `heads/${pr.headRefName}`,
    });
  } catch {
    // already gone: the repo deletes head branches on merge, or someone beat us to it
  }
};

// merges a PR and everything below it in its stack; `plan` is top first, ending at the bottom.
// A native GitHub stack has to go through gh-stack. A plain chain merges top-down, each PR into
// its parent's branch, so the bottom lands in the trunk carrying the rest with no re-applied commits.
export const merge = async (
  repo: string,
  plan: PR[],
  method: MergeMethod,
  nativeStack: number | null
) => {
  const [top] = plan;
  if (dryRun.enabled || !top) {
    return;
  }
  if (nativeStack !== null) {
    // gh extensions take the repo from GH_REPO rather than a flag
    await run(
      ["gh", "stack", "merge", String(top.number), "--yes", `--${method}`],
      { GH_REPO: repo }
    );
    return;
  }
  const octokit = await api();
  for (const pr of plan) {
    // oxlint-disable-next-line no-await-in-loop -- each PR merges into the branch the one before it left behind
    await mergeOne(octokit, repo, pr, method);
  }
};

export const approve = async (repo: string, n: number) => {
  if (!dryRun.enabled) {
    const octokit = await api();
    await octokit.rest.pulls.createReview({
      ...split(repo),
      event: "APPROVE",
      pull_number: n,
    });
  }
};

export const closePR = async (repo: string, n: number) => {
  if (!dryRun.enabled) {
    const octokit = await api();
    await octokit.rest.pulls.update({
      ...split(repo),
      pull_number: n,
      state: "closed",
    });
  }
};

// brings the PR branch up to date with its base, like GitHub's "Update branch" button:
// rebasing it onto the base, or merging the base in
export const updateBranch = async (pr: PR, method: UpdateMethod) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.graphql(
    // "method" is reserved by Octokit for the HTTP method, so the variable can't use that name
    `mutation ($id: ID!, $updateMethod: PullRequestBranchUpdateMethod!) {
      updatePullRequestBranch(input: { pullRequestId: $id, updateMethod: $updateMethod }) {
        pullRequest { number }
      }
    }`,
    { id: pr.id, updateMethod: method.toUpperCase() }
  );
};

// how many commits the base branch has that the PR branch doesn't
export const behindBy = async (repo: string, pr: PR): Promise<number> => {
  const head = `${pr.headOwner || split(repo).owner}:${pr.headRefName}`;
  const octokit = await api();
  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    ...split(repo),
    basehead: `${pr.baseRefName}...${head}`,
    // only the counts matter, so skip the commit list
    per_page: 1,
  });
  return data.behind_by;
};

export const openInBrowser = (url: string) =>
  Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], {
    stderr: "ignore",
    stdout: "ignore",
  });
