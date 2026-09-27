// Usage: bun scripts/build.ts [bun-target] [outfile]
import type { Build } from "bun";

export const build = async (
  target?: Build.CompileTarget,
  outfile = "dist/prs"
) => {
  // OpenTUI imports every platform's native package; stub all but the target's
  const platform = target
    ? target.replace(/^bun-/u, "")
    : `${process.platform}-${process.arch}`;

  const result = await Bun.build({
    compile: target ? { outfile, target } : { outfile },
    entrypoints: ["src/cli.tsx"],
    minify: true,
    plugins: [
      {
        name: "stub-unused",
        setup(builder) {
          builder.onResolve({ filter: /^react-devtools-core$/u }, (args) => ({
            namespace: "stub",
            path: args.path,
          }));
          builder.onResolve({ filter: /^@opentui\/core-[\w-]+$/u }, (args) =>
            args.path === `@opentui/core-${platform}`
              ? undefined
              : { namespace: "stub", path: args.path }
          );
          builder.onLoad({ filter: /.*/u, namespace: "stub" }, () => ({
            contents: "export default {}",
            loader: "js",
          }));
        },
      },
    ],
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
  console.log(`built ${outfile} (${target ?? "host"})`);
};

if (import.meta.main) {
  const [target, outfile] = Bun.argv.slice(2);
  await build(target as Build.CompileTarget | undefined, outfile);
}
