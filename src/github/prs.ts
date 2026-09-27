import type { Octokit } from "@octokit/rest";

import { api, dryRun, run, split } from "./client.ts";

export type Checks = "pass" | "fail" | "pending" | "none";
export type MergeMethod = "squash" | "merge" | "rebase";
export type UpdateMethod = "merge" | "rebase";
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export interface Label {
  name: string;
  // hex without the #
  color: string;
}

export interface Review {
  author: string;
  state: string;
}

export interface PR {
  // GraphQL node id, for mutations
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  // how the author relates to the repo: MEMBER, CONTRIBUTOR, OWNER, …
  authorAssociation: string;
  createdAt: string;
  updatedAt: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  isDraft: boolean;
  reviewDecision: string;
  mergeable: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  url: string;
  body: string;
  checks: Checks;
  labels: Label[];
  reviews: Review[];
  reviewRequests: string[];
  headOwner: string;
  // the branch lives in a fork, so merging shouldn't try to delete it
  isCrossRepository: boolean;
  // set when the PR is part of one of GitHub's native stacks
  stackNumber: number | null;
  stackPosition: number | null;
}

const PR_FIELDS = `
  fragment PRFields on PullRequest {
    id number title createdAt updatedAt headRefName headRefOid baseRefName isDraft authorAssociation
    reviewDecision mergeable additions deletions changedFiles url body isCrossRepository
    repository { nameWithOwner }
    author { login }
    headRepositoryOwner { login }
    stack { number }
    stackEntry { position }
    comments { totalCount }
    labels(first: 20) { nodes { name color } }
    latestReviews(first: 20) { nodes { author { login } state } }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    reviewRequests(first: 20) {
      nodes { requestedReviewer { ... on User { login } ... on Team { slug } } }
    }
  }
`;

interface RawPR {
  id: string;
  authorAssociation: string;
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  isDraft: boolean;
  reviewDecision: string | null;
  mergeable: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  body: string;
  isCrossRepository: boolean;
  repository: { nameWithOwner: string };
  author: { login: string } | null;
  headRepositoryOwner: { login: string } | null;
  stack: { number: number } | null;
  stackEntry: { position: number } | null;
  comments: { totalCount: number };
  labels: { nodes: Label[] };
  latestReviews: {
    nodes: { author: { login: string } | null; state: string }[];
  };
  commits: {
    nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
  };
  reviewRequests: {
    nodes: { requestedReviewer: { login?: string; slug?: string } | null }[];
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

const toPR = (p: RawPR): PR => {
  const rollup = p.commits.nodes[0]?.commit.statusCheckRollup;
  return {
    additions: p.additions,
    author: p.author?.login ?? "ghost",
    authorAssociation: p.authorAssociation,
    baseRefName: p.baseRefName,
    body: p.body,
    changedFiles: p.changedFiles,
    checks: rollup ? (CHECK_STATES[rollup.state] ?? "none") : "none",
    comments: p.comments.totalCount,
    createdAt: p.createdAt,
    deletions: p.deletions,
    headOwner: p.headRepositoryOwner?.login ?? "",
    headRefName: p.headRefName,
    headRefOid: p.headRefOid,
    id: p.id,
    isCrossRepository: p.isCrossRepository,
    isDraft: p.isDraft,
    labels: p.labels.nodes,
    mergeable: p.mergeable,
    number: p.number,
    repo: p.repository.nameWithOwner,
    reviewDecision: p.reviewDecision ?? "",
    reviewRequests: p.reviewRequests.nodes
      .map((r) => r.requestedReviewer?.login ?? r.requestedReviewer?.slug ?? "")
      .filter(Boolean),
    reviews: p.latestReviews.nodes.map((r) => ({
      author: r.author?.login ?? "ghost",
      state: r.state,
    })),
    stackNumber: p.stack?.number ?? null,
    stackPosition: p.stackEntry?.position ?? null,
    title: p.title,
    updatedAt: p.updatedAt,
    url: p.url,
  };
};

// a repo's open PRs, straight from the repo so a just-merged PR never lingers
export const listRepoPRs = async (repo: string): Promise<PR[]> => {
  const octokit = await api();
  const data = await octokit.graphql<{
    repository: { pullRequests: { nodes: RawPR[] } };
  }>(
    `${PR_FIELDS}
    query ($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(states: OPEN, first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes { ...PRFields }
        }
      }
    }`,
    split(repo)
  );
  return data.repository.pullRequests.nodes.map(toPR);
};

// PRs across every repo, for GitHub search queries like "is:open is:pr author:@me"
export const searchPRs = async (query: string): Promise<PR[]> => {
  const octokit = await api();
  const data = await octokit.graphql<{
    search: { nodes: (RawPR | Record<string, never>)[] };
  }>(
    `${PR_FIELDS}
    query ($q: String!) {
      search(query: $q, type: ISSUE, first: 100) {
        nodes { ...PRFields }
      }
    }`,
    { q: `${query} sort:updated-desc` }
  );
  return data.search.nodes.filter((n): n is RawPR => "number" in n).map(toPR);
};

export const getDiff = async (pr: PR) => {
  const octokit = await api();
  const { data } = await octokit.rest.pulls.get({
    ...split(pr.repo),
    mediaType: { format: "diff" },
    pull_number: pr.number,
  });
  // with the diff media type the body is the raw diff text
  return data as unknown as string;
};

// merges one PR into its base, then deletes its branch like `gh pr merge --delete-branch`,
// first pointing any open PRs stacked on that branch at the base instead
const mergeOne = async (octokit: Octokit, pr: PR, method: MergeMethod) => {
  await octokit.rest.pulls.merge({
    ...split(pr.repo),
    merge_method: method,
    pull_number: pr.number,
  });
  if (pr.isCrossRepository) {
    return;
  }
  const { data: dependents } = await octokit.rest.pulls.list({
    ...split(pr.repo),
    base: pr.headRefName,
    state: "open",
  });
  await Promise.all(
    dependents.map((dependent) =>
      octokit.rest.pulls.update({
        ...split(pr.repo),
        base: pr.baseRefName,
        pull_number: dependent.number,
      })
    )
  );
  try {
    await octokit.rest.git.deleteRef({
      ...split(pr.repo),
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
      { GH_REPO: top.repo }
    );
    return;
  }
  const octokit = await api();
  for (const pr of plan) {
    // oxlint-disable-next-line no-await-in-loop -- each PR merges into the branch the one before it left behind
    await mergeOne(octokit, pr, method);
  }
};

export const submitReview = async (pr: PR, event: ReviewEvent, body = "") => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.rest.pulls.createReview({
    ...split(pr.repo),
    body: body || undefined,
    event,
    pull_number: pr.number,
  });
};

export const closePR = async (pr: PR) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.rest.pulls.update({
    ...split(pr.repo),
    pull_number: pr.number,
    state: "closed",
  });
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

// flips a PR between draft and ready for review
export const setDraft = async (pr: PR, draft: boolean) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  const mutation = draft
    ? "convertPullRequestToDraft"
    : "markPullRequestReadyForReview";
  await octokit.graphql(
    `mutation ($id: ID!) { ${mutation}(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
    { id: pr.id }
  );
};

// how many commits the base branch has that the PR branch doesn't
export const behindBy = async (pr: PR): Promise<number> => {
  const head = `${pr.headOwner || split(pr.repo).owner}:${pr.headRefName}`;
  const octokit = await api();
  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    ...split(pr.repo),
    basehead: `${pr.baseRefName}...${head}`,
    // only the counts matter, so skip the commit list
    per_page: 1,
  });
  return data.behind_by;
};

export const repoLabels = async (repo: string): Promise<Label[]> => {
  const octokit = await api();
  const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    ...split(repo),
    per_page: 100,
  });
  return labels.map((l) => ({ color: l.color, name: l.name }));
};

export const setLabels = async (pr: PR, names: string[]) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.rest.issues.setLabels({
    ...split(pr.repo),
    issue_number: pr.number,
    labels: names,
  });
};
