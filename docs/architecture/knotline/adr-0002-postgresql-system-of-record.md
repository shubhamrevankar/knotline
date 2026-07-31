# ADR-0002: PostgreSQL as the transactional system of record

- Status: Accepted
- Date: 2026-07-31
- Owners: Data platform
- Milestone: M01

## Context

Workspace state, authorization, workflow definitions, ledgers, outbox intents,
and audit references need transactional consistency and strong tenant
isolation. The product also needs evolvable relational queries and a controlled
path to vector retrieval without making a cache authoritative.

## Decision

Use PostgreSQL as the transactional source of truth. Apply SQL migrations,
tenant-aware repositories, database constraints, and Row-Level Security to
tenant tables. Transactions persist state and outbox intent together; network
calls never occur inside a long transaction. Redis may accelerate cache,
presence, and approximate coordination, but safety-critical truth remains in
PostgreSQL, Temporal, or the designated global control store.

Use `pgvector` only for bounded retrieval indexes. Original content,
permissions, retention state, and deletion authority remain relational source
records.

## Alternatives considered

- A document store maps naturally to some workflow documents but complicates
  relational authorization, financial ledgers, and cross-resource invariants.
- Event sourcing for all product state provides history but adds projection and
  operational complexity before the domain requires it.
- Redis as primary state improves some latency paths but does not meet the
  durability and relational-integrity requirements.

## Consequences

- Schema changes follow expand, migrate, contract and have tested downgrade or
  forward-fix procedures.
- Every new data class needs retention/deletion registration and tenant
  isolation tests.
- High-volume append paths need partitioning and query-plan evidence before
  production promotion.
- Backups, point-in-time recovery, deletion propagation, and restore controls
  are part of the data contract rather than deployment afterthoughts.

## Revisit triggers

Revisit individual workloads when measured scale, isolation, or consistency
requirements cannot be met without distorting the PostgreSQL model. A workload
move does not change PostgreSQL's authority without a separate ADR.
