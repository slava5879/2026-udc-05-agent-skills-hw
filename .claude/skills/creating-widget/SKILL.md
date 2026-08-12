---
name: creating-widget
description: Add a new widget to the app/ widget-registry library — the project-specific golden path (pure factory in app/src/widgets/<name>/<name>.ts, self-registration via register(), colocated vitest test, import in app/src/widgets/index.ts). Use whenever someone asks to add, create, or scaffold a widget/component in this repo (e.g. "add an alert widget"), or to review whether an existing widget follows the pattern. Not for changes to app/src/core/registry.ts itself.
---

# Creating a widget

## When to use this

- "Add a `spinner` widget", "create an `alert` component", "scaffold a new widget".
- Porting an existing HTML snippet into this library as a widget.
- Reviewing/fixing a widget that does not follow the house pattern (missing
  `register()` call, test not colocated, not imported in `widgets/index.ts`).

Do **not** use this for changing the registry contract itself
(`register`/`create`/`listWidgets` in `app/src/core/registry.ts`) — that public
API is stable and out of scope for adding a widget.

## Instructions

A widget is a **pure function returning an HTML string** that self-registers
under a string name at module load. Adding one means touching exactly three
files. Use the seeded `app/src/widgets/badge/` as the reference implementation.

### 1. `app/src/widgets/<name>/<name>.ts`

`<name>` is kebab-case and is the registry key. The factory is
`create<PascalName>`.

```ts
import { register, type WidgetProps } from "../../core/registry.js";

export interface AlertProps extends WidgetProps {
  message: string;
  tone?: "info" | "warn" | "error";
}

export function createAlert(props: AlertProps): string {
  const tone = props.tone ?? "info";
  return `<div class="alert alert--${tone}">${props.message}</div>`;
}

register("alert", createAlert);
```

Rules that are specific to this project:

- **Relative imports carry a `.js` extension** (`../../core/registry.js`), even
  though the source is `.ts` — the package is `"type": "module"` and every
  existing import in `app/src/` is written that way. (`tsconfig.json` uses
  `moduleResolution: "Bundler"`, so an extensionless import would still
  typecheck — match the house style anyway.)
- **Named exports only** — no `export default`.
- **The props interface extends `WidgetProps`** (`Record<string, unknown>`) so
  the factory is assignable to `WidgetFactory<P>`, and optional props get their
  defaults via `??` inside the factory.
- **The factory stays pure**: no DOM access, no I/O, no module-level state. The
  single allowed side effect in the module is the one top-level `register(...)`
  call, placed after the factory declaration.
- **No `any`, no `@ts-ignore`** — TS strict.
- Do not add npm dependencies and do not introduce a UI framework; string
  templates only.

### 2. `app/src/widgets/<name>/<name>.test.ts` (colocated)

Test the **factory directly** — import the named export, not `create(...)` from
the registry. Cover the default-prop branch and at least one explicit-prop
branch, asserting the exact HTML string, mirroring `badge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAlert } from "./alert.js";

describe("createAlert", () => {
  it("defaults to the info tone", () => {
    expect(createAlert({ message: "Saved" })).toBe(
      '<div class="alert alert--info">Saved</div>',
    );
  });

  it("respects an explicit tone", () => {
    expect(createAlert({ message: "Boom", tone: "error" })).toBe(
      '<div class="alert alert--error">Boom</div>',
    );
  });
});
```

### 3. `app/src/widgets/index.ts`

Add the side-effect import so the `register()` call actually runs — a widget
that is not imported here is invisible to `create()` and absent from the bundle:

```ts
import "./alert/alert.js";
```

Keep the existing `export { listWidgets, create } from "../core/registry.js";`
line untouched. Nothing else needs editing — `app/src/index.ts` re-exports from
`widgets/index.ts`, so the new widget reaches the bundle automatically.

### Gotchas

- `register()` **throws** on a duplicate name (`Widget "x" is already
  registered`). Check `listWidgets()` / the existing folders first, and never
  call `register` twice for the same widget or import the module from two
  paths.
- The registry key (`"alert"`) must match the folder and file name; `create()`
  resolves purely by that string.
- No lint script exists in this project — do not invent `npm run lint`.

## Verify

```bash
cd app && npm test && npm run typecheck
```

Both must be green (`npm test` runs vitest, `npm run typecheck` runs
`tsc --noEmit` under `strict` + `noUncheckedIndexedAccess`). Then confirm the
pattern held:

```bash
grep -n "register(" app/src/widgets/<name>/<name>.ts   # exactly one top-level call
grep -n "<name>" app/src/widgets/index.ts              # the side-effect import is present
ls app/src/widgets/<name>/                             # exactly <name>.ts + <name>.test.ts
```

If the widget should be reachable by string ID, `create("<name>", { ... })`
returns its HTML and `listWidgets()` includes `"<name>"`.
