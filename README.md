<div align="center">

# prs

**A keyboard-first terminal UI for reviewing and merging pull requests.** One key to merge, one key to undo.

[![CI](https://github.com/nandatheguntupalli/prs/actions/workflows/ci.yml/badge.svg)](https://github.com/nandatheguntupalli/prs/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/nandatheguntupalli/prs?color=2dd4bf)](https://github.com/nandatheguntupalli/prs/releases/latest) [![Homebrew](https://img.shields.io/badge/homebrew-nandatheguntupalli%2Ftap-2dd4bf?logo=homebrew&logoColor=white)](https://github.com/nandatheguntupalli/homebrew-tap) [![License: MIT](https://img.shields.io/badge/license-MIT-2dd4bf)](LICENSE) [![Built with Bun](https://img.shields.io/badge/built%20with-Bun-000?logo=bun)](https://bun.sh)

[Install](#install) · [Usage](#usage) · [Keys](#keys) · [Stacked PRs](#stacked-prs) · [Settings](#settings) · [Contributing](#contributing)

</div>

---

## Features

- **Merge in one keystroke.** `m` merges, and `z` undoes it for a few seconds after.
- **Review without leaving the terminal.** Read diffs with inline review comments, comment on lines or ranges, approve or request changes.
- **CI at a glance.** See every check, then drill into an Actions job's steps and logs, jumping between errors.
- **Stacked PRs.** Stacks are shown together and merged in one go, including GitHub's native stacks.
- **Your whole inbox.** One repo, or every PR you're involved in across GitHub, plus your own tabs from any GitHub search.
- **Fits your setup.** Themes that follow your terminal's light or dark mode, mouse support, and open-in-editor.

## Install

```sh
brew install nandatheguntupalli/tap/prs
```

Or grab a binary for macOS or Linux from the [latest release](https://github.com/nandatheguntupalli/prs/releases/latest).

prs signs in with your [`gh`](https://cli.github.com) login (`gh auth login`), or with `GITHUB_TOKEN` if it's set.

## Usage

```sh
prs                   # the repo you're in
prs owner/repo        # some other repo
prs --all             # your PRs across GitHub
prs --method squash   # merge (default), squash or rebase
prs --update merge    # how `u` updates a branch: rebase (default) or merge
prs --delay 2         # seconds before a merge or close goes through (default 4)
prs --dry-run         # try it out without changing anything on GitHub
```

Press `?` for every key, or `ctrl+p` for the command palette.

Inside a repo you get **All**, **Mine**, **Review requested**, **Merged** and **Closed** tabs. With `--all` you get **Mine**, **Review requested**, **Involved**, **Merged** and **Closed** across every repo.

Merges and closes wait a few seconds before they go through, so `z` can take them back. After that the PR stays in the list, marked **Merged** or **Closed**, until you refresh with `r`.

## Keys

<table>
<tr><th>Pull requests</th><th>Moving around</th><th>Diffs</th></tr>
<tr valign="top"><td>

| key |                  |
| --- | ---------------- |
| `m` | merge            |
| `x` | close / reopen   |
| `z` | undo             |
| `a` | approve          |
| `R` | review           |
| `u` | update branch    |
| `s` | toggle draft     |
| `L` | labels           |
| `c` | checks and logs  |
| `y` | copy             |
| `e` | open in editor   |
| `B` | check out branch |
| `o` | open in browser  |

</td><td>

| key               |                |
| ----------------- | -------------- |
| `j` `k`           | move           |
| `gg` `G`          | top, bottom    |
| `ctrl+d` `ctrl+u` | page           |
| `tab` `1`–`9`     | switch tabs    |
| `/`               | filter         |
| `⏎` `d`           | open diff      |
| `[` `]`           | details tabs   |
| `p`               | toggle details |
| `{` `}` `=`       | resize details |
| `t`               | theme          |
| `r`               | refresh        |

</td><td>

| key     |                     |
| ------- | ------------------- |
| `]` `[` | next / prev file    |
| `f`     | jump to file        |
| `n` `p` | next / prev comment |
| `⏎`     | comment or reply    |
| `v`     | select lines        |
| `J` `K` | next / prev PR      |

</td></tr>
</table>

## Stacked PRs

When one PR's base is another PR's branch, they're grouped as a stack. Merging a PR in a stack merges everything below it too, and the button tells you how many.

GitHub's native stacks are merged with `gh stack merge`, so you'll need the [gh-stack](https://github.com/github/gh-stack) extension. Other chains are merged top-down into each parent's branch, and PRs above are re-pointed before any branch is deleted.

> [!NOTE] After a squash merge, the PRs above still carry the old commits and need a restack (`gh stack sync` or `git rebase --onto`). prs won't do that for you, since it means force-pushing someone else's branch.

## Settings

Settings live in `~/.config/prs/config.json`:

```jsonc
{
  // "system", "midnight", "graphite", "nord", "tokyo" or "paper"
  "theme": "system",

  // "plain" if your font doesn't have Nerd Font icons
  "icons": "nerd",

  // what `e` runs. Available: {{repo}} {{owner}} {{name}} {{number}}
  // {{headRef}} {{baseRef}} {{author}} {{url}} {{repoPath}}
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

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get set up.

```sh
bun install
bun start owner/repo --dry-run
```

## License

[MIT](LICENSE) © Nanda Guntupalli
