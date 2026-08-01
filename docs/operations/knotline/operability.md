# Operability, SLOs, and operator controls

Staging and production infrastructure is described by the same pinned Terraform modules. This repository does not apply infrastructure from a developer workstation. GitHub OIDC, protected environments, signed digest admission, remote encrypted state, reviewed plans, migration gates, canary health, and rollback are the only deployment path.

Critical journeys publish availability, latency, freshness, durability, queue-lag, cost, and correctness signals with bounded cardinality. Multi-window burn alerts name the user symptom, owner, deputy, runbook, dedupe key, and escalation. Logs carry environment, version, request, correlation, trace, and workspace hash and exclude secrets or customer content.

Kill switches exist for global, provider, workspace, workflow, agent, connector, tool, and trigger scope with declared `finish`, `cancel`, or `quarantine` in-flight behavior. Every exercise records disable, observed effect, safe re-enable, and reconciliation.

Repairs require preview, exact target, reason, idempotency, confirmation, and recent step-up by risk. Break glass requires an active ticket, two independent approvers, hardware-backed step-up within five minutes, exact scope, at most 30 minutes, visible banner, alert, immediate revoke, and independent review.

The workforce origin, directory, FIDO2 identities, staffed rotations, provider sandboxes, AWS staging account, and real alert routes remain external/environment gates. Fixtures prove contracts without creating a deployed or staffed claim.
