---
name: architecture-deep-dive
description: Explains how the app/ widget-registry library is actually built — the registry contract in app/src/core/registry.ts, the widget module boundary, the import chain that makes create() work, and where a new feature belongs. Use when asked to explain the architecture, review a design decision, decide which layer/file a change goes in, or onboard onto this codebase. For the mechanical steps of adding one widget, use creating-widget instead.
---

# Architecture deep dive

## When to use this

- "Explain the architecture of this project", "how does this library work?"
- "Where should I put X?" — deciding which layer a new feature belongs to
  (registry core vs. a widget module vs. the barrel files).
- Reviewing a change that crosses module boundaries, or one that touches
  `app/src/core/registry.ts`.
- Judging whether a proposal (adding state, DOM access, a framework, a new
  dependency) fits this codebase's constraints.

Not this skill: the step-by-step recipe for scaffolding one widget — that's
`creating-widget`. Bundle-weight questions — that's `analyzing-bundle-size`.

## Instructions

1. **Read `references/architecture.md` first.** It carries the depth: the
   registry contract with real signatures, the four-layer module map, the
   runtime flow that makes `create("badge", …)` resolve, the design
   constraints and their rationale, and the known pitfalls. Do not answer
   architecture questions from generic knowledge of "plugin registries" — this
   library is 25 lines of core and its specifics matter.
2. **Verify against the code before asserting.** The reference cites exact
   files; open the cited file when a claim drives a decision. Source of record:
   `app/src/core/registry.ts`, `app/src/widgets/badge/`,
   `app/src/widgets/index.ts`, `app/src/index.ts`.
3. **Answer at the layer of the question.** "Where does this go?" → name the
   file and why that boundary owns it. "Why is it like this?" → give the
   constraint (purity, stable contract, framework-free) not just the shape.
4. **Respect the fixed points.** The public API `register` / `create` /
   `listWidgets` is a stable contract every widget depends on; the library is
   framework-free and dependency-light by design. If a request needs those to
   change, say so explicitly instead of quietly working around it.

## References

- `references/architecture.md` — the registry contract and its invariants,
  module boundaries and the dependency direction, the registration/lookup
  runtime flow, design constraints with rationale, extension points, and
  pitfalls. Open it for any non-trivial architecture or "where does this
  belong" question.

## Verify

An answer produced with this skill should be checkable against the code:

```bash
cd app && npm test && npm run typecheck
```

Sanity checks that a claim is grounded, not invented:

```bash
grep -n "export function" app/src/core/registry.ts   # the real public surface
grep -rn "register(" app/src/widgets/                # every registration site
cat app/src/widgets/index.ts                         # the side-effect import barrel
```

If an explanation names a function, file, or option that these do not show,
it is wrong — correct it against the code.
