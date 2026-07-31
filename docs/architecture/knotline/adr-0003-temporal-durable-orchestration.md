# ADR-0003: Temporal for durable workflow orchestration

- Status: Accepted
- Date: 2026-07-31
- Owners: Runtime platform
- Milestone: M01
- External gate: EXT-003

## Context

Workflow runs include timers, human waits, retries, branches, cancellation, and
long-lived state. Process-local queues cannot recover these semantics reliably.
Retries also must not duplicate non-idempotent external effects or bypass
spend, capability, and kill-switch controls.

## Decision

Use Temporal for durable orchestration: workflows express deterministic
coordination; activities perform bounded I/O. Production uses a separately
approved Temporal Cloud namespace, while deterministic local development uses
Temporal's development service. Workflow history carries identifiers and
bounded metadata, not secrets or unbounded customer payloads.

External effects use stable operation identities, idempotency or authoritative
reconciliation, fencing, and explicit certainty states. A non-idempotent effect
with an uncertain result stops for reconciliation rather than being blindly
replayed. Active workflows use versioning-compatible worker changes.

## Alternatives considered

- Database polling plus cron is simple initially but transfers timer,
  cancellation, replay, and operator-repair correctness into application code.
- A message broker coordinates events but is not by itself a durable workflow
  state machine.
- A cloud-specific state-machine service reduces some operations work while
  increasing platform coupling and offering a less natural worker development
  model for this domain.

## Consequences

- Workflow code must be deterministic and replay-tested.
- Activities must be idempotent, reconcilable, or explicitly classify an
  uncertain external result.
- Namespace region, retention, recovery, credentials, SLO, and DPA evidence are
  external-gate requirements; code cannot claim them complete.
- PostgreSQL remains product-state authority and records durable start intents
  that can be reconciled during Temporal disruption.

## Revisit triggers

Revisit if external-gate review rejects the service, certified recovery cannot
meet product objectives, or production measurements show the orchestration
model cannot meet correctness, scale, or cost targets.
