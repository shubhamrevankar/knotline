# Infrastructure delivery and rollback

Infrastructure changes are planned from versioned Terraform with encrypted, versioned, locked remote state and audited OIDC roles. Development, staging, and production are isolated environments. No developer workstation applies these stacks, and no long-lived deploy key is accepted.

CI builds one immutable image digest, attaches SBOM and provenance, verifies its signature, and promotes that same digest. Staging and production use the same module digest and the M36-tested topology parameters. A material network, data, compute, queue, security, Temporal, or recovery change invalidates mapped security/resilience evidence.

Database delivery uses expand, mixed-version validation, bounded backfill, and contract only after compatibility is proven. A failed health gate chooses rollback only when the previous version remains schema compatible; otherwise it stops and uses reviewed roll-forward repair.

Progressive delivery moves through preview, staging, internal, canary, cohort, percentage, and GA. Every transition has an owner, observation window, entry/exit criteria, automated health gate, manual stop, feature/kill switch, and rollback target. Service-worker/static assets retain compatible versions across rollback.

Production apply, domain/email/provider configuration, Temporal production namespace, secret rotation, signed admission, canary rollback, drift repair, and fresh-account bootstrap remain production environment/external gates. Repository checks prove the contracts but never claim an apply occurred.
