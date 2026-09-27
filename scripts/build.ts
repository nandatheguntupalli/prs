// Compiles prs into a standalone binary: bun scripts/build.ts [bun-target] [outfile]
import type { Build } from "bun";

export async function build(target?: Build.CompileTarget, outfile = "dist/prs") {
  // OpenTUI statically imports a native lib package for every platform; keep only the one we're building for
  const platform = target ? target.replace(/^bun-/, "") : `${process.platform}-${process.arch}`;

  const result = await Bun.build({
    entrypoints: ["src/cli.tsx"],
    minify: true,
    compile: target ? { target, outfile } : { outfile },
    plugins: [
      {
        name: "stub-unused",
        setup(build) {
          build.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({ path: args.path, namespace: "stub" }));
          build.onResolve({ filter: /^@opentui\/core-[\w-]+$/ }, (args) =>
            args.path === `@opentui/core-${platform}` ? undefined : { path: args.path, namespace: "stub" },
          );
          build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}", loader: "js" }));
        },
      },
    ],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`built ${outfile} (${target ?? "host"})`);
}

if (import.meta.main) {
  const [target, outfile] = Bun.argv.slice(2);
  await build(target as Build.CompileTarget | undefined, outfile);
}
