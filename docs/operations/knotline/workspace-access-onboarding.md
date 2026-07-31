# Workspace access and onboarding operations

## Scope

This runbook covers Knotline workspace lifecycle, membership, invitations, RBAC, groups, reporting relationships, onboarding progress, and removable sample data. All local verification uses disposable localhost-only PostgreSQL and captured local invitation delivery. Production email delivery remains unavailable until its external gate is satisfied.

## Security invariants

- Every tenant table has forced row-level security and every repository operation establishes the workspace, principal, and request context inside its transaction.
- A request may act only on its authenticated active workspace. Cross-workspace identifiers return a denial or not-found response without disclosing the resource.
- A workspace must retain one active owner. Ownership transfer is atomic; owner removal or suspension is rejected.
- Invitation tokens are random, stored only as hashes, single-use, expiring, revocable, and bound to the normalized invited email address. Browser fragments are removed from history before preview.
- Custom-role permissions must be known catalog permissions and cannot exceed the assigning principal's permission ceiling.
- Suspending or removing a member revokes that user's active workspace sessions.
- Reporting relationships reject self-links and cycles. Manual relationships record source, precedence, and effective time for future directory synchronization.
- Guest identities remain disabled. No UI or API path can activate them in M05.
- Sample data is visibly labeled, tracked in `sandbox_resources`, and removed by its exact sample identifier.

## Local verification

Run `pnpm test:workspace`. The suite creates a pinned disposable PostgreSQL container bound only to localhost, migrates from zero, uses a restricted runtime database role, and verifies workspace switching, RLS isolation, invitation replay/forwarding defenses, RBAC denial, role ceilings, groups, reporting cycles, last-owner enforcement, ownership transfer, resumable onboarding, revision conflicts, sample cleanup, audit records, and outbox records.

Run `pnpm exec playwright test tests/e2e/workspace-access.spec.ts` for responsive browser coverage. Run the cumulative `pnpm verify` gate before committing the milestone.

## Operational procedures

For an access incident, suspend the membership first; this revokes active workspace sessions. Preserve the related `audit_events` entries and request IDs. Restore only after the identity is verified and the reason is documented.

For an invitation incident, cancel the pending invitation. A resend rotates the secret; an old token must never become usable again. Do not copy invitation fragments into tickets or logs.

For ownership recovery, identify another active member, complete an authenticated ownership transfer, then reassign owned resources before removing the former owner. Never modify membership rows directly.

For onboarding conflicts, refetch `/v1/me/onboarding` and reapply the user's choice against the returned revision. Do not overwrite a newer revision.

For sample cleanup, call the exact sample-workspace deletion route and verify both the workflow and its active sandbox-resource marker are gone. Repeated deletion is safe and returns zero removed resources.

## Monitoring and audit

Alert on repeated invitation failures, ownership-transfer conflicts, cross-tenant authorization denials, and organization-cycle rejections. Audit events contain identifiers and state transitions only; tokens, authorization headers, cookies, user-entered content, and raw invitation URLs are forbidden.

The durable-store registry defines retention and deletion handlers. Workspace deletion is a requested state in M05; the later lifecycle milestone owns asynchronous erasure and legal-hold execution.

## Rollback

The database migration is forward-only. Disable the M05 routes and UI navigation if rollback is required; preserve tables and data. Restore service access only after the cumulative security, migration, contract, browser, and evidence gates pass again.
