# Versioned workflow operations

## Scope

This runbook covers typed workflow definitions, optimistic draft editing, deterministic validation, immutable publication, version history, restore, canonical import/export, folders, tags, favorites, ownership, and workspace templates.

## Core invariants

- Workflow definitions use schema version 1 and only the declared node kinds: trigger, human, agent, approval, condition, delay, loop, subworkflow, transform, and integration action.
- The restricted expression language is parsed as data and is never evaluated as JavaScript. Dynamic import, evaluation, prototype access, statement delimiters, and function construction are forbidden.
- Draft updates require both the stored draft revision and an HTTP `If-Match` ETag. A stale writer receives a conflict and never overwrites a newer definition.
- A draft may contain validation errors while it is being edited. Publication is atomic and impossible while any error finding exists.
- Findings have stable codes and workflow/node/edge locations suitable for UI deep links.
- Published workflow versions and their node/edge children are immutable at the database layer. Their canonical SHA-256 content hash must remain stable forever.
- Publication creates a fresh editable draft after sealing the published version. Restore always creates another draft; it never mutates history.
- Canonical imports are schema-validated and size-limited by the API body limit. Exports include format version, workflow/version identity, definition, and content hash.
- Template variables are declared, required values are enforced, and substitution operates on data without executing code.
- Every new durable table uses forced row-level security. Cross-workspace identifiers disclose no workflow or template data.

## Verification

Run `pnpm test:workflows`. It starts a pinned PostgreSQL image bound only to localhost, migrates an empty database, then verifies import, canonical hashing, simultaneous-edit conflicts, validation findings, invalid-publication blocking, immutable published rows, history, semantic diff, restore, export/import round trip, folders, tags, template variables and instantiation, tenant isolation, audit records, and HTTP ETag behavior.

Run `pnpm exec playwright test tests/e2e/versioned-workflows.spec.ts` for the responsive create/validate/publish/history/diff/restore/template customer journey. Run `pnpm verify` before the milestone commit.

## Conflict recovery

On `WORKFLOW_EDIT_CONFLICT` or HTTP 412, fetch the latest draft and present the user with the server definition. Reapply intentional edits against its revision and ETag. Never retry a stale full-definition write automatically.

## Invalid publication

Return every stable finding and focus the first error location. Do not create an outbox publication event, change workflow state, or advance the version. Warnings alone may publish; error findings may not.

## Restore and rollback

To roll back workflow behavior, restore the known-good published version into a new draft, validate it, inspect its diff, and publish it as a new immutable version. Never update or delete the historical published row.

For a service rollback, disable the M06 routes and navigation while preserving the forward-only migration and all definitions. Re-enable only after migrations, RLS, immutable-row tests, API contracts, event compatibility, browser coverage, and the cumulative gate pass.

## Incident evidence

Preserve request ID, workflow ID, version, revision, finding codes, and content hash. Never record the full customer definition in operational logs. Audit and outbox payloads contain identifiers and hashes rather than user-entered workflow content.
