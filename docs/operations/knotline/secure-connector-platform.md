# Secure connector platform operations

## Scope and invariants

This runbook covers the connector manifest registry, connection authorization, credential references, durable sync, webhook intake, reconciliation, health, and kill controls introduced in M22. Provider credentials and PKCE verifiers never enter browser-visible responses, application logs, events, or normalized object payloads. Runtime records contain only `credential://` references; resolution is reserved for the credential proxy.

Every request and durable record is workspace scoped. A provider installation identifier may never be reassigned across workspaces. Application-scoped webhooks are authenticated against the endpoint application/environment secret over the exact timestamp plus raw bytes before parsing or routing. Routing requires exactly one historical installation interval; missing provider-authenticated event time/order after detach or rebind is quarantined.

## Connection lifecycle

Allowed states are `draft`, `authorizing`, `active`, `degraded`, `reauthorization_required`, `disabled`, `revoked`, `deleting`, and `deleted`. An authorization transaction expires after ten minutes, binds the workspace, user, session, browser nonce, connection, manifest and version, provider, client application/config version, redirect URI, requested scopes, and clean `/app/` return target, and is consumed once. The callback reconciles actual granted scopes. Missing required scopes produces `reauthorization_required`; missing optional scopes remains active with reduced capability.

Disable stops new polling, webhook queueing, sync, and actions. Delete immediately clears the credential reference, moves to `deleting`, stops activity, attempts provider revocation when supported, and queues governed local deletion. `deleted` is terminal. Do not manually force an active state after auth or scope errors.

## Sync and reconciliation

Work is fairly scheduled per workspace and connection under the manifest concurrency and request budget. Prefer authenticated webhooks; otherwise poll with deterministic jitter and adapt the interval to observed change rate. Each object is idempotent on connection, object type, external ID, external version, and permission hash. Commit an ordered page receipt and object changes before advancing the checkpoint. On page retry, the unique provider page identity turns the page into a no-op. Cursor expiry schedules a bounded rescan rather than silently skipping history.

Reconciliation compares provider inventory and watermark with the external-object ledger, creates missing versions, applies permission-only changes, and tombstones locally live objects absent from an authoritative provider listing. It must not broaden ACLs when fidelity is incomplete. `ACL-REVOKE-1` certification must prove webhook, polling/backlog, serving-cache, retrieval, citation, graph, and agent-context invalidation or fail-closed behavior.

## Webhook response procedure

Return a fast `202` only after endpoint lookup, raw signature and timestamp verification, replay fingerprint reservation, trusted installation extraction, and unique historical binding resolution. Asynchronous processing performs payload parsing and domain writes. Reject stale, mutated, wrong-application, wrong-environment, duplicate-binding, disabled-at-event-time, and cross-workspace events before selecting a workspace queue. Identical event IDs on different installations are distinct; duplicates within one installation are suppressed.

Quarantine preserves hashes and authentication metadata, never raw unauthorized payloads. Inspect endpoint, application/environment, installation, authenticated sequence/time, historical intervals, and secret version. Do not replay until ambiguity has been removed and authorization remains current.

## Errors and remediation

- `auth`: disable activity and request reauthorization; serialize refresh with a lease.
- `scope`: show requested versus granted scopes and ask for consent only when required.
- `rate_limit`: honor `Retry-After`, reduce concurrency, and apply jittered exponential backoff.
- `quota`: pause the affected capability and surface provider quota guidance.
- `permission`: tombstone or reduce visibility immediately; never retain broader cached ACLs.
- `deleted_object`: create a provider tombstone and invalidate downstream representations.
- `unsupported_type`: count and expose the omission without retry storms.
- `outage`: open the circuit, preserve checkpoints, and retry fairly.
- `bug`: quarantine the record, retain sanitized diagnostics, and roll back the connector version.

## Kill, rollout, and recovery

Controls may target provider, connector version, connection, workspace, capability, and inbound/outbound direction. Start with the narrowest sufficient switch. A provider-wide inbound switch rejects or quarantines webhook work; outbound stops actions and refresh. Staged versions progress by deterministic workspace allocation. Roll back by setting the prior manifest active and the faulty version rollout to zero; existing durable checkpoints remain versioned and must pass the compatibility adapter before resume.

For an incident: stop the affected direction, capture sanitized receipt/checkpoint/error counts, verify no cross-tenant routing, rotate endpoint or client secrets through the credential proxy, reconcile scopes and provider inventory, run the fixture certification suite, then re-enable at a small staged percentage. Never paste credentials or provider payloads into tickets.

## Verification

Run `pnpm test:connectors`, `pnpm verify:migrations`, `pnpm test:api`, `pnpm exec playwright test tests/e2e/connections.spec.ts`, `pnpm verify:secrets`, and the universal gate. Local certification uses only the synthetic Fixture Cloud adapter and loopback URLs. Live provider certification remains explicitly gated to M23–M25.
