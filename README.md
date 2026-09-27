# prs

Superhuman for pull requests. A keyboard-first TUI for clearing your PR inbox.

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

| key | list | detail |
| --- | --- | --- |
| `j` / `k` | move | scroll |
| `⏎` | open diff | |
| `m` | **merge** (and delete branch) | merge |
| `z` | undo the pending merge | undo |
| `a` | approve | approve |
| `o` | open in browser | open in browser |
| `space` / `b` | | page down / up |
| `J` / `K` | | next / prev PR |
| `r` | refresh | refresh |
| `q` / `esc` | quit | back |

Merges wait a few seconds before running, like Superhuman's undo send. Hit `z` to take it back. Quitting while a merge is pending runs it right away.

## Development

```sh
bun install
bun start owner/repo
bun run build         # standalone binary at dist/prs
```

## Releasing

Push a tag. CI builds binaries for macOS and Linux, publishes a GitHub release, and updates the formula in [homebrew-tap](https://github.com/nandatheguntupalli/homebrew-tap).

```sh
npm version patch     # bumps package.json and tags vX.Y.Z
git push --follow-tags
```
