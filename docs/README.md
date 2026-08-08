# Documentation

## Product demo

- [Complete local product demo](./demo/knotline/2026-08-02-complete-product-demo.md)

This directory is the canonical location for Markdown artifacts created for this
workspace.

## File-placement convention

- Keep the repository landing page at `/README.md`; place all other generated
  Markdown artifacts under `docs/`.
- Put each Markdown artifact in a task-appropriate subfolder under `docs/`.
- Prefer the structure `docs/<category>/<subject>/`.
- Use lowercase kebab-case for directory and file names.
- Prefix dated research reports with `YYYY-MM-DD-`.
- Keep this file as the index and convention reference for the documentation
  tree.

## Current structure

```text
docs/
├── README.md
├── demo/
│   └── knotline/
│       └── 2026-08-02-complete-product-demo.md
├── implementation/
│   └── knotline/
│       └── 2026-07-31-complete-end-to-end-implementation-plan.md
├── product/
│   └── knotline/
│       └── 2026-07-31-product-build-blueprint.md
├── research/
│   └── trace-so/
│       └── 2026-07-29-trace-so-technical-analysis.md
└── system-design/
    └── trace/
        └── 2026-07-29-trace-end-to-end-system-design.md
```

## Documents

- [Knotline complete end-to-end implementation plan](implementation/knotline/2026-07-31-complete-end-to-end-implementation-plan.md) —
  authoritative scope, architecture, milestones, test gates, commits, and GA
  acceptance
- [Knotline product build blueprint](product/knotline/2026-07-31-product-build-blueprint.md)
- [Knotline complete product demo](demo/knotline/2026-08-02-complete-product-demo.md)
- [Release-local production runtime](operations/knotline/release-local-runtime.md)
- [Trace.so technical analysis](research/trace-so/2026-07-29-trace-so-technical-analysis.md)
- [Trace end-to-end system design](system-design/trace/2026-07-29-trace-end-to-end-system-design.md)

## Contributor quick start

From the repository root, start the complete local dependency and application
stack with one command:

```sh
pnpm local:preview
```

Run the complete currently activated engineering gate with:

```sh
pnpm verify
```

Use `pnpm local:down` to stop the local stack. The verification gate includes
the plan-derived contract registries and evidence validation; regenerate an
intentionally changed plan contract with `pnpm contracts:generate` before
reviewing and committing its diff.
