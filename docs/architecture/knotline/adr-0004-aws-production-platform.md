# ADR-0004: AWS as the production infrastructure platform

- Status: Accepted
- Date: 2026-07-31
- Owners: Cloud platform
- Milestone: M01
- External gate: EXT-002

## Context

The production platform needs isolated accounts and environments, private data
services, managed encryption, auditable identity, reproducible delivery,
regional controls, backups, and a credible recovery path. The initial team
benefits from managed services while retaining portable application and data
contracts.

## Decision

Use AWS with Terraform-managed infrastructure. The intended production shape
uses separate accounts, VPC isolation, WAF at public boundaries, ECS/Fargate
for services, RDS PostgreSQL Multi-AZ, ElastiCache for non-authoritative Redis
workloads, S3 for object data, KMS for key control, and managed secret storage.

Workloads use short-lived roles and private network paths. Immutable artifact
digests move through development, staging, and production using validated
promotion manifests, smoke evidence, alarms, and rollback criteria. Region,
residency, backup, and disaster-recovery claims require environment evidence.

## Alternatives considered

- Kubernetes provides a broad scheduling ecosystem but adds control-plane and
  operational burden not justified by the initial service topology.
- Another major cloud could meet the functional needs but would fragment the
  selected account, identity, data, and delivery design.
- Self-managed databases and queues increase control while materially
  increasing reliability and security ownership.

## Consequences

- Terraform modules, account controls, cost limits, quota checks, and recovery
  tests are release artifacts.
- AWS-specific adapters remain behind package boundaries where practical;
  business contracts do not expose provider resource identifiers.
- Production readiness depends on approved accounts, support, quotas, regions,
  billing, and break-glass owners tracked by EXT-002.
- A committed design is not proof of a deployed or production-verified system.

## Revisit triggers

Revisit if residency or customer commitments require another platform, managed
service constraints violate recovery objectives, or measured cost and
operations data invalidate the decision.
