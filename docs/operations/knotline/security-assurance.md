# Security and supply-chain assurance

Threat models cover tenant isolation, authentication and enterprise identity, workflow and agent authority, prompts and tools, files and retrieval, connectors and webhooks, billing, support/operator access, build/deploy, and recovery. Every threat records mitigations, tests, owner, residual risk, and a 90-day review cadence.

The CI assurance lane runs formatting, lint, type safety, unit/property/integration/browser/accessibility tests, RLS and migration checks, secret scanning, dependency and license policy, SBOM generation, reproducible-build comparison, API/event contract checks, evidence validation, and container policy. Critical/high scanner findings block the engineering gate unless a time-bounded, approved exception exists; launch separately requires closure of independent critical/high findings.

Release artifacts use a pinned lockfile, build-once digest, SBOM, provenance, signature, and admission-time digest verification. Long-lived developer deployment credentials are prohibited. Key, certificate, secret, provider, support, and emergency identities have explicit inventory, rotation, revoke, and access review.

Incident response covers credential compromise, cross-tenant exposure, malicious connector, model data incident, ransomware, insider/support misuse, and dependency compromise. Preserve evidence, contain with scoped kill switches, revoke compromised authority, communicate through named roles, and retain a post-incident review.

Independent penetration testing, launch access review, legal/privacy review, staffed tabletop, workforce hardware identity, and any formal certification remain blocked under their exact external/environment gates. The trust center must never imply those results before signed evidence exists.
