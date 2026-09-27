// Things that happen on this machine rather than on GitHub: the clipboard and the editor.

import type { CliRenderer } from "@opentui/core";

import { repoPath } from "./config.ts";
import type { Config } from "./config.ts";
import type { PR } from "./github/prs.ts";

const CLIPBOARD_TOOLS = [
  ["pbcopy"],
  ["wl-copy"],
  ["xclip", "-selection", "clipboard"],
];

// the system clipboard when there's a tool for it, else the terminal's own (OSC 52, which also
// works over SSH)
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
      // not installed; try the next one
    }
  }
  return renderer.copyToClipboardOSC52(text);
};

const fill = (template: string, values: Record<string, string>) =>
  template.replaceAll(
    /\{\{(?<key>\w+)\}\}/gu,
    (_, key: string) => values[key] ?? ""
  );

// the shell command `e` runs for a PR: the configured template, or $VISUAL / $EDITOR on the clone
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

// hands the terminal to a command and takes it back when the command exits
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
