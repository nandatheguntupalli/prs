# prs

A keyboard-first terminal UI for reviewing and merging pull requests. Superhuman for PRs: one key to merge, one key to undo.

Built with [OpenTUI](https://github.com/anomalyco/opentui) and Bun.

## Install

```sh
brew install nandatheguntupalli/tap/prs
```

prs uses your [`gh`](https://cli.github.com) login (`gh auth login`), or `GITHUB_TOKEN` if it's set.

## Usage

```sh
prs                   # the repo you're in
prs owner/repo        # some other repo
prs --all             # your PRs across GitHub
prs --method squash   # merge (default), squash or rebase
prs --update merge    # how `u` updates a branch: rebase (default) or merge
prs --delay 2         # seconds before a merge or close goes through (default 4)
prs --dry-run         # don't change anything on GitHub
```

`?` lists every key, and `ctrl+p` opens a command palette.

## Pull requests

Inside a repo you get **All**, **Mine**, **Review requested**, **Merged** and **Closed**. With `--all` you get **Mine**, **Review requested**, **Involved**, **Merged** and **Closed** across every repo. You can add your own tabs too (see [Settings](#settings)).

| key |                                                                    |
| --- | ------------------------------------------------------------------ |
| `m` | merge (and delete the branch)                                      |
| `x` | close, or reopen a closed PR                                       |
| `z` | undo a merge or close                                              |
| `a` | approve                                                            |
| `R` | review with a comment, approval or change request                  |
| `u` | update the branch from its base                                    |
| `s` | toggle draft                                                       |
| `L` | labels                                                             |
| `c` | checks, then a job's steps and log (`n` / `p` jump between errors) |
| `y` | copy the URL, branch, or a checkout command                        |
| `e` | open in your editor                                                |
| `B` | check out the branch locally                                       |
| `o` | open in the browser                                                |

Merges and closes wait a few seconds before they go through, so `z` can take them back. Once done, the PR stays in the list marked **Merged** or **Closed** until you refresh with `r`.

The details pane has **Overview**, **Activity**, **Commits**, **Checks** and **Files Changed** tabs (`[` / `]`). Links in PR descriptions are clickable.

## Moving around

| key                   |                                |
| --------------------- | ------------------------------ |
| `j` / `k`, `gg` / `G` | move, top, bottom              |
| `ctrl+d` / `ctrl+u`   | page down / up                 |
| `tab`, `1`–`9`        | switch tabs                    |
| `/`                   | filter                         |
| `⏎` / `d`             | diff                           |
| `p`                   | toggle the details pane        |
| `{` / `}`, `=`        | resize the details pane, reset |
| `t`                   | theme                          |

The mouse works as well. You can click rows, tabs and buttons, and drag the divider.

## Diffs

Review comments show inline under the lines they're on.

| key       |                                         |
| --------- | --------------------------------------- |
| `]` / `[` | next / previous file                    |
| `f`       | jump to a file                          |
| `n` / `p` | next / previous comment                 |
| `⏎`       | comment on a line, or reply to a thread |
| `v`       | select a range of lines to comment on   |
| `J` / `K` | next / previous PR                      |

## Stacked PRs

When one PR's base is another PR's branch, they're shown together as a stack. Merging a PR in a stack merges everything below it too, and the button tells you how many.

Native GitHub stacks are merged with `gh stack merge`, so you'll need the [gh-stack](https://github.com/github/gh-stack) extension. Other chains are merged top-down into each parent's branch, and PRs above are re-pointed before any branch gets deleted.

After a squash merge, the PRs above still carry the old commits and need a restack (`gh stack sync` or `git rebase --onto`). prs won't do that for you since it means force-pushing someone else's branch.

## Settings

`~/.config/prs/config.json`:

```jsonc
{
  // "system", "midnight", "graphite", "nord", "tokyo" or "paper"
  "theme": "system",

  // "plain" if your font doesn't have Nerd Font icons
  "icons": "nerd",

  // what `e` runs. Available: {{repo}} {{owner}} {{name}} {{number}} {{headRef}}
  // {{baseRef}} {{author}} {{url}} {{repoPath}}
  "editorCommand": "code {{repoPath}}",

  // extra tabs, as GitHub searches
  "sections": [
    { "title": "Bugs", "filter": "is:open label:bug" },
    { "title": "Dependabot", "filter": "is:open author:app/dependabot" },
  ],

  // where your clones live, for `e` and `B`
  "repoPaths": {
    "me/dotfiles": "~/dotfiles",
    "my-org/*": "~/work/*",
    ":owner/:repo": "~/src/:owner/:repo",
  },
}
```

Without `editorCommand`, `e` uses `$VISUAL` or `$EDITOR`.

## Development

```sh
bun install
bun start owner/repo
bun test
bun run check         # lint and format
bun run build         # binary at dist/prs
```

`bun run release [patch|minor|major]` tags a new version. CI builds the binaries, publishes the GitHub release and updates the [Homebrew tap](https://github.com/nandatheguntupalli/homebrew-tap).
