# Reference: widget-registry architecture (`app/`)

## Overview

`app/` is a framework-free TypeScript library built around one idea: a widget
is a **pure function that returns an HTML string**, and widgets are reachable by
a **string name** instead of by import. This file documents the contract that
makes that work, the module boundaries around it, and the constraints that keep
it small — the depth that would bloat `SKILL.md`. Every claim below is stated
against the current code; the cited files are the source of record.

## Deep dive

### The four layers

| Layer | File | Owns |
|---|---|---|
| Core contract | `app/src/core/registry.ts` | the name→factory map, `register` / `create` / `listWidgets` |
| Widget modules | `app/src/widgets/<name>/<name>.ts` | one widget: its props type, its pure factory, its own registration |
| Widget barrel | `app/src/widgets/index.ts` | side-effect imports of every widget + re-export of the lookup API |
| Package entry | `app/src/index.ts` | the public surface consumers/bundler see |

Dependency direction is strictly one-way: **widgets depend on core, core depends
on nothing.** `registry.ts` has zero imports and does not know a single widget
name. That is what makes a widget addable without editing core.

### The contract (`app/src/core/registry.ts`, 25 lines)

```ts
export type WidgetProps = Record<string, unknown>;
export type WidgetFactory<P extends WidgetProps = WidgetProps> = (props: P) => string;

export function register<P extends WidgetProps>(name: string, factory: WidgetFactory<P>): void
export function create(name: string, props: WidgetProps = {}): string
export function listWidgets(): string[]
```

State is a single module-level `const widgets = new Map<string, WidgetFactory>()`.
Behaviour that matters:

- **`register` is fail-fast on duplicates.** If the name is already in the map
  it throws `Widget "<name>" is already registered` — it never silently
  overwrites. There is no `unregister` and no way to reset the map, so
  registration is effectively append-only for the process lifetime.
- **`create` throws on an unknown name**, and the message enumerates what *is*
  registered: `Unknown widget "x". Registered: badge`. That listing is why a
  widget missing from the barrel produces a confusing-but-diagnosable error.
- **`create` defaults `props` to `{}`**, so a widget whose props are all
  optional can be created with `create("name")`.
- **The generic is erased at the boundary.** `register` accepts a
  `WidgetFactory<P>` and stores it as `WidgetFactory` via
  `factory as WidgetFactory`. Type safety on props therefore holds at the
  *widget's* call sites (`createBadge({ label })`), **not** through
  `create(name, props)` — `create` takes an untyped `WidgetProps` bag and
  returns `string`. Passing wrong props through `create` is a runtime concern,
  not a compile-time one. This is the deliberate trade for string-keyed lookup.

Because `WidgetProps` is `Record<string, unknown>`, a widget's props interface
must **extend `WidgetProps`** to satisfy the `P extends WidgetProps` bound: an
`interface` gets no implicit index signature, so it fails the constraint, `P`
falls back to its default `WidgetProps`, and `tsc` reports the mismatch at the
`register` call — verified:

```
error TS2345: Argument of type '(p: P) => string' is not assignable to
parameter of type 'WidgetFactory<WidgetProps>'.
  Property 'label' is missing in type 'WidgetProps' but required in type 'P'.
```

(A `type` alias does get an implicit index signature and would slip through —
the codebase still uses `interface … extends WidgetProps`, per `badge.ts`.)

### The registration flow — why the barrel import exists

Registration is a **module load-time side effect**: `register("badge", createBadge)`
is a top-level statement in `app/src/widgets/badge/badge.ts`. It runs only if
something imports that module. Nothing imports widget modules by name at
runtime, so `app/src/widgets/index.ts` does it explicitly:

```ts
import "./badge/badge.js";                                  // side-effect: runs register()
export { listWidgets, create } from "../core/registry.js";  // re-export the lookup API
```

Then `app/src/index.ts` re-exports `create` / `listWidgets` from that barrel.
The chain is what makes both halves work at once:

```
index.ts → widgets/index.ts ─┬─ import "./badge/badge.js" → register("badge", …) → Map
                             └─ re-export create/listWidgets ← core/registry.ts
```

Consequences worth knowing:

- A widget folder that exists but is **not** imported in `widgets/index.ts`
  compiles, typechecks, and passes its own colocated test (the test imports the
  factory directly), yet `create("<name>")` throws and `listWidgets()` omits it
  — and it is absent from the bundle entirely. This is the single most common
  failure mode.
- Import order in the barrel = registration order = `listWidgets()` order
  (`Map` preserves insertion order). Nothing depends on it today; don't make
  anything depend on it.
- The side-effect import is also the **dependency root for the bundle**:
  esbuild reaches a widget only through this file, so the barrel is what
  determines bundle contents (see `analyzing-bundle-size`).

### The widget module boundary (`app/src/widgets/badge/`)

The seeded `badge` is the canonical shape — a folder of exactly two files:

- `badge.ts` — `export interface BadgeProps extends WidgetProps`, the pure
  `export function createBadge(props: BadgeProps): string` returning a template
  string, then one top-level `register("badge", createBadge)`.
- `badge.test.ts` — colocated vitest, importing the **named factory export**
  (`import { createBadge } from "./badge.js"`) and asserting exact HTML for the
  default-prop branch and an explicit-prop branch.

Tests target the factory rather than `create()` precisely because the factory is
pure and has a typed signature; going through `create()` would test the registry
instead of the widget and lose prop types.

### Design constraints, and why

- **Purity of factories** (props in → HTML string out; no DOM, no I/O, no
  module state beyond `register`). Keeps widgets trivially testable without a
  DOM environment — vitest runs with no jsdom — and keeps output renderable
  server-side or client-side alike.
- **A stable core contract.** Every widget depends on `register`; changing the
  signature of `register` / `create` / `listWidgets` breaks all of them at once.
  `AGENTS.md` marks it protected for that reason. Additive change (a new
  exported helper) is the safe shape; signature change is not.
- **Framework-free, dependency-light.** Only devDependencies exist
  (`typescript`, `vitest`, `esbuild`); the shipped library has zero runtime
  deps. Adding React/Vue or a runtime dependency contradicts the premise and is
  called out as a guardrail in `app/AGENTS.md`.
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`), named exports
  only, no `any` / `@ts-ignore`.
- **`moduleResolution: "Bundler"`, `"type": "module"`.** Imports in `app/src/`
  are written with a `.js` extension by convention (`./badge/badge.js` resolving
  to `badge.ts`); extensionless would also resolve under this setting, but the
  codebase is uniform — match it.

### Build

`npm run build` → `app/scripts/build.mjs` → esbuild with
`entryPoints: ["src/index.ts"]`, `bundle: true`, `minify: true`,
`format: "esm"`, `platform: "neutral"` → `dist/bundle.js`, and it prints the
byte size via `statSync`. `dist/` is gitignored. Because every widget is pulled
in by the barrel's side-effect import, **no widget is tree-shakeable** from the
default entry point — every registered widget lands in the bundle whether or
not a consumer uses it. That is the price of string-keyed lookup and the reason
bundle size grows linearly with widget count.

### Where a change belongs

| Request | Goes in | Notes |
|---|---|---|
| New widget | new `src/widgets/<name>/` + barrel import | the `creating-widget` skill |
| Change a widget's markup/props | that widget's `<name>.ts` + its test | no core change needed |
| Shared helper for several widgets | new module under `src/core/` (or a shared util), imported by widgets | keep the dependency direction one-way |
| Lookup/lifecycle behaviour (e.g. "list by category") | `src/core/registry.ts`, **additively** | do not alter existing signatures |
| Anything needing the DOM | nowhere in this library | factories return strings; rendering is the consumer's job |

### Pitfalls

1. **Forgetting the barrel import** — widget is invisible at runtime and absent
   from the bundle, while all tests still pass. Check `app/src/widgets/index.ts`.
2. **Double registration** — importing a widget module from two paths, or
   calling `register` twice, throws at load time and takes the whole barrel
   down with it (so *every* widget becomes unreachable, not just the duplicate).
3. **Expecting type safety from `create()`** — it accepts any `WidgetProps`;
   only the direct factory call is typed.
4. **A props interface that doesn't extend `WidgetProps`** — fails the
   `P extends WidgetProps` constraint on `register`.
5. **Assuming a lint step** — none is configured (`npm test`,
   `npm run typecheck`, `npm run build` only). Don't invent `npm run lint`.
6. **Mutating the registry contract to solve a widget-level problem** — almost
   always the wrong layer; the map is intentionally dumb.

## Related

- `.agents/skills/creating-widget/SKILL.md` — the mechanical golden path for
  adding one widget.
- `.agents/skills/analyzing-bundle-size/SKILL.md` — measuring the bundle this
  architecture produces.
- `materials/architecture-brief.md` — the project's own intent statement.
- `app/AGENTS.md` — the enforced conventions and guardrails in short form.
