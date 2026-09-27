import { Octokit } from "@octokit/rest";

export type Checks = "pass" | "fail" | "pending" | "none";
export type MergeMethod = "squash" | "merge" | "rebase";

export interface PR {
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
}

const run = async (cmd: string[]): Promise<string> => {
  const proc = Bun.spawn(cmd, {
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
    throw new Error(err.trim().split("\n")[0] || `${cmd[0]} exited ${code}`);
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

// GitHub's own reason, without the status text and docs link Octokit wraps it in
export const errorMessage = (error: unknown) => {
  const body = (error as { response?: { data?: ErrorBody } }).response?.data;
  const [first] = body?.errors ?? [];
  const reason = typeof first === "string" ? first : first?.message;
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
          number title createdAt headRefName baseRefName isDraft reviewDecision mergeable
          additions deletions changedFiles url body isCrossRepository
          author { login }
          headRepositoryOwner { login }
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
      nodes: (Omit<PR, "author" | "checks" | "reviewRequests" | "headOwner"> & {
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
    ({ commits, headRepositoryOwner, reviewRequests, ...p }) => {
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

// merges, then deletes the branch like `gh pr merge --delete-branch`
export const merge = async (repo: string, pr: PR, method: MergeMethod) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.rest.pulls.merge({
    ...split(repo),
    merge_method: method,
    pull_number: pr.number,
  });
  if (pr.isCrossRepository) {
    return;
  }
  try {
    await octokit.rest.git.deleteRef({
      ...split(repo),
      ref: `heads/${pr.headRefName}`,
    });
  } catch {
    // already gone: the repo deletes head branches on merge, or someone beat us to it
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

// merges the base branch into the PR branch, like GitHub's "Update branch" button
export const updateBranch = async (repo: string, n: number) => {
  if (!dryRun.enabled) {
    const octokit = await api();
    await octokit.rest.pulls.updateBranch({ ...split(repo), pull_number: n });
  }
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
