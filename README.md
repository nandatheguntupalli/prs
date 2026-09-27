# prs

Superhuman for pull requests. A keyboard-first TUI for reviewing, merging, and keeping up with pull requests, built on [OpenTUI](https://github.com/anomalyco/opentui).

## Install

```sh
brew install nandatheguntupalli/tap/prs
```

Talks to GitHub directly through its API. It signs in with the [`gh` CLI](https://cli.github.com)'s login (`gh auth login`; Homebrew installs `gh` for you), or set `GITHUB_TOKEN` to use a token instead.

## Usage

```sh
prs                   # the repo in the current directory
prs owner/repo        # or any repo
prs --all             # your PRs across GitHub (also what you get outside a repo)
prs --method squash   # how m merges: merge (default), squash, or rebase
prs --update merge    # how u updates a branch: rebase (default) or merge
prs --delay 2         # seconds before a merge or close fires (default 4)
prs --dry-run         # nothing on GitHub changes
prs --text-graph      # draw the graph with characters, even if the terminal can show images
```

Press `?` for every key, or `ctrl+p` to find any action by name.

## Pull requests

In a repo, the queues are **All**, **Mine**, and **Review requested**. With `--all` they're **Mine**, **Review requested**, and **Involved**, across every repo.

| key |  |
| --- | --- |
| `m` | **merge** (and delete the branch) |
| `x` | close |
| `z` | undo a merge or close that hasn't fired yet |
| `a` | approve |
| `R` | review: comment, approve, or request changes, with a message |
| `u` | update the branch from its base |
| `s` | toggle draft / ready for review |
| `L` | labels |
| `c` | checks: every CI check, then a job's steps and log (`n` / `p` jump between errors) |
| `y` | copy the URL, a markdown link, the branch, or a checkout command |
| `e` | open in your editor (see below) |
| `o` | open in the browser |

Merges and closes wait a few seconds before running, like Superhuman's undo send, so `z` can take one back. Quitting while one is pending runs it right away. The sidebar shows how far a branch is behind its base; **Update** appears when it is, unless the branch conflicts, which has to be fixed locally.

## Moving around

| key                     |                                            |
| ----------------------- | ------------------------------------------ |
| `j` / `k`, `gg` / `G`   | move, top, bottom                          |
| `ctrl+d` / `ctrl+u`     | page down / up                             |
| `tab` / `1`–`3`         | switch queues                              |
| `/`                     | filter by title, author, branch, or number |
| `⏎` / `d`               | diff                                       |
| `h` / `l`               | move between the graph and the PRs         |
| `v` / `p`               | show or hide the graph / the details       |
| `[` `]` / `{` `}` / `=` | resize the graph / the details / reset     |
| `t`                     | theme                                      |

The mouse works too: click rows, tabs, and the sidebar's buttons, and drag the lines between panes to resize them.

## Diffs and comments

The diff shows line numbers, each file under its own header, and review comments inline under the lines they're on (outdated ones under their file).

| key       |                                                |
| --------- | ---------------------------------------------- |
| `]` / `[` | next / previous file                           |
| `f`       | jump to a file                                 |
| `n` / `p` | next / previous comment thread                 |
| `⏎`       | comment on the line, or reply on a thread      |
| `v`       | select lines, then `⏎` to comment on the range |
| `J` / `K` | next / previous PR                             |

## Stacked PRs

PRs that build on each other (one PR's base is another PR's branch, the way `gh stack` and Graphite make them) are shown together, top first, joined by `╭ ├ ╰`. The sidebar lists the whole stack.

Merging a stacked PR merges it and everything below it, and the button says how many (**Merge 3**). GitHub's native stacks go through `gh stack merge`, so install the [gh-stack](https://github.com/github/gh-stack) extension if you use them. Plain chains are merged top-down, each PR into its parent's branch, so the bottom lands in `main` carrying the rest. PRs above the one you merge are re-pointed at the new base before any branch is deleted.

After a squash merge, PRs higher in the stack still carry the original commits and will show conflicts until they're restacked (`gh stack sync`, or `git rebase --onto`). `prs` doesn't do that for you, since it means force-pushing someone's branch.

## Graph

The commit graph sits on the left, drawn like VS Code's: one row per commit, colored lanes, and the branch pill right next to its commit. `h` moves into it, `⏎` shows a commit, and `l` goes back to the PRs. PR keys like `m` don't act while you're in the graph.

In terminals that can show images (Ghostty, Kitty, WezTerm, and others with the Kitty graphics protocol or Sixel), the graph is drawn in pixels: smooth lines through the commit dots and rounded curves. Everywhere else it's drawn with characters.

Run `prs` inside a clone and the graph reads that clone's history. Anywhere else, `prs` keeps a small bare clone (no file contents until you open a commit) in `~/.cache/prs`.

## Settings

`~/.config/prs/config.json`:

```jsonc
{
  // "system" follows the terminal's light / dark mode; or "midnight", "graphite", "nord", "tokyo", "paper"
  "theme": "system",

  // what `e` runs; {{repo}} {{owner}} {{name}} {{number}} {{headRef}} {{baseRef}} {{author}} {{url}} {{repoPath}}
  "editorCommand": "code {{repoPath}}",

  // where your clones are, for {{repoPath}}: an exact repo, an owner's repos, or a pattern
  "repoPaths": {
    "useTaiga/siberia": "~/VS/siberia",
    "useTaiga/*": "~/code/useTaiga/*",
    ":owner/:repo": "~/src/:owner/:repo",
  },
}
```

Without `editorCommand`, `e` opens the clone in `$VISUAL` or `$EDITOR`. Pane sizes are kept in `~/.config/prs/layout.json`.

## Development

```sh
bun install
bun start owner/repo
bun test
bun run build         # standalone binary at dist/prs
```

## Releasing

```sh
bun run release       # patch; or: bun run release minor | major | 1.2.3
```

That bumps the version, tags it, and pushes. CI then runs `scripts/release.ts`, which builds binaries for macOS and Linux, publishes a GitHub release, and updates the formula in [homebrew-tap](https://github.com/nandatheguntupalli/homebrew-tap).
