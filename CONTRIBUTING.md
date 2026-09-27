# Contributing

Thanks for taking a look! Bug reports, ideas and pull requests are all welcome.

## Getting set up

You'll need [Bun](https://bun.sh) and the [GitHub CLI](https://cli.github.com), logged in with `gh auth login`.

```sh
git clone https://github.com/nandatheguntupalli/prs
cd prs
bun install
bun start owner/repo --dry-run
```

`--dry-run` keeps anything from changing on GitHub, so it's the safe way to try things against a real repo.

## Before you open a PR

```sh
bun run check       # lint and format (bun run fix to fix)
bun run typecheck
bun test
```

CI runs the same three.

## Where things are

| path              |                                     |
| ----------------- | ----------------------------------- |
| `src/cli.tsx`     | entry point and flags               |
| `src/app.tsx`     | the app: state, actions and screens |
| `src/bindings.ts` | every command and its key           |
| `src/github/`     | talking to GitHub (Octokit)         |
| `src/hooks/`      | data loading and app state          |
| `src/ui/`         | components                          |
| `scripts/`        | build and release                   |

## Releasing

Maintainers only: `bun run release [patch|minor|major]` tags a version. CI builds the binaries, publishes the GitHub release and updates the [Homebrew tap](https://github.com/nandatheguntupalli/homebrew-tap).
