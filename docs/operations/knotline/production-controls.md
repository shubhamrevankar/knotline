# Production-control contract

The `@knotline/operations` package is the minimum contract every service adopts
from its first feature. It contains no persistence or telemetry vendor adapter;
those implementations are supplied at service composition boundaries.

## Request and trace identity

- Accept `x-request-id` only when it matches the bounded request-ID grammar;
  otherwise generate a new `req_` identifier.
- Accept W3C version `00` `traceparent` values with non-zero trace and span IDs.
- Return the request ID to callers, attach request and trace IDs to structured
  logs, and propagate a newly generated span ID to downstream calls.
- Request, trace, span, user, workspace, workflow, run, and task IDs must never
  be metric labels.

## Structured logs

Create log records through `createLogRecord` and emit them through a
`StructuredLogSink`. Events use dot-separated lowercase names. The default
policy redacts credentials, cookies, tokens, request bodies, payloads, queries,
and content recursively. Services add domain-specific sensitive keys rather
than removing defaults. Customer content belongs in its governed data store,
not telemetry.

On suspected leakage, engage the relevant kill switch, restrict telemetry
access, preserve incident evidence under the security policy, rotate exposed
credentials, and follow the incident response process. Do not copy leaked
values into a ticket or chat.

## Metrics

Metric names use `knotline_` plus snake case. Counters end in `_total`; units
belong in names for gauges and histograms where applicable. Labels are bounded
dimensions such as method, templated route, result, provider, or status code.
The package rejects common identity and URL labels.

## Flags and kill switches

Every flag declares its kind, risk, owner, responder contact, runbook, default,
and safe value. External-write and expensive-work feature flags default and
fail closed. A kill switch's safe value is engaged (`true`). Callers use
`resolveControlFlag`; a configuration outage must pass
`configurationAvailable = false`.

During activation, record the flag cohort and observation window in promotion
evidence. During containment, engage the kill switch first, then reconcile
in-flight work according to the feature runbook. Removing a flag requires its
owner to remove all reads, overrides, dashboards, and documentation in the same
release.

## Usage and spend reservations

An implementation of `UsageSpendReservationPort` must atomically check limits
and reserve allowance before dispatch. Amounts are positive safe integers;
spend is represented in minor currency units. Idempotency keys make repeated
reserve, commit, and release requests stable. Fencing tokens prevent an expired
or superseded holder from committing. Control-store uncertainty denies risky
new work; it never silently creates unbounded allowance.

Long work renews a bounded lease. Completion commits actual use, while failure
or cancellation releases unused allowance. Implementations must reconcile
expired reservations and expose denial, expiry, renewal, and reconciliation
metrics.

## Retention and deletion registry

Every introduced persistent or derived data class registers exactly one
`DataClassRegistration` with retention, deletion SLA, legal-hold behavior,
owner, runbook, derived classes, delete handler, and verification handler.
Startup or CI calls `assertCoverage` against the service's data inventory.

Deletion orchestration checks legal hold before invoking a handler, records the
receipt, invokes verification, and remains incomplete until every registered
primary and derived class proves removal. Backups and external processors need
registered handlers or explicit governed lifecycle entries; restoring data
must reapply deletion tombstones before serving it.

## Capability labels

Product copy and documentation render only the label from validated
`CapabilityMetadata`: `LIVE`, `BETA`, `DEMO`, or `PLANNED`. `LIVE` requires
production evidence; `BETA` requires staging or production evidence; `PLANNED`
cannot carry verification evidence. Provider account, contract, certification,
and staffing evidence stays in external-gate records and is never invented by
code.
