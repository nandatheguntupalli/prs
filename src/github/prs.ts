import type { Octokit } from "@octokit/rest";

import { api, dryRun, run, split } from "./client.ts";

export type Checks = "pass" | "fail" | "pending" | "none";
export type MergeMethod = "squash" | "merge" | "rebase";
export type UpdateMethod = "merge" | "rebase";
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export interface Label {
  name: string;
  color: string;
}

export interface Review {
  author: string;
  state: string;
}

export type PRState = "OPEN" | "MERGED" | "CLOSED";

export interface PR {
  id: string;
  state: PRState;
  mergedAt: string | null;
  closedAt: string | null;
  repo: string;
  number: number;
  title: string;
  author: string;
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
  // fork branches can't be deleted after merge
  isCrossRepository: boolean;
  stackNumber: number | null;
  stackPosition: number | null;
}

const PR_FIELDS = `
  fragment PRFields on PullRequest {
    id number title state mergedAt closedAt createdAt updatedAt headRefName headRefOid baseRefName isDraft authorAssociation
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
  state: PRState;
  mergedAt: string | null;
  closedAt: string | null;
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
    closedAt: p.closedAt,
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
    mergedAt: p.mergedAt,
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
    state: p.state,
    title: p.title,
    updatedAt: p.updatedAt,
    url: p.url,
  };
};

// Diff stats and the CI rollup cost GitHub work per PR, so 100 PRs in one query take 7-9s
// and can time out. Listing just the IDs, then fetching the fields in parallel chunks, takes ~2s.
const CHUNK = 10;

const hydrate = async (ids: string[]): Promise<PR[]> => {
  const octokit = await api();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    chunks.push(ids.slice(i, i + CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      octokit.graphql<{ nodes: (RawPR | null)[] }>(
        `${PR_FIELDS}
        query ($ids: [ID!]!) {
          nodes(ids: $ids) { ...PRFields }
        }`,
        { ids: chunk }
      )
    )
  );
  return pages
    .flatMap((page) => page.nodes)
    .filter((n): n is RawPR => n !== null)
    .map(toPR);
};

// Listed from the repo rather than search, since search can lag a merge by a few seconds.
export const listRepoPRs = async (
  repo: string,
  state: PRState = "OPEN"
): Promise<PR[]> => {
  const octokit = await api();
  const order = state === "OPEN" ? "CREATED_AT" : "UPDATED_AT";
  const data = await octokit.graphql<{
    repository: { pullRequests: { nodes: { id: string }[] } };
  }>(
    `query ($owner: String!, $repo: String!, $state: PullRequestState!, $count: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(states: [$state], first: $count, orderBy: { field: ${order}, direction: DESC }) {
          nodes { id }
        }
      }
    }`,
    { ...split(repo), count: state === "OPEN" ? 100 : 50, state }
  );
  return hydrate(data.repository.pullRequests.nodes.map((n) => n.id));
};

export const searchPRs = async (query: string): Promise<PR[]> => {
  const octokit = await api();
  const data = await octokit.graphql<{
    search: { nodes: { id?: string }[] };
  }>(
    `query ($q: String!) {
      search(query: $q, type: ISSUE, first: 100) {
        nodes { ... on PullRequest { id } }
      }
    }`,
    { q: `${query} sort:updated-desc` }
  );
  return hydrate(
    data.search.nodes.flatMap((n) => (n.id === undefined ? [] : [n.id]))
  );
};

export const getDiff = async (pr: PR) => {
  const octokit = await api();
  const { data } = await octokit.rest.pulls.get({
    ...split(pr.repo),
    mediaType: { format: "diff" },
    pull_number: pr.number,
  });
  return data as unknown as string;
};

// Retarget anything stacked on this branch before deleting it, or GitHub closes those PRs.
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
    // already deleted by the repo's auto-delete setting
  }
};

// `plan` is top first. Native stacks have to go through gh-stack. Plain chains merge top-down,
// so the bottom lands in the trunk carrying the rest without re-applying commits.
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
    // gh extensions read the repo from GH_REPO, not a flag
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

export const reopenPR = async (pr: PR) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.rest.pulls.update({
    ...split(pr.repo),
    pull_number: pr.number,
    state: "open",
  });
};

export const updateBranch = async (pr: PR, method: UpdateMethod) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.graphql(
    // Octokit reserves "method" for the HTTP method
    `mutation ($id: ID!, $updateMethod: PullRequestBranchUpdateMethod!) {
      updatePullRequestBranch(input: { pullRequestId: $id, updateMethod: $updateMethod }) {
        pullRequest { number }
      }
    }`,
    { id: pr.id, updateMethod: method.toUpperCase() }
  );
};

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

export const behindBy = async (pr: PR): Promise<number> => {
  const head = `${pr.headOwner || split(pr.repo).owner}:${pr.headRefName}`;
  const octokit = await api();
  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    ...split(pr.repo),
    basehead: `${pr.baseRefName}...${head}`,
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
