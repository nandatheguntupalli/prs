#!/usr/bin/env bun
import { parseArgs } from "node:util";

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import pkg from "../package.json";
import { App } from "./app.tsx";
import { loadConfig } from "./config.ts";
import { currentRepo, dryRun } from "./github/client.ts";
import type { MergeMethod, UpdateMethod } from "./github/prs.ts";
import { loadSizes } from "./layout.ts";
import { localCheckout } from "./local.ts";
import { setIconStyle } from "./ui/icons.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  args: Bun.argv.slice(2),
  options: {
    all: { short: "a", type: "boolean" },
    delay: { default: "4", short: "d", type: "string" },
    "dry-run": { type: "boolean" },
    help: { short: "h", type: "boolean" },
    method: { default: "merge", short: "m", type: "string" },
    update: { default: "rebase", short: "u", type: "string" },
    version: { short: "v", type: "boolean" },
  },
});

if (values.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (values.help) {
  console.log(`prs [owner/repo] [--all] [--method merge|squash|rebase] [--update rebase|merge] [--delay seconds] [--dry-run]

Keyboard-first PR inbox. Shows the repo in the current directory, or with --all (or
outside a repo) your pull requests across GitHub. Settings: ~/.config/prs/config.json`);
  process.exit(0);
}

const method = values.method as MergeMethod;
if (!["squash", "merge", "rebase"].includes(method)) {
  console.error(`Unknown merge method: ${method}`);
  process.exit(1);
}

const updateMethod = values.update as UpdateMethod;
if (!["rebase", "merge"].includes(updateMethod)) {
  console.error(`Unknown update method: ${updateMethod}`);
  process.exit(1);
}

const here = await currentRepo().catch(() => "");

const scope = values.all ? "" : (positionals[0] ?? here);

dryRun.enabled = !!values["dry-run"];

const local = scope && here === scope ? await localCheckout() : null;
const [initialSizes, config] = await Promise.all([loadSizes(), loadConfig()]);
setIconStyle(config.icons ?? "nerd");

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
    scope={scope}
    local={local}
    config={config}
    initialSizes={initialSizes}
    method={method}
    updateMethod={updateMethod}
    delay={Number(values.delay)}
    dryRun={dryRun.enabled}
    onQuit={quit}
  />
);
