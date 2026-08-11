---
name: analyzing-bundle-size
description: Measures the real size of app/dist/bundle.js by running the project's own `npm run build` and stat-ing the output, instead of estimating it. Use whenever asked how big the bundle is, whether a change affects bundle weight, or to compare before/after size for a new widget or dependency. Never answer a bundle-size question from a guess — run the script.
---

# Analyzing bundle size

## When to use this

- "How big is the bundle right now?", "what does `dist/bundle.js` weigh?"
- "Does adding this widget/dependency affect bundle size?" — measure before and
  after, report the delta.
- Reviewing a PR that adds code to `app/src/` and claiming a size impact.
- Any answer where a byte count would otherwise be estimated. A model cannot
  predict esbuild's minified output; the script can read it.

## Instructions

1. **Run the script — do not estimate.**

   ```bash
   node .agents/skills/analyzing-bundle-size/scripts/measure-bundle.mjs
   ```

   It runs `npm run build` in `app/` (esbuild → minified ESM `dist/bundle.js`),
   then reports the real byte count, the gzipped size, which widgets are in the
   bundle, and the average bytes per widget. Paths resolve relative to the
   script, so the working directory does not matter.

2. **Flags:**
   - `--json` — machine-readable report (use when feeding the number into
     further work; suppresses the build's own stdout).
   - `--compare <bytes>` — prints the delta and percentage against a previous
     measurement. This is how you report a change's impact.
   - `--skip-build` — stat the existing `app/dist/bundle.js` without rebuilding.
     Only use it when a build just ran; otherwise the number is stale.

3. **For a before/after comparison**, measure on the unchanged tree first, note
   the byte count, apply the change, then re-run with
   `--compare <the earlier number>`. Both runs must be full builds (no
   `--skip-build`), or the comparison is meaningless.

4. **Report the actual numbers** — bytes and gzipped bytes, plus the delta when
   comparing. Quote them as measured; don't round them into a vague claim.

5. **Interpret the number with the architecture in mind.** Every widget reaches
   the bundle through the side-effect imports in `app/src/widgets/index.ts`, so
   **nothing is tree-shaken** — bundle size grows with every registered widget,
   whether or not a consumer calls it. A widget that is *not* imported in that
   barrel adds zero bytes (and is also broken at runtime — see
   `architecture-deep-dive`). At this scale the absolute numbers are tiny
   (hundreds of bytes); report deltas honestly rather than dramatizing them.

6. **If the build fails**, say so and surface the error — `cd app && npm install`
   is the usual fix when dependencies are missing. Do not fall back to a
   guessed number.

## Scripts

- `scripts/measure-bundle.mjs` — runs `npm run build` in `app/`, stats
  `app/dist/bundle.js`, gzips it in memory for a transfer-size figure, and
  parses `app/src/widgets/index.ts` for the bundled widget list. Read-only
  apart from the build output that `npm run build` itself writes to
  `app/dist/`; no network calls, no deletions, nothing written outside `app/`.

## Verify

A run on the seeded repo (only the `badge` widget) looks like this:

```
app/dist/bundle.js  411 bytes (278 gzipped)
widgets bundled     1 [badge] — ~411 bytes each, registry core included
```

Confirm the report is real, not stale or invented:

```bash
cd app && npm run build && ls -l dist/bundle.js
# the npm script prints "dist/bundle.js — <N> bytes"; N must equal the
# byte count the skill reported, and ls must show the same size
```

`app/dist/` is gitignored, so a missing `dist/` on a fresh clone is expected —
the script rebuilds it. If a stated size does not match a fresh
`npm run build`, the number was guessed; re-run the script.
