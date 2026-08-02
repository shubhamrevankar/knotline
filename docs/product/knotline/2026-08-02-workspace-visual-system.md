# Knotline workspace visual system

## Status

This is the canonical visual contract for authenticated Knotline workspace surfaces. New product pages must inherit the shared `WorkspaceShell` and its tokens. They must not introduce a page-specific shell, heading font, type scale, or competing color theme.

## Product character

Knotline should feel calm, trustworthy, precise, and operationally mature. The interface uses warm light surfaces, restrained green accents, generous whitespace, clear hierarchy, and moderate type weights. Dense operational information should remain readable without becoming visually aggressive.

## Canonical typography

- Interface and body text: Inter, with the shared system-sans fallback stack.
- Page titles: Georgia, with the shared serif fallback stack, weight 500.
- Operational identifiers and metric values: DM Mono, with the shared monospace fallback stack.
- Normal body copy: weight 400.
- Labels and navigation: weight 500 or 600.
- Emphasis: weight 600.
- Weight 700 is reserved for genuinely high-priority labels or actions.
- Do not use weight 750, 760, 800, or 900 in authenticated workspace content.
- Do not introduce another display font for an individual feature.

The source of truth is the `--product-font-*` and `--product-weight-*` token set on `.app-shell--activation` in `apps/web/src/styles.css`.

## Shared application chrome

All standard authenticated pages use `WorkspaceShell` for the sidebar, top bar, mobile navigation, active-route state, and persisted desktop collapse behavior. Workflow creation, onboarding, and the full-canvas workflow editor may omit standard chrome when focus or canvas space requires it, but their colors and typography still follow the same product tokens.

## Color and surface rules

- Workspace background: warm off-white.
- Primary cards and controls: white.
- Borders: low-contrast neutral green-gray.
- Primary accent: governed green.
- Dark surfaces are limited to code, immutable JSON, logs, and other content where a console treatment communicates meaning.
- Metrics, navigation, filters, task cards, status summaries, and ordinary content must never use a dark surface merely for decoration.

## Page hierarchy

Every standard workspace page should use the same hierarchy:

1. Optional mono section index or breadcrumb.
2. Serif page title using the shared display token.
3. Regular-weight explanatory sentence.
4. Primary page action aligned with the title region.
5. Metrics, filters, and content in light bordered surfaces.

## Implementation rule

Before adding feature-level CSS, use existing shared tokens and components. Feature CSS may control layout and state-specific meaning, but it must not redefine the product font family, base heading weight, application chrome, or default surface colors. Any intentional exception must be documented in this file and verified on desktop and mobile.
