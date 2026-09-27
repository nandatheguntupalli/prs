#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
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

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  backgroundColor: "#000000",
  useMouse: true,
});

const quit = () => {
  renderer.destroy();
  process.exit(0);
};

createRoot(renderer).render(
  <App repo={repo} method={method} delay={Number(values.delay)} dryRun={dryRun.enabled} onQuit={quit} />,
);
