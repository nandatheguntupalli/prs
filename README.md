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
prs --text-graph      # draw the graph with characters, even if the terminal can show images
```

| key | list | diff |
| --- | --- | --- |
| `j` / `k` | move | scroll |
| `⏎` / `d` | open diff |  |
| `m` | **merge** (and delete branch) | merge |
| `x` | close | close |
| `z` | undo a pending merge or close | undo |
| `u` | update branch (merge the base branch in) | page up |
| `a` | approve | approve |
| `o` | open in browser | open in browser |
| `tab` / `1`–`3` | switch between All, Mine, Review requested |  |
| `h` / `l` | move between the graph and the PR list | back / |
| `v` | show or hide the graph |  |
| `[` / `]` | shrink / grow the graph |  |
| `{` / `}` | shrink / grow the sidebar |  |
| `=` | reset pane sizes |  |
| `p` | toggle the sidebar |  |
| `space` / `b` |  | page down / up |
| `J` / `K` |  | next / prev |
| `r` | refresh | refresh |
| `q` / `esc` | quit | back |

The mouse works too: click a row, a tab, or the **Merge**, **Update**, and **Close** buttons in the sidebar, and drag the lines between panes to resize them. Pane sizes are remembered in `~/.config/prs/layout.json`. The sidebar shows how far a PR's branch is behind its base, and **Update** appears when it is.

## Graph

The graph sits on the left, drawn like VS Code's: one row per commit, colored lanes, and the branch pill right next to its commit. Press `h` to move into it, `j`/`k` to walk the history, `⏎` to see a commit, and `l` to go back to the PRs. PR keys like `m` don't act while you're in the graph.

In terminals that can show images (Ghostty, Kitty, WezTerm, and others with the Kitty graphics protocol or Sixel), the graph is drawn in pixels: smooth lines through the commit dots and rounded curves, like VS Code. Everywhere else it's drawn with characters. Pass `--text-graph` to always use characters.

Run `prs` inside a clone and the graph reads that clone's history. Anywhere else, `prs` keeps a small bare clone (no file contents until you open a commit) in `~/.cache/prs`. Either way it fetches in the background.

Merges and closes wait a few seconds before running, like Superhuman's undo send. Hit `z` to take one back. Quitting while one is pending runs it right away.

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
