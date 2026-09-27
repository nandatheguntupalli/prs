// What the details pane's tabs show: the conversation, the commits, and the changed files.

import { api, split } from "./client.ts";
import type { PR } from "./prs.ts";

export interface ActivityItem {
  id: string;
  author: string;
  // "commented", "approved", "requested changes", "reviewed"
  action: string;
  body: string;
  createdAt: string;
}

const REVIEW_ACTIONS: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "reviewed",
  DISMISSED: "had a review dismissed",
};

// the PR's conversation: comments and reviews, oldest first
export const listActivity = async (pr: PR): Promise<ActivityItem[]> => {
  const octokit = await api();
  const [comments, reviews] = await Promise.all([
    octokit.paginate(octokit.rest.issues.listComments, {
      ...split(pr.repo),
      issue_number: pr.number,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.pulls.listReviews, {
      ...split(pr.repo),
      per_page: 100,
      pull_number: pr.number,
    }),
  ]);
  const items: ActivityItem[] = [
    ...comments.map((c) => ({
      action: "commented",
      author: c.user?.login ?? "ghost",
      body: c.body ?? "",
      createdAt: c.created_at,
      id: `c${c.id}`,
    })),
    // a review with no summary and no verdict is just the wrapper around line comments
    ...reviews
      .filter((r) => r.body || r.state !== "COMMENTED")
      .map((r) => ({
        action: REVIEW_ACTIONS[r.state] ?? r.state.toLowerCase(),
        author: r.user?.login ?? "ghost",
        body: r.body ?? "",
        createdAt: r.submitted_at ?? "",
        id: `r${r.id}`,
      })),
  ];
  return items.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export interface CommitItem {
  sha: string;
  message: string;
  author: string;
  date: string;
  // more than one parent: a merge, like "Merge branch 'main' into …"
  merge: boolean;
}

export const listCommits = async (pr: PR): Promise<CommitItem[]> => {
  const octokit = await api();
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    ...split(pr.repo),
    per_page: 100,
    pull_number: pr.number,
  });
  return commits.map((c) => ({
    author: c.author?.login ?? c.commit.author?.name ?? "",
    date: c.commit.author?.date ?? "",
    merge: c.parents.length > 1,
    message: c.commit.message.split("\n")[0] ?? "",
    sha: c.sha.slice(0, 7),
  }));
};

export interface FileItem {
  path: string;
  // added, removed, modified, renamed, …
  status: string;
  additions: number;
  deletions: number;
}

export const listFiles = async (pr: PR): Promise<FileItem[]> => {
  const octokit = await api();
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    ...split(pr.repo),
    per_page: 100,
    pull_number: pr.number,
  });
  return files.map((f) => ({
    additions: f.additions,
    deletions: f.deletions,
    path: f.filename,
    status: f.status,
  }));
};
