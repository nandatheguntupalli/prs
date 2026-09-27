#!/usr/bin/env bun
import { parseArgs } from "node:util";

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import pkg from "../package.json";
import { App } from "./app.tsx";
import { currentRepo, dryRun } from "./gh.ts";
import type { MergeMethod } from "./gh.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  args: Bun.argv.slice(2),
  options: {
    delay: { default: "4", short: "d", type: "string" },
    "dry-run": { type: "boolean" },
    help: { short: "h", type: "boolean" },
    method: { default: "squash", short: "m", type: "string" },
    version: { short: "v", type: "boolean" },
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

let [repo] = positionals;
if (!repo) {
  try {
    repo = await currentRepo();
  } catch {
    console.error("Not in a GitHub repo. Pass one: prs owner/repo");
    process.exit(1);
  }
}

dryRun.enabled = !!values["dry-run"];

const renderer = await createCliRenderer({
  backgroundColor: "#000000",
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  useMouse: true,
});

const quit = () => {
  renderer.destroy();
  process.exit(0);
};

createRoot(renderer).render(
  <App
    repo={repo}
    method={method}
    delay={Number(values.delay)}
    dryRun={dryRun.enabled}
    onQuit={quit}
  />
);
