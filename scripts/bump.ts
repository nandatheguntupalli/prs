// Bumps the version, tags it, and pushes the tag, which kicks off the release workflow
// Usage: bun run release [patch|minor|major|x.y.z]
import { $ } from "bun";

const increment = Bun.argv[2] ?? "patch";
await $`bun pm version ${increment}`;
await $`git push --follow-tags`;
