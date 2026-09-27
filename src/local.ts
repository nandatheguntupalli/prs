import type { CliRenderer } from "@opentui/core";

import { repoPath } from "./config.ts";
import type { Config } from "./config.ts";
import { run } from "./github/client.ts";
import type { PR } from "./github/prs.ts";

export const localCheckout = async (): Promise<string | null> => {
  try {
    const out = await run(["git", "rev-parse", "--show-toplevel"]);
    return out.trim();
  } catch {
    return null;
  }
};

const CLIPBOARD_TOOLS = [
  ["pbcopy"],
  ["wl-copy"],
  ["xclip", "-selection", "clipboard"],
];

// fall back to OSC 52, which also works over SSH
export const copyText = async (renderer: CliRenderer, text: string) => {
  for (const cmd of CLIPBOARD_TOOLS) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- try each tool until one exists
      const proc = Bun.spawn(cmd, {
        stderr: "ignore",
        stdin: "pipe",
        stdout: "ignore",
      });
      proc.stdin.write(text);
      proc.stdin.end();
      // oxlint-disable-next-line no-await-in-loop -- same
      if ((await proc.exited) === 0) {
        return true;
      }
    } catch {
      // not installed
    }
  }
  return renderer.copyToClipboardOSC52(text);
};

const fill = (template: string, values: Record<string, string>) =>
  template.replaceAll(
    /\{\{(?<key>\w+)\}\}/gu,
    (_, key: string) => values[key] ?? ""
  );

export const editorCommand = (
  config: Config,
  pr: PR,
  localDir: string | null
) => {
  const [owner = "", name = ""] = pr.repo.split("/");
  const path = repoPath(config, pr.repo) ?? localDir ?? "";
  if (config.editorCommand) {
    return fill(config.editorCommand, {
      author: pr.author,
      baseRef: pr.baseRefName,
      headRef: pr.headRefName,
      name,
      number: String(pr.number),
      owner,
      repo: pr.repo,
      repoPath: path,
      url: pr.url,
    });
  }
  const editor = process.env.VISUAL || process.env.EDITOR;
  if (!editor || !path) {
    return null;
  }
  return `${editor} ${JSON.stringify(path)}`;
};

export const runInTerminal = async (renderer: CliRenderer, command: string) => {
  renderer.suspend();
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });
    return await proc.exited;
  } finally {
    renderer.resume();
  }
};

// gh pr checkout handles branches from forks
export const checkoutBranch = async (pr: PR, dir: string) => {
  await run(
    ["gh", "pr", "checkout", String(pr.number), "-R", pr.repo],
    {},
    dir
  );
};
