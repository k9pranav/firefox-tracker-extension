// build.mjs
import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

// Add entry points you want bundled
const entryPoints = {
  background: "backgroundScript.js",
  popup: "popup/check_stats.js",
  stats: "stats_page/stats_page.js",
};

const common = {
  entryPoints,
  outdir: "dist",
  bundle: true,
  platform: "browser",
  target: ["es2017"],

  // MV2 background scripts are classic scripts, not ESM.
  // IIFE is the safest output format.
  format: "iife",

  // Useful during dev
  sourcemap: true,

  // Name the globals created by IIFE wrappers
  // (esbuild will produce dist/background.js, dist/popup.js, etc.)
  entryNames: "[name]",

  // If any dependency tries to reference process/env,
  // you can uncomment the next line:
  // define: { "process.env.NODE_ENV": '"production"' },
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(common);
    await ctx.watch();
    console.log("esbuild: watching…");
  } else {
    await esbuild.build(common);
    console.log("esbuild: build complete");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
