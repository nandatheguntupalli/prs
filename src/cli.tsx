#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { parseArgs } from "node:util";
import { App } from "./app.tsx";
import pkg from "../package.json";
import { currentRepo, dryRun, type MergeMethod } from "./gh.ts";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    method: { type: "string", short: "m", default: "squash" },
    delay: { type: "string", short: "d", default: "4" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

if (values.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (values.help) {
  console.log(`prs [owner/repo] [--method squash|merge|rebase] [--delay seconds] [--dry-run]

Keyboard-first PR inbox. Defaults to the repo in the current directory.`);
  process.exit(0);
}

const method = values.method as MergeMethod;
if (!["squash", "merge", "rebase"].includes(method)) {
  console.error(`Unknown merge method: ${method}`);
  process.exit(1);
}

let repo = positionals[0];
if (!repo) {
  try {
    repo = await currentRepo();
  } catch {
    console.error("Not in a GitHub repo. Pass one: prs owner/repo");
    process.exit(1);
  }
}

dryRun.enabled = !!values["dry-run"];

// alternate screen so the TUI takes over the terminal and leaves no mess behind
process.stdout.write("\x1b[?1049h\x1b[H");
const app = render(<App repo={repo} method={method} delay={Number(values.delay)} />, { exitOnCtrlC: false });
await app.waitUntilExit();
process.stdout.write("\x1b[?1049l");
