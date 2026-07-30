# Documentation

This directory is the canonical location for Markdown artifacts created for this
workspace.

## File-placement convention

- Do not place generated Markdown files at the workspace root.
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

- [Knotline product build blueprint](product/knotline/2026-07-31-product-build-blueprint.md)
- [Trace.so technical analysis](research/trace-so/2026-07-29-trace-so-technical-analysis.md)
- [Trace end-to-end system design](system-design/trace/2026-07-29-trace-end-to-end-system-design.md)
