import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
} from "@opentui/core";
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

// the system clipboard, or OSC 52 through the terminal when there isn't one (over SSH, say)
export const copyText = async (renderer: CliRenderer, text: string) => {
  const clipboard = createClipboard({
    host: createHostClipboard(),
    terminal: createRendererClipboardAdapter(renderer),
  });
  try {
    const result = await clipboard.writeText(text, {
      destination: "best-available",
    });
    return (
      result.host.status === "written" || result.terminal.status === "attempted"
    );
  } finally {
    await clipboard.dispose();
  }
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
