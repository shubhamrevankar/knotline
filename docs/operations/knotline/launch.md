# Release candidate, launch, and rollback

The pre-commit candidate manifest records proposed version, plan/index digest, artifact inputs, SBOM/provenance locations, migrations, configuration, evidence index, expected approvals, promotion phases, rollback target, and deliberately null commit/tag/deployment claims. A post-commit signed successor attestation is created outside the repository only after required approvals and deployment records exist.

Release authorization requires every milestone engineering state `COMMITTED`, every environment criterion at its exact terminal state, every selected external gate at its exact terminal state, and no open critical/high risk. A missing or stale row blocks GA. Scope amendments must explicitly remove an unavailable capability and update its public feature status; they cannot convert a fixture into `LIVE` evidence.

Controlled launch proceeds through staging, internal, design partners, limited beta, frozen release candidate, production canary, and GA. Each phase defines cohort, duration, observation metrics, feedback channel, entry/exit criteria, rollback trigger, and accountable decision owner. Production smoke uses synthetic tenants and performs no uncontrolled external effect.

Rollback restores the prior signed compatible artifact, preserves accepted operations and receipts, reconciles uncertain external effects, validates schema/static/service-worker compatibility, communicates status, and retains the incident/deployment record. If schema compatibility prevents rollback, stop promotion and execute the reviewed roll-forward repair.

This engineering candidate is not deployed or generally available. External owners must complete provider, legal, billing, accessibility, linguistic, device, security, operations, staging, performance, resilience, recovery, and production evidence before a signed GA decision.
