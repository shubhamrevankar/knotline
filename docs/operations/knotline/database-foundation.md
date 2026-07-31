# Knotline database foundation runbook

## Scope

This runbook owns PostgreSQL migrations, tenant transaction context, runtime
roles, data-store lifecycle registration, query telemetry, readiness, and the
emergency mutation-disable control introduced in M03.

## Role model

- `knotline_runtime` is the application role. It is never superuser and never
  has `BYPASSRLS`; every request sets transaction-local workspace, principal,
  request, and mutation-control settings.
- `knotline_reporting` is read-only and remains subject to RLS.
- `knotline_migration` owns controlled schema evolution and may bypass RLS only
  for migrations, never application traffic.
- `knotline_repair` is a separately assumed, RLS-constrained repair role.

Production application credentials must use the runtime role. Migration
credentials are supplied only to a separate migration job. The local stack may
bootstrap migrations before starting the API, using synthetic localhost-only
credentials.

## Expand and contract migration policy

1. Expand with nullable columns, new tables/indexes, or backward-compatible
   constraints. Keep table-lock time below two seconds and measure it against
   the realistic generator.
2. Deploy code that can read both shapes and writes the new shape.
3. Backfill in bounded, restartable batches with telemetry.
4. Validate constraints without holding a long exclusive lock.
5. Contract only after the old application version is absent and rollback no
   longer requires the old shape.

Every migration is immutable and checksum-verified. A mismatch or failed
migration makes readiness fail; each migration executes in one transaction.

## Emergency mutation disable

Set `KNOTLINE_MUTATIONS_DISABLED=true` and restart or roll the API. Each tenant
transaction propagates the control to PostgreSQL, where mutation triggers block
workflow writes. Liveness remains available; reads and diagnostics continue.
Record activation, reason, owner, and restoration evidence in the incident.

## Telemetry and alerts

Query observations contain only a normalized fingerprint, duration, row count,
and outcome. Never log parameters. Alert in staging at 80% pool saturation,
250 ms query p95, five connection errors in five minutes, or an outbox item older
than 120 seconds.

## Recovery and verification

Run `pnpm verify:migrations`, `pnpm test:rls`, and `pnpm test:db`. Confirm the
schema-only backup smoke can be restored to an empty PostgreSQL instance before
promotion. Validate both synthetic workspaces remain mutually invisible.
