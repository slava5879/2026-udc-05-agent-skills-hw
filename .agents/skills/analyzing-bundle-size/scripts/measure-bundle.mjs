#!/usr/bin/env node
// Measures the REAL bundle size of app/dist/bundle.js by running the project's
// own `npm run build` (esbuild, minified) and stat-ing the output. No guessed
// numbers, no network, no writes outside app/ — it only wraps an existing npm
// script and reads the file that script produces.
//
// Usage (the paths it reads and builds resolve relative to this file, so only
// the path you type to launch it depends on the shell's cwd — from the repo
// root that is):
//   node .agents/skills/analyzing-bundle-size/scripts/measure-bundle.mjs
//   node .../measure-bundle.mjs --json                machine-readable output
//   node .../measure-bundle.mjs --compare 1234        diff against a previous raw byte count
//   node .../measure-bundle.mjs --compare-gzip 890    diff against a previous gzipped byte count
//   node .../measure-bundle.mjs --skip-build          stat the existing dist/ only

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const skipBuild = args.includes("--skip-build");
// A baseline is a byte count: only non-negative integers make sense, or the
// delta and percentage that get derived from it are nonsense too.
function readBaseline(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const value = Number(args[idx + 1]);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${flag} needs a whole number of bytes, e.g. ${flag} 1234`);
    process.exit(2);
  }
  return value;
}

const compareTo = readBaseline("--compare");
const compareGzipTo = readBaseline("--compare-gzip");

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
  ...(compareGzipTo === null
    ? {}
    : {
        comparedToGzipBytes: compareGzipTo,
        deltaGzipBytes: gzipBytes - compareGzipTo,
      }),
};

function formatDelta(current, baseline) {
  const delta = current - baseline;
  const sign = delta > 0 ? "+" : "";
  const pct = baseline ? ((delta / baseline) * 100).toFixed(1) : "0.0";
  return `${sign}${delta} bytes (${sign}${pct}%)`;
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const perWidget =
    report.bytesPerWidget === null ? "n/a" : `~${report.bytesPerWidget} bytes each`;
  console.log(`\napp/dist/bundle.js  ${bytes} bytes (${gzipBytes} gzipped)`);
  console.log(
    `widgets bundled     ${widgets.length} [${widgets.join(", ")}] — ${perWidget}, registry core included`,
  );
  if (compareTo !== null) {
    console.log(`vs ${compareTo} bytes    ${formatDelta(bytes, compareTo)} raw`);
  }
  if (compareGzipTo !== null) {
    console.log(
      `vs ${compareGzipTo} gzipped ${formatDelta(gzipBytes, compareGzipTo)} gzipped`,
    );
  }
  console.log("");
}
