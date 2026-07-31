# Approvals and SLA operations

## Purpose

This runbook covers Knotline approval requests, immutable policy snapshots, business-calendar SLA timers, escalation intents, and the authorization consumption boundary. It is safe for local and future deployed environments; provider-specific notification delivery is deliberately deferred to the notification milestone.

## State model

An approval begins in `PENDING` and enters `IN_REVIEW` after a partial decision. A policy resolution produces `APPROVED_PENDING_EXECUTION`, `REJECTED`, `REVISION_REQUESTED`, or `CANCELLED`. An approved authorization is deliberately not an executed action: the downstream worker and requester race through one database compare-and-set to `CONSUMED` or `REVOKED`. Expiration may also win while the authorization is unconsumed. Terminal records and decisions are retained as governed evidence.

## Investigation

1. Locate the run and approval by workspace, run ID, and node key. Confirm the task fencing token and Temporal workflow ID.
2. Compare `packet_hash` with a fresh canonical hash of `packet`. A mismatch is a security incident; do not manually advance the request.
3. Inspect `policy_snapshot`, `approval_steps.resolution_evidence`, and immutable decisions. Never resolve against the current mutable group or policy definition.
4. Inspect `sla_timer_events` by due time and idempotency key. A scheduled past-due row indicates a worker/timer issue; a handled row with no corresponding event or notification intent indicates a reconciliation issue.
5. Inspect `approval_consumptions` before retrying an effect. Its operation ID is the exactly-once authorization receipt.

## Safe recovery

- Restarting the worker is safe: the durable workflow replays timers and activities, while decision, reminder, and consumption idempotency keys reject duplicates.
- A notification dispatcher may retry a pending intent; the workspace/deduplication key prevents duplicate intents.
- Never edit an approval packet, decision, policy snapshot, or consumption. Create a replacement workflow run or linked approval when the proposed action changes.
- If the requester must stop an approved action, use the revocation API. Do not update the state directly. A `409` means consumption or another terminal transition already won and the downstream operation must be investigated.
- If a timer is demonstrably lost, use the reconciliation command to signal the existing workflow. Do not create a second Temporal workflow ID.

## Alerts and service indicators

Alert on overdue scheduled timers, repeated activity failure, approval packet hash mismatch, a terminal approval with an active step, duplicate-operation constraint failure, or notification-intent backlog. Track request volume, time to decision, SLA breach rate, rejection/revision rate, and bottleneck policy/step. Do not publish opaque individual reviewer rankings.

## Verification

Run the approval property tests, PostgreSQL workflow suite, migration/RLS suite, browser approval journey, accessibility lane, and the full milestone gate. The PostgreSQL suite includes the concurrent revocation-versus-consumption race and must prove exactly one winner.
