# Production trigger and outbound-sync operations

## Scope and support state

Knotline supports versioned manual, API, signed-webhook, schedule, connector-event, record-change, email/message, calendar, file, and parent-workflow triggers. The local product proves deterministic schedules, event normalization, deduplication, fairness, test-mode isolation, durable receipts, and outbound reconciliation using sanitized fixtures. A provider-backed branch is not `LIVE` until its own applicable external gate (`EXT-007`, `EXT-008`, `EXT-009`, `EXT-010`, `EXT-011`, `EXT-012`, `EXT-013`, `EXT-014`, or `EXT-025`) is independently production-verified.

## Configure and release

1. Publish the workflow version before creating a trigger. Bind the exact workflow version, connection, schema version, environment, filter, mappings, deduplication strategy, concurrency, and rate limit.
2. For schedules, record the cron expression, IANA time zone, DST policy, missed-run policy, bounded catch-up behavior, jitter, exclusions, and optional start/end interval. Inspect the next-run preview across a nearby DST boundary.
3. Start in `test`. Capture only encrypted payload references and hashes; never retain or display secrets or raw customer payloads. Replay a fixture and verify its receipt, queue record, and run lineage.
4. Verify the connection remains active with sufficient scopes. Enabling a trigger does not bypass workflow, connection, broker, approval, or tenant policy.
5. Publish a new immutable trigger definition version for every change. Queued receipts remain bound to the version that accepted them.

## Inbound-event controls

- Verify signatures over raw bytes before parsing. Enforce current/rotating secret versions, timestamp skew, replay window, body-size limit, schema version, and source identity.
- Normalize provider events to the canonical envelope. Store a payload hash and encrypted reference, not body content. When the provider has no stable identifier, use the documented sequence/content-window policy and surface its collision risk.
- Check provider event ID, source sequence, reorder window, and source checkpoint before dispatch. One accepted logical event may create at most one logical run.
- Apply typed filters and mappings before queueing. Invalid schema or mapping enters a visible rejected receipt; filtered and duplicate counts remain observable.
- Enforce workspace fairness, per-trigger concurrency/rate limits, and bounded queues. Backpressure pauses the noisy trigger without blocking unrelated workflow triggers.

## Outbound writes and reconciliation

Every provider mutation flows through the governed tool broker and immutable external-operation journal. The operation records preview/diff, target identity and version, approval, idempotency key, request hash, compensation metadata, provider receipt, and reconciliation result. A timeout or ambiguous response becomes `UNCERTAIN`; do not retry blindly. Query provider state when possible, compare the intended postcondition, then mark reconciled or require an operator-confirmed repair. Target, schema, or permission changes invalidate the preview and approval.

## Diagnose and recover

Inspect trigger health: last received/started, filtered/duplicate/error counts, lag, backlog, next schedule, disabled reason, receipt state, queue attempt, run ID, and outbound receipt. Pause the trigger first when volume, signature failures, schema drift, or duplicates are unsafe. Preserve redacted receipt, definition-version, checkpoint, and provider-status evidence. Rotate webhook secrets with a bounded overlap, repair checkpoints only from confirmed provider truth, and resume after a test event passes. Disabling or revoking a connection stops new triggers and actions immediately.

## Privacy and telemetry

Log identifiers, versions, counts, hashes, state, latency, and normalized error classes only. Never log signing secrets, OAuth tokens, raw webhook bodies, email/message bodies, calendar details, files, mapped sensitive fields, or provider response bodies. Test captures expire under their configured retention and cannot target production.
