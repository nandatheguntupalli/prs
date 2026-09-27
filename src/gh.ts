export type Checks = "pass" | "fail" | "pending" | "none";
export type MergeMethod = "squash" | "merge" | "rebase";

export type PR = {
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
};

const FIELDS =
  "number,title,author,createdAt,headRefName,baseRefName,isDraft,reviewDecision,mergeable,additions,deletions,changedFiles,url,body,statusCheckRollup";

async function gh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(err.trim().split("\n")[0] || `gh exited ${code}`);
  return out;
}

function summarizeChecks(rollup: any[] | null): Checks {
  if (!rollup?.length) return "none";
  let pending = false;
  for (const c of rollup) {
    // CheckRun has status/conclusion, StatusContext has state
    const v = (c.conclusion || c.state || "").toUpperCase();
    if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(v)) return "fail";
    if ((c.status && c.status !== "COMPLETED") || v === "PENDING" || v === "EXPECTED") pending = true;
  }
  return pending ? "pending" : "pass";
}

export async function currentRepo(): Promise<string> {
  return (await gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])).trim();
}

export async function listPRs(repo: string): Promise<PR[]> {
  const raw = JSON.parse(await gh(["pr", "list", "-R", repo, "--limit", "100", "--json", FIELDS]));
  return raw.map((p: any) => ({
    ...p,
    author: p.author?.login ?? "ghost",
    checks: summarizeChecks(p.statusCheckRollup),
    statusCheckRollup: undefined,
  }));
}

export const getDiff = (repo: string, n: number) => gh(["pr", "diff", String(n), "-R", repo, "--color", "never"]);

export const dryRun = { enabled: false };

export const merge = async (repo: string, n: number, method: MergeMethod) =>
  dryRun.enabled ? "" : gh(["pr", "merge", String(n), "-R", repo, `--${method}`, "--delete-branch"]);

export const approve = async (repo: string, n: number) =>
  dryRun.enabled ? "" : gh(["pr", "review", String(n), "-R", repo, "--approve"]);

export const openInBrowser = (url: string) =>
  Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], { stdout: "ignore", stderr: "ignore" });
