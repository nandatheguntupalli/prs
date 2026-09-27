# prs

Superhuman for pull requests. A keyboard-first TUI for clearing your PR inbox, built on [OpenTUI](https://github.com/anomalyco/opentui).

## Install

```sh
brew install nandatheguntupalli/tap/prs
```

Requires the [`gh` CLI](https://cli.github.com), logged in (`gh auth login`). Homebrew installs it for you.

## Usage

```sh
prs                   # open PRs for the repo in the current directory
prs owner/repo        # or any repo
prs --method rebase   # squash (default), merge, or rebase
prs --delay 2         # seconds before a merge fires (default 4)
prs --dry-run         # nothing is merged or approved
```

| key | list | diff |
| --- | --- | --- |
| `j` / `k` | move | scroll |
| `⏎` / `d` | open diff |  |
| `m` | **merge** (and delete branch) | merge |
| `z` | undo the pending merge | undo |
| `a` | approve | approve |
| `o` | open in browser | open in browser |
| `tab` / `1` `2` `3` | switch between All, Mine, Review requested |  |
| `p` | toggle the sidebar |  |
| `space` / `b` |  | page down / up |
| `J` / `K` |  | next / prev PR |
| `r` | refresh | refresh |
| `q` / `esc` | quit | back |

The mouse works too: click a row to select it, click a tab, or click **Merge** in the sidebar.

Merges wait a few seconds before running, like Superhuman's undo send. Hit `z` to take it back. Quitting while a merge is pending runs it right away.

## Development

```sh
bun install
bun start owner/repo
bun run build         # standalone binary at dist/prs
```

## Releasing

```sh
bun run release       # patch; or: bun run release minor | major | 1.2.3
```

That bumps the version, tags it, and pushes. CI then runs `scripts/release.ts`, which builds binaries for macOS and Linux, publishes a GitHub release, and updates the formula in [homebrew-tap](https://github.com/nandatheguntupalli/homebrew-tap).
