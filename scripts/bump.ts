// Usage: bun run release [patch|minor|major|x.y.z]. Pushing the tag starts the release workflow.
import { $ } from "bun";

const increment = Bun.argv[2] ?? "patch";
await $`bun pm version ${increment}`;
await $`git push --follow-tags`;
