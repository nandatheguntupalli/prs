import { api, dryRun, split } from "./client.ts";
import type { PR } from "./prs.ts";

export type Side = "LEFT" | "RIGHT";

export interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface Thread {
  id: number;
  path: string;
  // null when outdated
  line: number | null;
  startLine: number | null;
  side: Side;
  comments: Comment[];
}

export const listThreads = async (pr: PR): Promise<Thread[]> => {
  const octokit = await api();
  const raw = await octokit.paginate(octokit.rest.pulls.listReviewComments, {
    ...split(pr.repo),
    per_page: 100,
    pull_number: pr.number,
  });
  const threads = new Map<number, Thread>();
  for (const c of raw) {
    const comment = {
      author: c.user?.login ?? "ghost",
      body: c.body,
      createdAt: c.created_at,
      id: c.id,
    };
    const root = c.in_reply_to_id ?? c.id;
    const thread = threads.get(root);
    if (thread) {
      thread.comments.push(comment);
    } else {
      threads.set(root, {
        comments: [comment],
        id: root,
        line: c.line ?? null,
        path: c.path,
        side: c.side === "LEFT" ? "LEFT" : "RIGHT",
        startLine: c.start_line ?? null,
      });
    }
  }
  return [...threads.values()];
};

export interface NewComment {
  path: string;
  line: number;
  side: Side;
  startLine?: number;
  body: string;
}

export const addComment = async (pr: PR, c: NewComment) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  const range =
    c.startLine !== undefined && c.startLine !== c.line
      ? { start_line: c.startLine, start_side: c.side }
      : {};
  await octokit.rest.pulls.createReviewComment({
    ...split(pr.repo),
    body: c.body,
    commit_id: pr.headRefOid,
    line: c.line,
    path: c.path,
    pull_number: pr.number,
    side: c.side,
    ...range,
  });
};

export const reply = async (pr: PR, threadId: number, body: string) => {
  if (dryRun.enabled) {
    return;
  }
  const octokit = await api();
  await octokit.rest.pulls.createReplyForReviewComment({
    ...split(pr.repo),
    body,
    comment_id: threadId,
    pull_number: pr.number,
  });
};
