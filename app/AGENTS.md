# AGENTS.md

## Stack

TypeScript 5, Node 22, Vitest, esbuild — plain library, no framework.

## Commands

- Install: `npm install`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Build (bundle): `npm run build` → `dist/bundle.js`
- Lint: not configured

## Architecture

A tiny widget registry (`src/core/registry.ts`): `register(name, factory)` /
`create(name, props)`. Each widget is a **pure function** returning an HTML
string, colocated under `src/widgets/<name>/` with its own `*.test.ts`, and
self-registers via a top-level `register(...)` call in its module. The bundle
entry point is `src/index.ts`.

## Conventions

- Named exports only (no default exports).
- No `any`, no `@ts-ignore`.
- One widget = one folder: `src/widgets/<name>/<name>.ts` + `<name>.test.ts`.
- Widget factories are pure — no DOM access, no side effects beyond
  `register()` at module load.

## Guardrails

- Do not add a UI framework (React/Vue/etc.) — this library stays framework-free.
- Do not add new npm dependencies without a documented reason.
- `src/core/registry.ts` is the shared contract every widget depends on —
  changes there affect all widgets; keep its public API (`register`, `create`,
  `listWidgets`) stable.

## Skills

Project skills live in `.agents/skills/<name>/SKILL.md` (repo root). Load one
when its trigger matches instead of re-deriving the pattern from scratch.

- **`creating-widget`** — the golden path for adding a widget: pure factory in
  `src/widgets/<name>/<name>.ts` + top-level `register()`, colocated
  `<name>.test.ts`, side-effect import in `src/widgets/index.ts`. Use it for any
  "add/create/scaffold a widget" request.
- **`architecture-deep-dive`** — explains the registry contract and module
  boundaries; depth lives in its `references/architecture.md`. Use it when
  asked how the project works or where a new feature belongs.
- **`analyzing-bundle-size`** — runs the real `npm run build` via
  `scripts/measure-bundle.mjs` and reports the actual `dist/bundle.js` size
  instead of guessing. Use it for bundle-weight questions or before/after
  size checks.
