// Run by CI on a tag push. Builds each target, publishes the release, and updates ./tap.
import { $ } from "bun";

import { build } from "./build.ts";
import { formula, TARGETS } from "./formula.ts";
import type { Target } from "./formula.ts";

const tag = Bun.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag?.startsWith("v")) {
  throw new Error(`Expected a tag like v1.2.3, got ${tag}`);
}
const version = tag.slice(1);

const pkg = await Bun.file("package.json").json();
pkg.version = version;
await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

const release = async (target: Target) => {
  const dir = `build/${target}`;
  await build(`bun-${target}`, `${dir}/prs`);
  if (target.startsWith("darwin")) {
    await $`codesign --force --sign - ${dir}/prs`;
  }
  const tarball = `prs-${target}.tar.gz`;
  await $`tar -czf ${tarball} -C ${dir} prs`;
  const bytes = await Bun.file(tarball).bytes();
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
};

const hashes = await Promise.all(TARGETS.map(release));
const sha = Object.fromEntries(TARGETS.map((t, i) => [t, hashes[i]])) as Record<
  Target,
  string
>;

const host = `${process.platform}-${process.arch}` as Target;
if (TARGETS.includes(host)) {
  const out = await $`build/${host}/prs --version`.text();
  if (out.trim() !== version) {
    throw new Error(
      `Smoke test failed: binary reports ${out.trim()}, expected ${version}`
    );
  }
}

await Bun.write(
  "checksums.txt",
  TARGETS.map((t) => `${sha[t]}  prs-${t}.tar.gz\n`).join("")
);
const assets = [...TARGETS.map((t) => `prs-${t}.tar.gz`), "checksums.txt"];
await $`gh release create ${tag} ${assets} --generate-notes`;

await Bun.write("tap/Formula/prs.rb", formula(version, sha));
await $`git -C tap add Formula/prs.rb`;
const bot = [
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
];
await $`git -C tap ${bot} commit -m ${`prs ${tag}`}`;
await $`git -C tap push`;
console.log(`released ${tag}`);
