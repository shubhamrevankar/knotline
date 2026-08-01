# Notification delivery operations

## Scope and current capability

Knotline projects authorization-aware notification intents to in-app items and deterministic delivery records for email, Slack, Teams, and signed webhooks. In-app delivery is locally functional. Email and collaboration channels remain `RECORDED` until `EXT-006`, `EXT-008`, and `EXT-012` have production evidence; operators must never label those channels `LIVE` from fixture evidence.

## Delivery lifecycle

1. A domain event creates one intent using a workspace-scoped deduplication key.
2. Recipient resolution rechecks membership, delegation, assignment, and resource authorization.
3. Workspace policy and user preference choose immediate, daily digest, weekly digest, or suppression. Mandatory security events and policy-bound critical escalations may bypass quiet hours, with an audit event.
4. Grouping collapses equivalent intents inside the configured window. Every external channel gets a stable idempotency key and destination hash; content remains behind an encrypted reference.
5. A delivery progresses through `queued`, `sending`, and a terminal or recoverable state. Provider ambiguity is `uncertain`, never success. Receipts are immutable.
6. Digest compilation and send both repeat authorization checks. A deep link also relies on current API authorization and presents an unavailable state after deletion or access loss.

## Failure classification and response

| Signal | Meaning | Operator response |
| --- | --- | --- |
| `failed` | Provider rejected a retriable attempt | Inspect normalized error kind; retry with bounded exponential backoff. |
| `uncertain` | Request may have reached the provider | Reconcile by provider receipt or idempotency key before retrying. |
| `suppressed` | Preference, authorization, invalid target, bounce, complaint, or rate policy stopped delivery | Inspect suppression reason; do not retry preference, complaint, or revoked-access outcomes. |
| `dead_lettered` | Retry budget exhausted | Quarantine, alert the workspace owner when safe, and redeliver only with a new audited operation. |
| circuit open | Consecutive provider failures crossed threshold | Hold that provider channel, preserve in-app delivery, and probe only after cooldown. |

## Security controls

- Email subjects reject CR/LF, HTML variables are escaped, and links must resolve to this deployment's `/app/` origin.
- Webhooks use versioned payloads, timestamped HMAC signatures, a five-minute replay window, rotation overlap, and receipt reconciliation.
- Slack and Teams interactive actions bind the signed provider actor to an eligible product identity, reject stale or duplicate operation IDs, and re-read approval/task state.
- Bounce and complaint callbacks suppress the exact destination. Logs contain destination hashes, identifiers, state, latency, and normalized reason codes—never message bodies, access tokens, or secrets.

## Health and alerting

Watch queue age, deliveries by channel/state, retries, uncertainty, suppressions by reason, bounce/complaint rates, circuit state, digest lateness, and notification counts per user/workspace. Page for a sustained queue-age breach, mandatory-security delivery failure, or authorization leak. Rate-limit storms per user and workspace without dropping the authoritative intent.

## Recovery drills

- Duplicate storm: replay the fixture event and confirm one intent/item plus bounded grouping.
- Provider outage: force five failures, confirm the circuit opens and in-app remains available, then verify cooldown recovery.
- Revoked access: revoke the recipient between intent, digest, send, and click; confirm no content renders at every boundary.
- Signing rotation: accept current and overlap key, reject expired key and replayed receipt.
- Restore: restore notification tables with the workspace database, reconcile queued/uncertain deliveries before workers resume, and never resend a terminal idempotency key.

## Privacy and retention

In-app items, digests, deliveries, and suppressions follow the data-store registry. Template versions and receipts are immutable governance evidence. Workspace deletion removes destinations and active schedules; identity deletion removes per-user preferences and notification items under the registered handlers.
