# Governance operations

The governance subsystem is fail-closed and tenant scoped. Audit records are append-only for the runtime role and form a canonical SHA-256 chain using a workspace sequence, prior hash, event hash, actor, action, resource, result, reason, request identifier, and redacted metadata. Export verifiers must reject missing, reordered, altered, or cross-workspace records.

Retention policies are versioned per data class and bounded to supported durations. Preview destructive effects before activation. Active legal holds exclude matching records from purge but never grant product visibility. Releasing a hold is an explicit audited transition.

User and workspace exports and deletion requests are distinct durable jobs. A deletion job may report `queued`, `blocked_hold`, `running`, `attention`, or `complete`; only `complete` with a registry-wide proof is terminal. Operators resume failed steps idempotently and never rewrite immutable evidence. Restore procedures consult deletion proofs before exposing recovered data.

Support access requires a customer-created grant naming an operator reference, exact scope, read/write mode, reason, ticket, and expiry. Revoke immediately after the task or on suspicion. Shared/live operator sessions remain externally blocked until the isolated workforce plane is certified; local fixtures do not create a production access claim.

Data exports expire after 24 hours and contain a versioned manifest, checksums, classification notes, and omission reasons. Never include secrets, raw payment data, unrestricted prompts, or unrelated tenant content.
