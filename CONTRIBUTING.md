# Contributing

If you've found a bug or want to add something, go for it. Open an issue first for anything big so we can talk it through.

## Getting set up

You need [Bun](https://bun.sh) and the [GitHub CLI](https://cli.github.com). Log in with `gh auth login` if you haven't already.

```sh
git clone https://github.com/nandatheguntupalli/prs
cd prs
bun install
bun start owner/repo --dry-run
```

With `--dry-run`, nothing you do in the app touches GitHub, so you can point it at a real repo and press whatever you like.

## Before you open a PR

```sh
bun run check       # lint and format (bun run fix to fix)
bun run typecheck
bun test
```

CI runs the same checks on every PR.

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

This part is for maintainers. `bun run release [patch|minor|major]` bumps the version and pushes a tag. CI then builds the binaries, publishes the release and updates the formula in the [Homebrew tap](https://github.com/nandatheguntupalli/homebrew-tap).
