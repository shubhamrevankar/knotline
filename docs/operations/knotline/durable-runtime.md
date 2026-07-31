# Durable workflow runtime operations

## Authority and invariants

PostgreSQL is authoritative for run/task state, ordered events, external
operation certainty, admission reservations, and immutable ledger entries.
Temporal is authoritative for durable orchestration history and timers. Redis
is never used to relax a fence, budget, entitlement, or ownership decision.

Every run starts in one transaction that locks the active policy period,
reserves the declared worst-case integer quantity, writes the run and task
graph, appends sequence 1, and emits `run.start.requested` to the outbox. The
Temporal workflow ID is `knotline-run-<run UUID>` and is stable across retries.
Starting the same workflow ID twice is treated as successful reconciliation.

## Worker classes and versioning

- `knotline-system-v1`: trigger, condition, transform, delay, loop, and
  subworkflow coordination.
- Human, agent, and connector nodes carry distinct queue classes in PostgreSQL;
  their dedicated workers activate in M12–M14.
- Workflow code must remain deterministic. Network, time, randomness, and
  persistence happen only in activities.
- Deploy compatible workers before routing new starts. Retain the prior worker
  build until its open executions drain or pass deterministic replay tests.

## Failure semantics

All delivery is at least once. State commits require expected state, state
version, and fencing token. A stale worker cannot commit. An external operation
records send-started evidence before the call; an ambiguous response is
`uncertain` and cannot retry automatically. Operators reconcile provider
receipts before moving it to a terminal result.

Pause and resume are durable Temporal signals. Cancellation first enters
`cancelling`, lets activities observe cancellation, then becomes `cancelled`.
Process loss does not imply cancellation. Ordered `run_events` and external
attempt records are append-only.

## Admission and spend stop

Quantities are decimal strings over exact integer base units. The period row is
locked before comparing committed + reserved + requested against the hard
limit. The last available unit may be reserved; one unit more is denied.
Reservations have immutable reserve/increment/finalize/release entries and a
fencing token. Unknown usage remains held conservatively. `spend_stop` and the
workspace/global start switches fail closed.

## Reconciliation and repair

The start path normally starts Temporal and marks its outbox row published.
After a crash between those operations, run the repair command in dry-run mode:

```sh
pnpm exec tsx tooling/runtime/repair.ts --workspace <uuid> --principal <uuid>
```

Review the exact run IDs and Temporal workflow IDs. To idempotently start or
confirm those executions:

```sh
pnpm exec tsx tooling/runtime/repair.ts --workspace <uuid> --principal <uuid> --confirm
```

The command requires an explicitly scoped database URL and defaults to no
mutation. Never bulk-retry `uncertain` external operations. Stuck-run, expired
lease, missing-signal, outbox, and DLQ alerts require an incident record and
content-free evidence before repair.

## Kill switches and rollback

Disable the workspace/global start switch to stop new admission while leaving
existing histories inspectable. Roll back the API before workers when a release
fails. Keep compatible workers available, replay the failing history against
the candidate build, repair missing starts idempotently, and only then restore
admission. Do not delete Temporal histories, outbox rows, ledger entries, or
ordered run events.

## Verification

```sh
pnpm test:property
pnpm test:api
pnpm verify:migrations
pnpm test:integration
pnpm verify
```

Dashboards must expose start latency, running/paused/stuck counts, queue depth by
class/workspace, activity retries, outbox age, expired leases, DLQ count,
uncertain operations, admission denials, threshold crossings, and spend-stop
state without customer payloads.
