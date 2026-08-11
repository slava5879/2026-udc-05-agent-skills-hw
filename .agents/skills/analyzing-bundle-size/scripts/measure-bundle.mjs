#!/usr/bin/env node
// Measures the REAL bundle size of app/dist/bundle.js by running the project's
// own `npm run build` (esbuild, minified) and stat-ing the output. No guessed
// numbers, no network, no writes outside app/ — it only wraps an existing npm
// script and reads the file that script produces.
//
// Usage (from anywhere; paths resolve relative to this file):
//   node .agents/skills/analyzing-bundle-size/scripts/measure-bundle.mjs
//   node .../measure-bundle.mjs --json           machine-readable output
//   node .../measure-bundle.mjs --compare 1234   diff against a previous byte count
//   node .../measure-bundle.mjs --skip-build     stat the existing dist/ only

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const skipBuild = args.includes("--skip-build");
const compareIdx = args.indexOf("--compare");
const compareTo = compareIdx === -1 ? null : Number(args[compareIdx + 1]);

if (compareIdx !== -1 && !Number.isFinite(compareTo)) {
  console.error("--compare needs a number of bytes, e.g. --compare 1234");
  process.exit(2);
}

// .agents/skills/analyzing-bundle-size/scripts/ -> repo root is 4 levels up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const appDir = join(repoRoot, "app");
const bundlePath = join(appDir, "dist", "bundle.js");

if (!skipBuild) {
  try {
    // Fixed command string (no interpolation) so the shell has nothing to
    // expand — and so npm.cmd resolves on Windows without execFile's DEP0190.
    execSync("npm run build", {
      cwd: appDir,
      stdio: asJson ? "pipe" : "inherit",
    });
  } catch (err) {
    console.error(`Build failed (npm run build in ${appDir}).`);
    console.error("Run `cd app && npm install` first if dependencies are missing.");
    if (asJson && err.stderr) console.error(String(err.stderr));
    process.exit(1);
  }
}

let bytes;
try {
  ({ size: bytes } = statSync(bundlePath));
} catch {
  console.error(`No bundle at ${bundlePath}. Run without --skip-build.`);
  process.exit(1);
}

const source = readFileSync(bundlePath);
const gzipBytes = gzipSync(source).length;

// Widgets reaching the bundle = the side-effect imports in the barrel. Nothing
// is tree-shaken away, so this is the real per-widget cost driver.
const barrel = readFileSync(join(appDir, "src", "widgets", "index.ts"), "utf8");
const widgets = [...barrel.matchAll(/^\s*import\s+"\.\/([^/"]+)\//gm)].map((m) => m[1]);

const report = {
  bundle: "app/dist/bundle.js",
  bytes,
  gzipBytes,
  widgetCount: widgets.length,
  widgets,
  bytesPerWidget: widgets.length ? Math.round(bytes / widgets.length) : null,
  ...(compareTo === null
    ? {}
    : { comparedToBytes: compareTo, deltaBytes: bytes - compareTo }),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\napp/dist/bundle.js  ${bytes} bytes (${gzipBytes} gzipped)`);
  console.log(
    `widgets bundled     ${widgets.length} [${widgets.join(", ")}] — ~${report.bytesPerWidget} bytes each, registry core included`,
  );
  if (compareTo !== null) {
    const delta = bytes - compareTo;
    const sign = delta > 0 ? "+" : "";
    const pct = compareTo ? ((delta / compareTo) * 100).toFixed(1) : "0.0";
    console.log(`vs ${compareTo} bytes    ${sign}${delta} bytes (${sign}${pct}%)`);
  }
  console.log("");
}
