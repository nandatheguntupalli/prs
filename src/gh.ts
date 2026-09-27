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
}

// CheckRun has status/conclusion, StatusContext has state
interface RawCheck {
  conclusion?: string;
  state?: string;
  status?: string;
}

// users have a login, teams have a slug
interface RawReviewer {
  login?: string;
  name?: string;
  slug?: string;
}

type RawPR = Omit<PR, "author" | "checks" | "reviewRequests"> & {
  author: { login: string } | null;
  statusCheckRollup: RawCheck[] | null;
  reviewRequests: RawReviewer[] | null;
};

const FIELDS =
  "number,title,author,createdAt,headRefName,baseRefName,isDraft,reviewDecision,mergeable,additions,deletions,changedFiles,url,body,statusCheckRollup,reviewRequests";

const FAILED = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

const gh = async (args: string[]): Promise<string> => {
  const proc = Bun.spawn(["gh", ...args], { stderr: "pipe", stdout: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(err.trim().split("\n")[0] || `gh exited ${code}`);
  }
  return out;
};

const summarizeChecks = (rollup: RawCheck[] | null): Checks => {
  if (!rollup?.length) {
    return "none";
  }
  let pending = false;
  for (const c of rollup) {
    const v = (c.conclusion || c.state || "").toUpperCase();
    if (FAILED.has(v)) {
      return "fail";
    }
    if (
      (c.status && c.status !== "COMPLETED") ||
      v === "PENDING" ||
      v === "EXPECTED"
    ) {
      pending = true;
    }
  }
  return pending ? "pending" : "pass";
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const currentRepo = async (): Promise<string> => {
  const out = await gh([
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
    const out = await gh(["api", "user", "-q", ".login"]);
    return out.trim();
  } catch {
    return "";
  }
};

export const listPRs = async (repo: string): Promise<PR[]> => {
  const out = await gh([
    "pr",
    "list",
    "-R",
    repo,
    "--limit",
    "100",
    "--json",
    FIELDS,
  ]);
  const raw: RawPR[] = JSON.parse(out);
  return raw.map(({ statusCheckRollup, ...p }) => ({
    ...p,
    author: p.author?.login ?? "ghost",
    checks: summarizeChecks(statusCheckRollup),
    reviewRequests: (p.reviewRequests ?? [])
      .map((r) => r.login ?? r.slug ?? r.name ?? "")
      .filter(Boolean),
  }));
};

export const getDiff = (repo: string, n: number) =>
  gh(["pr", "diff", String(n), "-R", repo, "--color", "never"]);

export const dryRun = { enabled: false };

export const merge = (repo: string, n: number, method: MergeMethod) =>
  dryRun.enabled
    ? Promise.resolve("")
    : gh([
        "pr",
        "merge",
        String(n),
        "-R",
        repo,
        `--${method}`,
        "--delete-branch",
      ]);

export const approve = (repo: string, n: number) =>
  dryRun.enabled
    ? Promise.resolve("")
    : gh(["pr", "review", String(n), "-R", repo, "--approve"]);

export const openInBrowser = (url: string) =>
  Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], {
    stderr: "ignore",
    stdout: "ignore",
  });
