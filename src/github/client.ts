import { Octokit } from "@octokit/rest";

export const run = async (
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
export const api = () => {
  client ??= createClient();
  return client;
};

export const split = (repo: string) => {
  const [owner = "", name = ""] = repo.split("/");
  return { owner, repo: name };
};

// when set, nothing that changes GitHub actually runs
export const dryRun = { enabled: false };

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

// the Mine and Review requested views just stay empty if this fails
export const viewer = async (): Promise<string> => {
  try {
    const octokit = await api();
    const { data } = await octokit.rest.users.getAuthenticated();
    return data.login;
  } catch {
    return "";
  }
};

export const openInBrowser = (url: string) =>
  Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], {
    stderr: "ignore",
    stdout: "ignore",
  });
