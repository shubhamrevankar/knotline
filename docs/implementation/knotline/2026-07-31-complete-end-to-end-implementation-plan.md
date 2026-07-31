# Knotline Complete End-to-End Implementation Plan

**Product:** Knotline\
**Tagline:** Operations, in motion\
**Document type:** Authoritative product, architecture, delivery, and acceptance specification\
**Version:** 1.0\
**Date:** 2026-07-31\
**Status:** Approved implementation source of truth\
**Baseline commit:** `c1a2f16` (`chore: establish Knotline product foundation`)\
**Plan adoption commit:** the commit named `docs: adopt complete Knotline implementation plan`; its SHA is recorded by the release evidence manifest rather than self-referenced here\
**Target:** Fully functional, fully featured, production-ready responsive SaaS and installable PWA

---

## 0. Document contract

This document is the single implementation source of truth for Knotline. It is
intentionally self-contained. During implementation, the team does not need to
consult the earlier Trace research or reverse-engineered system-design
documents to determine product scope, architecture, sequencing, acceptance
criteria, or release readiness.

This plan is not an estimate and is not time-boxed. Completeness and product
quality take priority over schedule and code brevity. A milestone may be split
into smaller commits only when necessary for safe review, but it may not be
declared engineering-`COMMITTED` until every `[ENG]` deliverable, test, and
acceptance criterion in that milestone passes. It is fully complete across all
dimensions only when its `[ENV]` and `[EXT]` criteria also pass; M38 requires
that full condition for every GA-scope milestone.

### 0.1 Meaning of “complete”

Knotline is complete only when:

1. every feature in the product inventory is implemented and usable;
2. all flows work with real persisted data rather than hard-coded demo state;
3. every screen is polished at supported desktop, tablet, and mobile widths;
4. all user-visible empty, loading, success, partial, offline, unauthorized,
   and failure states are intentional;
5. workflows execute durably across process restarts and provider failures;
6. humans, agents, connectors, schedules, approvals, and external side effects
   work together end to end;
7. tenant isolation, authorization, privacy, auditability, accessibility,
   observability, backup, and disaster recovery are demonstrated;
8. supported integrations pass both deterministic contract tests and real
   provider sandbox tests;
9. production infrastructure is reproducible from code;
10. launch, rollback, support, incident response, and data-recovery procedures
    have been exercised rather than merely documented.

### 0.2 Authority and change control

- This file owns the complete implementation scope.
- A material product or architecture change must update this file in the same
  milestone as the change.
- A new feature is incomplete unless it includes authorization, audit,
  analytics, accessibility, responsive behavior, error handling, tests, and
  operational ownership.
- “Temporary,” “mock,” “beta,” and “coming soon” behavior is prohibited in the
  final product unless explicitly marked as an intentional plan entitlement.
- Test skips, placeholder handlers, fake success states, and untracked manual
  setup are release blockers.
- External certifications, contracts, and credentials cannot be created by
  code. The implementation must produce the controls and evidence needed for
  them, and the production launch gate records the remaining owner-approved
  external evidence.

### 0.3 Milestone state vocabulary

Milestones use three independent state dimensions. This avoids incorrectly
equating committed code with a provider approval or production release.

| Dimension | Allowed state | Meaning |
|---|---|---|
| Engineering | `NOT_STARTED` | No implementation has been accepted |
| Engineering | `IN_PROGRESS` | Work exists, but the milestone gate has not passed |
| Engineering | `VERIFIED` | Applicable automated and manual gates pass |
| Engineering | `COMMITTED` | Verified work is committed using the required message |
| Environment | `NOT_DEPLOYED` | The committed capability has not reached a shared environment |
| Environment | `STAGING_VERIFIED` | It is deployed to staging and its declared smoke/evidence gate passes |
| Environment | `PRODUCTION_VERIFIED` | It is deployed to production, enabled for its approved cohort, and smoke-tested |
| External evidence | `NOT_APPLICABLE` | The milestone has no external evidence requirement for the stated capability/environment |
| External evidence | `BLOCKED_EXTERNAL` | A named credential, contract, tenant, approval, certification, or staffed process remains incomplete |
| External evidence | `SIMULATED` | Deterministic fixtures/emulators pass, but no real provider evidence exists |
| External evidence | `SANDBOX_VERIFIED` | The declared capability passes against a real non-production provider/tenant |
| External evidence | `PRODUCTION_VERIFIED` | Required production account, contract, process, and safe live evidence are approved |

Later engineering milestones may depend only on engineering state `COMMITTED`.
A provider-backed capability may be used for deterministic development when its
external gate is blocked, but it cannot be labelled `LIVE`, pass a production
acceptance criterion, or satisfy M38 until every GA-required gate reaches its
declared terminal evidence state, normally `PRODUCTION_VERIFIED`.
The `Status` line in each detailed milestone is the engineering state; the
environment and external-gate states are maintained in the ledger in Section
27.

### 0.4 Milestone criterion dimensions

Detailed milestone bullets are classified so engineering dependencies remain
deterministic before credentials or production infrastructure exist:

- an unprefixed bullet is `[ENG]`: source, schema, UI, automation, deterministic
  fixture/emulator tests, security controls, documentation, and reviewable
  evidence that must pass before engineering state becomes `COMMITTED`;
- `[ENV]` requires an actual named shared environment or deployment and advances
  `STAGING_VERIFIED` or `PRODUCTION_VERIFIED`; it is not a prerequisite for the
  engineering commit unless the bullet also carries `[ENG+ENV]`;
- `[EXT]` requires a third-party account, real provider tenant, legal/finance
  approval, independent assessment, or staffed human process and advances the
  referenced external gate;
- `[GA]` is a composite release criterion that requires its engineering,
  environment, and external inputs and is used only by M38.

Compound tags such as `[ENG+ENV]` or `[ENV+EXT]` require every named dimension
and are split into separate bullets whenever independent status is useful.
Every milestone must commit its runnable `[ENV]`/`[EXT]` test automation and
evidence schema as `[ENG]` work even when the real run is blocked. A downstream
engineering dependency requires only `COMMITTED`; a downstream environment,
external, or GA criterion explicitly requires the corresponding state. No
untagged statement about a real provider, independent approval, shared staging,
or production run may be interpreted as part of the engineering dependency.
Each `[ENV]` or compound criterion receives a stable
`Mxx.ENV.<kebab-slug>` ID in the milestone declaration, a digest of the exact
source bullet, and the Section 27.1 default `requiredTerminalState` unless the
criterion explicitly declares the terminal state appropriate to its named
environment. An explicit value is mandatory when one milestone mixes staging
and production criteria; it may not claim a stronger environment than the
evidence actually exercises. Each `[EXT]` or compound criterion lists exact
`EXT-*` IDs. The evidence manifest records each tagged criterion
independently; changing its bullet changes the digest and invalidates stale
evidence.

---

## 1. Immutable product and technology decisions

These decisions remain in force unless this document is explicitly amended.

### 1.1 Product decisions

- The product name is **Knotline**.
- Knotline is an operations platform for business processes shared by people,
  AI agents, and external systems.
- The primary product abstraction is a versioned directed workflow graph.
- A workflow definition is separate from a workflow run.
- Human judgment is a first-class durable state, not an ephemeral dialog.
- Every important result exposes provenance, cost, decisions, attempts, and
  source context.
- Product usefulness and clarity take priority over architectural novelty.
- The UI is original and does not copy Trace’s appearance or implementation.
- Trace research may remain under `docs/` as historical design input, but no
  authored artifact outside `docs/` may retain Trace.so branding, domains,
  logos, copied assets or copy, product identifiers, UI labels, seed data,
  package/module names, comments, fixtures, snapshots, or implementation
  provenance. Knotline code and runtime artifacts must be independently
  authored and Knotline-branded.
- Standard non-brand technical usage such as distributed trace/span IDs,
  OpenTelemetry, Playwright trace output, and immutable third-party package
  names is permitted. This narrow exception cannot contain or conceal a
  Trace.so product reference.

### 1.2 Experience decisions

- The visual system uses deep graphite surfaces, mineral blue structure,
  acid-lime live signals, and coral risk states.
- The application is information-dense, calm, and editorial.
- Canvas views always have an accessible list/table alternative.
- Desktop, tablet, and mobile are supported in every milestone.
- The web application becomes an installable PWA; native iOS and Android apps
  are not required.
- Core task and approval flows remain useful on narrow mobile screens.
- Destructive, billable, external-write, and high-risk agent actions always
  communicate consequence before execution.

### 1.3 Application decisions

- Language: TypeScript in a pnpm monorepo.
- Web: React 19, Vite, React Router, TanStack Query, Zod, XYFlow, and a
  repository-owned component/token system.
- Forms: React Hook Form with Zod-derived validation.
- API: Fastify modular monolith with explicit module boundaries and `/v1`
  resource APIs.
- Persistence: PostgreSQL with Drizzle ORM and SQL migrations.
- Vector search: `pgvector` initially.
- Cache and ephemeral coordination: Redis.
- Object storage: S3 in production and MinIO locally.
- Durable orchestration: Temporal Cloud in production and Temporal’s local
  development server for local and CI tests.
- Asynchronous integration: transactional outbox plus EventBridge/SNS/SQS and
  dead-letter queues in production; deterministic local adapters in tests.
- Infrastructure: AWS, Terraform, ECS/Fargate, RDS PostgreSQL Multi-AZ,
  ElastiCache, S3, CloudFront, WAF, ALB, SQS, EventBridge, SES, Secrets Manager,
  and KMS.
- CI/CD: GitHub Actions with protected environments, signed artifacts, staged
  database migrations, progressive delivery, and rollback.

### 1.4 AI decisions

- OpenAI is the primary model and embedding provider.
- Model access is only through Knotline’s provider-neutral model gateway.
- New model work uses the OpenAI Responses API rather than binding domain logic
  to a legacy endpoint.
- Exact model IDs are deployment configuration, not domain constants.
- Product policies refer to model roles such as `quality`, `balanced`, `fast`,
  `embedding`, `moderation`, and `judge`; the versioned model registry resolves
  them.
- Model-generated machine-consumed output uses strict JSON Schema structured
  output and is still validated at the Knotline boundary.
- Custom tools use strict schemas, bounded calls, explicit capability grants,
  and Knotline-controlled execution.
- OpenAI requests default to `store: false`; hashed non-PII safety identifiers
  are used where supported.
- Provider retention, residency, and processing behavior is recorded in the
  tenant’s model policy and data-processing inventory.
- Agent and prompt evaluation is owned by Knotline’s internal versioned eval
  runner. It does not depend on the OpenAI Evals platform because that platform
  is scheduled for retirement in 2026.
- No prompt, model, agent, retrieval, or tool-policy version reaches production
  without task-specific regression evaluation.

### 1.5 External service decisions

- Stripe is the authoritative billing provider.
- Authentication supports email magic link, Google OIDC, and later enterprise
  SAML/OIDC SSO.
- Email delivery uses Amazon SES in production and a local capture server in
  development.
- Supported connector families are listed in Section 15 and are part of the
  final product.
- Real credentials will be supplied when a milestone reaches provider sandbox
  acceptance. Until then, implementation uses recorded provider contracts and
  deterministic emulators without pretending that provider acceptance passed.

---

## 2. Product definition

Knotline converts a business process into a visible, versioned operating graph,
routes each dependency-ready step to a person, AI agent, or integration,
retrieves only authorized organizational context, pauses at explicit judgment
gates, performs approved external actions idempotently, and preserves a complete
audit and provenance trail.

### 2.1 Primary actors

| Actor | Product responsibility |
|---|---|
| Visitor | Understands the product, security posture, pricing, and use cases |
| New user | Authenticates, creates or joins a workspace, and completes onboarding |
| Member | Views authorized work, completes tasks, comments, and follows runs |
| Workflow builder | Creates, tests, publishes, and maintains workflows |
| Workflow owner | Starts, pauses, resumes, cancels, retries, and archives runs |
| Approver | Approves, rejects, requests revision, or delegates an exact payload |
| Agent builder | Defines agents, prompts, models, retrieval, tools, budgets, and evals |
| Integration admin | Connects systems, controls scopes, monitors sync, and resolves failures |
| Workspace admin | Manages members, roles, security, data policy, billing, and audit |
| Billing admin | Manages plan, payment method, invoices, credits, and spend controls |
| Developer | Uses service principals, API credentials, webhooks, and API documentation |
| Auditor | Reviews immutable security, workflow, agent, connector, and billing evidence |
| Support operator | Diagnoses tenant issues using safe impersonation and audited controls |
| Platform operator | Deploys, observes, limits, restores, and responds to incidents |
| AI agent | Executes one bounded task with an immutable configuration and capability set |
| Connector | Imports, exports, or synchronizes data with an external system |
| Webhook sender | Triggers or updates Knotline using a signed external event |

### 2.2 Core user outcomes

1. A new team reaches a successful first run without external assistance.
2. A builder turns a plain-language process into an editable validated graph.
3. A run continues correctly through restarts, retries, human waits, and
   provider failures.
4. A person sees one prioritized inbox for tasks, approvals, mentions, and
   failures.
5. An agent produces schema-valid, cited, reviewable work within authority and
   budget.
6. An administrator connects organizational systems without exposing secrets
   or crossing source permissions.
7. An owner can explain exactly what happened, why, by whom, using what context,
   at what cost, and with which external effects.
8. An enterprise can control identity, access, residency, retention, export,
   deletion, and operational risk.

---

## 3. Complete product requirements

All requirements below are mandatory. Their IDs are used by milestone tests and
the final traceability matrix.

### 3.1 Identity, workspace, and access

| ID | Requirement |
|---|---|
| ID-001 | Users can request and exchange a single-use email magic link |
| ID-002 | Users can sign in with Google OIDC |
| ID-003 | Enterprise users can sign in through configured SAML or OIDC SSO |
| ID-004 | Sessions use rotating HttpOnly Secure SameSite cookies and can be individually revoked |
| ID-005 | A user can view and revoke active sessions |
| ID-006 | A user can belong to multiple workspaces and switch active workspace |
| ID-007 | A new user can create a workspace or accept an invitation |
| ID-008 | Administrators can invite, resend, cancel, suspend, restore, and remove members |
| ID-009 | Roles include owner, admin, builder, member, approver, billing, auditor, and custom roles |
| ID-010 | Fine-grained permissions apply to resources and actions, not only pages |
| ID-011 | Service principals and scoped API credentials support rotation, expiry, and revocation |
| ID-012 | SCIM provisions, updates, suspends, and deprovisions enterprise users and groups |
| ID-013 | Domain capture and enforced SSO can be configured safely |
| ID-014 | Every tenant-owned resource has one immutable workspace owner |
| ID-015 | The server derives and verifies tenant membership on every protected operation |

### 3.2 Onboarding and activation

| ID | Requirement |
|---|---|
| ON-001 | Onboarding adapts to role, use case, team size, and connected systems |
| ON-002 | Users can start from a pattern, natural-language prompt, or blank workflow |
| ON-003 | The product includes a guided but real first-run experience |
| ON-004 | Sample data is isolated, labeled, removable, and never confused with production data |
| ON-005 | Setup progress survives logout and device changes |
| ON-006 | Every onboarding step can be skipped and resumed |
| ON-007 | Empty states teach the next useful action without blocking expert users |

### 3.3 Workflow definitions and studio

| ID | Requirement |
|---|---|
| WF-001 | Workflows have metadata, owner, tags, status, draft, and published-version pointers |
| WF-002 | Builders can create, duplicate, import, export, archive, restore, and delete workflows |
| WF-003 | Builders can generate a workflow from natural language using schema-valid model output |
| WF-004 | Builders can create workflows from first-party or workspace templates |
| WF-005 | Node types include trigger, human, agent, approval, condition, delay, loop, subworkflow, transform, and integration action |
| WF-006 | Builders can add, move, connect, duplicate, group, split, disable, and remove nodes |
| WF-007 | Edges support conditions, mappings, labels, success paths, failure paths, and default paths |
| WF-008 | Node inputs and outputs use versioned JSON Schemas |
| WF-009 | The studio supports zoom, pan, minimap, fit, auto-layout, alignment, multiselect, undo, redo, and keyboard shortcuts |
| WF-010 | The studio provides a synchronized accessible outline/table view |
| WF-011 | Edits use optimistic concurrency and display resolvable conflicts |
| WF-012 | Drafts autosave and visibly indicate saved, saving, offline, or conflict state |
| WF-013 | Validation detects cycles where forbidden, unreachable nodes, invalid mappings, missing assignments, unavailable agents/tools, policy violations, and absent terminal paths |
| WF-014 | Builders can dry-run a draft using fixtures without external side effects |
| WF-015 | Publishing creates an immutable version with content hash and release note |
| WF-016 | Version history provides visual and semantic diff |
| WF-017 | Rollback creates a new draft from a previous immutable version |
| WF-018 | Reusable subworkflows have typed contracts and pinned or compatible version policies |
| WF-019 | Templates include variables, setup instructions, preview, category, author, and version |
| WF-020 | Workflows support folders, tags, favorites, saved filters, ownership transfer, and bulk actions |

### 3.4 Triggers, runs, and orchestration

| ID | Requirement |
|---|---|
| RN-001 | Runs can start manually, by schedule, webhook, connector event, API, or parent workflow |
| RN-002 | A run pins one immutable workflow version, policy snapshot, and input set |
| RN-003 | Dependency-ready tasks dispatch durably and idempotently |
| RN-004 | Run states include queued, running, waiting, paused, cancelling, cancelled, succeeded, failed, and timed out |
| RN-005 | Task states include pending, ready, running, waiting, retry-wait, succeeded, failed, skipped, cancelled, and timed out |
| RN-006 | Attempts preserve worker, timing, input/output references, usage, trace, and error classification |
| RN-007 | Retries use explicit per-node policies with jitter, limits, and retryable error classes |
| RN-008 | A failed run can retry from failure or fork while reusing only validated safe outputs |
| RN-009 | Pause stops new dispatch while preserving in-flight result reconciliation |
| RN-010 | Cancellation propagates without silently repeating or losing uncertain external effects |
| RN-011 | Delays, deadlines, recurring schedules, and human waits survive restarts and deployments |
| RN-012 | Conditions and mappings evaluate deterministically in a restricted expression engine |
| RN-013 | Loops have explicit maximum iterations and spend/time budgets |
| RN-014 | Subworkflows preserve correlation, cancellation, usage, and lineage |
| RN-015 | Every run exposes a monotonically sequenced append-only event timeline |
| RN-016 | Live state uses SSE with resume and bounded polling fallback |
| RN-017 | Operators can reconcile stuck work, uncertain operations, and dead-letter items |
| RN-018 | Per-tenant fairness and concurrency limits prevent noisy-neighbor starvation |

### 3.5 Human work and approvals

| ID | Requirement |
|---|---|
| HU-001 | Users have a unified inbox for tasks, approvals, mentions, and exceptions |
| HU-002 | Human tasks support assignee, watchers, due date, priority, SLA, form schema, rich instructions, comments, and attachments |
| HU-003 | Users can claim, reassign, delegate, complete, reopen, or request clarification |
| HU-004 | Task forms validate typed data and preserve drafts |
| HU-005 | Bulk task actions are permission checked and audited |
| HU-006 | Approvals bind to an exact payload hash and policy version |
| HU-007 | Approvers can approve, reject, request revision, delegate, or abstain |
| HU-008 | Approval policies support any-one, all, quorum, ordered, role, group, and separation-of-duties rules |
| HU-009 | Expiry, reminders, quiet hours, escalations, and fallback approvers are durable |
| HU-010 | High-risk or irreversible tool actions require explicit approval unless policy forbids them entirely |
| HU-011 | Mobile task and approval flows require no canvas interaction |

### 3.6 Agents, models, tools, and evaluation

| ID | Requirement |
|---|---|
| AG-001 | Agents have stable definitions and immutable versions |
| AG-002 | Agent versions include instructions, input/output schemas, model policy, retrieval policy, tools, budgets, and guardrails |
| AG-003 | Model policies map roles to provider/model versions, fallback, residency, latency, and cost limits |
| AG-004 | Prompt and model changes are independently versioned and attributable |
| AG-005 | The model gateway normalizes requests, streaming, usage, errors, refusal, timeout, and retry behavior |
| AG-006 | Model output consumed by code must pass strict schema validation |
| AG-007 | Agent context is assembled from authorized inputs and a recorded retrieval manifest |
| AG-008 | Agent authority is a short-lived per-task capability set narrower than the initiating user |
| AG-009 | Tools have immutable versions, strict schemas, risk level, scopes, timeout, network policy, and idempotency behavior |
| AG-010 | Secrets are injected by a credential proxy and never enter prompts or model-visible arguments |
| AG-011 | Agent loops have maximum model calls, tool calls, tokens, time, cost, and handoffs |
| AG-012 | Tool calls are validated, authorized, approved when needed, executed, and output-scanned |
| AG-013 | Runtime code execution is isolated by CPU, memory, filesystem, network, and duration |
| AG-014 | Every output records model, prompt, agent, tool, context, citation, usage, cost, and reviewer lineage |
| AG-015 | Evals cover instruction following, schema validity, correctness, retrieval, tool selection, arguments, safety, handoff, latency, and cost |
| AG-016 | Agent releases require held-out deterministic, adversarial, and human-calibrated eval gates |
| AG-017 | Production feedback can be curated into versioned eval cases without leaking tenant data |
| AG-018 | Administrators can disable one agent, tool, model, tenant, or global execution class within 60 seconds |
| AG-019 | Agent memory scopes are none, execution, user-private, or workspace-shared with explicit ACL, retention, and purpose |
| AG-020 | Durable memory writes are explicit, typed, versioned, provenance-backed operations and never an implicit side effect of model text |
| AG-021 | Authorized users can inspect, correct, export, and delete durable memory without rewriting historical run evidence |
| AG-022 | User, source, permission, retention, and workspace deletion propagates to memory and all memory-derived context |

### 3.7 Files, knowledge, and retrieval

| ID | Requirement |
|---|---|
| KN-001 | Users can upload supported files with progress, cancellation, size/type validation, and malware scanning |
| KN-002 | Raw source, normalized content, versions, and parsed artifacts are preserved according to policy |
| KN-003 | Parsers support PDF, DOCX, PPTX, XLSX, CSV, TXT, Markdown, HTML, images with OCR, and common email exports |
| KN-004 | Every source object preserves provider ID, version, permissions, provenance, and deletion state |
| KN-005 | Documents are chunked using versioned parsing and chunking policies |
| KN-006 | Embeddings are versioned and can be re-indexed without losing current serving state |
| KN-007 | Search combines lexical, semantic, metadata, freshness, authority, and relationship signals |
| KN-008 | Retrieval applies tenant and source permissions before content reaches a model |
| KN-009 | Results include citations to exact source version and location |
| KN-010 | Users can inspect sources, sync status, parsing status, permissions, and use lineage |
| KN-011 | Entity resolution creates canonical people, teams, projects, customers, products, and custom entities |
| KN-012 | Relationships preserve type, confidence, temporal validity, and provenance |
| KN-013 | Source changes and deletion propagate to chunks, embeddings, entities, caches, and citations |
| KN-014 | Retrieval quality has offline and production-shadow evaluation |

### 3.8 Connections and synchronization

| ID | Requirement |
|---|---|
| CN-001 | Integrations use one provider-neutral lifecycle and health model |
| CN-002 | OAuth uses server-generated state, PKCE where supported, clean callbacks, least privilege, and encrypted credentials |
| CN-003 | API-key integrations validate, encrypt, rotate, revoke, and never return raw secrets |
| CN-004 | Initial and incremental sync use durable cursors and generation fencing |
| CN-005 | Signed webhooks are verified against raw body, timestamp checked, deduplicated, and replayable |
| CN-006 | Provider rate limits, pagination, backoff, token expiry, and partial failures are normalized |
| CN-007 | Outbound writes use stable idempotency keys and reconciliation |
| CN-008 | Connection removal revokes provider access where possible and follows configured data-deletion policy |
| CN-009 | Admins can pause, resume, resync, reauthorize, inspect, and remove connections |
| CN-010 | Supported providers pass recorded contract tests and real sandbox acceptance |

### 3.9 Collaboration, search, and reporting

| ID | Requirement |
|---|---|
| CO-001 | Comments support mentions, reactions, editing policy, deletion policy, and attachment references |
| CO-002 | Users can follow workflows and runs and configure notification preferences |
| CO-003 | Activity feeds distinguish product activity from immutable audit events |
| CO-004 | Global search covers workflows, runs, tasks, agents, people, documents, entities, and settings allowed to the user |
| CO-005 | Command palette provides keyboard-accessible navigation and safe actions |
| CO-006 | Saved views support filters, columns, sorting, sharing, and ownership |
| CO-007 | Dashboard cards drill into the exact filtered data behind the metric |
| CO-008 | Reports cover throughput, cycle time, wait time, failure, automation, agent quality, cost, SLA, and returned time |
| CO-009 | Report data can be filtered, exported, and scheduled according to permissions |

### 3.10 Billing and commercial behavior

| ID | Requirement |
|---|---|
| BL-001 | Plans and prices are versioned platform data |
| BL-002 | Stripe Checkout creates subscriptions using server-selected price mappings |
| BL-003 | Stripe webhooks authoritatively update customer, subscription, invoice, and payment state |
| BL-004 | Entitlements enforce features, seats, storage, runs, tasks, model spend, connectors, and retention |
| BL-005 | Usage reservations prevent concurrent work from overspending a limit |
| BL-006 | Usage and credits use append-only idempotent ledgers |
| BL-007 | Billing admins can view current usage, forecast, limits, invoices, plan, and payment status |
| BL-008 | Trials, upgrades, downgrades, cancellation, grace periods, and payment failure have explicit behavior |
| BL-009 | Product access degrades safely during billing-provider failure |
| BL-010 | Every billable event traces to its source run, task, integration, or storage object |

### 3.11 Administration, audit, privacy, and enterprise

| ID | Requirement |
|---|---|
| AD-001 | Audit events capture actor, action, resource, tenant, result, request, trace, metadata hash, and time |
| AD-002 | Ordinary application roles cannot update or delete audit events |
| AD-003 | Audit search and export support permissioned filters and integrity evidence |
| AD-004 | Workspace admins can configure retention by data class |
| AD-005 | Users and tenants can export their data in documented formats |
| AD-006 | User deletion and tenant deletion are durable jobs with legal-hold and completion evidence |
| AD-007 | Data deletion propagates to caches, indexes, object storage, providers, and backups according to policy |
| AD-008 | Admins can configure region, model processing policy, telemetry policy, and connector allowlist |
| AD-009 | Support access is time-limited, reason-bound, approval-aware, and audited |
| AD-010 | Security center displays sessions, SSO, SCIM, domains, API credentials, webhooks, and recent risk events |

### 3.12 Platform and operations

| ID | Requirement |
|---|---|
| OP-001 | Local development starts all required dependencies from documented commands |
| OP-002 | CI reproduces schema, API, worker, web, and end-to-end tests |
| OP-003 | Infrastructure is fully represented in Terraform |
| OP-004 | Staging mirrors production topology at smaller capacity |
| OP-005 | Deployments are progressive, observable, reversible, and compatible with active runs |
| OP-006 | Database migrations are backward compatible across the deployment window |
| OP-007 | Metrics, logs, traces, errors, and audit correlation share stable identifiers |
| OP-008 | Alerts are tied to service objectives and actionable runbooks |
| OP-009 | Backups, point-in-time recovery, object versioning, and restore procedures are tested |
| OP-010 | Regional recovery meets the stated RPO and RTO in an exercise |
| OP-011 | Capacity, fairness, and spend controls are load-tested |
| OP-012 | Dependency, container, secret, IaC, SAST, DAST, and SBOM controls run in CI |
| OP-013 | Platform operators authenticate through an origin- and session-isolated workforce identity plane with phishing-resistant MFA, least-privilege duty scopes, prompt offboarding, periodic access review, controlled break glass, and zero workspace-credential acceptance |

### 3.13 Global experience, guests, PWA, help, and support

| ID | Requirement |
|---|---|
| EX-001 | The web application is installable and safely updates without interrupting active work |
| EX-002 | Offline behavior is explicit, policy-aware, and limited to safe cached data and drafts |
| EX-003 | Push subscriptions are device-scoped, revocable, payload-minimized, and permission checked at delivery and click |
| EX-004 | Guests receive expiring, revocable access to one exact resource/action and cannot browse workspace metadata |
| EX-005 | Guest identity, invitation, session, action, download, and revocation are auditable |
| EX-006 | All first-party UI strings, formatting, validation, email, help, and exports use the localization system |
| EX-007 | English, Hindi, Spanish, French, German, and Japanese complete production translation and linguistic QA |
| EX-008 | Current and previous major Chrome, Edge, Firefox, and Safari plus current iOS Safari and Android Chrome are supported |
| EX-009 | Every critical journey passes the defined keyboard, zoom/reflow, voice-control, and screen-reader matrix |
| EX-010 | Users can search versioned help, view current status and changelog, replay onboarding, and submit contextual feedback |
| EX-011 | Customers can open and follow permissioned support tickets with attachments and service targets |
| EX-012 | Diagnostic bundles require preview and consent and are redacted, encrypted, expiring, checksummed, and access logged |
| EX-013 | Product incident banners are authenticated, resilient to status-feed failure, accessible, and dismissible according to severity |
| EX-014 | Pricing, terms, privacy, DPA, acceptable use, accessibility, subprocessors, and security claims are current and owner approved |
| EX-015 | Every visible feature or integration is labelled `LIVE`, `BETA`, `DEMO`, `PLANNED`, unavailable, or degraded according to verified reality |
| EX-016 | A scoped citation-quality or unsafe-output report preserves relevant provenance without granting support broader content access |
| EX-017 | The public contact flow validates consent, resists abuse, persists and routes the request, acknowledges honestly, and follows retention/deletion policy |

---

## 4. Non-functional targets

These are release gates, not aspirations. `NFR-001` and `NFR-002` are operating
SLOs measured monthly after launch; their pre-release gate is correct
instrumentation, error-budget alerting, dependency exclusion rules, and a
seven-day production-equivalent staging qualification at or above the target.

| ID | Target |
|---|---|
| NFR-001 | 99.9% monthly availability for interactive API and workflow control plane |
| NFR-002 | 99.5% monthly availability for non-critical connector ingestion |
| NFR-003 | p95 cached metadata reads under 400 ms at reference load |
| NFR-004 | p95 accepted mutations under 750 ms, excluding asynchronous completion |
| NFR-005 | p95 task dispatch within 5 seconds of dependency readiness |
| NFR-006 | p95 SSE event delivery within 2 seconds of durable event commit |
| NFR-007 | No cross-tenant access in automated, adversarial, or manual isolation tests |
| NFR-008 | Transactional-data RPO no greater than 15 minutes |
| NFR-009 | Regional recovery RTO no greater than 4 hours |
| NFR-010 | WCAG 2.2 AA for all supported product and marketing flows |
| NFR-011 | No critical or high exploitable security finding at release |
| NFR-012 | No unbounded agent loop, connector retry, queue growth, or tenant spend path |
| NFR-013 | Tenant execution kill switch takes effect within 60 seconds |
| NFR-014 | All acknowledged mutations survive process and single-AZ failure |
| NFR-015 | At-least-once delivery never automatically repeats an `UNCERTAIN` non-idempotent external effect; certified idempotent or authoritatively reconcilable operations produce zero logical duplicate |
| NFR-016 | Core mobile flows work at 320 CSS px without horizontal page overflow |
| NFR-017 | Core desktop flows work from 1024 through 2560 CSS px |
| NFR-018 | Initial authenticated shell LCP under 2.5 seconds at p75 on reference mobile profile |
| NFR-019 | Interaction to Next Paint under 200 ms at p75 for ordinary UI actions |
| NFR-020 | Cumulative Layout Shift below 0.1 at p75 |
| NFR-021 | Telemetry excludes secrets and configured sensitive customer content |
| NFR-022 | Critical operational alerts reach the on-call path within 5 minutes |
| NFR-023 | Knotline-admin permission revocation is effective on the committing transaction; connected-source ACL revocation disappears from all online serving caches, search, citations, and agent context within 5 minutes; server and browser clients fail closed whenever current ACL proof is older than that bound, including while offline, with disconnected ciphertext governed by Section 6.7 rather than presented as remotely erased |

### 4.1 Reference capacity for final testing

The final release must demonstrate at least:

- 10,000 active workspaces;
- 100,000 monthly active users;
- 10,000,000 workflow runs per month;
- 50,000 concurrently active runs;
- 5,000 task transitions per second during burst tests;
- 2,000 concurrent SSE connections per API task set and horizontal scaling;
- 100 million searchable chunks across representative tenant partitions;
- 10 TB of object data with lifecycle behavior validated;
- one hot tenant consuming its full entitlement without materially degrading
  ordinary tenants.

These figures are a test envelope, not a sales commitment.

### 4.2 Reproducible measurement profiles

M36 may revise a profile only through a reviewed plan amendment that preserves
or raises the intended envelope. Every run records source commit, artifact
digests, Terraform plan, AWS region and instance/task types, autoscaling bounds,
dataset seed/checksums, cache state, start/end, samples, errors, percentiles,
queue lag, correctness reconciliation, and actual AWS/provider cost.

| Profile | Fixed launch protocol | Pass criteria |
|---|---|---|
| `WEB-MOBILE-1` | Release evidence pins exact Chrome build, Playwright build, host OS/CPU, 320×720 viewport, 4-core mid-tier-Android CPU profile, 4× slowdown, 1.6 Mbps down/750 Kbps up, 150 ms RTT, dataset hash, and cache state; 50 cold and 100 warm samples per critical route on three independent runs, with no outlier discarded unless instrumentation proves invalid | NFR-018/019/020 at p75 with 95% bootstrap confidence interval not crossing the limit; no failed request, overflow, long task over 200 ms without worker/yield, or accessibility blocker |
| `API-MIX-1` | Production build; three AZ; API tasks start at 12 × 2 vCPU/4 GiB and may autoscale to 80; 15-minute warm-up, 60-minute steady state, 10-minute 2× burst; 10,000 seeded tenants with Zipf-like 80/20 traffic | NFR-003/004/006; non-injected 5xx below 0.1%; zero authorization/correctness error; average steady CPU/DB connections below 75%; burst queues return to baseline within 15 minutes |
| `RUNTIME-1` | 50,000 active runs over small linear, branching, fan-out/join, wait, subworkflow, and bounded-loop graphs; 5,000 transitions/second for 10 minutes then 1,500/second for 60 minutes; worker cap 160 × 4 vCPU/8 GiB | NFR-005/012/014/015; zero lost/duplicate logical transition; zero duplicate effect for certified idempotent/reconcilable operations; every deliberately ambiguous non-idempotent operation stops in `UNCERTAIN` without automatic replay; p95 dispatch under five seconds; backlog drains within 20 minutes; ordinary tenant p95 degrades less than 20% during hot-tenant load |
| `SEARCH-100M-1` | 100 million 700-token-average chunks across 10,000 tenants; 20% ACL-filtered queries; warm and cold query sets; 2,000 representative hybrid queries over 30 minutes | Authorized recall@20 ≥ 0.90 on must-find set, nDCG@10 ≥ 0.75, citation correctness 100% on must-cite set, ACL leakage 0, warm p95 ≤ 1.5 seconds, cold p95 ≤ 3 seconds |
| `OBJECT-10TB-1` | Manifest representing 10 TB across small/medium/large objects plus at least 10 million keys; lifecycle, version, multipart, scan, delete, restore, and inventory samples run against production-equivalent bucket policy | Checksum/provenance mismatch 0; unauthorized access 0; deletion/lifecycle discrepancies 0 after declared convergence; upload/download p95 within product-disclosed limits |
| `SOAK-24H-1` | 24 hours at 35% of steady envelope plus scheduled bursts, provider fault fixtures, deploy/restart, cursor changes, and tenant churn | No monotonic memory/connection/bloat/cardinality growth above 10%; no stuck durable work; ledger/cursor/event reconciliation mismatch 0; error budget remains within NFR-001/002 target |
| `DR-REGION-1` | Three-region production-equivalent topology: active and standby data planes plus distinct residency-approved protection region; restore/cutover runs while representative workflows, waits, accepted API/callback/schedule/billing events, and external-operation receipts exist; standby continues protected writes while original primary stays unavailable, then the exercise injects protection-region loss and a separate subsequent active-standby loss; incident clocks and topology states are recorded | NFR-008/009 for the first regional loss; audit/hash and data checksum match; with a readable source, independent journal/WAL/object protection plus the sealed unsettled root yields every accepted mutation/inbound-event/effect intent in the possible 15-minute RPO gap, including arbitrarily old unsettled, orphaned, not-committed, commit-unconfirmed, and uncertain classifications; with an actually lost source, the signed loss manifest instead proves every acknowledged, primary-mutating, or effect-capable operation while declaring the bounded journal-only pre-primary population/count `UNKNOWN` rather than fabricating completeness; every success acknowledgement has durable `COMMITTED`; protection loss closes writes before RPO breach until a readable-source barrier or explicit lost-source reconstruction re-protects, while any missing reconstruction proof keeps writes closed; second data-plane loss preserves bounded recovery material/complete manifest with measured compound-disaster RTO; zero duplicate certified effect, automatic replay of `UNCERTAIN`, or deleted/held/out-of-region violation |
| `ACL-REVOKE-1` | 10,000 permission changes across Knotline grants and every `LIVE` connector, including webhook, polling, backlog, server/CDN/browser/service-worker cache, Cache Storage, IndexedDB, offline/reconnecting PWA, open SSE/session, search result, citation-open, entity graph, and in-flight agent-context cases | Local grants deny in the committing transaction; provider-origin changes disappear end-to-end at p95 ≤ 2 minutes and maximum ≤ 5 minutes; client/server proof older than 5 minutes fails closed even offline; unauthorized title/count/snippet/cache/context exposure 0; unreadable disconnected ciphertext is purged on next activation/reconnect or its declared local destruction deadline |

The default full M36 qualification has a direct infrastructure/provider spend
ceiling of USD 7,500 and must tear down temporary capacity within four hours.
Exceeding the ceiling fails the run unless the product and finance owners
approve a documented capacity-profile amendment before rerun.

---

## 5. Information architecture and route inventory

Every route listed here must classify and evidence every applicable state under
Section 5.8. A state is never omitted silently or fabricated where it has no
meaning. Protected routes must preserve a safe return target through
authentication without leaking query secrets.

### 5.1 Public routes

| Route | Required surface |
|---|---|
| `/` | Product narrative, interactive example, use cases, proof, CTA |
| `/product` | Complete product overview |
| `/product/workflows` | Workflow studio and runtime |
| `/product/agents` | Agent foundry and governed execution |
| `/product/knowledge` | Connected knowledge and provenance |
| `/product/integrations` | Searchable supported connector catalog |
| `/solutions/:solution` | Operations, go-to-market, product, support, finance, HR, IT |
| `/templates` | Public template gallery |
| `/templates/:slug` | Template detail and preview |
| `/pricing` | Plans, limits, FAQ, enterprise contact |
| `/security` | Security architecture and controls |
| `/trust` | Availability, subprocessors, policies, and reports |
| `/docs` | Product and API documentation home |
| `/docs/*` | Searchable documentation pages |
| `/help` | Versioned product help, troubleshooting, and support entry |
| `/help/*` | Searchable localized help articles |
| `/changelog` | Versioned product changes |
| `/status` | Link or embedded public status |
| `/contact` | Sales/contact workflow |
| `/accessibility` | Current accessibility statement and contact path |
| `/legal/privacy` | Privacy notice |
| `/legal/terms` | Terms of service |
| `/legal/dpa` | Data processing terms |
| `/legal/acceptable-use` | Acceptable-use and prohibited-use policy |
| `/legal/subprocessors` | Current subprocessor list and change process |
| `/auth/sign-in` | Magic-link and Google sign-in |
| `/auth/check-email` | Non-enumerating email confirmation |
| `/auth/magic/callback` | One-time exchange and clean redirect |
| `/auth/google/callback` | OIDC callback and clean redirect |
| `/invitations/accept` | Asset-isolated invitation token exchange, preview, and acceptance |
| `/guest` | Asset-isolated scoped guest-token exchange followed by task, approval, or resource surface |

### 5.2 Authenticated global routes

| Route | Required surface |
|---|---|
| `/app` | Role-aware operations home |
| `/app/inbox` | Unified tasks, approvals, mentions, and exceptions |
| `/app/search` | Permission-aware global search |
| `/app/notifications` | Notification center |
| `/app/onboarding` | Resumable activation flow |
| `/app/profile` | Profile, locale, accessibility, and notification preferences |
| `/app/profile/sessions` | Session inventory and revocation |
| `/app/profile/memory` | User-private agent memory, provenance, correction, export, and deletion |
| `/app/support` | Support cases, service targets, status, and new request |
| `/app/support/:ticketId` | Ticket messages, attachments, diagnostics, and resolution |
| `/app/feedback` | Product, citation-quality, accessibility, and unsafe-output report |

### 5.3 Workflow routes

| Route | Required surface |
|---|---|
| `/app/workflows` | Library, folders, tags, filters, bulk actions |
| `/app/workflows/new` | Blank, prompt, import, or template creation |
| `/app/workflows/:workflowId` | Overview, health, versions, runs |
| `/app/workflows/:workflowId/studio` | Graph editor and accessible outline |
| `/app/workflows/:workflowId/versions` | Immutable version history |
| `/app/workflows/:workflowId/versions/:version` | Read-only version and diff entry |
| `/app/workflows/:workflowId/triggers` | Manual, schedule, webhook, event, API triggers |
| `/app/workflows/:workflowId/settings` | Ownership, permissions, retention, archive/delete |
| `/app/templates` | Workspace and first-party templates |
| `/app/templates/:templateId` | Template editor, versions, usage |

### 5.4 Run and human-work routes

| Route | Required surface |
|---|---|
| `/app/runs` | Filterable run operations table |
| `/app/runs/:runId` | Live run room |
| `/app/runs/:runId/timeline` | Complete sequenced history |
| `/app/runs/:runId/tasks/:taskRunId` | Task, attempts, inputs, outputs, provenance |
| `/app/tasks` | Human task list and saved views |
| `/app/tasks/:taskRunId` | Task form, context, comments, artifacts |
| `/app/approvals` | Approval queue |
| `/app/approvals/:approvalId` | Exact payload, policy, evidence, decision |

### 5.5 Agent and knowledge routes

| Route | Required surface |
|---|---|
| `/app/agents` | Agent catalog, status, health, usage |
| `/app/agents/new` | Guided agent creation |
| `/app/agents/:agentId` | Definition overview and versions |
| `/app/agents/:agentId/builder` | Instructions, schemas, model, retrieval, tools, budgets |
| `/app/agents/:agentId/evals` | Datasets, runs, comparisons, release gates |
| `/app/agents/:agentId/activity` | Invocations, quality, latency, cost, failures |
| `/app/agents/:agentId/memory` | Permitted memory policies, records, uses, and workspace-shared administration |
| `/app/knowledge` | Source and corpus overview |
| `/app/knowledge/sources` | Files and connected sources |
| `/app/knowledge/documents/:documentId` | Versions, parse, permissions, citations |
| `/app/knowledge/search` | Hybrid search debugger |
| `/app/knowledge/entities` | Entity explorer |
| `/app/knowledge/entities/:entityId` | Attributes, relations, provenance |

### 5.6 Connection, analytics, and administration routes

| Route | Required surface |
|---|---|
| `/app/connections` | Integration catalog and connected accounts |
| `/app/connections/new/:provider` | Authorization/setup |
| `/app/connections/:integrationId` | Health, scopes, syncs, webhooks, actions |
| `/app/analytics` | Operational analytics |
| `/app/analytics/reports/:reportId` | Report detail and export |
| `/app/settings/workspace` | Name, region, defaults |
| `/app/settings/members` | Members, invitations, groups |
| `/app/settings/roles` | System and custom roles |
| `/app/settings/security` | Sessions, domains, SSO, SCIM, policies |
| `/app/settings/developers` | Service principals, API credentials, OAuth clients |
| `/app/settings/webhooks` | Outgoing webhooks and delivery logs |
| `/app/settings/billing` | Plan, payment, usage, invoices |
| `/app/settings/notifications` | Workspace notification and escalation defaults |
| `/app/settings/data` | Retention, export, deletion, residency |
| `/app/settings/audit` | Audit explorer and exports |
| `/app/settings/usage` | Meter and cost explorer |
| `/app/settings/feature-access` | Connector/model/agent allowlists and kill switches |
| `/app/settings/identity` | SSO, domains, SCIM, JIT, and enterprise sessions |
| `/app/settings/policies` | Model, connector, memory, sharing, telemetry, and support policies |
| `/app/settings/support-access` | Customer-authorized and emergency support access history |
| `/app/developer/api` | Interactive workspace API documentation |
| `/app/developer/apps` | OAuth clients, credentials, scopes, and consent configuration |
| `/app/developer/webhooks` | Public webhook subscriptions, tests, logs, and redelivery |

### 5.7 Platform operator routes

These routes use separate platform-operator authorization, step-up
authentication, reason/ticket binding, enhanced audit, and customer support-
access grants where customer content is involved.

| Route | Required surface |
|---|---|
| `/ops` | Fleet health, active incidents, SLO burn, deploys, and safe global controls |
| `/ops/incidents` | Incident lifecycle, roles, timeline, status communication, and post-incident evidence |
| `/ops/support` | Support queues, entitlements, assignment, SLA, and customer-visible messages |
| `/ops/workspaces/:workspaceId` | Safe metadata, support-access request/session, throttles, and diagnostics |
| `/ops/runtime` | Queues, Temporal, outbox, stuck work, DLQ, reconciler, and audited repair |
| `/ops/providers` | Model/tool/connector/email/billing health, limits, credentials state, and kill switches |
| `/ops/releases` | Artifacts, flags, canaries, migrations, health gates, rollback, and evidence |
| `/ops/security` | Risk events, access review, secret/key/certificate rotation, and break-glass review |
| `/ops/privacy` | Export/delete/hold/retention/residency cases and failed propagation |

### 5.8 Route-state applicability and evidence

The implementation registry assigns every Section 5 path a stable route ID
derived from its semantic path (for example, `/app/runs/:runId` becomes
`route.app.runs.detail`), owner milestone, route class, permission, entitlement,
data sources, and canonical journeys. CI rejects an inventory route without a
registry entry or a code route absent from this inventory.

Each route’s `route-coverage.json` classifies every state below as `REQUIRED` or
`NOT_APPLICABLE` with a non-empty reason and reviewer. M38 requires zero
unclassified or unevidenced `REQUIRED` cell; reasoned `NOT_APPLICABLE` is valid
for an intrinsically irrelevant state and is not a skipped gate.

| Route class | Always required | Required when the condition exists | Normally not applicable |
|---|---|---|---|
| Static public/legal/help article | first load, content/render failure fallback, offline/cached-or-unavailable, unsupported locale, 404 | consent, stale/version notice, degraded status feed | workspace unauthorized, plan gate, edit conflict, archived resource |
| Public async/catalog/contact/auth | loading/pending, success, validation, empty result, retryable/final error, rate limit, offline, 404 | provider degraded, consent/challenge, expired/replayed token, partial result | workspace archive unless invitation targets one |
| Protected collection/search | loading/skeleton, first-use empty, filtered empty, partial page, refresh/stale, error/retry, unauthorized, session expired, plan/limit, offline, 404 | degraded dependency, bulk pending/partial, archived scope | edit conflict unless saved-view mutation |
| Protected detail | loading, success, stale refresh, error, unauthorized, session expired, plan/limit, offline, missing/deleted | partial/degraded dependency, archived/suspended, async action pending/result, conflict for mutable fields | empty only when the resource legitimately has no children |
| Editor/form/settings | loading, draft/saving/saved, validation, pending, success, error, conflict, unauthorized, plan/limit, offline, stale, missing/deleted, destructive confirm | partial/degraded dependency, archived/suspended, step-up, policy denial | none without recorded reason |
| Live run/task/approval/operator | connecting/live, reconnecting, stale, polling fallback, partial history, pending action, success/error, unauthorized, plan/policy, offline, missing, terminal | degraded provider, uncertain/reconciling, kill/throttle, expired, archived | edit conflict only for truly immutable views |

The route ownership registry is not deferred to implementation. The exact
groups below assign all 105 inventory paths one primary implementation/
acceptance milestone and at least one canonical journey or owned branch.
M02 owns shared route plumbing and layouts; the milestone listed here owns the
route’s truthful feature behavior. Comma-separated entries are exact inventory
paths, not prefix wildcards, and every path must occur in exactly one row.
`route-registry.json` is generated from/checks against this mapping; CI rejects
an unmatched or multiply owned path.

| Exact inventory paths | Primary milestone | Canonical journey/branch |
|---|---|---|
| `/`, `/product`, `/product/workflows`, `/product/agents`, `/product/knowledge`, `/product/integrations`, `/solutions/:solution`, `/templates`, `/templates/:slug`, `/security`, `/docs`, `/docs/*`, `/changelog` | M02 | `CJ-01` |
| `/pricing` | M29 | `CJ-17`; public evaluation branch of `CJ-01` |
| `/trust`, `/contact`, `/accessibility`, `/legal/privacy`, `/legal/terms`, `/legal/dpa`, `/legal/acceptable-use`, `/legal/subprocessors` | M33 | `CJ-01` |
| `/help`, `/help/*`, `/status` | M33 | `CJ-22` |
| `/auth/sign-in`, `/auth/check-email`, `/auth/magic/callback`, `/auth/google/callback` | M04 | `CJ-02` |
| `/invitations/accept` | M05 | `CJ-03` |
| `/guest` | M33 | `CJ-20` |
| `/app` | M28 | `CJ-16` |
| `/app/inbox` | M12 | `CJ-08`, `CJ-09` |
| `/app/search` | M28 | `CJ-16` |
| `/app/notifications` | M27 | `CJ-15` |
| `/app/onboarding` | M05 | `CJ-03` |
| `/app/profile`, `/app/profile/sessions` | M04 | `CJ-02` |
| `/app/profile/memory` | M17 | `CJ-11` |
| `/app/support`, `/app/support/:ticketId`, `/app/feedback` | M33 | `CJ-22` |
| `/app/workflows`, `/app/workflows/:workflowId`, `/app/workflows/:workflowId/versions`, `/app/workflows/:workflowId/versions/:version`, `/app/workflows/:workflowId/settings`, `/app/templates`, `/app/templates/:templateId` | M06 | `CJ-05` |
| `/app/workflows/new` | M08 | `CJ-06` |
| `/app/workflows/:workflowId/studio` | M07 | `CJ-05` |
| `/app/workflows/:workflowId/triggers` | M26 | `CJ-14` |
| `/app/runs`, `/app/runs/:runId`, `/app/runs/:runId/timeline`, `/app/runs/:runId/tasks/:taskRunId` | M11 | `CJ-07` |
| `/app/tasks`, `/app/tasks/:taskRunId` | M12 | `CJ-08` |
| `/app/approvals`, `/app/approvals/:approvalId` | M13 | `CJ-09` |
| `/app/agents`, `/app/agents/new`, `/app/agents/:agentId`, `/app/agents/:agentId/builder` | M14 | `CJ-10` |
| `/app/agents/:agentId/evals`, `/app/agents/:agentId/activity` | M18 | `CJ-10` |
| `/app/agents/:agentId/memory` | M17 | `CJ-11` |
| `/app/knowledge/sources`, `/app/knowledge/documents/:documentId` | M19 | `CJ-12` |
| `/app/knowledge/search` | M20 | `CJ-12` |
| `/app/knowledge`, `/app/knowledge/entities`, `/app/knowledge/entities/:entityId` | M21 | `CJ-12` |
| `/app/connections`, `/app/connections/new/:provider`, `/app/connections/:integrationId` | M22 | `CJ-13.FRAMEWORK`; provider-family branches join in M23–M25 |
| `/app/analytics`, `/app/analytics/reports/:reportId` | M28 | `CJ-16` |
| `/app/settings/workspace`, `/app/settings/members`, `/app/settings/roles` | M05 | `CJ-03` |
| `/app/settings/security`, `/app/settings/identity` | M32 | `CJ-04` |
| `/app/settings/developers`, `/app/settings/webhooks`, `/app/developer/api`, `/app/developer/apps`, `/app/developer/webhooks` | M30 | `CJ-18` |
| `/app/settings/billing`, `/app/settings/usage` | M29 | `CJ-17` |
| `/app/settings/notifications` | M27 | `CJ-15` |
| `/app/settings/data`, `/app/settings/audit`, `/app/settings/support-access` | M31 | `CJ-19` |
| `/app/settings/feature-access` | M34 | `CJ-23` |
| `/app/settings/policies` | M32 | `CJ-04`, `CJ-19.REGION_MIGRATION` |
| `/ops`, `/ops/incidents`, `/ops/support`, `/ops/workspaces/:workspaceId`, `/ops/runtime`, `/ops/providers` | M34 | `CJ-23` |
| `/ops/releases` | M37 | `CJ-23.PRODUCTION` |
| `/ops/security` | M35 | `CJ-23.SECURITY` |
| `/ops/privacy` | M31 | `CJ-19` |

Evidence dimensions for each `REQUIRED` cell are route ID, state ID, fixture/
fault trigger, screenshot, browser test, accessibility result, locale set,
viewport/device, authorization persona, expected analytics/audit, and evidence
URI. Public/static routes do not need a fabricated unauthorized or plan-gated
screen; mutable settings cannot mark conflict or validation `NOT_APPLICABLE`.

### 5.9 Canonical critical journeys

Coverage profiles below define the complete release target. Their locale,
viewport, browser/device, and assistive-technology dimensions activate by the
lane matrix in Section 20.6; an early owner milestone proves the active subset
and records later dimensions as `NOT_YET_APPLICABLE`, never as passed.

- `UI-CRITICAL`: all six locales; 320, 480, 768, 1024, 1440, and 1920 widths;
  current/previous supported desktop browsers; pinned physical iOS/Android
  where the flow is mobile-relevant; keyboard; the complete Section 20.3 AT
  matrix; every route-state branch named below.
- `UI-ADMIN`: all six locales and supported desktop/tablet/phone layouts;
  keyboard, Windows NVDA, macOS VoiceOver, zoom/high-contrast/voice access; a
  physical phone for urgent controls; destructive/step-up/policy branches.
- `API-CRITICAL`: public OpenAPI/SDK/CLI, auth/scope/idempotency/rate/error/
  webhook branches, two-tenant fixtures, and provider sandbox where relevant.
- `OPS-CRITICAL`: production-equivalent staging, operator identity, alert/
  runbook/kill/rollback/customer-communication evidence, plus accessible
  operator UI.

| Journey | Actor and precondition | Entry → successful outcome | Mandatory branches/risks | Owner | Coverage |
|---|---|---|---|---|---|
| `CJ-01` Evaluate and contact | Visitor; no account | `/`/product/pricing/security → consented `/contact` request routed and acknowledged | mobile, locale, offline, form error, abuse/rate, routing outage, privacy delete | M33 | UI-CRITICAL |
| `CJ-02` Authenticate and recover | New/returning user | sign-in → clean callback → session inventory/revoke/logout | unknown email, resend, expired/replay, Google denial, CSRF, suspended, session reuse | M04 | UI-CRITICAL |
| `CJ-03` Activate workspace | Owner; valid session | create/join workspace → role/use case → teammate → real first successful run | skip/resume, sample removal, invite mismatch/expiry, no provider, failure/recovery, multi-workspace switch | M15 | UI-CRITICAL |
| `CJ-04` Enterprise lifecycle | Enterprise admin + IdP | verify domain → test/enforce SSO → SCIM user/group → deprovision | bad cert/claims, mapping conflict, last owner, break glass, token reuse, region policy | M32 | UI-ADMIN, API-CRITICAL |
| `CJ-05` Build and publish | Builder; workspace | workflow library → studio/outline → validate → publish/version/diff | every node, keyboard/touch, 500 nodes, conflict/offline, invalid policy, rollback draft | M07 | UI-CRITICAL |
| `CJ-06` Generate/import/test | Builder | prompt or import → assumptions/repair → dry run → accept/publish | refusal/schema error, injection, cancel, fixture-only side effects, real provider status/cost | M15 | UI-CRITICAL |
| `CJ-07` Run and recover | Builder/operator; published workflow | trigger/start → live run room → pause/resume/cancel or terminal result | restart, duplicate, failed/timeout, retry/fork, SSE loss, uncertain effect, DLQ/repair | M11 | UI-CRITICAL, OPS-CRITICAL |
| `CJ-08` Complete human task | Member; assigned/queue task | inbox → claim/delegate/draft/attach → submit → workflow resumes | double claim, reassign, clarify, reopen, offline conflict, malicious file, expired SLA | M12 | UI-CRITICAL |
| `CJ-09` Decide approval | Eligible approver | queue/deep link → inspect exact packet → decide → effect consumes approval | mobile, delegate/abstain/revise, quorum, self deny, revoke race, expiry/escalation/DST | M13 | UI-CRITICAL |
| `CJ-10` Release agent | Agent builder/governor | configure → test → eval compare → canary → promote/rollback | invalid schema/tool scope, safety regression, low sample, provider outage, budget | M18 | UI-ADMIN |
| `CJ-11` Governed agent effect | Workflow operator; released agent | retrieve → model → tool approval → brokered effect → typed output/provenance | injection, refusal, memory policy, secret, sandbox, cancellation, uncertain write, kill | M17 | UI-CRITICAL, OPS-CRITICAL |
| `CJ-12` File to cited knowledge | Knowledge steward/member | upload/connect file → scan/parse/index → search → exact citation/entity provenance | malware, OCR/corrupt, ACL revoke ≤5 min, stale/fail closed, reindex/delete | M21 | UI-CRITICAL |
| `CJ-13` Connect and synchronize | Integration admin | catalog → scope/OAuth → initial/incremental sync → health → reauth/remove | PKCE/state, reduced scope, cursor reset, webhook replay, quota/outage, ACL/delete | M25 | UI-ADMIN, API-CRITICAL |
| `CJ-14` Event to reconciled write | Builder/operator | configure trigger/action → event → run/approval → provider receipt | DST/burst/duplicate/reorder, target mismatch, conflict, uncertain outcome, pause/kill | M26 | UI-CRITICAL, API-CRITICAL |
| `CJ-15` Receive and act | Member/admin | preference/default → notification/digest → authorized deep link/action | quiet hours, escalation, revoked access, duplicate, bounce, push expiry, chat replay | M27 | UI-CRITICAL |
| `CJ-16` Find and measure | Leader/member | global search/saved view → dashboard → drill/export/schedule | ACL revoke, partial/stale metric, empty/demo exclusion, late event, formula injection | M28 | UI-CRITICAL |
| `CJ-17` Buy and control spend | Billing admin | checkout/trial → usage/budget/invoice → plan change/cancel/reactivate | webhook reorder, failed payment, grace, concurrent hard limit, Stripe outage, refund | M29 | UI-ADMIN |
| `CJ-18` Integrate by API | Developer | service/OAuth credential → public API run → signed webhook → rotate/revoke | scope/resource deny, idempotency conflict, rate limit, replay, SDK compatibility | M30 | API-CRITICAL, UI-ADMIN |
| `CJ-19` Govern data | Owner/privacy/auditor | audit verify → retention/hold → export/delete or region migration → proof | support access, partial delete, hold conflict, restore ledger, region fail/rollback | M31 | UI-ADMIN, OPS-CRITICAL |
| `CJ-20` External guest action | Guest + inviter | fragment exchange → exact task/approval/resource action → logout/revoke | forwarded/replayed/expired token, identity/domain mismatch, metadata probing, lost device | M33 | UI-CRITICAL |
| `CJ-21` Install and work offline | Member | install → cached shell/draft → reconnect/conflict → safe update | physical iOS/Android, quota, sign-out purge, push revoke, update rollback, no offline approval | M33 | UI-CRITICAL |
| `CJ-22` Get help/support | Customer/support | help search → ticket/consented diagnostics → response/resolution/status | locale/a11y, redaction, access expiry, attachment, outage/banner fallback, escalation | M33 | UI-CRITICAL, UI-ADMIN |
| `CJ-23` Operate incident | On-call/platform operator | alert → incident/diagnosis → contain/repair/rollback → communicate/review | compromised credential, DB/Temporal/provider/queue, unsafe repair, break glass, status | M34 | OPS-CRITICAL |
| `CJ-24` Recover region | Incident commander/privacy | declare loss → restore/fence/reconcile → limited read → approved writes | RPO affected manifest, deleted data, residency, split brain, waits/timers, uncertain effects | M36 | OPS-CRITICAL |

The `Owner` column owns the core happy path and any listed branch not overridden
below. Cross-milestone mandatory branches have stable IDs and independent
evidence:

| Branch ID | Mandatory branch | Owning milestone(s) and completion rule |
|---|---|---|
| `CJ-11.RELEASE` | released/canary-controlled agent version | M18; full CJ-11 cannot pass before M18 |
| `CJ-11.RETRIEVAL` | real indexed retrieval, ACL revocation, citation/provenance | M20; joins M17’s agent-context contract |
| `CJ-12.CONNECTED` | provider-connected file/source rather than manual upload | M23; manual file/entity path remains M21 core |
| `CJ-13.FRAMEWORK` | OAuth/sync/health/reauth/remove fixture contract | M22 |
| `CJ-13.KNOWLEDGE` | Google/Notion/Confluence source families | M23 |
| `CJ-13.WORK` | work/source-control/collaboration/X families | M24 |
| `CJ-13.ENTERPRISE_DATA` | Microsoft 365/mail/calendar/CRM/generic/data families | M25; CJ-13 is complete only when every GA `LIVE` family branch passes |
| `CJ-14.PROVIDERS` | at least one certified read-trigger/write receipt per declared provider family | M23–M25; M26 owns the generic fixture/schedule/broker path |
| `CJ-15.CHAT` | real Slack/Teams delivery/action/replay | M24 + M27 |
| `CJ-15.PUSH` | installed-device PWA push expiry/revocation/click | M33; M27 owns in-app/email/webhook/digest core |
| `CJ-19.REGION_MIGRATION` | region eligibility/freeze/cutover/rollback/purge | M32; M31 owns audit/retention/hold/export/delete core |
| `CJ-19.RESTORE` | restore deletion/hold/residency proof | M36 |
| `CJ-23.SECURITY` | compromised-credential/break-glass incident branch | M35; M34 owns staging operations core |
| `CJ-23.PRODUCTION` | production canary/rollback/status branch | M37 |
| `CJ-24.PRODUCTION` | production-region bootstrap/cutover controls | M37; M36 owns production-equivalent DR proof |

Every feature milestone adds its core and explicitly owned branch IDs to the
cumulative suite. `journey-branches.json` records branch ID, prerequisite
milestones, routes, requirements, fixtures/providers, test/evidence IDs,
coverage dimensions, and state. CI rejects a core owner that cannot satisfy its
dependency closure, an unowned mandatory branch, or a full-journey pass while
one required branch is incomplete. M38 runs all 24 journeys and all GA-scope
branches. The traceability validator links each requirement and route to at
least one journey/branch or records why it is a non-journey support contract.

---

## 6. Responsive interaction and design specification

### 6.1 Breakpoint model

Components respond to available space rather than device names.

| Range | Required behavior |
|---|---|
| `320–479 px` | Single-column mobile; bottom or sheet navigation; no page overflow |
| `480–767 px` | Wide mobile; compact split content where useful |
| `768–1023 px` | Tablet; collapsible rail; master/detail may use drawers |
| `1024–1439 px` | Standard desktop; persistent navigation and panels |
| `1440–1919 px` | Wide desktop; expanded inspector and denser tables |
| `1920–2560+ px` | Maximum content widths or useful multi-panel expansion; never stretched unreadably |

### 6.2 Application shell behavior

- Desktop uses persistent left navigation, workspace switcher, command search,
  global create action, notifications, and profile.
- Tablet collapses the left rail and preserves current context.
- Mobile uses a compact header plus bottom navigation for Home, Inbox,
  Workflows, Runs, and More.
- Deep links open the correct detail; closing a mobile detail restores scroll
  and filter state.
- Navigation is fully keyboard operable and has visible focus.
- Workspace switching invalidates tenant-scoped caches before rendering the new
  tenant.

### 6.3 Canvas behavior

- Desktop shows graph, toolbar, minimap, and inspector.
- Tablet shows graph with inspector as a resizable drawer.
- Mobile defaults to the outline; graph is an optional pan/zoom mode.
- All node operations available on canvas are available from the outline.
- The editor preserves viewport and selection per workflow draft.
- Touch targets are at least 44 by 44 CSS px for primary interactions.
- Large graphs use viewport culling and worker-based layout.
- Keyboard users can create, connect, reorder, configure, and delete nodes.

### 6.4 Table and list behavior

- Column priority determines which fields collapse on narrow widths.
- Mobile rows become semantic cards; actions remain labeled and reachable.
- Bulk selection is never the only way to perform an action.
- Filters use a sheet on narrow widths and an inline bar on desktop.
- Virtualization never breaks screen-reader row semantics or browser find for
  essential content.

### 6.5 Form behavior

- Every input has a programmatic label, description, error, and required state.
- Errors appear inline and in a focusable summary for long forms.
- Draft forms recover after refresh when safe.
- Secret fields are write-only and never prefilled with stored values.
- Destructive confirmation names the target and consequence.
- Unsaved-change prompts do not trap navigation after a successful save.

### 6.6 Accessibility

- WCAG 2.2 AA is mandatory.
- Automated axe checks run for every stable route, but manual keyboard and
  screen-reader passes remain required.
- Status is never conveyed by color alone.
- Motion respects `prefers-reduced-motion`.
- Contrast passes for text, icons, focus, graphs, charts, and disabled states.
- Live regions announce async generation, saves, run state, and validation
  without excessive interruption.
- Charts have table summaries.
- Graphs have outline and dependency narration.
- Time, dates, numbers, and direction support locale and timezone.

### 6.7 PWA and network behavior

- Every browser-stored item has one cache class:
  `PUBLIC_VERSIONED` (immutable shell/design/help assets),
  `WORKSPACE_ACL_METADATA` (minimal encrypted metadata with authorization-proof
  epoch and hard five-minute display lease), `USER_DRAFT` (user-authored,
  encrypted, workspace/user/device bound), or `PROHIBITED`.
- `PUBLIC_VERSIONED` may follow immutable asset lifetime. A
  `WORKSPACE_ACL_METADATA` item is hidden and unusable when its online proof is
  older than five minutes; offline mode cannot extend the lease. Reconnect
  reauthorizes before display and deletes denied entries.
- Authentication pages, secrets, task inputs/outputs, documents, and sensitive
  API responses are `PROHIBITED` and are not stored by the service worker,
  Cache Storage, IndexedDB, or application query persistence.
- Offline mode clearly indicates stale data and allows safe local task-form or
  workflow-draft recovery where policy permits.
- A `USER_DRAFT` contains only content the user typed locally, never cached task
  context/source text. Its WebCrypto key lease expires within five minutes
  offline unless a stricter enterprise policy disables it; after lease expiry
  the UI locks the ciphertext and cannot display or sync it until online
  reauthorization. Revocation/deletion destroys the server-side key wrapper
  immediately and purges the local ciphertext on the next service-worker
  activation/reconnect, with a maximum local destruction attempt deadline of
  24 hours while the app/device runs.
- Knotline discloses the unavoidable endpoint boundary: a powered-off or
  permanently disconnected user-controlled device cannot be remotely erased.
  Such ciphertext is not serviceable after its five-minute proof/key lease,
  and enterprise policy may prohibit offline drafts entirely. Export/deletion
  evidence records outstanding device subscriptions until reconnect, expiry,
  or policy-approved endpoint-management proof.
- Mutations are never silently queued when their authorization or consequence
  could change; the user explicitly retries after reconnection.
- Install prompt is contextual and dismissible.
- Update activation does not interrupt an active edit or approval.

---

## 7. Logical architecture

### 7.1 Repository target

```text
apps/
  web/                    React product, marketing, and PWA
  api/                    Fastify HTTP control plane and SSE
  worker/                 Temporal activities and event consumers
  scheduler/              Trigger reconciliation and schedule ownership
  connector-worker/       Provider sync, webhook, and outbound operations
  ingest-worker/          Parse, chunk, embed, entity, and deletion pipelines
  notification-worker/    Email, Slack, webhook, and in-app delivery
  admin-cli/              Safe operator, migration, repair, and evidence commands
packages/
  contracts/              Transport schemas, event schemas, and generated types
  db/                     Drizzle schema, migrations, transaction helpers
  domain/                 State machines, policies, invariants, pure services
  auth/                   Session, principal, RBAC, service credentials
  workflow/               Definition, validation, versioning, runtime contracts
  agents/                 Agent/model/tool/retrieval/eval contracts
  connectors/             Provider-neutral interfaces and test suites
  knowledge/              Parsing, chunking, retrieval, entity contracts
  billing/                Plans, entitlements, reservations, ledgers
  audit/                  Audit construction, hashing, export
  observability/          Logging, tracing, metrics, redaction
  config/                 Typed environment and feature configuration
  ui/                     Tokens, accessible components, icons, charts
  testkit/                Fixtures, builders, fake clock, fake providers
infra/
  docker-compose.yml      Local dependencies
  temporal/               Local and production namespace/task-queue config
  terraform/
    modules/              Reusable AWS modules
    environments/         Development, staging, production
  policies/               IAM, WAF, OPA/Conftest, network policies
  dashboards/             Versioned observability definitions
  runbooks/               Machine-readable links and operational scripts
docs/
  implementation/         This source of truth and implementation records
  product/                Product language and durable UX decisions
  operations/             Runbooks, recovery, and support procedures
  security/               Threat models, controls, and assurance evidence index
tests/
  e2e/                    Browser end-to-end suites
  contract/               Provider and public API contract tests
  load/                   k6 capacity and soak suites
  resilience/             Fault injection and recovery suites
  security/               Tenant, auth, webhook, agent, and DAST suites
  evals/                  Agent datasets, graders, thresholds, and reports
```

### 7.2 Runtime boundaries

| Boundary | Owns | Must not own |
|---|---|---|
| Web | Presentation, bounded draft interaction, cache, accessibility | Authorization truth, secrets, durable workflow state |
| API | Auth, authorization, validation, transactions, query APIs, SSE | Long-running model, connector, or parsing work |
| Temporal workflows | Durable orchestration, timers, signals, retry intent | Customer secrets, large payloads, direct unbounded code |
| Activity workers | One bounded idempotent unit of work | Cross-task orchestration truth |
| Connector workers | Provider protocols, cursors, rate limits, reconciliation | Workflow definition or membership policy |
| Ingest workers | Raw-to-index processing and deletion propagation | Direct user authorization decisions |
| Notification workers | Preference-aware channel delivery | Business state transitions |
| PostgreSQL | Transactional truth, state, ledgers, outbox, provenance | Large binary data or ephemeral presence |
| S3 | Raw files, parsed artifacts, exports, large outputs | Authorization truth |
| Redis | Performance cache, presence, approximate rate counters, and non-authoritative semaphore hints | Sole copy of durable state, fencing, paid-limit admission, external-effect ownership, or any safety-critical lease |

### 7.3 Transaction rules

- Authorization-sensitive reads and mutations use the same derived tenant
  context.
- Aggregate mutation, audit metadata, usage reservation, and outbox intent
  commit atomically when they belong to one business action.
- Network calls never occur inside a long PostgreSQL transaction.
- Workers claim with compare-and-set version or fencing token.
- Safety-critical claim/fencing truth is PostgreSQL, Temporal, or the global
  recovery control store. Redis may accelerate it but loss/bypass can never
  create a second owner or relax a hard limit.
- On Redis loss, reads bypass only cache-safe data. New model/tool/connector/
  schedule/expensive dispatch uses a conservative PostgreSQL-backed allowance
  or fails closed; provider concurrency and hard spend do not fall back to
  unbounded local counters.
- All delivery is assumed at least once.
- Every externally visible write has a stable logical operation ID.
- Large payloads are content-addressed object references.
- Temporal history contains identifiers and bounded metadata, not sensitive
  document bodies or secrets.

---

## 8. Data architecture

### 8.1 Global field conventions

Tenant-scoped tables include:

```text
id uuid primary key
workspace_id uuid not null
created_at timestamptz not null
updated_at timestamptz not null
created_by_principal_id uuid when attributable
version bigint not null default 1
```

Rules:

- Tenant-inclusive foreign keys or equivalent database constraints prevent
  cross-tenant references.
- IDs are generated server-side.
- User emails are normalized for comparison and preserved separately for
  display where needed.
- Timestamps are stored in UTC; user timezone is explicit.
- Customer settlement, invoice, payment, tax, and credit amounts use integer
  minor units plus ISO currency. High-frequency internal/provider cost accrual
  uses exact `numeric(38,12)` major-currency units (or an equivalent declared
  integer nano-unit), never binary floating point or per-call cent rounding.
- Money/quantity values cross JSON boundaries as decimal strings with explicit
  unit, scale, and currency. Usage quantities use fixed-precision numeric or
  integer base units.
- Currency conversion records original and budget/billing currency, immutable
  FX source/version, exact rate, observation/effective time, and rounding rule;
  costs aggregate in exact original units before invoice-boundary rounding.
- Secrets store only an encrypted reference, version, expiry, and fingerprint.
- Published/versioned rows are immutable through ordinary application roles.
- Append-only ledgers and audit tables reject update/delete for runtime roles.
- Soft deletion is limited to recoverable product objects; privacy deletion
  uses explicit destruction jobs.

### 8.2 Identity and tenant tables

| Table | Required fields and constraints |
|---|---|
| `users` | normalized unique email, display name, locale, timezone, status |
| `identity_links` | user, provider, unique provider subject, claims metadata |
| `sessions` | user, rotation family, token verifier, expiry, last use, IP/device summary, revocation |
| `magic_link_tokens` | email hash, token verifier, requested IP, expiry, consumed time |
| `identity_authorization_transactions` | provider/connection and application/environment, high-entropy authorization-locator hash unique, state hash, nonce hash, S256 PKCE verifier reference, browser-initiation cookie binding, SAML request/RelayState binding where applicable, exact clean return-target ID, requested scopes, created/expiry time, atomic one-time callback-consumed time |
| `identity_authorization_results` | authorization transaction unique, high-entropy result-handle verifier hash unique, original browser-initiation binding, resolved user and pending session intent without provider credentials, exact clean return-target ID, safe success/error code, issued/expiry time, atomic one-time exchanged time |
| `workspaces` | name, slug, status, region, default locale/timezone, data policy |
| `memberships` | unique workspace/user, state, joined/suspended times; roles come from bindings |
| `invitations` | workspace, normalized email, role, token verifier, inviter, expiry, state |
| `groups` | workspace, name, source, external ID |
| `group_memberships` | unique workspace/group/user |
| `roles` | workspace/customer-application scope, key, name, immutable system-role flag; never an operator-plane role |
| `permissions` | stable action/resource keys |
| `role_permissions` | role and permission unique pair |
| `principal_role_bindings` | workspace, user/group principal, role, source/provenance, resource scope, effective interval, state; never grants operator access |
| `resource_grants` | principal/group, resource type/id, permission, expiry |
| `organization_relationships` | workspace, subject user, relationship such as `reports_to`, target user, source, priority, effective interval, state; acyclic where required |
| `service_principals` | workspace, name, owner, status, policy |
| `api_credentials` | principal, prefix, verifier, scopes, resources, expiry, rotation family, last use, revocation |
| `oauth_clients` | workspace, client ID, secret verifier/JWK/mTLS, redirects, grants, scopes, status |
| `sso_connections` | workspace, protocol, issuer, metadata, domain policy, encrypted secret reference, exact application/environment and registered callback/ACS URI, stable high-entropy ACS connection-locator hash unique |
| `scim_tokens` | workspace, verifier, scopes, last use, expiry, revocation |
| `domain_claims` | domain, workspace, verification method/state, SSO enforcement |
| `scim_operations` | workspace, request ID, resource/method, request hash, result/error, actor token, time |
| `onboarding_progress` | user/workspace, role/use-case answers, current/completed/skipped steps, sample-data state |
| `guest_invitations` | workspace, resource/action scope, email/domain/identity rule, token verifier, expiry/max use, state |
| `guest_sessions` | invitation, verified guest identity, token verifier, expiry, last use, device summary, revocation |
| `platform_operators` | unique workforce-directory issuer/subject, display identity, employment/contract state, lifecycle source/version, required authentication assurance, provisioned/disabled/offboarded times; never linked to a workspace login identity |
| `platform_operator_role_bindings` | operator, fixed platform role, environment/duty scope, source, distinct approver where required, effective interval, state; no workspace role or customer-created wildcard |
| `platform_identity_authorization_transactions` | workforce issuer/tenant/client/environment, intent (`LOGIN` or `STEP_UP`), optional current operator session, high-entropy locator/state/nonce/S256 PKCE hashes, host-only browser-initiation binding, exact stable callback and clean return-target IDs, required assurance, created/expiry/atomic callback-consumed times; stored and keyed separately from customer identity transactions |
| `platform_identity_authorization_results` | platform authorization transaction unique, high-entropy result-handle verifier hash unique, operator and pending platform-session/step-up intent, browser-initiation binding, achieved methods/assurance, safe result code, exact return target, issued/expiry/atomic exchanged times; contains no IdP credential |
| `platform_operator_sessions` | operator, workforce IdP session subject, rotation family and hashed verifier, authentication methods/assurance, device summary, issued/last-use/absolute/idle expiry, last step-up, revocation reason/time |
| `platform_break_glass_grants` | operator, incident/change/ticket, exact environment/action/resource scope, justification, requester and two distinct approvers, hardware-auth evidence hash, issued/expiry/use/revoke times, post-use reviewer/result, state |
| `platform_workforce_directory_sources` | exact workforce issuer/tenant and directory/SCIM application, encrypted credential/token reference and version, allowed source groups, lifecycle mapping version, status, last full-snapshot/cursor/version, reconciliation schedule/result, rotation/revocation |
| `platform_workforce_directory_operations` | source and external request/event ID unique, idempotency key/request hash, operator subject, resource/method, lifecycle before/after versions, result/error, received/processed times, audit event; duplicate delivery cannot repeat provisioning or offboarding |
| `platform_access_reviews` | review type/period/environment/duty scope, immutable population snapshot/hash, owner, independent reviewer, due/closed times, status, aggregate decision, evidence and audit references |
| `platform_access_review_items` | review and operator/binding/session/support-access/break-glass resource, manager/system owner, current privilege and last-use evidence, keep/remove/change decision, justification, finding/remediation owner/due/state, decision time; unique item per review/resource |

### 8.3 Workflow definition tables

| Table | Required fields and constraints |
|---|---|
| `workflow_folders` | workspace, parent, name, position |
| `workflows` | workspace, folder, name, description, status, owner, draft/published pointers |
| `workflow_tags` | workspace, unique normalized name, color |
| `workflow_tag_links` | unique workflow/tag |
| `workflow_versions` | workflow, sequential version, status, definition hash, release note, published time |
| `workflow_nodes` | version, stable node key, type, name, config, input/output schema, assignment, policy, position |
| `workflow_edges` | version, stable edge key, from/to keys, condition, mapping, label, path type |
| `workflow_triggers` | workflow/version, type, config, timezone, state, next fire |
| `subworkflow_bindings` | parent version/node, child workflow/version policy, input/output mapping |
| `workflow_collaborators` | workflow, user/group, grant |
| `workflow_draft_events` | draft revision, actor, operation, payload/hash |
| `workflow_favorites` | user/workflow unique pair |
| `templates` | platform/workspace scope, slug, category, author, current version, visibility |
| `template_versions` | template, version, source workflow version, variables, instructions, content hash |
| `workflow_generations` | workspace, principal, prompt reference, model invocation, status, result workflow |
| `workflow_validation_runs` | workflow/draft revision, validator versions, state, summary, fixture/environment, time |
| `workflow_validation_findings` | validation run, node/edge/path, severity, stable code, message, remediation |
| `generic_threads` | workspace, resource type/id, state, visibility, created/closed metadata |
| `generic_comments` | thread, author, body, edit/delete state, parent, attachment refs |
| `comment_reactions` | comment type/id, actor, reaction, unique actor/reaction |
| `resource_follows` | user, resource type/id, event policy, unique resource follower |

### 8.4 Runtime and human-work tables

| Table | Required fields and constraints |
|---|---|
| `workflow_runs` | workflow/version, state, trigger, input ref, policy snapshot, idempotency key, parent/fork lineage, timing |
| `task_runs` | run, node key, deterministic instance key/execution path, fan-out generation, parent task, state, assignee/agent, input/output refs, readiness/due timing, fencing version; unique run/node/instance |
| `task_dependencies` | run, exact task instance, exact dependency task instance, resolution state/result |
| `task_attempts` | task, unique attempt number, state, worker, trace, error class, usage, timing |
| `run_events` | run, strictly increasing sequence, type, actor, payload/ref, time |
| `run_reused_outputs` | child/parent run/task/attempt, content hash, validation/freshness/permission evidence |
| `human_tasks` | task, assignee, claim, form schema/data draft, priority, SLA, escalation, submission |
| `task_queues` | workspace, stable key/name, state, capacity, routing mode/version, fallback principal, SLA calendar, default template |
| `task_queue_memberships` | queue, user/group principal, priority/skills, capacity, effective interval, state; unique active binding |
| `task_queue_routing_rules` | queue/version, ordered typed condition, eligible principals/skills, load policy, fallback, effective interval |
| `task_templates` | workspace, stable key/name, owner, state, current published version |
| `task_template_versions` | template, immutable version, form/output schemas, instructions, assignment/queue/SLA defaults, policy, content hash |
| `task_watchers` | task/user unique pair |
| `task_comments` | task, author, body, edit/delete state, parent |
| `comment_mentions` | comment, mentioned principal, delivery state |
| `approvals` | task, payload hash/ref, policy snapshot, state, expiry |
| `approval_steps` | approval, order/group/quorum, eligible/assigned principal, decision |
| `approval_decisions` | approval/step, actor, decision, reason, payload hash, time |
| `artifacts` | run/task/attempt, object URI, media type, size, content hash, classification, scan state |
| `external_operations` | workspace/task/integration, globally stable logical operation ID unique within workspace, operation type, provider application/account and exact destination binding, idempotency key unique in operation scope, canonical request hash, approval/policy references, current state, claim generation/execution epoch/fence, result/receipt refs, certainty/reconciliation state |
| `external_operation_attempts` | operation/attempt number unique pair, immutable canonical request hash, claim generation/epoch/fence, provider idempotency key, connection/credential version, current projection state; request identity never changes |
| `external_operation_attempt_records` | attempt/sequence unique pair, append-only `SEND_STARTED`, `SENT`, `RESPONSE`, `RECEIPT`, `FAILED_SAFE`, or `UNCERTAIN` record with epoch/fence, provider request ID, occurrence/send/response times, sanitized response/receipt hash/ref, and certainty; rows never update/delete |
| `dead_letter_items` | source queue/workflow, aggregate, payload ref, attempts, error, resolution |
| `incoming_trigger_endpoints` | workflow trigger, high-entropy endpoint-key hash unique, secret reference/version, schema, state, rate/dedupe policy |
| `incoming_trigger_deliveries` | endpoint, external/logical event ID, payload hash/ref, signature/schema result, state, run |
| `schedule_leases` | trigger, due instant, generation, owner/fencing token, lease expiry, dispatch state |
| `task_drafts` | task/user, form schema version, encrypted/ref data, ETag, local-sync marker, expiry |
| `task_assignments` | task, prior/new user/group/queue, actor/reason, effective time |
| `approval_delegations` | delegator/delegate, scope, effective interval, exclusions, state |
| `sla_calendars` | workspace, timezone, business intervals, holidays, version |
| `sla_timer_events` | task/approval, policy version, timer type/due time, fired/handled state |

### 8.5 Agent and evaluation tables

| Table | Required fields and constraints |
|---|---|
| `agent_definitions` | platform/workspace scope, stable key, name, owner, state, current version |
| `agent_versions` | definition, version, status, schemas, prompt, model/retrieval/tool policies, budgets, hash |
| `prompt_versions` | scope, key, version, template, variables schema, content hash, release metadata |
| `model_providers` | provider key, endpoint class, credential reference, region, state |
| `model_registry` | provider, model ID, snapshot, capabilities, context, pricing version, state |
| `model_policies` | scope, role routing, fallback, residency, budgets, retention, safety |
| `model_invocations` | task/attempt, provider/model/prompt, input/output refs, status, tokens, cost, latency, refusal |
| `tool_definitions` | scope, key, immutable version, schemas, risk, scopes, timeout, idempotency, runtime |
| `agent_tool_policies` | agent version, tool version, approval rule, constraints |
| `tool_invocations` | attempt, tool, operation ID, args/result refs, approval, state, timing |
| `capability_grants` | task/attempt, capability, resource constraints, credential broker reference, expiry |
| `retrieval_policies` | scope, sources, filters, ranking, freshness, token and result limits |
| `retrieval_manifests` | attempt, policy/query hash, selected source versions, rankings, exclusions |
| `eval_datasets` | scope, name, purpose, version, split policy, provenance |
| `eval_cases` | dataset/version, input, expected/rubric refs, tags, sensitivity |
| `eval_suites` | agent/prompt/model target, dataset versions, graders, thresholds |
| `eval_runs` | suite, candidate/baseline versions, state, environment, summary |
| `eval_results` | run/case/grader, score, pass, evidence, latency, cost |
| `agent_releases` | agent version, eval run, reviewer, decision, rollout/rollback state |
| `memory_records` | workspace, scope (`execution`, `user_private`, `workspace_shared`), owner/subject, purpose, state, current version, retention/classification |
| `memory_versions` | memory record, immutable version, typed value/ref, source/provenance, writer action, content hash, effective time |
| `memory_access_bindings` | memory record, subject user/group/agent policy, permission, source, effective interval |
| `memory_usage_refs` | run/attempt/retrieval manifest, memory version, selection reason, permission evidence hash |

### 8.6 Connection and knowledge tables

| Table | Required fields and constraints |
|---|---|
| `integrations` | workspace, provider, external account, state, scopes, credential, health, sync policy |
| `encrypted_credentials` | integration, KMS envelope metadata, ciphertext reference, version, expiry, rotation |
| `connection_authorizations` | workspace/user and draft integration, connector manifest/version, provider plus exact client application ID/environment/config version, exact registered redirect URI, high-entropy authorization-locator hash unique, state/nonce/S256 PKCE verifier references, initiating session/browser nonce binding, requested and granted scope snapshots, clean redirect target ID, expiry, atomic one-time consumed time |
| `sync_jobs` | integration, type, generation, state, counters, cursor range, attempts, timing |
| `sync_cursors` | integration/resource, cursor, watermark, version, status |
| `webhook_endpoints` | scope mode (`CONNECTION` or `PROVIDER_APPLICATION`), optional workspace/integration, exact provider application/environment and account where pre-known, high-entropy endpoint-locator hash unique, signature profile, active/prior secret references and versions, state |
| `webhook_events` | endpoint/provider application/environment plus authenticated installation/account/tenant ID, provider event ID unique inside that authenticated provider scope, selected binding version, verified provider sequence/time where supplied, signature/locator result, edge receipt time, raw payload hash/ref, state |
| `provider_installation_bindings` | immutable binding version, provider application/environment plus verified installation/account/tenant ID, exactly one workspace/integration ownership, credential/version, provider event watermark, effective interval, predecessor, state; app-level webhooks resolve through historical binding only after signature verification, and an installation identity is never silently reassigned across workspaces |
| `provider_rate_limits` | integration/provider bucket, reset, remaining, observed time |
| `source_objects` | integration, provider type/ID/version, parent, raw ref, ACL hash, monotonic ACL projection epoch, provider ACL revision, observed/expiry times, invalidation/deletion state |
| `documents` | workspace, source object or upload, canonical metadata, current version, state |
| `document_versions` | document, provider version, content hash, raw/normalized refs, parser version, state |
| `chunks` | document version, stable ordinal, offsets/page/path, text/ref, ACL hash/projection epoch, content hash |
| `embeddings` | chunk/entity, provider/model version, dimensions, vector, generated time |
| `entities` | workspace, type, canonical name, identity-only canonical metadata, status |
| `entity_aliases` | entity, provider/external ID or normalized alias, confidence |
| `entity_facts` | entity, attribute key, typed value/ref, confidence, valid interval, state |
| `entity_fact_evidence` | fact, source object/document location or user/system action, ACL derivation, content hash |
| `relations` | workspace, from/to entity, type, confidence, valid interval, state |
| `relation_evidence` | relation, source object/document location or user/system action, ACL derivation, content hash |
| `acl_projection_versions` | workspace/integration/source, monotonic epoch and provider revision unique, complete/incomplete state, observed/expiry times, source hash, predecessor, invalidation time/reason |
| `access_bindings` | object type/id, subject type/id, permission, source/inheritance path, provider revision and ACL projection epoch, observed/expiry/effective interval, state |
| `authorization_proof_keys` | region/environment signing-key reference/version, public key, activation/retirement, compromise/revocation state |
| `citations` | output/artifact, document version/chunk, location, content hash |
| `deletion_tombstones` | source/object, deletion version/time, propagation state |
| `files` | workspace, stable canonical file ID, owner, purpose, classification, current version, retention/legal-hold state, lifecycle/deletion state |
| `file_upload_sessions` | workspace/user, purpose, object key/version, parts, size/type/checksum/quota, expiry, state |
| `file_versions` | canonical file, immutable object version/checksum, scan/processing, retention/classification |
| `entity_merge_candidates` | entity pair, evidence, score/version, review state |
| `entity_fact_conflicts` | entity/attribute, competing values/source refs, status, resolution |

### 8.7 Billing, notification, and governance tables

| Table | Required fields and constraints |
|---|---|
| `plans` | platform scope, key, version, public metadata, state |
| `plan_entitlement_definitions` | plan/version, feature/meter, limit, overage policy |
| `subscriptions` | workspace, Stripe customer/subscription, plan version, state, period |
| `entitlements` | workspace, feature/meter, exact value/unit, source and policy/version, effective interval, conservative cache expiry |
| `budget_policies` | workspace, stable name/key, owner, current published version, state |
| `budget_policy_versions` | policy, immutable version, period/timezone, exact budget currency/amount, soft/hard mode, forecast method, effective interval, content hash |
| `budget_policy_scopes` | policy version, optional workflow/agent/provider/meter scope, precedence, exact limit/overage behavior |
| `budget_periods` | policy version/scope and period key unique, exact reserved/consumed/debt projections, state, opened/closed times |
| `budget_thresholds` | policy version/scope, ordered exact threshold, channel/escalation/kill action, cooldown, state |
| `usage_reservations` | workspace/run/task/source, policy/version/scope/period, meter and exact reserved/consumed/released quantity/unit/scale and cost/currency, state, lease owner/generation/fence/expiry, idempotency key |
| `usage_ledger` | workspace, immutable entry kind (`RESERVE`, `INCREMENT`, `FINALIZE`, `RELEASE`, `ADJUST`), reservation reference and per-reservation sequence unique, meter, exact quantity/unit/scale, original and budget amount/currency, price/FX source versions and times, rounding residual, source type/id, idempotency key, occurrence |
| `usage_debt_ledger` | workspace/policy/period/reservation, immutable debt/reconciliation entry and sequence, exact quantity/unit/scale and amount/currency, reason/source/evidence, occurrence |
| `credit_ledger` | workspace, immutable grant/debit/expiry/adjustment entry and sequence, exact quantity/unit/scale and amount/currency where monetary, source/evidence, occurrence |
| `usage_adjustment_requests` | workspace, immutable preview/payload hash, proposed ledger entries and financial impact, requesting platform-finance operator, reason/ticket/evidence, risk/dual-control threshold result, distinct approver where required, expiry/state, commit idempotency key, committed ledger references |
| `spend_control_actions` | workspace/policy/scope, threshold/manual source, stop/resume action, exact effective fence, reason/actor, occurrence |
| `stripe_webhook_endpoints` | environment/account binding, high-entropy endpoint-locator hash unique, active/prior signing-secret references and versions, state |
| `stripe_events` | endpoint/account, provider event ID unique, type, signature/locator result, raw payload hash/ref, processing state |
| `notification_preferences` | workspace/user, event class/channel, schedule, quiet hours |
| `notifications` | workspace, recipient, event/type, resource ref, rendered-safe summary, group key, read/expiry state |
| `notification_deliveries` | event, recipient, channel, attempt, provider ID, state, error |
| `push_subscriptions` | user/workspace/device, endpoint verifier/ref, keys, locale, last use, expiry/revocation |
| `offline_devices` | user/workspace, pseudonymous device installation ID, policy/cache capability, key-binding public material, first/last activation, proof epoch, expiry/revocation/deletion state |
| `offline_cache_registrations` | device, cache class/namespace and manifest hash, maximum proof/key expiry, last inventory/activation, purge deadline/state; never raw cached content |
| `offline_key_leases` | device/user/workspace/cache class, wrapped local-key reference, authorization-proof hash/key version, issued/expiry, destroyed/revoked time/reason |
| `offline_purge_attempts` | device/cache registration, trigger/reason, requested/attempted/completed time, result/evidence hash, next retry/deadline |
| `saved_views` | workspace/user or shared scope, resource, filters, sort, columns |
| `reports` | workspace, owner, metric/query version, filters/dimensions/visualization, visibility, state |
| `report_schedules` | report, recipients/channels, timezone/schedule, format, last/next run, state |
| `outgoing_webhooks` | workspace, URL, events, secret reference, state, policy |
| `webhook_deliveries` | endpoint, event, attempt, request/response metadata, state |
| `idempotency_records` | scope, principal, operation, key, request hash, status/result ref, expiry |
| `outbox_events` | aggregate scope, event ID/type/version, payload/ref, publish state |
| `event_receipts` | consumer/event unique pair, state, processed time |
| `audit_events` | tenant/platform scope, actor, action, resource, result, request/trace, metadata hash |
| `audit_exports` | workspace, query, object ref, integrity digest, expiry |
| `feature_flags` | environment/platform default or workspace override, rollout |
| `data_exports` | subject/workspace, scope, state, object ref, expiry |
| `data_deletion_jobs` | subject/workspace, scope, legal hold, state, propagation evidence |
| `support_access_grants` | workspace, operator, reason, approver, scope, start/expiry, revocation |
| `retention_policies` | workspace, data class, duration/action, version, effective interval, exception |
| `legal_holds` | workspace, case/reason, scope, creator/approver, effective/release, state |
| `deletion_ledger` | globally durable subject/object tombstone hash, deadline, purge/restore evidence |
| `region_migration_jobs` | workspace, source/target region, plan/version, state, validation, cutover, purge evidence |
| `support_tickets` | workspace/reporter, category/severity, subject, consent, SLA, owner, status/resolution |
| `support_messages` | ticket, author type/id, body, attachment refs, visibility, time |
| `diagnostic_bundles` | ticket/workspace, requested/consented scope, object ref, checksum, expiry, access log state |
| `feedback_reports` | workspace/user, type, resource/provenance refs, body, consent, triage/resolution |
| `oauth_authorization_codes` | client/user/workspace, verifier, redirect, scopes, PKCE, expiry/consumption |
| `oauth_access_grants` | client/user/workspace, scopes/resources, access JTI/verifier, refresh-family verifier/version, rotation/reuse state, signing key, issued/expiry/revocation |
| `contact_requests` | public request ID, normalized contact, organization, consent/version, purpose, source/referrer policy, abuse decision, routing destination/receipt, state, retention/deletion |
| `protection_stream_generations` | scope/data shard and class, authority incarnation/recovery epoch, immutable stream/timeline ID, source region plus database-cluster/bucket incarnation, PostgreSQL timeline and parent checkpoint, destination region/vault/prefix, KMS/version, first/final WAL LSN or object sequence, deletion/hold watermark, state, manifest root, effective interval |
| `protection_stream_checkpoints` | stream generation, immutable ordinal/time, WAL LSN/snapshot or source bucket/version/inventory coordinates, object/deletion/hold counts and digest, replication lag, source lease/role version, predecessor hash, receipt and verification state |

Two minimal non-content control stores are part of the data model:

- `execution_scope_epochs` is an Amazon DynamoDB global table configured for
  multi-Region strong consistency (MRSC) in a dedicated control/security AWS
  account. Each approved control/residency pool uses exactly three MRSC
  participants, all configured as readable/writable replicas for Knotline. A
  scope is a workspace (`W`),
  identity-home user/shard (`I`), platform-control environment/domain (`P`),
  public-intake region/shard (`U`), or global-directory shard (`G`); its
  partition key is the scope class plus keyed opaque scope ID. Attributes are
  active and standby data-plane regions, independent protection region,
  authority incarnation, monotonic epoch, lease generation, current recovery-
  journal generation plus last verified window/generation root and checkpoint
  time, current protection-stream generation/root, protection state,
  transition state, maximum issued data and registration lease expiries,
  `new_lease_not_before`, incident/change reference, and timestamps.

  MRSC synchronously commits item changes across regions and strongly
  consistent reads at any healthy replica return the latest committed value.
  Conditional single-item `UpdateItem` operations therefore provide one serial
  order per scope while any one authority region is unavailable. Knotline does
  not use unsupported multi-item DynamoDB transactions on the MRSC table.
  Stateless epoch services in all three regions use the same audience-bound
  multi-Region KMS signing-key lineage and region-local IAM role; health routing
  can move to another replica without changing authority incarnation or
  lowering an epoch. Loss of one authority region is an online failover.
  Loss of MRSC quorum fails all new mutation/effect/control leases closed until
  the managed quorum is restored; the measured quorum-loss RTO and compound-
  disaster communication are separate from single-region RTO. Creating an
  unrelated replacement table or reusing an older incarnation is prohibited.
  India remains disabled until an India-only three-site linearizable authority
  with equivalent semantics is approved under `EXT-022`.

  A signed **data-mutation lease** binds scope, active region, authority
  incarnation, epoch, service class, issue/not-before/expiry, and journal
  generation. The receiving authoritative-store commit path validates every
  field against store/database time before commit; PostgreSQL performs the
  check in the same transaction as the product mutation. Leases last at most
  30 seconds, renew no later than every 10 seconds, and assume measured maximum
  five-second clock error. Issuance conditionally requires `ACTIVE`/`PROTECTED`
  and raises `maximum_issued_data_lease_expiry`; no cached/offline issuer
  exists. During transition one conditional authority update changes the state
  to `FENCING`, stops issuance, fixes that maximum, increments the epoch, and
  sets `new_lease_not_before = maximum_issued_data_lease_expiry + 5 seconds
  clock uncertainty + 5 seconds safety`. It refuses every new data lease until
  that instant and the recovery protocol completes. Thus the worst-case lease
  drain is 40 seconds and an old store whose clock is five seconds slow rejects
  its final lease before a new store can commit. No cache can override expired,
  not-yet-valid, stale-incarnation/generation, or wrong-region proof.

  The MRSC table uses dedicated KMS encryption, PITR, deletion protection,
  restricted break-glass access, CloudTrail/data-event evidence, no TTL, and no
  application-role write permission except the epoch/directory service.
- The MRSC authority also contains a non-expiring, strongly queryable
  `recovery_scope_directory` with a fixed declared shard set. Directory items
  use
  `PK=ENV#{environment}#SCOPE_DIRECTORY#{scopeClass}#SHARD#{n}` and
  `SK=SCOPE#{scopeKey}`; tombstoned/migrated scopes retain effective intervals
  and are never deleted or hidden by a GSI. Because MRSC does not support
  transactions, scope registration is an explicit activation protocol:
  a conditional single-item update on the chosen `G` shard's admission-control
  item requires `OPEN`, increments its admission sequence, and adds an active
  token containing deterministic `registrationOperationId`, opaque target
  directory/epoch keys, candidate region mapping, admission generation, and
  expiry. It then returns the signed maximum-30-second registration lease.
  Each serialized token is capped at 1.5 KiB and each shard permits at most 128
  active tokens, keeping the map at or below 192 KiB plus bounded control
  metadata—below DynamoDB's 400 KiB item limit. Excess creation is durably
  queued/rate-limited rather than routed around the shard.

  The registrar first appends `REGISTRATION_INTENT` under that lease to the
  shard's protection-region journal. Only then may the
  registrar conditionally put the directory item as `PENDING`, put the epoch
  row as `REGISTERING`, strong-read both, and conditionally advance both to
  `ACTIVE`. Every per-item step carries the operation ID and a strictly
  increasing expected step version; retries use the same value and never
  overwrite a later or terminal version. No data-mutation lease is issuable
  before both active records match. Normal completion appends
  `REGISTRATION_ACTIVATED` (or terminal `REGISTRATION_ABORTED`) with both item
  versions/hashes. Only after strong reads prove the same terminal pair and
  journal record may a conditional update remove the token from the active map.
  Thus a removed token always has discoverable terminal directory state; every
  incomplete or ambiguously completed registration remains named in the MRSC
  active-token map independently of the journal.

  Incident freeze conditionally stops registration-lease issuance and
  data-mutation lease issuance for **every fixed `G` registration-admission
  shard in the environment across all control/residency pools**, regardless of
  its current shard contents. It atomically fixes each admission-sequence
  cutoff and active-token map and fixes all lease maxima. This global
  registration freeze is required because any shard can admit a candidate
  whose region mapping intersects the incident. After those expiries plus the
  clock/safety drain, the recovery controller has the MRSC authority mark every
  such `G` shard `FENCING` and issue that transition's endpoint-bound
  source-close and destination-prepare leases. The source lease drains and
  seals the shard's registration-admission generation through the DynamoDB
  transaction's full ten-minute client-token ambiguity horizon, writes its
  unsettled/carry/closure manifests, and cannot write a destination carry
  record. Only after those source roots verify does the destination lease
  create the successor as `PREPARING`, copy/verify the G-shard scope-wide claims
  and carry manifest, and write destination carry records/pointers. The
  resulting immutable intent/cutoff manifest is unioned with every frozen MRSC
  active-token map; recovery does not rely on a scan racing independent MRSC
  writes.

  For every journal intent or frozen active token, the controller then
  converges both target items to the same terminal `ACTIVE` or
  `ABORTED`/tombstone outcome and strong-reads the pair before recording
  `REGISTRATION_RESOLVED` in that destination `PREPARING` generation. If an
  initial write was delayed, an already-created terminal tombstone defeats its
  `attribute_not_exists` condition; if an intermediate/final write races, the
  exact expected-version conditions serialize it before or after recovery and
  the reconciler re-reads until both items agree. A crash can therefore leave
  visible partial state but can never create an admitted mutable scope absent
  from the sealed intent manifest or resurrect a terminal registration.

  Recovery next strongly queries every fixed directory shard and reads each
  epoch row to select all `W`, `I`, `P`, `U`, and `G` scopes whose active,
  standby, or journal-protection region intersects the incident, unioned with
  every sealed registration intent and frozen active token. The destination
  lease writes the immutable resolved scope-set digest as
  `SCOPE_MANIFEST_FIXED` and then `GENERATION_ACCEPTED`; the authority verifies
  both endpoint barriers,
  resolution-record digest, and scope-set digest before per-scope fencing may
  use the manifest. A scope created after the restored product snapshot is
  still present. The destination `G` generation remains non-admitting until
  the overall recovery performs the normal authority `OPENING`, destination
  `PREPARING` → `OPEN`, and authority `ACTIVE`/`PROTECTED` transitions. Its
  preliminary `FENCING` update is the sole recovery epoch increment for that
  `G` scope. New scope registration/migration resumes only after every admitted
  intent is resolved, that manifest boundary is fixed, and those opening
  transitions complete.
- `recovery_operation_journal` is an Amazon DynamoDB table deployed in each
  scope's independent, residency-approved protection region, which is distinct
  from both its active and standby data-plane regions. Scope-to-protection
  mapping is deterministic: workspace and identity scopes use the third region
  in their approved residency triple; platform control uses its declared
  three-region set; public intake is assigned at the edge to an approved
  regional protection shard; and the global directory uses its separately
  approved three-region control set. The mapping does not reverse when standby
  becomes active. A request cannot change scope or journal region after
  `INTENT`.

  Each generation has one local control/sequencer item with state `PREPARING`,
  `OPEN`, `DRAINING`, or `SEALED`, its authority incarnation/epoch/generation,
  next data sequence, admission cutoff, and manifest state. An application
  append transaction contains exactly one conditional `Update` action—not a
  second `ConditionCheck` against the same item—which verifies those current
  fields and atomically advances the data sequence alongside the base/index
  writes. Before submitting it, the gateway cryptographically validates the
  **data-mutation lease**, including database/AWS time and endpoint audience.
  `INTENT` and `SEND_STARTED` require `OPEN`, the authority's current
  incarnation/epoch/generation, and an unexpired correct-data-region lease.
  The sole pre-scope exception is `REGISTRATION_INTENT`: the fixed `G`-shard
  admission endpoint requires the unexpired signed registration lease and its
  admission generation, never accepts a product mutation/effect, and otherwise
  uses the identical sequencer/base/index transaction and ambiguity rules.

  Recovery uses a separately signed **recovery-control lease set**. The MRSC
  authority issues it only while the scope is `FENCING`/`RECOVERING`, under one
  transition ID:

  - a source-close lease binds the exact source journal ARN/region, old
    generation, incident, authority incarnation/epoch, drain/reconcile/
    classify/carry-manifest/seal verbs, issue/expiry, nonce, KMS audience, and
    source gateway IAM role;
  - a destination-prepare lease binds the exact destination journal ARN/region,
    proposed generation, same transition/incident/incarnation/epoch,
    create/copy/carry/late/registration-resolve/scope-manifest/accept/open
    verbs, issue/expiry, nonce, separate KMS audience, and destination gateway
    IAM role.

  The two leases remain distinct even when source and destination are the same
  physical journal. Each gateway rejects the other endpoint/region/audience
  and every verb outside its lease. PostgreSQL/product stores, edge/trigger
  admission, credential proxy, provider egress, and ordinary journal endpoints
  reject both. Neither can create `INTENT`/`SEND_STARTED`, commit product state,
  claim a task, or send an effect. The source lease may transition the old
  generation and append a fingerprint-verified `COMMITTED`/receipt/
  reconciliation for a pre-cutoff operation, classify remaining operations,
  and write `CARRY_MANIFEST`, but it cannot write `CARRIED_FORWARD`. The
  destination lease may prepare the new generation, copy claims, and write
  `LATE_COMPLETION`,
  `CARRIED_FORWARD`, `REGISTRATION_RESOLVED`, `SCOPE_MANIFEST_FIXED`,
  `GENERATION_ACCEPTED`, and the authorized opening transition.

  Transition to `DRAINING` atomically fixes the last ordinary-admission
  sequence: only control-lease completion/reconciliation for an operation whose
  existing `INTENT` is at or below that cutoff may append. A final control
  transaction changes `DRAINING` to `SEALED` and fixes the final data sequence;
  no application, receipt, worker, retry, or later control record can alter
  that data set. `GENERATION_CLOSED` is produced from the immutable sealed set.
  A completion discovered afterward is never back-written: the control gateway
  verifies the primary fingerprint/provider receipt and represents it in the
  `PREPARING`/current generation as `LATE_COMPLETION` plus
  `CARRIED_FORWARD`, or leaves it `UNCERTAIN`. The old digest never changes.

  Each operation record uses
  `PK=SCOPE#{scopeKey}#GEN#{generation}#OP#{operationId}`. Deterministic sort
  keys are `INTENT`, `COMMITTED`, `RECONCILED`,
  `ATTEMPT#{attemptNo}#SEND_STARTED`, `ATTEMPT#{attemptNo}#SENT`,
  `ATTEMPT#{attemptNo}#RESPONSE`, and
  `ATTEMPT#{attemptNo}#RECEIPT#{receiptNo}`. Each singleton uses
  `attribute_not_exists(PK) AND attribute_not_exists(SK)`; an identical retry
  reads and validates the immutable request hash, while a conflict fails
  closed. Idempotency uniqueness deliberately omits journal generation:
  `PK=SCOPE#{scopeKey}#UNIQUE#{hashPrefix}` and
  `SK=IDEMPOTENCY#{actorClass}#{actorBindingHash}#{operation}#{keyedIdempotencyHash}`.
  The scope-wide claim record stores immutable canonical request hash, logical
  operation ID, and first generation plus conditionally monotonic current
  generation, disposition/result reference, and a retention deadline later
  than every client, provider, queue, restore, and reconciliation retry
  window. It is transactionally created with `INTENT`; every later claim-state
  transition is conditional and emits an immutable journal/audit record. A
  retry in any later generation reads the existing claim and returns or resumes
  that logical operation; it can never claim a second identity for the same
  key.

  The journal also maintains a base-table **unsettled-operation index** whose
  fixed shard count/hash is declared by the generation:
  `PK=SCOPE#{scopeKey}#GEN#{generation}#UNSETTLED#SHARD#{n}` and
  `SK=OP#{operationId}`. Its non-content pointer stores logical operation and
  keyed claim/request hashes, first `INTENT` sequence/time, latest accepted
  sequence/state, effect-certainty class, expected next evidence, and pointer
  version. The initial `INTENT` transaction creates the pointer; every
  intermediate journal-record transaction conditionally advances it; and the
  transaction that appends a provably final record deletes it. `UNCERTAIN`,
  commit-unconfirmed, receipt-missing, registration-pending, and every state
  that can still change product/effect certainty remain unsettled. A pointer
  update/delete is atomic with the immutable base record, time-index item, and
  sequencer update, so no accepted transition can outrun its pointer.

  When a generation finishes `DRAINING`, the controller waits every candidate
  token horizon, changes it to `SEALED`, strongly enumerates every fixed
  unsettled shard, dereferences each pointer's operation chain, and writes
  non-indexed per-shard plus aggregate `UNSETTLED_SEALED` manifests with
  count/root/first-latest sequence bounds. No pointer can change after
  `SEALED`. `CARRY_MANIFEST` classifies exactly that verified aggregate, and
  `GENERATION_CLOSED` binds both roots. Destination preparation creates
  `CARRIED_FORWARD` plus a destination unsettled pointer for each nonterminal
  item before acceptance. Thus an intent may begin arbitrarily before the
  restore-time guard and still be enumerated; there is no assumed maximum
  `INTENT`-to-terminal duration.

  Every data base record is atomically paired in the same
  `TransactWriteItems` call with a strongly queryable time-index item and the
  single conditional `Update` of the scope/generation control/sequencer item;
  an operation/registration record also includes its required unsettled-
  pointer create/update/delete action. The journal gateway strongly reads
  `nextDataSequence` and proposes that
  candidate. A logical append has a stable record identity, while each
  candidate has a deterministic attempt number and DynamoDB
  `ClientRequestToken = base64url(SHA-256(recordIdentity || attemptNo ||
  candidateSequence || immutableRequestHash))[0:36]`.

  An unambiguous conditional-conflict response proves that candidate did not
  commit; after a strong read confirms the logical base record is absent, the
  gateway may read the new sequence and submit the next attempt/token. An
  ambiguous timeout never advances attempts: the gateway retries only the exact
  same parameters/token and strongly reads the exact logical base/index/
  unsettled-pointer/sequencer result until it proves commit or definite
  non-commit. The online request stops after 60 seconds and returns a stable
  pending outcome, but a
  reconciler retains exclusive ownership of that candidate for DynamoDB's full
  ten-minute client-token idempotency horizon. No alternate attempt is allowed
  during that horizon. After it expires, a strong read that finds neither the
  base record nor its sequence/index effect permits the next candidate;
  otherwise the committed candidate is adopted. This yields a strictly
  increasing, gap-free `acceptanceSequence` without making concurrency
  conflicts indistinguishable from ambiguous commits, and the sequence can
  never be supplied by a caller.

  The gateway timestamps the accepted transaction from AWS Time Sync Service,
  continuously measures its error, and fails closed if absolute error exceeds
  five seconds. Caller, provider, payload, and source-region clocks are
  recorded only as non-authoritative metadata. The index is:
  `PK=SCOPE#{scopeKey}#GEN#{generation}#WINDOW#{utcHour}#SHARD#{n}` and
  `SK={zeroPaddedAcceptanceSequence}#{operationId}#{recordSortKey}`. The
  immutable generation record declares the fixed shard count/hash function,
  sequencer start, and five-second certified clock bound. Recovery queries
  every shard for every UTC hour intersecting the restore-to-cutover interval
  expanded by the clock bound, plus one complete guard hour on each side, with
  `ConsistentRead=true`. It then dereferences and hash-compares every base
  record and follows every selected operation partition through its latest
  record even when the operation began before or finishes after the wall-time
  interval. Recovery unions that time set with active/unsettled operation IDs
  in restored state **and every operation in the generation's verified
  `UNSETTLED_SEALED` manifest**, then follows each chain from its first intent
  regardless of age. This base-table index—not an eventually consistent
  GSI—plus the authoritative acceptance order and unsettled manifest makes the
  query bounded and complete despite exact-hour boundaries, clock skew, or an
  arbitrarily long-straddling operation. Missing any base record, index half,
  unsettled pointer/manifest member, declared shard, or expected sequence
  aborts the transaction or recovery, so enumeration cannot silently omit an
  accepted record.

  Only operation records, scope-wide claim transitions, and registration-
  admission records consume the data sequence and time index. Generation state
  and `WINDOW_SEALED`, `UNSETTLED_SEALED`, `CARRY_MANIFEST`,
  `GENERATION_CLOSED`, `SCOPE_MANIFEST_FIXED`, `GENERATION_ACCEPTED`,
  `LOST_SOURCE_MANIFEST`, and `LOST_SOURCE_ACCEPTED` envelopes live in the
  non-time-indexed `CONTROL` namespace under a separate monotonic control
  revision; they describe the data set and never become leaves in their own
  root.

  Each UTC-hour/shard becomes immutable after its end plus the five-second
  clock bound and the full ten-minute client-token ambiguity horizon. A sealer
  first proves no candidate capable of committing into the window remains
  unresolved, strongly enumerates it, and writes a non-indexed `WINDOW_SEALED`
  control envelope with first/last acceptance sequences, record/base-index
  counts, sorted-leaf Merkle root, and adjacent-window anchors. After admission
  closes it seals the partial final windows. The non-indexed
  `GENERATION_CLOSED` envelope stores the ordered root of all data-window
  manifests plus final data sequence; inclusion proofs bind each restore-
  window manifest to that root without a self-reference. Recovery verifies the
  complete record set/count/root for every queried guard/boundary/interior
  window, its lower/upper anchors and inclusion proof, rather than incorrectly
  comparing a window subset with a whole-generation record count. A full-
  generation audit can recompute the same root from all window manifests
  without scanning raw content.

  Before an accepted mutation or inbound event, `INTENT` records opaque
  operation/idempotency ID, scope, type, canonical request hash, source
  region/epoch/generation, authoritative acceptance sequence/time, and
  non-authoritative intended/source time. After the primary transaction
  commits, `COMMITTED` records its transaction/outbox fingerprint; no caller
  receives success until that marker is durable. Recovery treats `INTENT`
  without `COMMITTED` as unknown and verifies the primary fingerprint before
  retry or compensation. Before an external call, `SEND_STARTED` records the
  stable provider idempotency key, request hash, credential version, epoch, and
  fence. Later immutable records capture authoritative journal acceptance time
  plus provider sent/response/receipt times, certainty, and reconciliation. A
  timeout after `SEND_STARTED` is `UNCERTAIN`, not an automatic retry, unless
  the certified provider contract proves the same idempotency key safe; a safe
  retry receives a new attempt number without changing logical operation
  identity.

  A region migration, disaster recovery, or planned control-plane move uses a
  cycle-free journal-generation barrier:

  1. the MRSC authority enters `FENCING`, stops data/registration leases,
     records their maximum expiries, and issues only the transition's narrow
     source-close and destination-prepare recovery-control leases after the
     full lease/skew drain;
  2. the source-close lease changes the old generation `OPEN` → `DRAINING`,
     fixes the cutoff, resolves every candidate through its ten-minute token
     horizon, appends allowed reconciliation records, changes it to `SEALED`,
     seals data-window and unsettled manifests, classifies every member of the
     verified unsettled root in a non-indexed `CARRY_MANIFEST`, and writes
     `GENERATION_CLOSED` referencing both manifests; it writes no destination
     carry record;
  3. the destination-prepare lease creates the destination generation as
     `PREPARING`, copies/verifies scope-wide claims and the source carry
     manifest, writes each permitted `CARRIED_FORWARD`/late-completion data
     record and conditionally advances its claim, strongly verifies their
     immutable pre-open sequence prefix/digest, and writes
     `GENERATION_ACCEPTED`; it does not seal a still-open UTC window that later
     application appends will extend;
  4. the authority strongly verifies both barriers/manifests, claim and
     protection-stream lineage, then conditionally records the target active
     region/generation as `OPENING`; the destination-prepare lease changes
     `PREPARING` to `OPEN`;
  5. only after protection and reconciliation approval does the authority
     become `ACTIVE`/`PROTECTED`, revoke/expire both recovery-control leases,
     and issue data-mutation leases after `new_lease_not_before`.

  A crash at any boundary leaves no data/effect lease and resumes idempotently
  from the recorded state. The destination control credential can prepare/
  accept a generation before it is current precisely because it has no
  product-mutation authority; ordinary application append rules still require
  the current generation and a data lease. Cross-use of the source or
  destination lease is rejected even if a transition moves between journal
  tables or regions.

  The old generation writes immutable control records under
  `PK=SCOPE#{scopeKey}#GEN#{generation}#CONTROL` with sort keys
  `CLOSING#{transitionId}` and `GENERATION_CLOSED#{transitionId}`. All
  outstanding operations are reconciled or classified with exact source
  operation/request/claim hashes and disposition in
  `CARRY_MANIFEST#{transitionId}`; the seal transaction prevents every late
  old-generation append. Only the destination generation later represents a
  classified item as `CARRIED_FORWARD`.

  `GENERATION_CLOSED` fixes the final indexed timestamp, final acceptance
  sequence, inclusive last bucket/shard keys, ordered sealed-window manifest
  root of the data namespace, execution epoch, and transition ID. It is a
  non-indexed control envelope, includes the source unsettled-manifest and
  carry-manifest counts/roots, and therefore cannot alter or self-reference
  those sealed roots. If the destination uses a different journal table/region,
  the frozen handoff copies every unexpired
  scope-wide idempotency claim and retained terminal tombstone, verifies
  its count/digest, and prevents destination admission until the copy matches.
  Unsettled operations receive an explicit `CARRIED_FORWARD` record with the
  same logical operation ID/request hash and a conditional update of the
  claim's current generation; no new effect identity is created. The
  destination writes `GENERATION_ACCEPTED#{transitionId}` under the new
  generation's corresponding `CONTROL` partition with the verified source and
  claim-ledger digests, first and pre-open-last data sequences/times (or an
  explicit empty prefix), next data sequence, immutable pre-open prefix digest,
  bucket/shard contract, and target epoch. This record is also a non-indexed
  control envelope; ordinary later appends extend the data sequence/window but
  cannot change that recorded prefix. The authority executes steps 4–5 only
  after strongly reading and verifying both
  endpoint-bound immutable records, the source/destination lease identities,
  the claim-ledger copy, and their digests. The recovery window after cutover
  queries every old-generation shard through the final data sequence named by
  `GENERATION_CLOSED` and every new-generation shard beginning with the first
  data sequence—or declared next sequence for an empty prefix—named by
  `GENERATION_ACCEPTED`; it rejects a gap, overlap, missing base/index pair,
  unlinked duplicate operation identity, claim-ledger mismatch, or digest
  mismatch. The same logical operation may span generations only through the
  verified carry link. If either endpoint lease, barrier, digest, time window,
  claim copy, or journal region is unavailable, that normal source-close
  cutover remains closed and cannot fall through to a partial handoff.

  Actual loss of the protection journal uses a separate, fail-closed
  **`LOST_SOURCE_JOURNAL` reconstruction branch**; it never fabricates a source
  seal or silently treats a missing journal as empty:

  1. It is eligible only while at least one active/standby authoritative data
     plane has a verified consistent PostgreSQL state, object inventory,
     deletion/legal-hold ledger, encryption material, and durable local mirrors
     of every accepted mutation and possible external effect. The side-effect
     invariant in Section 12.4 requires a committed `external_operations` claim
     and append-only local attempt record before credential release/network I/O;
     no journal-only intent can send an effect or receive product success. For
     a `G` registration-admission journal, the independently durable mirror is
     its MRSC admission cutoff/active-token map plus directory/epoch terminal
     rows; registration can perform no product/external effect, and a token is
     not removed until its terminal journal/directory proof exists.
  2. The MRSC authority atomically enters
     `REPROTECTING/LOST_SOURCE_JOURNAL`, performs the sole epoch increment,
     stops data/registration/protection-stream leases, fixes their maximum
     expiries, closes edge/trigger/credential/network egress, and waits the full
     lease/skew drain. It records the unavailable journal ARN/region/
     generation, last verified generation/window/protection checkpoint,
     last-good time, incident, and conservative loss-interval bounds. It never
     issues a source-close lease.
  3. After the drain, the authority issues only a
     **destination-reconstruct lease** bound to the replacement journal ARN/
     region, proposed generation, transition/epoch, and exact
     reconstruct/import/uncertain/registration-resolve/manifest/accept/open
     verbs with its own KMS audience and IAM role. It has the same product-
     store, task, credential, egress, `INTENT`, and `SEND_STARTED` prohibitions
     as every recovery-control credential.
  4. The controller fixes an authoritative database snapshot/LSN and standby
     replay proof; freezes object/deletion/hold inventories; and strongly
     enumerates idempotency records, external-operation claims and attempts,
     outbox/run/audit events, inbound-event receipts, schedules, billing/usage
     dispatches, connector cursors, approvals, and queue receipts from the last
     verified protection checkpoint—or scope creation when none exists—through
     the fence. It reconciles every claimed, sending, receipt-missing, or
     uncertain provider operation over that interval. Anything not
     authoritatively safe is preserved as `UNCERTAIN` and blocks dependent work
     or egress. For `G`, it instead enumerates every frozen active token plus
     all matching directory/epoch terminal and partial rows, then terminalizes
     each known target before fixing the scope manifest.
  5. The lease creates the replacement generation as `PREPARING`, imports the
     reconstructed scope-wide idempotency claims/tombstones, and appends
     `RECONSTRUCTED_COMMITTED`, `RECONSTRUCTED_EVENT`, and
     `RECONSTRUCTED_UNCERTAIN` records with source table/row/LSN/provider
     evidence hashes. Except for `G` registrations covered by the independent
     MRSC active-token map, a pre-primary journal-only intent absent from the
     data plane has no independently observable identity or exact count. The
     reconstruction therefore records that population/count as `UNKNOWN` over
     the exact loss interval and proves only that such an intent could not be
     acknowledged, mutate primary state, or pass credential/egress controls; it
     never invents an operation row, count, root, or commit.
  6. A signed non-indexed `LOST_SOURCE_MANIFEST` records the missing source
     identity, known-good root/checkpoint, exact loss interval, fixed snapshot/
     inventory coordinates, exact counts and Merkle roots for every observable
     category, `UNKNOWN` for the unobservable non-G journal-only pre-primary
     category, the non-effect/non-acknowledgement proof, provider reconciliation
     results, unresolved set, reconstruction tool/artifact digest, approvers,
     and the explicit absence of a source seal. A separate verifier recomputes
     every observable root and verifies the declared unknown boundary; the
     destination writes `LOST_SOURCE_ACCEPTED`; neither record is presented as
     `GENERATION_CLOSED`.
  7. Encrypted WAL/PITR/object/deletion streams are seeded into the replacement
     region under a new epoch/source lineage and pass catch-up, digest, lag,
     malware, deletion/hold, and isolated-restore verification. Only then may
     the authority record `OPENING`, the destination-reconstruct lease change
     `PREPARING` → `OPEN`, and the authority record `ACTIVE`/`PROTECTED` before
     issuing a data lease.
  8. If the lost region later returns, its role, epoch, KMS audience, and
     journal generation remain fenced/read-only. It is quarantined for
     comparison with `LOST_SOURCE_MANIFEST`; its records may improve audit or
     manual reconciliation but can never overwrite or merge into the canonical
     replacement generation automatically.

  If the required authoritative data-plane snapshot, effect mirrors, deletion/
  hold state, or provider reconciliation is incomplete—or a data plane is lost
  concurrently so those proofs are unavailable—replacement is forbidden. The
  scope remains read-only/unavailable until the original journal returns or a
  separately approved compound-disaster forensic recovery proves equivalent
  evidence. The branch therefore restores protection after an isolated
  protection-region loss without weakening transactional RPO, idempotency, or
  external-effect certainty and without claiming an unknowable exact orphan-
  intent inventory. The preceding source-close requirement remains mandatory
  for every normal migration/failover and cannot be bypassed by selecting this
  branch while the source is merely slow or reachable. Branch selection is
  immutable within a transition: if a source disappears during a normal close,
  that transition is abandoned/fenced, all of its control leases expire, and a
  new epoch/transition runs the eligibility proof before any destination-
  reconstruct lease can exist.

  The table uses dedicated KMS encryption, PITR, deletion protection, TTL only
  after a generation is closed, every unsettled/claim item is accepted in its
  successor, and the registered retention/hold policy permits it, audited
  cross-region writer roles, and no raw payload. Ordinary application roles
  cannot read or write it.

### 8.8 Required index classes

- Unique tenant-aware natural keys for membership, edges, attempts, webhook
  events, source objects, ledgers, and idempotency.
- Active list indexes by `(workspace_id, state/status, updated_at desc)`.
- Assignment indexes by `(workspace_id, assignee_id, state, due_at)`.
- Scheduler indexes for ready/retry/wait expiry.
- Partial pending outbox and dead-letter indexes.
- Audit and usage indexes by tenant/time and source.
- Lexical `tsvector` indexes for authorized searchable fields.
- Vector HNSW indexes partitioned or filtered by workspace/corpus as measured.
- Relation indexes in both directions.
- No index is accepted without representative query-plan tests for its owning
  milestone.

---

## 9. Core state machines and invariants

### 9.1 Workflow definition

```text
Workflow: ACTIVE -> ARCHIVED -> ACTIVE
Draft version: EDITING -> VALIDATING -> EDITING
Draft version: EDITING -> IMMUTABLE_PUBLISHED
Published version: IMMUTABLE_PUBLISHED -> IMMUTABLE_SUPERSEDED
```

A workflow may simultaneously point to one editable draft and one current
published version. Publishing atomically creates/marks an immutable version and
moves the published pointer; it does not make the workflow object itself a
different lifecycle state. Restore creates or selects a new editable draft and
never mutates an immutable version.

### 9.2 Run

```text
QUEUED -> RUNNING
RUNNING -> WAITING | PAUSED | CANCELLING | SUCCEEDED | FAILED | TIMED_OUT
WAITING -> RUNNING | PAUSED | CANCELLING | TIMED_OUT
PAUSED -> RUNNING | CANCELLING
CANCELLING -> CANCELLED | FAILED
```

Terminal states are `SUCCEEDED`, `FAILED`, `CANCELLED`, and `TIMED_OUT`.
Terminal state never changes in place. Retry or fork is a command that creates
a new `QUEUED` child run with explicit lineage and safe-output reuse evidence;
it is not a transition of the terminal run.

### 9.3 Task run

```text
PENDING -> READY | SKIPPED | CANCELLED
READY -> RUNNING | CANCELLED
RUNNING -> WAITING | RETRY_WAIT | SUCCEEDED | FAILED | TIMED_OUT | CANCELLED
WAITING -> READY | RUNNING | FAILED | TIMED_OUT | CANCELLED
RETRY_WAIT -> READY | FAILED | CANCELLED
```

Every transition uses compare-and-set state/version and appends a run event in
the same transaction.

### 9.4 Integration

```text
DRAFT -> AUTHORIZING
AUTHORIZING -> ACTIVE | DRAFT | DISABLED
ACTIVE -> DEGRADED | REAUTHORIZATION_REQUIRED | DISABLED | DELETING
DEGRADED -> ACTIVE | REAUTHORIZATION_REQUIRED | DISABLED | DELETING
REAUTHORIZATION_REQUIRED -> AUTHORIZING | DISABLED | DELETING
DISABLED -> ACTIVE | AUTHORIZING | DELETING
ACTIVE | DEGRADED | REAUTHORIZATION_REQUIRED | DISABLED -> REVOKED
REVOKED -> AUTHORIZING | DELETING
DELETING -> DELETED
```

Sync activity is represented by durable sync jobs, not by overloading the
connection lifecycle. Resume from `DISABLED` revalidates credential, scope,
policy, and checkpoint before `ACTIVE`.

### 9.5 Approval

```text
PENDING -> IN_REVIEW
PENDING | IN_REVIEW -> APPROVED_PENDING_EXECUTION | REJECTED | REVISION_REQUESTED | EXPIRED | CANCELLED
APPROVED_PENDING_EXECUTION -> CONSUMED | REVOKED | EXPIRED
```

The payload hash validated immediately before execution must equal the approved
payload hash. `CONSUMED` is committed in the same compare-and-set transaction
that durably claims the external operation or downstream execution; a
revocation competes with that claim and can win only before any effect is sent.
Delegation and abstention are immutable step decisions, not terminal approval
states; policy evaluation determines whether another eligible reviewer remains.
`REVISION_REQUESTED` terminates that exact payload request. A revised payload
creates a linked new approval with a new hash and policy-resolution snapshot.

### 9.6 Additional durable state contracts

Every transition below names the authenticated/system actor, current version,
precondition, transaction effects, emitted event, timer behavior, and
idempotency key in code. Terminal rows never reopen in place unless explicitly
stated.

| Entity | Required states and terminal/recovery rule |
|---|---|
| Human task | `UNASSIGNED`, `ASSIGNED`, `CLAIMED`, `IN_PROGRESS`, `WAITING_CLARIFICATION`, `COMPLETED`, `CANCELLED`, `EXPIRED`; reopen creates a linked new task/output revision |
| Workflow generation | Lifecycle is `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLING`, `CANCELLED`; non-authoritative progress phase is `GENERATING`, `VALIDATING`, `REPAIRING`, or `READY_TO_ACCEPT`; terminal retry creates a linked generation |
| Sync job | `QUEUED`, `RUNNING`, `PAUSING`, `PAUSED`, `SUCCEEDED`, `PARTIAL`, `FAILED`, `CANCELLING`, `CANCELLED`; resume preserves generation/cursor fencing |
| File upload/processing | `INITIATED`, `UPLOADING`, `UPLOADED`, `QUARANTINED`, `SCANNING`, `PROCESSING`, `READY`, `REJECTED`, `FAILED`, `DELETED`; rejected/deleted content cannot reenter without a new version |
| Evaluation run | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLING`, `CANCELLED`; promotion consumes only a terminal successful immutable result |
| Export job | `QUEUED`, `COLLECTING`, `PACKAGING`, `READY`, `FAILED`, `EXPIRED`, `DELETED`; an expired download never revives |
| Deletion job | `REQUESTED`, `GRACE`, `BLOCKED_HOLD`, `RUNNING`, `PARTIAL_FAILED`, `VERIFYING`, `COMPLETED`, `CANCELLED_BEFORE_DESTRUCTION`; no cancellation after irreversible destruction begins |
| External operation | `PLANNED`, `AWAITING_APPROVAL`, `READY`, `EXECUTING`, `SUCCEEDED`, `FAILED_SAFE`, `UNCERTAIN`, `RECONCILING`, `RECONCILED_SUCCEEDED`, `RECONCILED_FAILED`; `UNCERTAIN` cannot auto-retry and each reconciled terminal stores authoritative/human evidence |
| Notification delivery | `PENDING`, `SUPPRESSED`, `SENDING`, `DELIVERED`, `RETRY_WAIT`, `FAILED`, `BOUNCED`, `COMPLAINED`; provider retries retain one logical delivery identity |
| Subscription projection | `TRIAL`, `ACTIVE`, `PAST_DUE`, `GRACE`, `UNPAID`, `PAUSED`, `CANCELLED`, `INCOMPLETE`, `ENTERPRISE_CONTRACT`; changes are projected from authoritative provider/contract events |
| Agent memory | `ACTIVE`, `SUPERSEDED`, `CORRECTED`, `DELETION_PENDING`, `DELETED`; history remains only where a run’s immutable evidence requires it and is inaccessible as current context after revocation/deletion |
| Support ticket | `OPEN`, `TRIAGED`, `WAITING_CUSTOMER`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `REOPENED`; reopening preserves the prior resolution history |
| Region migration | `PLANNED`, `VALIDATING`, `COPYING`, `CATCHING_UP`, `FROZEN`, `CUTOVER`, `VERIFYING`, `ROLLING_BACK`, `PURGING_SOURCE`, `COMPLETED`, `FAILED`; only one migration owns a workspace fence |
| Protection recovery | `PROTECTED` → `FENCING` → `REPROTECTING/SOURCE_READABLE` or `REPROTECTING/LOST_SOURCE_JOURNAL` → `OPENING` → `PROTECTED`; any failed/missing proof enters `READ_ONLY_UNPROTECTED`, only the chosen branch may issue its endpoint-bound control credential, and a transition/epoch never switches branches in place |
| Platform operator | `PROVISIONED_PENDING_APPROVAL`, `ACTIVE`, `SUSPENDED`, `DISABLED`, `OFFBOARDED`; only approved active directory subjects can create sessions, disable/offboard revokes dependent authority atomically, and rehire requires a new reviewed lifecycle version |
| Platform operator session | `ACTIVE`, `REVOKED`, `EXPIRED`; recent step-up is a bounded assurance fact, not a state that survives expiry/revocation |
| Workforce directory operation | `RECEIVED`, `APPLIED`, `NOOP_DUPLICATE`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`; one source/request ID and hash can apply at most once |
| Platform break glass | `REQUESTED`, `AWAITING_APPROVALS`, `APPROVED`, `ACTIVE`, `EXPIRED`, `REVOKED`, `REJECTED`, `REVIEW_DUE`, `REVIEWED`; activation requires two approvals plus hardware step-up, and expiry/revoke cannot reopen the grant |
| Platform access review | `PLANNED`, `OPEN`, `REMEDIATION`, `OVERDUE`, `COMPLETED`; completion requires a decision for every immutable population item and tracked remediation for every removal/change |

### 9.7 Non-negotiable invariants

1. Tenant identity is server-derived and checked on every protected resource.
2. A published workflow, agent, prompt, tool, or template version is immutable.
3. A run pins exactly one workflow version and policy snapshot.
4. A task has one current state and immutable attempt history.
5. Only legal state transitions commit.
6. A stale worker cannot commit after its fencing token expires.
7. Acknowledged mutations survive process and single-AZ failure.
8. Events and webhooks may repeat; certified idempotent/reconcilable operations
   produce one logical effect, while an uncertain non-idempotent effect is
   never automatically repeated.
9. External writes have stable operation identity and reconciliation state.
10. Approval binds to the exact operation payload and its consumable
    authorization is atomically claimed before execution.
11. Agent authority is explicitly bounded per task.
12. Connector and model credentials never enter browser code, prompts,
    artifacts, ordinary logs, or analytics.
13. Retrieval applies tenant and source permissions before model access.
14. Every generated result can identify sources, agent, prompt, model, tools,
    attempt, usage, cost, and review.
15. Usage, credit, and audit records are append-only for ordinary roles.
16. Source and tenant deletion propagates to every derived store.
17. Telemetry failure cannot fail a product transaction.
18. Restore and replay cannot silently repeat uncertain irreversible actions.
19. Operators can stop unsafe execution without deploying code.
20. A feature is not complete if its unauthorized and failure paths are not
    tested.

---

## 10. HTTP API inventory and exposure contract

Every implemented operation carries exactly one OpenAPI extension:
`x-knotline-exposure: public_anonymous | browser_internal | public_customer |
provider_callback | standards | platform_operator_auth | platform_operator`.
CI fails an unclassified operation or a namespace/exposure mismatch.

The load-balancer liveness and readiness probes at `/health` and `/ready` are
private infrastructure endpoints, not product API operations. They are omitted
from product OpenAPI documents and the exposure taxonomy, contain no tenant or
customer data, and are reachable only from the orchestrator/load-balancer
network boundary. Their response schemas and container behavior remain tested.

| Exposure | Namespace/host | Authentication | Compatibility |
|---|---|---|---|
| Public anonymous edge | App edge `/edge/v1/*` | Narrow operation-specific challenge, one-time token, state, origin, or no credential as declared; never an ambient workspace session requirement | Additive request contract for published forms/auth; aggressive abuse and privacy controls |
| Browser internal | App origin `/v1/*` | HttpOnly session + CSRF or guest session | Versioned transport, but may evolve with the same deployed web client |
| Public customer | `api.knotline.com/v1/*` (represented as `/public/v1/*` in local tests) | Scoped OAuth access token, service account, or permitted PAT | Published additive compatibility/deprecation policy and generated public OpenAPI/SDK |
| Provider callback | Dedicated edge paths `/callbacks/v1/*` | Provider signature/state plus account binding | Provider contract version; never customer token auth |
| Standards | `/scim/v2/*`, `/.well-known/*`, `/oauth/*`, `/userinfo`, `/jwks.json` | Standard-specific credential/protocol | Standards conformance plus declared profile/version |
| Platform operator auth | Isolated operator origin `/ops/edge/v1/*`, `/ops/callbacks/v1/*`, and `/ops/scim/v2/*` | Narrow workforce OIDC transaction or dedicated workforce-directory bearer as declared; no ambient workspace credential | Internal workforce identity contract; omitted from customer OpenAPI |
| Platform operator | Separate operator origin `/ops/v1/*` | Platform identity, step-up, reason/ticket, enhanced audit | Internal operator contract; completely unreachable to workspace credentials |

Sections 10.3–10.9 inventory browser-internal resource operations unless a
milestone explicitly exposes the corresponding operation through the public
customer boundary. M30 defines and tests that allowlist; the public OpenAPI
generator must never include callbacks, browser-only account administration,
guest exchange, billing-provider hooks, or operator APIs.

### 10.1 Global conventions

- Browser-internal base path is `/v1`; public-customer base path is
  `/public/v1` locally and `/v1` on `api.knotline.com`; unauthenticated
  browser/bootstrap operations use `/edge/v1`; provider traffic uses
  `/callbacks/v1`; operator pre-auth/callback/directory ingress uses only the
  isolated operator-origin namespaces declared above.
- Browser-internal and public-customer operations use JSON except declared file
  transfer and SSE. `provider_callback`, `standards`, and
  `platform_operator_auth` operations instead use an exact per-operation
  media-type allowlist: OAuth token requests may use
  `application/x-www-form-urlencoded`, SAML ACS may use the browser form POST,
  customer/workforce SCIM uses its registered JSON types, and each webhook
  uses only the provider-declared raw media type. Callback middleware retains
  the exact raw bytes required for signature/protocol verification before any
  parser runs. An undeclared or ambiguous content type is rejected with `415`.
- IDs are opaque UUIDs exposed with stable resource prefixes only when useful
  for support.
- Session-authenticated mutations require CSRF protection.
- Service credentials use `Authorization: Bearer` and never browser storage.
- Browser-provided workspace IDs are locators, not authorization proof.
- `Idempotency-Key` is required for every journal-covered customer, browser,
  public-anonymous, and platform-operator mutation, including `POST`, `PUT`,
  `PATCH`, and `DELETE`; official clients generate and durably retain it until
  the terminal response. Reuse with a different canonical request hash is a
  conflict. Provider/standards callbacks derive the same operation identity on
  every retry from the verified one-time authorization transaction, SCIM
  source/request ID, provider event/delivery ID, or certified
  endpoint/application plus signed timestamp/payload fingerprint. Internal
  schedules and workers use their deterministic logical dispatch ID. An
  operation without a stable retry identity fails before mutation.
- `If-Match` is required for mutable definitions and settings.
- Lists use cursor pagination, stable sort, `limit`, and documented filters.
- Times use RFC 3339 UTC with explicit user timezone only for presentation or
  schedule definitions.
- Asynchronous requests return `202` with a durable status resource.
- Rate-limit responses use `429` and `Retry-After`.
- Every response includes `Knotline-Request-Id`; incoming valid request IDs may
  be propagated.
- API and application logs redact authorization, cookies, OAuth codes,
  invitation tokens, magic-link tokens, secrets, sensitive query values, and
  configured customer-content fields.
- `public_anonymous` is an explicit allowlist only. WAF/rate/device/network
  abuse controls, payload/content-type/size caps, non-enumerating responses,
  CSRF/origin checks for browser form posts, consent/privacy version capture,
  and endpoint-specific retention apply before application work. These
  operations cannot accept a workspace locator as authorization.
- CI compares path prefix, `x-knotline-exposure`, authentication middleware,
  raw-body requirements, WAF/rate policy, and generated documentation; any
  inconsistent combination fails.
- Every webhook callback includes a high-entropy opaque endpoint locator that
  selects either (a) one expected tenant/integration and secret version or
  (b) one provider application/environment and its active/prior app-level
  secret versions. Mode (b) supports GitHub Apps and similar providers with
  one webhook URL per application: Knotline verifies timestamp/replay and the
  signature over exact raw bytes before parsing, then maps the now-trusted
  installation/account/tenant identifier through
  append-only `provider_installation_bindings` history. Routing selects exactly
  one binding version whose immutable provider application/environment/
  installation ownership and effective interval contain the provider-
  authenticated event sequence/time. If the provider supplies no authenticated
  ordering/time and that installation has ever been detached, suspended,
  transferred, or rebound, the callback is quarantined for provider
  reconciliation rather than routed to the current binding. A provider
  installation identity is never reassigned across Knotline workspaces:
  reconnecting elsewhere requires provider revoke/uninstall plus a new
  installation identity; provider ID reuse remains quarantined. Zero or
  multiple historical matches, wrong application/environment, disabled
  installation at event time, or account mismatch is rejected. Dedupe
  uniqueness is `(provider application, environment, authenticated
  installation/account/tenant, provider event ID)`, not merely endpoint/event
  ID. Unverified payload fields never select a secret, binding, tenant, or
  dedupe namespace. OAuth callbacks
  use one-time signed state plus an opaque authorization locator;
  codes/state/query strings are suppressed or redacted at every edge log and
  the response redirects only to a pre-registered clean application target.
  When a provider signature covers the external URL/path, verification
  reconstructs that URL only from the trusted callback-edge distribution ID,
  configured public callback origin, and extracted locator/path fields; it
  never trusts a viewer-supplied `Host`, forwarded header, or post-rewrite ALB
  path.

### 10.2 Error envelope

```json
{
  "error": {
    "code": "WORKFLOW_VALIDATION_FAILED",
    "message": "The workflow contains invalid nodes or dependencies.",
    "requestId": "req_01...",
    "details": [
      {
        "path": "nodes.research.assignment",
        "code": "AGENT_NOT_AVAILABLE",
        "message": "The selected agent is not enabled for this workspace."
      }
    ]
  }
}
```

Error codes are stable and safe for clients. Raw provider messages, stack
traces, SQL, secrets, and customer content are not returned.

### 10.3 Authentication and bootstrap API

```text
POST   /edge/v1/auth/magic-links
POST   /edge/v1/auth/magic-links/exchange
POST   /edge/v1/auth/google/authorizations
POST   /edge/v1/auth/google/exchange
GET    /edge/v1/auth/sso/discovery
POST   /edge/v1/auth/sso/:connectionId/authorizations
POST   /edge/v1/auth/sso/:connectionId/exchange
GET    /callbacks/v1/identity/oauth/:provider
POST   /callbacks/v1/identity/saml/:connectionLocator
POST   /v1/auth/sessions/refresh
POST   /v1/auth/logout
GET    /v1/auth/sessions
DELETE /v1/auth/sessions/:sessionId
POST   /v1/auth/sessions/revoke-others
GET    /v1/me/bootstrap
GET    /v1/me
PATCH  /v1/me
GET    /v1/me/preferences
PATCH  /v1/me/preferences
```

The seven `/edge/v1/auth/*` operations are `public_anonymous`; both identity
callbacks are `provider_callback`; the remaining session/profile operations
are `browser_internal`. Each Google/SSO authorization-start operation creates
the durable one-time transaction, binds it to a host-only HttpOnly
application-origin initiation cookie, and returns only an allowlisted provider
authorization URL plus expiry. It never accepts a caller-selected provider
redirect URI or arbitrary application return URL. Enterprise SAML is
SP-initiated for GA: its start response creates the exact signed AuthnRequest
and a high-entropy, one-time RelayState bound to transaction, connection,
request ID, ACS, application/environment, clean return target, and initiating
browser. Unsolicited IdP-initiated assertions are rejected rather than
silently creating a session.

A magic-link token is placed in the URL fragment of an asset-isolated,
`no-referrer` callback page, never in the query/path, and is exchanged in a
POST body before `replaceState` and a clean redirect. Google/SAML/OIDC sends
its query- or form-bearing redirect only to the isolated callback edge in
Section 18.3. That edge removes credentials before any ordinary access-log
hop. OAuth/OIDC callbacks atomically validate and consume state, nonce, PKCE,
provider/application/environment, expiry, and exact return-target ID. A SAML
POST preserves the exact body until validation and requires the configured
issuer, signature, audience, recipient, destination, assertion time/replay
window, transaction-bound RelayState, exact `InResponseTo` AuthnRequest ID,
connection, application/environment, and ACS; it rejects an absent,
unsolicited, mismatched, or already-consumed transaction.

Every external redirect URI is stable and pre-registered. The OAuth/OIDC
authorization locator exists only inside the integrity-protected `state`
contract and the callback edge's redacted internal headers; it is never a
per-login redirect-path segment. The SAML ACS path contains only the SSO
connection's stable opaque locator, allowing metadata registration and safe
connection selection. Its one-time transaction is resolved from RelayState
and `InResponseTo`, not from a dynamic ACS. The exact callback/ACS URI stored
at authorization start must byte-match the environment/client/connection
registration at consumption.

The callback does not pretend that an application-origin SameSite cookie is
available on a cross-site SAML POST. After successful protocol validation it
atomically consumes the authorization transaction and creates a separate
`identity_authorization_results` row containing no provider credential. It
redirects to the asset-isolated application callback with only that row's
high-entropy one-time result handle in the fragment. The page loads no
third-party asset, uses `Referrer-Policy: no-referrer`, and exchanges the
handle once. That exchange atomically requires the original host-only
application-origin initiation cookie, matching transaction/browser binding,
unexpired result, and exact return target before issuing/rotating a session.
It then calls `replaceState` and redirects cleanly before normal application
assets load. A handle opened in another browser, a callback completed from an
attacker-initiated flow, or a replay cannot mint a session. Browser history,
referrer, analytics, error-reporting, and every edge-log layer are tested.

`/v1/me/bootstrap` returns the user, authorized workspace summaries, active
workspace, role/permission summary, entitlements, safe feature flags,
notification counts, onboarding state, and server time. It never returns
credential material.

### 10.4 Workspace and identity administration API

```text
GET    /v1/workspaces
POST   /v1/workspaces
GET    /v1/workspaces/:workspaceId
PATCH  /v1/workspaces/:workspaceId
DELETE /v1/workspaces/:workspaceId
POST   /v1/workspaces/:workspaceId/restorations
POST   /v1/workspaces/:workspaceId/archive
POST   /v1/workspaces/:workspaceId/switch

GET    /v1/workspaces/:workspaceId/members
GET    /v1/workspaces/:workspaceId/members/:memberId
PATCH  /v1/workspaces/:workspaceId/members/:memberId
DELETE /v1/workspaces/:workspaceId/members/:memberId
POST   /v1/workspaces/:workspaceId/ownership-transfers
POST   /v1/workspaces/:workspaceId/invitations
GET    /v1/workspaces/:workspaceId/invitations
POST   /v1/invitations/:invitationId/resends
DELETE /v1/invitations/:invitationId
POST   /edge/v1/invitation-responses
POST   /edge/v1/invitation-responses/preview

GET    /v1/workspaces/:workspaceId/groups
POST   /v1/workspaces/:workspaceId/groups
PATCH  /v1/groups/:groupId
DELETE /v1/groups/:groupId
PUT    /v1/groups/:groupId/members/:userId
DELETE /v1/groups/:groupId/members/:userId
POST   /v1/workspaces/:workspaceId/organization-relationships

GET    /v1/workspaces/:workspaceId/roles
POST   /v1/workspaces/:workspaceId/roles
GET    /v1/roles/:roleId
PATCH  /v1/roles/:roleId
DELETE /v1/roles/:roleId

GET    /v1/workspaces/:workspaceId/service-principals
POST   /v1/workspaces/:workspaceId/service-principals
PATCH  /v1/service-principals/:principalId
DELETE /v1/service-principals/:principalId
GET    /v1/service-principals/:principalId/credentials
POST   /v1/service-principals/:principalId/credentials
POST   /v1/api-credentials/:credentialId/rotations
DELETE /v1/api-credentials/:credentialId

GET    /v1/me/onboarding
PUT    /v1/me/onboarding
POST   /v1/me/onboarding/sample-workspaces
DELETE /v1/me/onboarding/sample-workspaces/:sampleId

GET    /v1/workspaces/:workspaceId/sso-connections
POST   /v1/workspaces/:workspaceId/sso-connections
PATCH  /v1/sso-connections/:connectionId
POST   /v1/sso-connections/:connectionId/tests
POST   /v1/sso-connections/:connectionId/activations
POST   /v1/sso-connections/:connectionId/rotations
DELETE /v1/sso-connections/:connectionId
GET    /v1/workspaces/:workspaceId/domains
POST   /v1/workspaces/:workspaceId/domains
POST   /v1/domains/:domainId/verifications
PATCH  /v1/domains/:domainId/enforcement
DELETE /v1/domains/:domainId
GET    /v1/workspaces/:workspaceId/scim-tokens
POST   /v1/workspaces/:workspaceId/scim-tokens
POST   /v1/scim-tokens/:tokenId/rotations
DELETE /v1/scim-tokens/:tokenId
GET    /v1/workspaces/:workspaceId/provisioning-events

GET    /v1/workspaces/:workspaceId/oauth-clients
POST   /v1/workspaces/:workspaceId/oauth-clients
GET    /v1/oauth-clients/:clientId
PATCH  /v1/oauth-clients/:clientId
POST   /v1/oauth-clients/:clientId/rotations
DELETE /v1/oauth-clients/:clientId

GET    /v1/workspaces/:workspaceId/guest-invitations
POST   /v1/workspaces/:workspaceId/guest-invitations
DELETE /v1/guest-invitations/:invitationId
POST   /v1/guest-invitations/:invitationId/resends
POST   /edge/v1/guest-access/previews
POST   /edge/v1/guest-access/exchanges
GET    /v1/guest/sessions
DELETE /v1/guest/sessions/:sessionId
POST   /v1/guest/logout
```

SCIM uses the standards-compatible `/scim/v2/Users`, `/scim/v2/Groups`,
`/scim/v2/Schemas`, `/scim/v2/ResourceTypes`, `/scim/v2/ServiceProviderConfig`,
and optional `/scim/v2/Bulk` resources with the selected workspace derived from
the presented SCIM credential. OAuth customer authorization uses
`/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, and registered callback
URIs, while its administration remains under `/v1`. It also publishes
`/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`
when OIDC is enabled, `/jwks.json`, and `/userinfo`.

Access tokens have signed issuer/audience, scope/resource, client, subject,
workspace, expiry, and unique JTI claims and are checked against
grant/revocation state for sensitive operations. Refresh tokens are opaque,
hashed, one-time rotating families with reuse detection that revokes the
family. Signing keys rotate with overlap and JWKS cache safety. Authorization
codes are single-use, PKCE-bound, client/redirect/user/workspace/scope-bound,
and short-lived. ID tokens and `userinfo` expose only consented standard claims;
they are never a route to unrestricted Knotline workspace data.

### 10.5 Workflow and template API

```text
GET    /v1/workspaces/:workspaceId/workflows
POST   /v1/workspaces/:workspaceId/workflows
GET    /v1/workflows/:workflowId
PATCH  /v1/workflows/:workflowId
DELETE /v1/workflows/:workflowId
POST   /v1/workflows/:workflowId/restorations
POST   /v1/workflows/:workflowId/duplicates
POST   /v1/workspaces/:workspaceId/workflow-imports
POST   /v1/workflows/:workflowId/exports
POST   /v1/workflows/bulk-actions
POST   /v1/workflows/:workflowId/ownership-transfers
POST   /v1/workflows/:workflowId/favorites
DELETE /v1/workflows/:workflowId/favorites
POST   /v1/workflows/:workflowId/follows
DELETE /v1/workflows/:workflowId/follows

GET    /v1/workspaces/:workspaceId/workflow-folders
POST   /v1/workspaces/:workspaceId/workflow-folders
PATCH  /v1/workflow-folders/:folderId
DELETE /v1/workflow-folders/:folderId
GET    /v1/workspaces/:workspaceId/workflow-tags
POST   /v1/workspaces/:workspaceId/workflow-tags
PATCH  /v1/workflow-tags/:tagId
DELETE /v1/workflow-tags/:tagId

GET    /v1/resources/:resourceType/:resourceId/thread
POST   /v1/resources/:resourceType/:resourceId/comments

GET    /v1/workflows/:workflowId/draft
PUT    /v1/workflows/:workflowId/draft
PUT    /v1/workflows/:workflowId/draft/nodes/:nodeKey
DELETE /v1/workflows/:workflowId/draft/nodes/:nodeKey
POST   /v1/workflows/:workflowId/draft/nodes/:nodeKey/duplicates
POST   /v1/workflows/:workflowId/draft/nodes/:nodeKey/splits
PUT    /v1/workflows/:workflowId/draft/edges/:edgeKey
DELETE /v1/workflows/:workflowId/draft/edges/:edgeKey
POST   /v1/workflows/:workflowId/draft/operations
POST   /v1/workflows/:workflowId/draft/layouts
POST   /v1/workflows/:workflowId/draft/validations
POST   /v1/workflows/:workflowId/draft/dry-runs
POST   /v1/workflows/:workflowId/draft/publications

GET    /v1/workflows/:workflowId/versions
GET    /v1/workflows/:workflowId/versions/:version
GET    /v1/workflows/:workflowId/version-diffs
POST   /v1/workflows/:workflowId/drafts-from-version

GET    /v1/workflows/:workflowId/triggers
POST   /v1/workflows/:workflowId/triggers
PATCH  /v1/workflow-triggers/:triggerId
POST   /v1/workflow-triggers/:triggerId/enables
POST   /v1/workflow-triggers/:triggerId/disables
POST   /v1/workflow-triggers/:triggerId/secret-rotations
GET    /v1/workflow-triggers/:triggerId/deliveries
POST   /v1/workflow-triggers/:triggerId/test-events
DELETE /v1/workflow-triggers/:triggerId

GET    /v1/templates
POST   /v1/workspaces/:workspaceId/templates
GET    /v1/templates/:templateId
PATCH  /v1/templates/:templateId
POST   /v1/templates/:templateId/publications
POST   /v1/templates/:templateId/instantiations
DELETE /v1/templates/:templateId

POST   /v1/workspaces/:workspaceId/workflow-generations
GET    /v1/workflow-generations/:generationId
POST   /v1/workflow-generations/:generationId/cancellations
POST   /v1/workflow-generations/:generationId/acceptances
POST   /v1/workflow-import-previews
POST   /v1/workflow-dry-runs
```

### 10.6 Run, task, and approval API

```text
GET    /v1/workflows/:workflowId/runs
POST   /v1/workflows/:workflowId/runs
GET    /v1/runs/:runId
GET    /v1/runs/:runId/events
GET    /v1/runs/:runId/stream
POST   /v1/runs/:runId/pauses
POST   /v1/runs/:runId/resumptions
POST   /v1/runs/:runId/cancellations
POST   /v1/runs/:runId/retries
POST   /v1/runs/:runId/forks
POST   /v1/runs/:runId/exports
POST   /v1/runs/:runId/follows
DELETE /v1/runs/:runId/follows

GET    /v1/workspaces/:workspaceId/task-queues
POST   /v1/workspaces/:workspaceId/task-queues
GET    /v1/task-queues/:queueId
PATCH  /v1/task-queues/:queueId
DELETE /v1/task-queues/:queueId
PUT    /v1/task-queues/:queueId/members/:principalId
DELETE /v1/task-queues/:queueId/members/:principalId
PUT    /v1/task-queues/:queueId/routing-policy
POST   /v1/task-queues/:queueId/routing-simulations

GET    /v1/workspaces/:workspaceId/task-templates
POST   /v1/workspaces/:workspaceId/task-templates
GET    /v1/task-templates/:templateId
PATCH  /v1/task-templates/:templateId
POST   /v1/task-templates/:templateId/versions
POST   /v1/task-templates/:templateId/publications
POST   /v1/task-templates/:templateId/previews
DELETE /v1/task-templates/:templateId

GET    /v1/task-runs
GET    /v1/task-runs/:taskRunId
PUT    /v1/task-runs/:taskRunId/draft
GET    /v1/task-runs/:taskRunId/attempts
GET    /v1/task-runs/:taskRunId/attempts/:attempt
POST   /v1/task-runs/:taskRunId/claims
POST   /v1/task-runs/:taskRunId/reassignments
POST   /v1/task-runs/:taskRunId/delegations
POST   /v1/task-runs/:taskRunId/submissions
POST   /v1/task-runs/:taskRunId/clarification-requests
POST   /v1/task-runs/:taskRunId/reopenings
POST   /v1/task-runs/bulk-actions
POST   /v1/task-runs/:taskRunId/unclaims
POST   /v1/task-runs/:taskRunId/returns-to-queue
POST   /v1/task-runs/:taskRunId/watches
DELETE /v1/task-runs/:taskRunId/watches

GET    /v1/task-runs/:taskRunId/comments
POST   /v1/task-runs/:taskRunId/comments
PATCH  /v1/comments/:commentId
DELETE /v1/comments/:commentId
POST   /v1/comments/:commentId/reactions
DELETE /v1/comments/:commentId/reactions/:reaction

GET    /v1/task-runs/:taskRunId/artifacts
POST   /v1/task-runs/:taskRunId/artifact-uploads
POST   /v1/artifact-uploads/:uploadId/completions
GET    /v1/artifacts/:artifactId/download
DELETE /v1/artifacts/:artifactId

GET    /v1/approvals
GET    /v1/approvals/:approvalId
POST   /v1/approvals/:approvalId/decisions
POST   /v1/approvals/:approvalId/delegations
POST   /v1/approvals/:approvalId/reminders
POST   /v1/approvals/:approvalId/revocations

POST   /callbacks/v1/workflow-triggers/:endpointKey
```

The incoming trigger endpoint authenticates the raw request with its configured
signature or secret, records replay/deduplication state before asynchronous
processing, and never uses `endpointKey` alone as authorization.

### 10.7 Agent, model, tool, and evaluation API

```text
GET    /v1/workspaces/:workspaceId/agents
POST   /v1/workspaces/:workspaceId/agents
GET    /v1/agents/:agentId
PATCH  /v1/agents/:agentId
GET    /v1/agents/:agentId/versions
POST   /v1/agents/:agentId/versions
GET    /v1/agents/:agentId/versions/:version
POST   /v1/agents/:agentId/versions/:version/validations
POST   /v1/agents/:agentId/versions/:version/evaluation-runs
POST   /v1/agents/:agentId/versions/:version/releases
POST   /v1/agents/:agentId/disables
POST   /v1/agents/:agentId/enables
DELETE /v1/agents/:agentId
GET    /v1/agents/:agentId/memory-policy
PUT    /v1/agents/:agentId/memory-policy

GET    /v1/me/memory-records
GET    /v1/me/memory-records/:memoryId
POST   /v1/me/memory-records/:memoryId/corrections
DELETE /v1/me/memory-records/:memoryId
POST   /v1/me/memory-exports
GET    /v1/workspaces/:workspaceId/memory-records
POST   /v1/memory-records/:memoryId/corrections
DELETE /v1/memory-records/:memoryId

GET    /v1/workspaces/:workspaceId/model-policies
POST   /v1/workspaces/:workspaceId/model-policies
GET    /v1/model-policies/:policyId
PATCH  /v1/model-policies/:policyId
GET    /v1/workspaces/:workspaceId/models

GET    /v1/workspaces/:workspaceId/tools
POST   /v1/workspaces/:workspaceId/tools
GET    /v1/tools/:toolId
GET    /v1/tools/:toolId/versions
POST   /v1/tools/:toolId/versions
POST   /v1/tools/:toolId/disables
POST   /v1/tools/:toolId/enables

GET    /v1/workspaces/:workspaceId/eval-datasets
POST   /v1/workspaces/:workspaceId/eval-datasets
GET    /v1/eval-datasets/:datasetId
POST   /v1/eval-datasets/:datasetId/versions
POST   /v1/eval-datasets/:datasetId/cases
PATCH  /v1/eval-cases/:caseId
DELETE /v1/eval-cases/:caseId
GET    /v1/eval-runs/:evalRunId
GET    /v1/eval-runs/:evalRunId/results
POST   /v1/eval-runs/:evalRunId/cancellations
GET    /v1/eval-comparisons
```

### 10.8 Knowledge and connection API

```text
GET    /v1/workspaces/:workspaceId/connections
POST   /v1/workspaces/:workspaceId/connection-authorizations
GET    /v1/connection-authorizations/:authorizationId
GET    /callbacks/v1/connections/oauth/:provider
GET    /v1/connections/:connectionId
PATCH  /v1/connections/:connectionId
POST   /v1/connections/:connectionId/syncs
GET    /v1/connections/:connectionId/syncs
GET    /v1/connections/:connectionId/syncs/:syncId
POST   /v1/connections/:connectionId/pauses
POST   /v1/connections/:connectionId/resumptions
POST   /v1/connections/:connectionId/reauthorizations
POST   /v1/connections/:connectionId/reconciliations
DELETE /v1/connections/:connectionId
POST   /callbacks/v1/provider-webhooks/:provider/:endpointLocator

GET    /v1/workspaces/:workspaceId/documents
POST   /v1/workspaces/:workspaceId/file-uploads
POST   /v1/file-uploads/:uploadId/completions
GET    /v1/documents/:documentId
GET    /v1/documents/:documentId/versions
GET    /v1/documents/:documentId/citations
POST   /v1/documents/:documentId/reprocessings
DELETE /v1/documents/:documentId
POST   /v1/workspaces/:workspaceId/search
POST   /v1/workspaces/:workspaceId/retrieval-debug

GET    /v1/workspaces/:workspaceId/entities
GET    /v1/entities/:entityId
PATCH  /v1/entities/:entityId
GET    /v1/entities/:entityId/relations
POST   /v1/entities/:entityId/merges
POST   /v1/entities/:entityId/splits
```

Connector authorization start is a server-generated contract, not a generic
OAuth redirect helper. It binds one draft integration, connector manifest and
version, provider, exact environment-specific client application ID and
configuration version, exact registered callback URI, initiating session and
browser nonce, requested scopes, workspace, and clean return target. Callback
consumption revalidates every binding, stores the actual granted-scope
snapshot, and rejects a different application/environment, manifest, redirect,
session, workspace, or concurrent/replayed flow before any credential becomes
active. Its callback URI is the provider/client's stable pre-registered URI;
the one-time authorization locator is carried only inside signed `state` and
the callback edge's sanitized internal handoff, never in a dynamic redirect
path.

### 10.9 Billing, reporting, notifications, and governance API

```text
GET    /v1/workspaces/:workspaceId/plans
POST   /v1/workspaces/:workspaceId/checkout-sessions
POST   /v1/workspaces/:workspaceId/billing-portal-sessions
GET    /v1/workspaces/:workspaceId/subscription
GET    /v1/workspaces/:workspaceId/invoices
GET    /v1/workspaces/:workspaceId/usage
GET    /v1/workspaces/:workspaceId/usage/forecast
GET    /v1/workspaces/:workspaceId/budgets
POST   /v1/workspaces/:workspaceId/budgets
GET    /v1/budgets/:budgetId
PATCH  /v1/budgets/:budgetId
POST   /v1/budgets/:budgetId/thresholds
PATCH  /v1/budget-thresholds/:thresholdId
DELETE /v1/budget-thresholds/:thresholdId
POST   /v1/workspaces/:workspaceId/spend-stops
POST   /v1/workspaces/:workspaceId/spend-resumptions
POST   /callbacks/v1/billing/stripe/:endpointLocator

GET    /v1/me/notifications
POST   /v1/me/notifications/:notificationId/read
POST   /v1/me/notifications/read-all
GET    /v1/me/notification-preferences
PATCH  /v1/me/notification-preferences
GET    /v1/workspaces/:workspaceId/notification-preferences
PATCH  /v1/workspaces/:workspaceId/notification-preferences
GET    /v1/me/push-subscriptions
POST   /v1/me/push-subscriptions
DELETE /v1/me/push-subscriptions/:subscriptionId
GET    /v1/me/offline-devices
POST   /v1/me/offline-devices/:deviceId/activations
POST   /v1/me/offline-devices/:deviceId/key-leases
DELETE /v1/me/offline-devices/:deviceId

GET    /v1/workspaces/:workspaceId/saved-views
POST   /v1/workspaces/:workspaceId/saved-views
PATCH  /v1/saved-views/:viewId
DELETE /v1/saved-views/:viewId
GET    /v1/workspaces/:workspaceId/analytics
GET    /v1/workspaces/:workspaceId/reports
POST   /v1/workspaces/:workspaceId/reports
GET    /v1/reports/:reportId
POST   /v1/reports/:reportId/exports
POST   /v1/reports/:reportId/schedules
PATCH  /v1/report-schedules/:scheduleId
DELETE /v1/report-schedules/:scheduleId

GET    /v1/workspaces/:workspaceId/audit-events
POST   /v1/workspaces/:workspaceId/audit-exports
GET    /v1/audit-exports/:exportId
POST   /v1/workspaces/:workspaceId/data-exports
GET    /v1/data-exports/:exportId
POST   /v1/me/data-exports
POST   /v1/me/deletion-requests
POST   /v1/workspaces/:workspaceId/deletion-requests
GET    /v1/deletion-requests/:requestId

GET    /v1/workspaces/:workspaceId/retention-policies
PUT    /v1/workspaces/:workspaceId/retention-policies
GET    /v1/workspaces/:workspaceId/legal-holds
POST   /v1/workspaces/:workspaceId/legal-holds
POST   /v1/legal-holds/:holdId/releases
GET    /v1/workspaces/:workspaceId/data-policies
PUT    /v1/workspaces/:workspaceId/data-policies
POST   /v1/workspaces/:workspaceId/region-migrations
GET    /v1/region-migrations/:migrationId

GET    /v1/workspaces/:workspaceId/support-access
POST   /v1/workspaces/:workspaceId/support-access
DELETE /v1/support-access/:grantId

GET    /v1/support-tickets
POST   /v1/support-tickets
GET    /v1/support-tickets/:ticketId
POST   /v1/support-tickets/:ticketId/messages
POST   /v1/support-tickets/:ticketId/diagnostic-bundles
POST   /v1/diagnostic-bundles/:bundleId/consents
GET    /v1/diagnostic-bundles/:bundleId/download
POST   /v1/feedback-reports
POST   /edge/v1/contact-requests

GET    /v1/workspaces/:workspaceId/outgoing-webhooks
POST   /v1/workspaces/:workspaceId/outgoing-webhooks
PATCH  /v1/outgoing-webhooks/:webhookId
DELETE /v1/outgoing-webhooks/:webhookId
GET    /v1/outgoing-webhooks/:webhookId/deliveries
POST   /v1/webhook-deliveries/:deliveryId/replays
```

### 10.10 Platform operator API

```text
POST   /ops/edge/v1/auth/oidc/authorizations
GET    /ops/callbacks/v1/auth/oidc
POST   /ops/edge/v1/auth/oidc/exchange
POST   /ops/v1/auth/step-up/authorizations
POST   /ops/v1/auth/step-up/exchange
POST   /ops/v1/auth/sessions/refresh
POST   /ops/v1/auth/logout
GET    /ops/v1/auth/sessions
DELETE /ops/v1/auth/sessions/:sessionId
GET    /ops/v1/me/bootstrap

GET    /ops/scim/v2/ServiceProviderConfig
GET    /ops/scim/v2/Schemas
GET    /ops/scim/v2/ResourceTypes
GET    /ops/scim/v2/Users
POST   /ops/scim/v2/Users
GET    /ops/scim/v2/Users/:scimId
PUT    /ops/scim/v2/Users/:scimId
PATCH  /ops/scim/v2/Users/:scimId
GET    /ops/scim/v2/Groups
POST   /ops/scim/v2/Groups
GET    /ops/scim/v2/Groups/:scimId
PUT    /ops/scim/v2/Groups/:scimId
PATCH  /ops/scim/v2/Groups/:scimId

GET    /ops/v1/operators
GET    /ops/v1/operators/:operatorId
POST   /ops/v1/operators/:operatorId/role-bindings
DELETE /ops/v1/operator-role-bindings/:bindingId
POST   /ops/v1/operators/:operatorId/disables
POST   /ops/v1/operators/:operatorId/offboardings
GET    /ops/v1/workforce-directory/operations
POST   /ops/v1/workforce-directory/reconciliations

GET    /ops/v1/break-glass-requests
POST   /ops/v1/break-glass-requests
GET    /ops/v1/break-glass-requests/:requestId
POST   /ops/v1/break-glass-requests/:requestId/approvals
POST   /ops/v1/break-glass-requests/:requestId/activations
POST   /ops/v1/break-glass-grants/:grantId/revocations
POST   /ops/v1/break-glass-grants/:grantId/reviews

GET    /ops/v1/health
GET    /ops/v1/incidents
POST   /ops/v1/incidents
PATCH  /ops/v1/incidents/:incidentId
POST   /ops/v1/incidents/:incidentId/status-updates
POST   /ops/v1/incidents/:incidentId/resolutions

GET    /ops/v1/support-tickets
POST   /ops/v1/support-tickets/:ticketId/assignments
POST   /ops/v1/support-tickets/:ticketId/status-changes
POST   /ops/v1/support-tickets/:ticketId/messages

GET    /ops/v1/workspaces/:workspaceId/safe-summary
POST   /ops/v1/workspaces/:workspaceId/support-access-requests
POST   /ops/v1/workspaces/:workspaceId/throttles
DELETE /ops/v1/workspaces/:workspaceId/throttles/:throttleId

GET    /ops/v1/runtime/queues
GET    /ops/v1/runtime/dead-letter-items
POST   /ops/v1/runtime/dead-letter-items/:itemId/repair-previews
POST   /ops/v1/runtime/dead-letter-items/:itemId/repairs
GET    /ops/v1/runtime/reconcilers
POST   /ops/v1/runtime/reconcilers/:reconcilerId/runs

GET    /ops/v1/providers
POST   /ops/v1/kill-switches
DELETE /ops/v1/kill-switches/:switchId
POST   /ops/v1/workspaces/:workspaceId/usage-adjustment-previews
POST   /ops/v1/workspaces/:workspaceId/usage-adjustment-requests
POST   /ops/v1/usage-adjustment-requests/:requestId/approvals
POST   /ops/v1/usage-adjustment-requests/:requestId/commits
GET    /ops/v1/deployments
GET    /ops/v1/migrations
POST   /ops/v1/deployments/:deploymentId/rollbacks
GET    /ops/v1/privacy-cases
GET    /ops/v1/access-reviews
POST   /ops/v1/access-reviews
GET    /ops/v1/access-reviews/:reviewId
POST   /ops/v1/access-reviews/:reviewId/item-decisions
POST   /ops/v1/access-reviews/:reviewId/completions
```

The three `/ops/edge/v1/auth/*` and `/ops/callbacks/v1/auth/*` operations plus
the workforce `/ops/scim/v2/*` service-provider surface are
`platform_operator_auth`; every `/ops/v1/*` operation is
`platform_operator`. OIDC login and step-up use separate durable platform
authorization/result tables, a stable pre-registered callback URI, signed
state, nonce, S256 PKCE, host-only initiation binding, one-time fragment result
exchange, and the same no-referrer/clean-URL rules as Section 10.3. A step-up
transaction additionally binds the current platform session, requested
action/resource/environment, required assurance, and clean return target; its
result updates only that session's recent-auth context.

The workforce SCIM credential is dedicated to one configured directory source,
stored as a rotated verifier/secret reference, IP/mTLS constrained where the
IdP supports it, and unable to call any other operator API. SCIM changes are
idempotent receipts, not role grants: directory groups may supply review
context, but a platform role binding still requires the explicit approved
operator operation above. Reconciliation compares a signed/versioned
directory snapshot or provider cursor with local operators and fail-closed
offboards a missing/disabled subject according to the reviewed lifecycle
policy.

The operator identity plane is deliberately separate:

- `ops.knotline.com` has a distinct CloudFront/ALB origin, CORS and CSP
  allowlist, CSRF origin, host-only cookie name, session store, signing keys,
  audience, and deployment role. It never accepts a workspace session, guest
  session, customer OAuth/PAT, service principal, workspace SSO assertion, or
  cookie scoped to another Knotline origin.
- Knotline integrates only the allowlisted organization workforce IdP through
  OIDC authorization code plus S256 PKCE. Upstream federation may occur inside
  that IdP, but there is no local password, magic-link, social login, or
  just-in-time operator creation. The exact issuer/tenant, client,
  redirect URI, subject, audience, nonce, state, authentication methods, and
  assurance context are validated.
- Workforce-directory/SCIM provisioning creates an operator only after the
  employment/contract record and manager/system-owner approval are active.
  Disable/offboarding is a fail-closed transaction that disables the operator,
  revokes every session, role and break-glass grant, ends active support access,
  removes on-call eligibility, and emits security/audit events. A scheduled
  reconciler detects missed directory changes; quarterly access review and
  manager recertification detect stale privileges.
- Interactive login requires a phishing-resistant WebAuthn/FIDO2 or
  hardware-bound passkey assurance claim. Tenant-affecting repair, release,
  privacy, security, kill-switch, finance-adjustment, and support-access use
  requires a fresh platform step-up no older than 15 minutes; break glass
  requires a fresh hardware assertion no older than 5 minutes. Session
  rotation/reuse detection, absolute/idle expiry, device inventory, revoke,
  and concurrent-session policy are independent of customer sessions.
- Fixed least-privilege roles are `incident_commander`, `runtime_operator`,
  `support_operator`, `security_operator`, `privacy_operator`,
  `release_operator`, `finance_operator`, and read-only `platform_auditor`.
  Environment and duty scopes narrow each binding. Requester/approver,
  deployer/release approver, adjustment requester/financial approver, support
  operator/customer-access approver, and break-glass requester/approver duties
  are separated; customer-created roles and wildcards cannot enter this plane.
- Break glass has no standing membership. An incident commander requests an
  exact action/resource/environment scope against an active incident/change
  ticket; two distinct authorized approvers, a hardware step-up, and a maximum
  30-minute grant are required. Use is visibly bannered, session-recorded,
  immutable-audited, immediately revocable, alerts security leadership, and
  requires a distinct post-use review by the next business day. The only
  offline emergency path uses pre-registered hardware identities and the same
  dual control/evidence model.

The fixed role maximums are:

| Platform role | Maximum ordinary authority |
|---|---|
| `incident_commander` | Incident declaration/coordination, status communication, scoped containment and break-glass request; cannot approve its own emergency grant |
| `runtime_operator` | Health, queues, stuck work, repair preview/commit, reconciler and workspace throttle within assigned environment; no release, privacy, security-policy, support-content, or finance authority |
| `support_operator` | Support queue, safe workspace summary, customer-visible message, and support-access request/use only within an active grant; no runtime repair or customer role change |
| `security_operator` | Operator lifecycle, role binding, access review, risk/credential/kill controls, and independent break-glass approval; cannot approve its own binding/grant or act as finance/privacy owner |
| `privacy_operator` | Privacy/export/delete/hold/residency case operation with legal/support-access constraints; no general content browse, runtime repair, or release |
| `release_operator` | Signed artifact, deployment, migration, canary, rollback, and release evidence for assigned environment; cannot approve its own production promotion |
| `finance_operator` | Usage-adjustment preview/request/independent approval/commit and reconciliation evidence; no payment-card data or non-finance tenant access |
| `platform_auditor` | Read-only enhanced audit, access-review evidence, deployment/incident evidence, and safe metadata; no mutation or customer content |

Every operator endpoint additionally requires its named role, effective duty
scope, reason/ticket where the action affects a tenant,
preview/confirmation for repair or control changes, and immutable enhanced
audit. Customer content also requires a currently effective
`support_access_grant`; operator identity alone never grants content access.
Ordinary workspace credentials receive the same non-enumerating denial at the
edge and application layers.

Usage adjustments are platform-finance operations, not workspace
administration. The preview fixes exact quantities, units, currencies,
price/FX versions, source/evidence, financial impact, reason, ticket, and
payload hash. A request consumes that preview; policy requires a distinct
`finance_operator` approver above the configured value/risk threshold and may
require dual control for any invoice-affecting adjustment. Commit requires
fresh step-up, exact preview hash, unexpired approval, and an idempotency key,
then appends—not edits—ledger rows and enhanced audit in one transaction.
Workspace billing administrators can view the resulting adjustment through
ordinary usage APIs but cannot create, approve, or commit one.

### 10.11 API idempotency algorithm

An idempotency claim's **uniqueness key** is:

```text
scope_class: W | I | P | U | G
opaque_scope_key
actor_class
keyed_actor_binding_hash
operation
idempotency_key
```

`canonical_request_hash` is immutable compared data stored on that one claim;
it is deliberately not part of the uniqueness key. Therefore the same
scope/actor/operation/key with a different request collides with the existing
claim and returns `409`, rather than creating a second claim.

The scope and actor binding are server-derived, never caller-selected.
`actor_class` is one of authenticated user/session, guest grant, service
principal/OAuth client, workforce principal, provider application/event,
standards client, internal schedule/worker, or anonymous edge transaction. The
binding is the keyed hash of the relevant immutable principal/session/grant/
client/event identity. A `public_anonymous` operation uses an edge-issued,
origin/challenge-bound transaction namespace (and, where required, a keyed
normalized contact/auth target) rather than inventing an authenticated
principal; its deterministic `U`, `I`, or `G` scope is selected by the server's
regional/routing policy. This prevents two anonymous callers who happen to
choose the same literal key from sharing a claim while still making one
caller's retry stable. Provider callbacks bind the verified application plus
delivery/event identity; unverified payload data cannot define either field.

The first request atomically claims the key. An identical retry receives the
original current or final result. Reuse with a different request hash returns
`409 IDEMPOTENCY_KEY_REUSED`. The record lives longer than all browser, queue,
provider, regional-recovery, and generation-handoff retry windows. The claim is
scope-wide across journal generations; a generation transition copies/verifies
the claim ledger when its recovery table changes and never allocates a new
logical operation for an existing claim. Provider-native idempotency keys
derive from the Knotline logical operation ID.

---

## 11. Event and real-time contracts

### 11.1 Internal event envelope

```json
{
  "eventId": "evt_01...",
  "eventType": "task_run.succeeded",
  "eventVersion": 1,
  "occurredAt": "2026-07-31T12:00:00Z",
  "workspaceId": "ws_01...",
  "aggregateType": "task_run",
  "aggregateId": "task_01...",
  "aggregateVersion": 7,
  "correlationId": "run_01...",
  "causationId": "attempt_01...",
  "actor": {
    "type": "agent",
    "id": "agent_version_01..."
  },
  "trace": {
    "traceparent": "00-..."
  },
  "data": {}
}
```

Rules:

- Event IDs remain stable across redelivery.
- Consumers ignore unknown additive fields.
- Breaking meaning requires a new `eventVersion`.
- Queue bodies exclude secrets and raw customer document text.
- Large or sensitive payloads are object references with content hash,
  classification, and authorization metadata.
- Every consumer deduplicates by event ID and records a receipt.
- Projection consumers compare `aggregateVersion` and never overwrite a newer
  projection with an older delivery. A same-aggregate gap triggers ordered
  replay/rebuild rather than speculative application.
- A consumer commits its receipt and database projection effects in one
  transaction. A consumer that will cause an external effect first claims a
  stable `external_operations` journal row; it marks the receipt complete only
  after durable intent exists, never merely after an in-memory call.
- Publication after database commit uses the transactional outbox.
- Event replay is operator-authorized, scoped, audited, and safe under duplicate
  delivery.

### 11.2 Required domain event families

```text
identity.user_created
identity.authorization_started
identity.authorization_consumed
identity.authorization_failed
identity.session_created
identity.session_revoked
workspace.created
workspace.member_joined
workspace.member_suspended
workspace.role_changed
workspace.invitation_changed
workspace.group_changed
identity.sso_configuration_changed
identity.scim_principal_changed
guest.invitation_changed
guest.access_used

workflow.created
workflow.draft_changed
workflow.validation_completed
workflow.published
workflow.archived
workflow.trigger_fired
workflow.generation_completed
workflow.comment_changed
resource.follow_changed

run.queued
run.started
run.waiting
run.paused
run.resumed
run.cancellation_requested
run.cancelled
run.succeeded
run.failed
run.timed_out

task_run.ready
task_run.started
task_run.waiting
task_run.retry_scheduled
task_run.succeeded
task_run.failed
task_run.cancelled
task_run.timed_out

human_task.assigned
human_task.claimed
human_task.submitted
human_task.reassigned
human_task.sla_changed
human_task.queue_changed
human_task.template_published
approval.requested
approval.delegated
approval.abstained
approval.decided
approval.revision_requested
approval.expired

agent.invocation_started
agent.invocation_completed
agent.invocation_failed
tool.approval_requested
tool.invocation_started
tool.invocation_completed
tool.invocation_failed
agent.release_promoted
agent.release_rolled_back
agent.evaluation_completed
memory.record_written
memory.record_corrected
memory.record_deleted
file.upload_completed
file.scan_completed
file.processing_completed
file.deleted

connection.authorized
connection.auth_expired
connection.degraded
connection.disabled
connection.resumed
connection.sync_started
connection.sync_completed
connection.sync_failed
connection.removed
connection.webhook_received
external_operation.planned
external_operation.claimed
external_operation.send_started
external_operation.sent
external_operation.succeeded
external_operation.failed_safe
external_operation.uncertain
external_operation.reconciled
source_object.changed
source_object.deleted
document.indexed
document.index_failed
knowledge.acl_changed
knowledge.acl_projection_advanced
knowledge.entity_changed
knowledge.reindex_completed
client.offline_key_revoked
client.cache_purge_requested
client.cache_purge_completed

billing.subscription_changed
billing.payment_failed
billing.invoice_changed
billing.budget_policy_changed
billing.budget_threshold_crossed
usage.reservation_created
usage.reservation_renewed
usage.reservation_finalized
usage.reservation_released
usage.recorded
usage.debt_recorded
usage.debt_reconciled
usage.adjusted
spend_control.changed
entitlement.changed
notification.requested
notification.delivered
notification.failed
report.ready
report.delivery_failed

audit.export_ready
data.export_ready
data.deletion_started
data.deletion_completed
data.retention_policy_changed
data.legal_hold_changed
data.region_migration_changed
support.access_changed
support.ticket_changed
support.diagnostic_bundle_ready
public.contact_received
public.contact_routed
security.kill_switch_changed
platform.operator_provisioned
platform.operator_disabled
platform.operator_offboarded
platform.operator_role_binding_changed
platform.operator_session_created
platform.operator_session_revoked
platform.operator_step_up_completed
platform.workforce_directory_reconciled
platform.break_glass_changed
platform.access_review_changed
```

### 11.3 SSE contract

`GET /v1/runs/:runId/stream`:

- authenticates the session and run authorization;
- accepts `Last-Event-ID`;
- emits committed `run_events` in increasing sequence;
- sends a heartbeat at a bounded interval;
- rechecks session and workspace access during long connections;
- closes before infrastructure idle limits and reconnects with jitter;
- includes event type, sequence, occurrence time, and safe summary;
- uses a bounded per-connection buffer and forces resume from durable history on
  slow-client overflow;
- never treats the connection as the source of truth.

Polling fallback uses `GET /v1/runs/:runId/events?after={sequence}` plus ETag and
adaptive backoff.

### 11.4 Outgoing webhook contract

Outgoing webhooks use:

- HTTPS only;
- tenant-owned allowlisted endpoint;
- brokered egress with public-IP-only resolution; private, loopback, link-local,
  multicast, metadata, and unsupported ports/protocols are blocked;
- DNS is resolved and validated at registration and every delivery, all
  redirects are revalidated and bounded, Host/SNI/certificate identity must
  match policy, and DNS-rebinding responses are rejected;
- HMAC SHA-256 signature over timestamp, delivery ID, and raw body;
- stable event/delivery IDs;
- five-minute default replay window;
- exponential retry with jitter and terminal delivery log;
- manual replay using the same event ID and a new delivery attempt ID;
- no secret or sensitive content unless the endpoint’s selected event contract
  explicitly allows and the workspace policy permits it.

---

## 12. Workflow execution semantics

### 12.1 Start transaction

Starting a run atomically:

1. verifies principal, workspace, workflow status, published version, trigger,
   entitlements, and budgets;
2. claims the idempotency key;
3. stores canonical validated inputs;
4. creates the run pinned to definition and policy snapshots;
5. creates task runs and dependency rows;
6. reserves configured usage;
7. appends `run.queued`, audit metadata, and outbox event;
8. commits;
9. an idempotent starter starts the deterministic Temporal workflow ID
   `knotline/run/{runId}`.

A reconciler detects a committed run whose orchestration start was not
acknowledged and repeats the idempotent start.

### 12.2 Dependency evaluation

- A node becomes ready only when every required incoming dependency resolves.
- Conditions evaluate against immutable upstream outputs using a restricted,
  versioned expression language.
- Join modes are `all`, `any`, `quorum`, or explicit expression.
- A false conditional path records `SKIPPED`, not silent absence.
- Failure policies are `fail_run`, `continue`, `fallback_edge`, or
  `wait_for_operator`.
- Dynamic fan-out materializes bounded child task instances whose key is a
  deterministic hash/encoding of run, node key, parent execution path,
  fan-out generation, and canonical item key/index. The database uniqueness
  constraint and dependency rows address that exact instance, so replay cannot
  create a second logical child or join the wrong generation.
- Loops declare item source, concurrency, maximum items/iterations, failure
  policy, and aggregate schema.

### 12.3 Retry behavior

Default retry classes:

| Error class | Default |
|---|---|
| Validation, authorization, policy | Never retry automatically |
| Provider throttle or transient 5xx | Exponential backoff with jitter |
| Network timeout before request send | Retry within activity policy |
| Network timeout after uncertain write | Reconcile before any retry |
| Model schema/refusal | Policy-specific repair or fallback, bounded |
| User input required | Durable human wait |
| Credential expired | Pause connection/task and request reauthorization |
| Sandbox limit | Fail or bounded retry only if policy changes input size |

Manual retry creates a child run or task attempt according to policy; terminal
history is never reopened or rewritten.

One propagated retry envelope owns the end-to-end deadline, maximum logical
attempts, maximum provider calls, and remaining cost. The workflow/node policy
is the coordinator. Temporal retries only a classified activity failure within
that envelope; the gateway or connector adapter may retry only a request proven
not accepted/sent and must debit the same envelope. Provider SDK hidden retries
are disabled or surfaced and counted. No layer starts a fresh independent
retry budget. Tests inject failures at every layer and fail on multiplicative
call, latency, or spend amplification.

### 12.4 Cancellation and uncertainty

- Cancellation stops future dispatch immediately after durable intent.
- In-flight model reads may be abandoned safely.
- In-flight external writes are allowed to resolve or become `UNCERTAIN`.
- `UNCERTAIN` irreversible results block dependent work and enter
  reconciliation.
- Provider status lookup, idempotency lookup, webhook evidence, or human review
  resolves uncertainty.
- A cancellation never reports complete while a material external operation is
  silently uncertain.

Every side effect follows one crash-auditable protocol:

1. Canonicalize the exact provider application/account, destination,
   operation, arguments, and approval payload into a request hash.
2. In one transaction, create or compare-and-set the stable logical operation,
   consume any approval, record the claim generation/execution epoch/fence,
   and emit `external_operation.claimed`. Reusing an idempotency key with a
   different request hash returns a stable conflict and never executes.
3. In one authoritative PostgreSQL transaction, create the attempt projection,
   append its immutable local `SEND_STARTED` attempt record plus
   `send_started` event, and retain the operation/request/epoch fingerprint.
   Then append the matching protection-journal `SEND_STARTED`. Before network
   I/O, the credential proxy requires both the primary transaction fingerprint
   and journal receipt under the same live lease. The local record is the
   independently durable possible-effect mirror used only by the explicit
   `LOST_SOURCE_JOURNAL` branch; it never substitutes for a healthy journal in
   ordinary execution. The proxy attaches the same provider idempotency key
   where supported. A stale epoch/fence cannot start or finalize an attempt.
4. If failure is authoritatively pre-send, append `failed_safe`. Once any
   request bytes may have left the process, a missing authoritative response
   becomes `UNCERTAIN`; it is never represented as safe to retry.
5. Append provider request ID, response timing, and receipt evidence as new
   immutable attempt records and emit `sent` plus `succeeded` or `uncertain`.
   The mutable attempt/operation projections may advance only from those
   records.
6. Reconciliation uses provider idempotency/status lookup, signed webhook,
   external-object query, or explicitly authorized human evidence, then emits
   `reconciled` with the authoritative receipt. An automatic retry is allowed
   only when the connector contract proves the prior attempt was not accepted
   or the same provider idempotency key guarantees one effect.

Crash tests stop the worker before/after claim, attempt append, socket write,
provider acceptance, response receipt, result commit, event publish, and
recovery-journal records. Each window must resolve to one safe retry, one
known result, or one visible `UNCERTAIN` operation—never an invisible or
duplicated effect.

---

## 13. Agent, model, tool, and evaluation design

### 13.1 Agent execution pipeline

Each agent task follows:

1. load immutable agent, prompt, model, retrieval, tool, and tenant policies;
2. reserve token, tool-call, time, and currency budgets;
3. validate task inputs against the agent input schema;
4. retrieve authorized context and persist the retrieval manifest;
5. assemble a redacted context package with provenance;
6. issue a Responses API request through the model gateway;
7. parse model items, refusals, incomplete results, and requested tool calls;
8. validate every tool argument against strict schema;
9. authorize the per-task capability and approval policy;
10. execute allowed tools through the tool broker and credential proxy;
11. append tool outputs to the bounded agent loop;
12. validate final structured output and deterministic business rules;
13. persist outputs, citations, usage, cost, lineage, and confidence evidence;
14. release only usage proven unused; retain a conservative reservation while
    provider usage is unknown;
15. complete, request human review, retry, or fail using explicit policy.

### 13.2 Model gateway contract

Input:

```ts
type ModelRole =
  | "fast"
  | "balanced"
  | "quality"
  | "judge"
  | "embedding"
  | "moderation";

interface ModelRequestBase {
  workspaceId: string;
  operationId: string;
  taskAttemptId?: string;
  modelPolicyVersionId: string;
  role: ModelRole;
  deadlineAt: string;
  safetyIdentifier: string;
  retention: "no-store";
  residency?: string;
}

interface GenerationRequest extends ModelRequestBase {
  kind: "generation";
  role: "fast" | "balanced" | "quality" | "judge";
  promptVersionId: string;
  messages: ModelInputItem[];
  outputSchema?: JsonSchema;
  tools: StrictToolSchema[];
  maxOutputTokens: number;
  maxToolCalls: number;
}

interface EmbeddingRequest extends ModelRequestBase {
  kind: "embedding";
  role: "embedding";
  inputs: Array<{ id: string; text: string }>;
  dimensions?: number;
}

interface ModerationRequest extends ModelRequestBase {
  kind: "moderation";
  role: "moderation";
  inputs: Array<{ id: string; text?: string; imageRef?: string }>;
  policyVersionId: string;
}

type ModelRequest =
  | GenerationRequest
  | EmbeddingRequest
  | ModerationRequest;
```

Output:

```ts
interface ModelResultBase {
  provider: string;
  modelId: string;
  modelSnapshot?: string;
  responseId?: string;
  status: "completed" | "incomplete" | "refused" | "failed";
  latencyMs: number;
  estimatedCost: {
    amountDecimal: string;
    currency: string;
    scale: 12;
    priceVersionId: string;
    budgetAmountDecimal?: string;
    budgetCurrency?: string;
    fx?: {
      source: string;
      version: string;
      rateDecimal: string;
      observedAt: string;
    };
  };
}

interface GenerationResult extends ModelResultBase {
  kind: "generation";
  outputItems: NormalizedModelItem[];
  parsedOutput?: unknown;
  refusal?: { category?: string; message: string };
  incompleteReason?: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
}

interface EmbeddingResult extends ModelResultBase {
  kind: "embedding";
  vectors: Array<{ id: string; values: number[] }>;
  usage: { inputTokens: number; vectorCount: number; dimensions: number };
}

interface ModerationResult extends ModelResultBase {
  kind: "moderation";
  decisions: Array<{
    id: string;
    allowed: boolean;
    categories: Record<string, boolean>;
    scores?: Record<string, number>;
  }>;
  usage: { inputUnits: number };
}

type ModelResult = GenerationResult | EmbeddingResult | ModerationResult;
```

The gateway owns:

- provider clients and credentials;
- model alias resolution and immutable snapshot recording;
- request timeout, circuit breaker, rate limit, and retry classification;
- strict structured output and refusal/incomplete handling;
- prompt caching policy without leaking tenant context across cache keys;
- hashed safety identifier;
- `store: false` default;
- provider retention/residency enforcement;
- usage normalization and price-version lookup;
- redacted tracing;
- fallback only when the policy explicitly permits compatible capability,
  residency, quality, and cost.

Generation, embedding, and moderation adapters share policy, credential,
residency, deadline, redaction, usage, pricing, and circuit-breaker controls,
but never coerce one response type into another. Embedding batching retains
per-input identity and partial-failure evidence; moderation cannot silently
rewrite content or substitute for an explicit product-policy decision.

### 13.3 OpenAI-specific adapter

The OpenAI adapter:

- uses the Responses API;
- uses strict function schemas for custom tools;
- uses strict structured output for final machine-consumed results;
- treats refusals and incomplete responses as explicit outcomes;
- validates output again with repository Zod/JSON Schema;
- does not rely on OpenAI-hosted conversation state for Knotline workflow
  durability;
- avoids provider file/vector persistence for tenant knowledge by default;
  Knotline-owned PostgreSQL/S3 storage remains authoritative;
- sends only the minimum authorized context;
- records the exact provider model identifier and response usage;
- never gives a hosted or remote tool broader authority than the Knotline tool
  policy;
- subjects any optional built-in web/file/MCP capability to the same tenant,
  privacy, approval, citation, and eval gates as custom tools.

### 13.4 Tool registry

Each immutable tool version declares:

```ts
interface ToolDefinition {
  key: string;
  version: number;
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  risk: "read" | "draft" | "reversible_write" | "irreversible_write";
  effectClasses: Array<
    "financial" | "public" | "privileged" | "destructive" | "data_export"
  >;
  scopes: string[];
  approval: "never" | "policy" | "always";
  idempotency: "read_only" | "provider_key" | "knotline_reconcile";
  timeoutMs: number;
  maxResponseBytes: number;
  allowedNetworkDestinations: string[];
  runtime: "connector" | "sandbox" | "internal";
}
```

Tools cannot dynamically widen their own schema, scope, destination, or
credential access. Publication rejects `irreversible_write` with any approval
other than `always`. A financial, public, privileged, destructive, or
data-export effect cannot use `approval: never`; workspace policy may require
`always` or forbid it entirely. A tool definition cannot weaken HU-010.

### 13.5 Credential proxy

- Workloads request a credential using task capability, integration ID, tool
  operation, destination, and nonce.
- The proxy verifies workspace, capability, expiry, operation, risk, approval,
  and destination.
- It decrypts only in memory, performs token refresh if allowed, and returns a
  short-lived provider token or performs the request itself.
- Reusable secrets are never returned to the model or generic sandbox.
- Every access is audited without secret value.

### 13.6 Sandbox

Untrusted code, customer scripts, complex parsers, or browser automation run in
an ephemeral isolated task with:

- non-root user;
- read-only base image;
- empty ephemeral working directory;
- no host mount or container socket;
- CPU, memory, process, disk, and wall-clock limits;
- deny-by-default egress with DNS and redirect revalidation;
- private, loopback, metadata, link-local, multicast, and unsupported protocol
  blocking;
- bounded request and response size;
- no ambient cloud credentials;
- one-task capability and signed input/output manifest;
- destruction after completion;
- malware and output policy scan.

### 13.7 Evaluation system

Evaluation is continuous and versioned. Each agent release suite includes:

- exact/schema graders;
- deterministic business-rule graders;
- reference-answer or executable graders;
- tool-selection and tool-argument graders;
- retrieval recall, precision, citation coverage, and permission graders;
- prompt-injection, jailbreak, exfiltration, and unsafe-action graders;
- pairwise or pass/fail model judge calibrated against human labels;
- latency, token, tool-call, and cost ceilings;
- typical, edge, adversarial, multilingual, long-context, provider-error, and
  ambiguous cases.

Datasets have `train`, `development`, `held_out`, and `adversarial` partitions.
Release thresholds specify must-pass cases and aggregate metrics. Candidate
results compare against the current production baseline. A release cannot hide
a regression behind an average. Shadow and canary evidence follows offline
acceptance. Production feedback is curated and de-identified before becoming a
new immutable case.

Minimum GA evaluation profile:

- at least 200 held-out representative cases per released agent purpose, with
  no evaluation case used to author or tune that candidate version;
- at least 50 cases for every declared high-risk tool/action class and at least
  100 indirect/direct prompt-injection and data-exfiltration cases;
- 100% pass for tenant/ACL isolation, secret non-disclosure, approval bypass,
  forbidden tool, destructive-target confirmation, and must-refuse cases;
- at least 99% schema-valid terminal outputs after the single configured repair
  allowance, with no invalid output consumed downstream;
- at least 95% correct tool selection and 98% schema-valid/correct arguments on
  cases where the expected action is unambiguous;
- at least 95% supported-claim citation precision and 100% citation permission
  correctness; each suite declares whether citation recall or answer
  completeness is the controlling metric;
- no task-success regression greater than two percentage points and no
  statistically meaningful regression in any safety, language, customer-risk,
  or high-volume slice;
- pairwise model graders must achieve at least 85% agreement and Cohen’s kappa
  of 0.70 against a minimum 100-case blinded human calibration set before they
  can gate release;
- p95 latency may not regress more than 20% and median cost per successful case
  may not regress more than 15% without an owner-approved quality/cost tradeoff;
- canary rollback triggers at any confirmed isolation/secret/approval failure,
  two consecutive 15-minute windows over twice the baseline critical-error
  rate, or the configured budget ceiling.

Small agents may not weaken the must-pass rules. If 200 distinct representative
cases do not exist, the release remains `BETA` until the dataset is large
enough; the reason and sample uncertainty are displayed.

---

## 14. Knowledge and retrieval design

### 14.1 Ingestion pipeline

```text
authorize source
  -> capture immutable raw object
  -> malware/quarantine decision
  -> normalize metadata
  -> parse/OCR in bounded worker
  -> store normalized version
  -> resolve source ACL and groups
  -> chunk with versioned policy
  -> embed with versioned model
  -> extract/link entities and relations
  -> build serving generation
  -> atomically promote generation
  -> emit searchable/indexed event
```

Cursor advancement occurs only after the full provider page/batch is durable.
A generation fence prevents an older sync from overwriting a newer result.

### 14.2 Retrieval pipeline

1. derive workspace and principal access subjects;
2. normalize query and classify requested data domains;
3. apply retrieval policy and source allowlist;
4. filter candidates by workspace, ACL, deletion, classification, and freshness
   before scoring;
5. retrieve lexical, vector, metadata, and relationship candidates;
6. fuse and rerank with versioned weights;
7. diversify and enforce per-source/result/token limits;
8. return exact snippets with document version and location;
9. persist selected and excluded candidate evidence in the retrieval manifest;
10. use only selected authorized content in model context.

### 14.3 Retrieval response

```ts
interface RetrievalResult {
  manifestId: string;
  corpusGeneration: string;
  results: Array<{
    sourceObjectId: string;
    documentId: string;
    documentVersionId: string;
    chunkId: string;
    title: string;
    location: { page?: number; path?: string; start?: number; end?: number };
    snippet: string;
    score: number;
    scoreBreakdown: Record<string, number>;
    contentHash: string;
    permissionEvidenceHash: string;
    provenance: Record<string, string>;
  }>;
}
```

### 14.4 Permission freshness

- Content sync and permission sync are separate health dimensions.
- Every local or provider ACL projection has a monotonically increasing epoch,
  provider/source revision where available, complete/incomplete state,
  observation time, hard expiry no later than five minutes, predecessor, and
  invalidation reason. Out-of-order or incomplete projections cannot lower the
  epoch or become serving-authoritative.
- ACL generation changes atomically publish
  `knowledge.acl_projection_advanced` and invalidate authorization-sensitive
  server, CDN, search, entity, citation, prepared-context, SSE, and registered
  client caches.
- A source whose current ACL cannot be proven, or whose proof is older than the
  five-minute NFR-023 bound, fails closed for all retrieval regardless of
  content classification.
- A compact signed authorization proof binds signing-key version, subject and
  group-resolution hash, workspace, device/session where applicable, exact
  resource/cache namespace, ACL projection epoch/hash, issued time, and expiry
  of at most five minutes. The server mints it only after checking the current
  authoritative projection; server and client reject subject/workspace/device
  substitution, unknown/retired keys, epoch rollback, expiry, or a resource
  outside the proof. Offline operation never refreshes or extends it.
- Installed clients register only pseudonymous device/cache metadata, not
  cached content. A `WORKSPACE_ACL_METADATA` or `USER_DRAFT` decryption wrapper
  is released only with a current proof and matching device key. Membership,
  source, policy, or deletion revocation destroys the server wrapper, emits
  key-revocation/purge events, and records each active-client purge attempt;
  reconnect/activation must reauthorize before display.
- Entity and graph queries apply fact-level permission, not only entity-level
  permission.
- Hidden neighbors, relation counts, and ranking metadata cannot reveal
  unauthorized existence.

### 14.5 Deletion

Deletion creates a durable tombstone before derived cleanup. Cleanup covers raw
objects when policy requires, normalized versions, chunks, embeddings, entity
facts, relations, retrieval caches, exports, citations where deletion policy
requires redaction, and provider copies. Backup expiry follows the documented
retention schedule and prevents deleted data from silently re-entering serving
indexes after restore.

### 14.6 Fact-level entity authorization

An entity row contains canonical identity metadata only. Every attribute value
is an `entity_fact`; every relationship has one or more evidence rows. A fact
or relation is materialized only from evidence the requesting principal can
currently access. Restricted evidence never contributes its value, confidence,
existence count, or ranking signal to an unauthorized result. Merge/split
operations preserve separate facts, evidence, and ACL derivations and cannot
turn one visible alias into access to the complete entity.

Permission or source deletion retracts affected evidence, recomputes remaining
fact confidence, invalidates graph/search caches, and removes a fact when no
authorized evidence remains. User-authored corrections create new versioned
evidence and never overwrite provider/source history.

---

## 15. Supported integration catalog

The final product includes the following production-supported connectors.

| Family | Providers/capabilities |
|---|---|
| Identity | Google OIDC; SAML/OIDC enterprise identity; SCIM 2.0 |
| Google Workspace | Drive, Docs, Sheets, Gmail, Calendar |
| Microsoft 365 | OneDrive, SharePoint, Outlook Mail, Outlook Calendar |
| Knowledge | Notion, Confluence, file upload |
| Project/work | Linear, Jira, GitHub Issues/Pull Requests |
| Communication | Slack messages/channels and Microsoft Teams |
| CRM | Salesforce and HubSpot core objects |
| Content/social | X read/search and approved posting where provider access permits |
| Developer | Generic REST action, signed incoming webhook, outgoing webhook |
| Data transfer | CSV import/export and S3-compatible watched prefix |
| Billing | Stripe checkout, subscription, invoices, and webhooks |
| AI | OpenAI Responses API and embeddings through the model gateway |

### 15.1 Provider-neutral connector interface

```ts
interface Connector {
  manifest(): ConnectorManifest;
  beginAuthorization(input: AuthorizationInput): Promise<AuthorizationStart>;
  completeAuthorization(input: AuthorizationCallback): Promise<ConnectedAccount>;
  validateConnection(context: ConnectorContext): Promise<ConnectionHealth>;
  listChanges(input: ChangePageInput): Promise<ChangePage>;
  fetchObject(input: FetchObjectInput): Promise<ProviderObject>;
  fetchPermissions?(input: PermissionInput): Promise<PermissionPage>;
  handleWebhook(input: VerifiedWebhook): Promise<ProviderChange[]>;
  executeAction?(input: ActionInput): Promise<ActionResult>;
  reconcileAction?(input: ReconcileInput): Promise<ReconcileResult>;
  revoke?(context: ConnectorContext): Promise<void>;
}
```

Provider-specific features may extend the interface through typed capability
objects; they may not bypass common credential, rate, audit, idempotency, or
tenant controls.

### 15.2 Connector acceptance matrix

Each connector must prove:

- least-privilege setup and scope display;
- OAuth state/PKCE/redirect behavior or secure API-key setup;
- token refresh, revocation, expiry, and reauthorization;
- pagination and incremental cursor correctness;
- provider rate-limit and retry behavior;
- initial, incremental, manual, and scheduled sync;
- webhook verification, duplication, reordering, and replay where supported;
- source create/update/delete and permission/group changes;
- mapping/provenance accuracy;
- outbound read/draft/write actions according to provider capability;
- provider-native idempotency or Knotline reconciliation;
- deterministic recorded contract suite;
- real provider sandbox test;
- removal and data-deletion behavior;
- admin health, error, and recovery UX.

### 15.3 GA provider capability contract

Exact provider scope strings, API versions, commercial tiers, and certified
tenant identifiers live in the versioned connector manifest because providers
can change them. A manifest change reruns certification. The following product
capabilities are the minimum GA contract; a row cannot be labelled `LIVE`
unless all declared cells and the real-provider gate pass.

| Provider | Required reads/sync | Required actions | Change/cursor contract | Permission and deletion contract |
|---|---|---|---|---|
| Google Drive/Docs/Sheets | Drives, folders, files, revisions, Docs structure, Sheets workbook/ranges | Create/export file and append/update an explicitly selected Sheet range | Drive changes token plus scheduled inventory reconciliation | Shared-drive, user/group/domain/link permission metadata; trash/delete/permission changes remove serving access |
| Gmail/Google Calendar | Authorized labels/threads/messages and calendars/events/recurrence | Draft/send/reply mail; create/update/cancel event | Gmail history ID and Calendar sync token with reset recovery | Mailbox/calendar and delegated access are explicit; deletion/cancellation tombstones reconcile |
| OneDrive/SharePoint | Sites, drives, libraries, folders, files, versions | Create/update explicitly selected file/list item where certified | Microsoft Graph delta plus reconciliation | Sharing/inheritance metadata and tenant consent mode; delete/move/permission change propagate |
| Outlook Mail/Calendar | Authorized mailbox folders/messages/threads and calendars/events | Draft/send/reply; create/update/cancel event | Graph delta/subscription with expiry renewal and reset | Shared/delegated mailbox/calendar scope is explicit and rechecked; delete/cancel propagates |
| Notion | Pages, block trees, databases/data sources, rows/properties, comments when granted | Create/update page and database row; add comment where supported | `last_edited_time` incremental scan plus reconciliation | Integration share boundary is preserved; archive/delete/unshare removes serving access |
| Confluence Cloud | Spaces, pages/blogs, versions, labels, attachments, restrictions | Create/update page and comment where certified | Webhook plus modified-time/page reconciliation | Space/page restrictions and inherited visibility preserved; archive/delete/restrict propagates |
| Linear | Teams, projects, cycles, issues, labels, comments, members | Create/update issue and comment | Webhooks plus updated-at reconciliation | Workspace/team membership and object visibility enforced; archive/delete propagates |
| Jira Cloud | Sites, projects, issue types/fields, issues, comments, users, transitions | Create/update/comment/transition using live metadata | Webhooks plus bounded JQL updated cursor/reconciliation | Project/issue security and field visibility preserved to supported fidelity; delete/permission change propagates |
| GitHub | App installations, orgs/repos, issues, PRs, reviews, checks, commits/files | Create issue/comment/review/check; branch/PR write only under explicit higher-risk policy | Signed App webhooks plus installation/repository reconciliation | Installation/repository/team scope enforced; uninstall/repository removal deletes or disables derived data |
| Slack | Workspace identity, permitted channels/history/threads/users/files | Post/update/delete message and interactive task/approval response where granted | Signed Events API with event ID and cursor/backfill policy | Private-channel membership and app scopes are rechecked; deletion/channel removal propagates |
| Microsoft Teams | Authorized teams/channels/messages/members/files | Post/reply and interactive task/approval response where tenant consent permits | Graph subscriptions with renewal plus reconciliation | Tenant/team/channel membership and delegated/application mode explicit; delete/access change propagates |
| Salesforce | Org schema, selected objects/fields/records, relationships | Create/update selected records | CDC/platform event where entitled, otherwise system-modstamp cursor plus reconciliation | Object/field/record access and connected-user policy; delete/merge/schema changes propagate |
| HubSpot | CRM schemas, selected objects, properties, associations, owners | Create/update selected objects | Webhooks plus modified-time reconciliation | Granted app scopes/teams and archived records respected; delete/schema change propagates |
| X | Authenticated account identity and only reads/search made available by the contracted tier | Draft/publish/delete post only after target-account confirmation and separate approval policy | Provider event/polling contract available to the approved tier | Account and tier capability shown; deletion propagates; unavailable approval keeps this row `BLOCKED_EXTERNAL` and blocks its GA claim |
| S3-compatible | One allowlisted endpoint, bucket, prefix, versions, metadata | Put/copy/delete only inside declared prefix and policy | Event notifications when certified plus version-aware inventory | Endpoint/bucket/prefix and encryption enforced; version/delete markers reconcile |
| Generic REST/webhook/CSV | Typed OpenAPI operations, signed input events, mapped CSV batches | Only manifest-declared typed operations and reversible import batch operations | Declared pagination/cursor/event ID or explicit reconciliation limitation | No inferred ACL fidelity; workspace policy and imported batch ownership govern use and deletion |

An outbound connector action may be `LIVE` only when its immutable manifest
declares either provider-native idempotency or a deterministic lookup/
reconciliation strategy that can distinguish success, failure, and uncertainty.
An irreversible provider operation that has neither is limited to preview,
draft, or explicit human-performed instructions outside Knotline; the broker
must not execute it or present it as an automated write capability.

The production certification record for every row includes provider developer
application/tenant, exact requested and granted scopes, API version, test
objects, webhook/subscription configuration, cursor/reset case, rate/size
limits, write receipts, delete/permission evidence, DPA/terms approval, owner,
run date, expiry/review date, and evidence location.
The external certification mapping is exact: Google capabilities use
`EXT-007`; Microsoft 365/Teams use `EXT-008`; Notion/Confluence use `EXT-009`;
Linear/Jira use `EXT-010`; GitHub uses `EXT-011`; Slack distribution uses
`EXT-012`; Salesforce/HubSpot use `EXT-013`; X uses `EXT-014`; and the
S3-compatible row uses the separate endpoint/account/security gate `EXT-025`.
`EXT-002` proves Knotline's AWS organization and runtime infrastructure only;
it can never stand in for connector certification.

---

## 16. Security, privacy, and enterprise controls

### 16.1 Authentication controls

- Magic tokens are at least 128 bits of entropy, hashed at rest, single-use,
  short-lived, intent-bound, and rate limited.
- Sign-in responses do not reveal whether an email exists.
- Google/OIDC validation checks issuer, audience, nonce, expiry, signature, and
  domain rules.
- OAuth callbacks use one-time state and S256 PKCE where supported.
- Session rotation detects old-token reuse and revokes the family.
- Sensitive administration requires recent authentication or step-up.
- Logout and suspension revoke effective access promptly.

### 16.2 Authorization layers

1. route authentication;
2. workspace membership and state;
3. RBAC maximum permission;
4. resource grant/ownership/assignment ABAC;
5. separation-of-duties and approval policy;
6. plan entitlement and limit;
7. data classification and source ACL;
8. database tenant constraint and PostgreSQL Row-Level Security.

RLS is mandatory defense in depth for tenant tables. Runtime database roles
cannot bypass it. Migration and repair roles are isolated, time-limited where
possible, and audited.

#### 16.2.1 Canonical permission catalog

Permission keys are immutable lowercase `resource.action` strings. A new key
requires a migration, default-role decision, API/OpenAPI annotation, audit
taxonomy entry, negative test, and this catalog update. Wildcards exist only in
server-owned system-role definitions and are never stored in a customer custom
role or bearer credential.

| Resource | Canonical actions |
|---|---|
| `workspace` | `read`, `update`, `archive`, `restore`, `delete`, `transfer_ownership`, `switch_region` |
| `member` | `read`, `invite`, `resend_invite`, `cancel_invite`, `change_role`, `suspend`, `restore`, `remove`, `reassign_content` |
| `group` | `read`, `create`, `update`, `delete`, `manage_members`, `map_external` |
| `role` | `read`, `create`, `update`, `delete`, `assign` |
| `workflow` | `create`, `read`, `update`, `publish`, `run`, `operate`, `grant`, `transfer`, `archive`, `delete` |
| `template` | `create`, `read`, `update`, `publish`, `instantiate`, `delete` |
| `run` | `read`, `start`, `pause`, `resume`, `cancel`, `retry`, `fork`, `export`, `operate` |
| `task` | `read`, `claim`, `unclaim`, `assign`, `delegate`, `complete`, `request_clarification`, `reopen`, `bulk`, `comment` |
| `approval` | `read`, `decide`, `abstain`, `delegate`, `revoke`, `remind`, `manage_policy` |
| `agent` | `create`, `read`, `update`, `evaluate`, `release`, `execute`, `disable`, `grant`, `delete` |
| `tool` | `read`, `register`, `version`, `grant`, `execute`, `disable`, `delete` |
| `knowledge` | `upload`, `read`, `search`, `manage_source`, `manage_entity`, `reindex`, `export`, `delete` |
| `connection` | `create`, `read`, `authorize`, `manage`, `use_read`, `use_write`, `reconcile`, `remove` |
| `analytics` | `read`, `create_report`, `share_report`, `schedule_report`, `export` |
| `billing` | `read`, `checkout`, `manage_subscription`, `manage_budget`, `view_invoice` |
| `audit` | `read`, `export`, `verify` |
| `developer` | `read`, `manage_service_account`, `manage_token`, `manage_oauth_client`, `manage_webhook` |
| `data_policy` | `read`, `update`, `export`, `request_delete`, `approve_delete`, `manage_hold`, `migrate_region` |
| `security` | `read`, `manage_sso`, `manage_scim`, `manage_domain`, `manage_session_policy`, `use_kill_switch` |
| `support` | `create_ticket`, `read_own_ticket`, `manage_ticket`, `request_access`, `approve_access`, `use_access` |
| `platform_ops` | `read_health`, `manage_incident`, `repair`, `throttle`, `deploy`, `rollback`, `break_glass`, `manage_security_case`, `manage_privacy_case`, `adjust_billing_ledger` |

`support.manage_ticket`, `support.use_access`, and all `platform_ops.*` are
platform-duty permissions and cannot be placed in a workspace custom role.
`workspace.delete`, `workspace.transfer_ownership`,
`data_policy.approve_delete`, `data_policy.manage_hold`,
`data_policy.migrate_region`, and `security.use_kill_switch` are protected:
custom roles receive them only when the creator currently has them and
workspace policy marks them delegable. Last-owner and break-glass invariants
cannot be overridden.

#### 16.2.2 Default role grants

`R` means list/read, `W` ordinary create/update/use, `P`
publish/execute/decide, and `A` administration. Assignment, ownership, resource
grant, plan, separation-of-duties, and data policy can only narrow these
defaults.

| Resource family | Owner | Admin | Builder | Member | Approver | Billing | Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Workspace/member/group | RWPA | RWA except ownership/delete | R | R | R | R | R |
| Roles/security/identity | RWPA | RWA except protected owner/break-glass | R | — | — | — | R |
| Workflows/templates | RWPA | RWPA | RWPA | R plus granted create/comment | R | R | R |
| Runs | RWPA | RWPA | RWP for owned/granted workflows | R plus assigned work | R | R | R |
| Tasks/comments | RWPA | RWPA | RWA | RWP when assigned/granted | RWP when assigned/eligible | R | R |
| Approvals | RWPA | RWA; decide only when eligible | R; decide only when eligible | R; decide only when eligible | RP when eligible | R | R |
| Agents/tools | RWPA | RWPA | RWPA subject to risk policy | R/use when granted | R | R | R |
| Knowledge/connections | RWPA | RWPA | RW for granted sources; writes need grant | R/search allowed sources | R/search allowed sources | R | R |
| Analytics/reports | RWPA | RWPA | RW | R | R | RW billing reports | R/export |
| Billing/usage | RWPA | R unless separately granted | Own usage R | Own usage R | Own usage R | RWPA except platform adjustment | R |
| Audit/data policy | RWPA | RWA except protected hold/delete approval | R own activity | R own export/delete | R own activity | R billing scope | R/export/verify |
| Developer controls | RWPA | RWA | RW when granted | — | — | — | R |
| Support | approve/request/read | approve/request/read | request/read own | request/read own | request/read own | request/read own | R |
| Platform operations | — | — | — | — | — | — | — |

- A user may hold multiple role bindings. Effective permission is their union
  after protected-action, plan, ABAC, separation-of-duties, classification, and
  tenant-policy denies.
- `principal_role_bindings` attach roles to users or groups with source,
  provenance, effective interval, and optional resource scope. SCIM-managed
  bindings cannot be edited locally.
- Assignment grants only the task/run context needed to act. Approval
  eligibility grants only the exact packet and decision action.
- A resource grant cannot cross a workspace or exceed the grantor’s currently
  delegable permissions.
- Owner alone can transfer ownership or approve workspace deletion, and one
  active break-glass-capable owner must remain.
- Auditor is read-only; export still applies field/content authorization and
  never implies support access.
- Service accounts use explicit scopes/resource constraints and gain no default
  role merely by existing.

### 16.3 Browser and edge controls

- TLS, HSTS, WAF managed rules, request/body limits, and bot/rate protection;
- exact CORS allowlist;
- restrictive Content Security Policy without routine `unsafe-eval`;
- `frame-ancestors 'none'` unless an explicit embed product is created;
- `nosniff`, strict referrer policy, and permissions policy;
- trusted-types adoption where compatible;
- sanitized Markdown and URL protocols;
- no auth tokens in `localStorage`;
- invitation and guest bearer links put the one-time token in the URL fragment,
  load an asset-isolated `Referrer-Policy: no-referrer` exchange page with no
  third-party request, POST the token in the body, immediately `replaceState`
  to a clean URL, and redact CDN/WAF/ALB/application logs; the exchanged session
  is short-lived, scoped, revocable, and never reuses the bearer token;
- session replay disabled or comprehensively masked on sensitive routes;
- CSRF tokens and origin checks for cookie mutations.

### 16.4 Threat model coverage

Mandatory abuse cases:

- BOLA/IDOR and cross-tenant search/cache/object reference;
- privilege escalation and confused deputy;
- invitation, magic-link, session, SSO, and OAuth replay/misbinding;
- CSRF, XSS, clickjacking, open redirect, unsafe Markdown, and upload attack;
- webhook forgery, replay, body-reparse mismatch, and event conflict;
- SQL/NoSQL/expression/template injection;
- prompt injection and indirect prompt injection from connected sources;
- tool argument manipulation, over-broad approval, secret exfiltration;
- SSRF, DNS rebinding, redirect-to-private-network, cloud metadata access;
- parser decompression bomb, malicious document, sandbox escape assumptions;
- duplicate external effects and uncertain operation replay;
- model/tool/connector cost exhaustion and queue starvation;
- telemetry, error, export, support, and backup data leaks;
- compromised dependency, build runner, container, artifact, or IaC;
- malicious or mistaken operator access.

### 16.5 Data classification

| Class | Examples | Minimum controls |
|---|---|---|
| Public | Marketing pages, public templates | Integrity and availability |
| Internal | Non-sensitive configuration, operational metadata | Auth, encryption, audit |
| Confidential | Workflow content, documents, task outputs, member data | Tenant auth, encryption, redaction, retention |
| Restricted | Credentials, auth tokens, highly sensitive customer content | Vault/KMS, narrow workload access, never log/model unless explicitly permitted |

### 16.6 Privacy behavior

- Provider data is not used for shared-model training by default.
- Purpose, processor, region, retention, and deletion behavior are inventoried
  per data flow.
- Analytics uses stable pseudonymous IDs and excludes customer content.
- Tenants can configure retention and model/telemetry policy.
- Export and deletion are durable, resumable, observable jobs.
- Legal holds block destruction only with explicit authorization and evidence.
- Subprocessor deletion and backup expiry are tracked.
- Privacy notices and consent reflect actual behavior.

### 16.7 Audit integrity

Audit events commit with the protected mutation when possible. An outbox
consumer exports events to an independently administered write-only archive.
Periodic signed checkpoints cover ordered event digests. Audit export includes
query, generation time, integrity digest, and chain/checkpoint references.

### 16.8 External assurance boundaries

The following require external evidence and cannot be declared by code alone:

- trademark/domain clearance;
- executed cloud/model/connector/subprocessor contracts;
- SOC 2 or ISO certification;
- independent penetration test;
- legal approval of terms, privacy notice, DPA, retention, and incident notice;
- provider OAuth/application verification;
- real IdP SSO/SCIM interoperability;
- published SLO, residency, RPO, and RTO claims;
- tax, accounting, and payment-operations approval;
- staffed on-call and customer-support commitments.

The release status for each is one of `NOT_APPLICABLE`, `SIMULATED`,
`SANDBOX_VERIFIED`, `PRODUCTION_VERIFIED`, or `BLOCKED_EXTERNAL`. A mock cannot
produce `PRODUCTION_VERIFIED`.

### 16.9 External gate register

Before work begins on an affected milestone, the program owner replaces each
role owner with a named accountable person and records target environment,
tenant/account/application IDs, requested scopes, commercial tier, region,
contract/DPA reference, cost approval, evidence URI, issue/renewal date, review
expiry, `gaRequired`, `requiredTerminalState`, capability/public-label scope,
and any `scopeAmendmentId` in
`artifacts/verification/external-gates.json`. No secret value is stored in the
manifest.

| Gate | Accountable role | Needed by | Unblock evidence | Initial state / expected lead |
|---|---|---|---|---|
| `EXT-001` Knotline name, trademark, domains | Executive/legal | M02, M38 | Clearance decision, acquired domains, renewal owner | `BLOCKED_EXTERNAL` / 2–8 weeks |
| `EXT-002` AWS organization and production account | Cloud owner | M03, M34, M37 | Approved accounts, billing, regions, quotas, support tier, break-glass owners | `BLOCKED_EXTERNAL` / 1–3 weeks |
| `EXT-003` Temporal production service decision | Platform owner | M10, M34, M37 | ADR, contract/account/namespace, region, retention, SLO/DPA, credentials | `BLOCKED_EXTERNAL` / 1–4 weeks |
| `EXT-004` OpenAI production project | AI owner/privacy | M15, M16, M34, M36, M38 | Contract/DPA, project, budgets, approved models, regions/retention, key rotation, live eval receipt | `BLOCKED_EXTERNAL` / 1–4 weeks |
| `EXT-005` Stripe merchant/tax configuration | Finance/legal | M29, M34, M38 | Production account, catalog/prices/tax policy, bank/payout, webhook, refund/support approval | `BLOCKED_EXTERNAL` / 2–8 weeks |
| `EXT-006` SES and sending domains | Operations/marketing | M27, M34, M37 | Verified identities, DKIM/SPF/DMARC, production access, complaint/bounce path | `BLOCKED_EXTERNAL` / 1–3 weeks |
| `EXT-007` Google developer applications | Connector owner/privacy | M04, M23, M25, M34 | OAuth consent/app verification as required, sandbox and production clients, scopes, DPA, certification | `BLOCKED_EXTERNAL` / 2–12 weeks |
| `EXT-008` Microsoft Entra/Graph application | Connector owner/privacy | M24, M25, M27, M34 | Multi-tenant app/consent, verified publisher if required, scopes, sandbox tenant, certification | `BLOCKED_EXTERNAL` / 2–12 weeks |
| `EXT-009` Notion and Confluence applications | Connector owner | M23, M34 | Apps, test workspaces/sites, scopes, terms/DPA, live capability certification | `BLOCKED_EXTERNAL` / 1–6 weeks |
| `EXT-010` Linear and Atlassian/Jira applications | Connector owner | M24, M34 | Apps/test sites, scopes/webhooks, terms/DPA, live read/write certification | `BLOCKED_EXTERNAL` / 1–8 weeks |
| `EXT-011` GitHub App and test organization | Connector/security | M24, M34 | App ownership, permissions/events, private test org, security review, certification | `BLOCKED_EXTERNAL` / 1–4 weeks |
| `EXT-012` Slack and Teams app distribution | Connector/security | M24, M27, M34 | Apps, scopes, interactivity/webhooks, test workspaces/tenant, distribution approval, certification | `BLOCKED_EXTERNAL` / 2–12 weeks |
| `EXT-013` Salesforce and HubSpot applications | Connector owner/privacy | M25, M34 | Developer tenants/apps, scopes/tier, terms/DPA, read/write/delete certification | `BLOCKED_EXTERNAL` / 2–12 weeks |
| `EXT-014` X developer access and commercial tier | Product/legal | M24, M34 | Approved application/tier, permitted capabilities, terms/content policy, live receipts | `BLOCKED_EXTERNAL`; this provider cannot be called `LIVE` until clear / 2–16+ weeks |
| `EXT-015` Enterprise IdP and SCIM certification tenants | Identity owner/security | M32, M34 | At least two independent IdPs plus SCIM client conformance evidence, recovery/break-glass review | `BLOCKED_EXTERNAL` / 2–8 weeks |
| `EXT-016` Legal, privacy, AI, and subprocessor approval | Legal/privacy | M31, M33, M38 | Terms, privacy, DPA/SCC, AUP, subprocessors, consent, deletion, AI use, regional claims approved | `BLOCKED_EXTERNAL` / 4–12 weeks |
| `EXT-017` Independent penetration test and launch security review | Security owner | M35, M38 | Signed scope/report, critical/high remediation, independent retest, and owner-signed cloud/production/support/CI/source/provider/break-glass access review | `BLOCKED_EXTERNAL` / book 6–12 weeks ahead |
| `EXT-018` SOC 2 readiness/audit | Security/compliance | M35 | Auditor/period/control evidence; public claims limited to report actually issued | `BLOCKED_EXTERNAL` / 3–12+ months; certification is not required to ship unless commercial scope says so |
| `EXT-019` On-call, support, and incident staffing | Operations/support | M33, M34, M35, M36, M38 | Named rotations, contact/escalation, service targets, training, game-day attendance | `BLOCKED_EXTERNAL` / 2–6 weeks |
| `EXT-020` Pricing, accounting, tax, and support policy | Finance/legal/support | M29, M33, M38 | Approved plans/prices/refunds/tax/invoice/trial/cancel/support terms | `BLOCKED_EXTERNAL` / 3–8 weeks |
| `EXT-021` Public DNS, certificates, status, monitoring | Operations | M34, M37, M38 | Production records/certs/status ownership, synthetic monitoring, renewal/failure test | `BLOCKED_EXTERNAL` / 1–3 weeks |
| `EXT-022` Regional processor/residency approval | Privacy/platform | M31, M32, M34, M35, M36, M37, M38 | Service-by-region matrix, active/standby/protection triples, journal/WAL/object placement, provider processing, re-protection, restore/migration and compound-disaster certification | `BLOCKED_EXTERNAL` / 4–12 weeks |
| `EXT-023` Usability, activation, accessibility, and linguistic participants | Product research/accessibility | M33, M38 | Consented representative users and design-partner workspaces, every Section 20.9 role/modality/locale cohort, study and activation protocol, findings, remediation/retest, privacy/compensation approval | `BLOCKED_EXTERNAL` / recruit 4–8 weeks ahead |
| `EXT-024` Workforce operator identity and hardware assurance | Security/platform owner | M34, M35, M38 | Approved workforce OIDC client/tenant, directory/SCIM lifecycle source, phishing-resistant FIDO2 authenticators, emergency hardware identities, named provisioning/offboarding owners, and live login/disable/break-glass evidence | `BLOCKED_EXTERNAL` / 2–8 weeks |
| `EXT-025` S3-compatible connector endpoint and certification | Connector owner/security/privacy | M25, M26, M34, M38 | Named real S3-compatible service/account and non-production bucket, endpoint/region/ownership, credentials and bucket policy, encryption/versioning/event configuration, commercial terms/DPA where external, read/write/delete/version/event receipts, prefix-isolation and SSRF review, rotation/revocation, and live capability certification | `BLOCKED_EXTERNAL` / 1–6 weeks |

The following is the default complete-product GA policy. Every gate is an
individual JSON row; ranges and the phrase “all applicable” are invalid in the
runtime ledger. `REQUIRED` means `gaRequired: true`.
`CONDITIONAL_CLAIM` means `gaRequired: false` unless the listed certification
or public claim is in the approved GA scope. An authorized scope amendment may
set a provider gate to false only when it updates the capability matrix,
requirements/traceability, public label, pricing/help/legal copy, tests, and
release notes together and records product, legal/privacy, security, and
commercial approval as applicable.

| Gate | Default GA policy | Required terminal state |
|---|---|---|
| `EXT-001` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-002` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-003` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-004` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-005` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-006` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-007` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-008` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-009` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-010` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-011` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-012` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-013` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-014` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-015` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-016` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-017` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-018` | `CONDITIONAL_CLAIM` | `NOT_APPLICABLE` without a certification claim; otherwise `PRODUCTION_VERIFIED` |
| `EXT-019` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-020` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-021` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-022` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-023` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-024` | `REQUIRED` | `PRODUCTION_VERIFIED` |
| `EXT-025` | `REQUIRED` | `PRODUCTION_VERIFIED` |

M38 calculates its gate set only from these individual manifest rows after
applying approved amendments. A `REQUIRED` row that is missing, expired,
blocked, simulated, or below its required terminal state blocks GA. The
validator rejects an amendment that merely omits a row or leaves a formerly
`LIVE` product claim in place.

If an external provider refuses a required capability, the feature remains
blocked until either the gate clears or an authorized scope amendment updates
Sections 3, 15, 23, 26, 38, and the public status label in the same reviewed
commit. Quietly dropping the capability is prohibited.

---

## 17. Billing, notification, analytics, help, and support behavior

### 17.1 Plan and entitlement model

Final packaging is editable platform data, but the product must support:

| Entitlement class | Examples |
|---|---|
| Boolean feature | agents, enterprise identity, audit export, custom connectors |
| Count limit | seats, workflows, active schedules, connections |
| Metered quantity | runs, tasks, model tokens/cost, storage, indexed chunks |
| Concurrency | simultaneous runs, agent tasks, syncs, SSE clients |
| Policy value | retention days, max graph size, model allowlist |

The browser displays entitlements but never enforces them alone. Server
admission and worker reservation are authoritative.

### 17.2 Subscription behavior

- Checkout accepts a Knotline plan key and billing interval; the server maps to
  an allowed Stripe price.
- Webhook state is authoritative; checkout redirect is not.
- Upgrade can apply immediately with provider-calculated proration.
- Downgrade schedules for the next period unless an explicit safe immediate
  policy exists.
- Cancellation schedules or executes according to the selected policy and is
  reversible until effective.
- Past-due enters a visible grace period. Existing read access and export remain
  available; risky new spend may be blocked.
- Provider outage never deletes or corrupts local entitlement history.
- Workspace deletion and subscription cancellation are separate explicit
  operations.

### 17.3 Usage accounting

Usage path:

```text
admission estimate
  -> atomic worst-case-bounded reservation
  -> fenced lease renewal for long work
  -> execution
  -> actual provider usage
  -> idempotent ledger entry
  -> consume reservation
  -> release only confirmed remainder
  -> entitlement projection and alert
```

Reconciliation compares Knotline provider invocation records, Stripe meter
records where used, and ledger totals. Manual adjustment is append-only,
reasoned, permissioned, and audited.

Provider/model/tool costs accrue in exact fixed-precision original currency.
Workspace budgets declare one immutable budget currency per policy version.
Conversion uses the recorded FX source/version/time at the declared accounting
boundary; both original and converted amounts remain in the ledger. Knotline
aggregates before customer settlement/invoice rounding and posts any rounding
residual explicitly rather than losing sub-minor-unit calls.

Every operation declares a hard maximum billable quantity that can be reserved
before dispatch. Long operations renew a fenced reservation lease without
increasing it beyond policy. If provider usage is unknown, the conservative
reservation remains consumed/held until authoritative usage or an approved
manual reconciliation arrives; it is not released optimistically. If delayed
actuals exceed the reservation because a provider violated/changed its bound,
the excess enters an append-only usage-debt ledger, blocks new discretionary
spend at a hard limit, alerts finance/customer owners, and is never silently
discarded or charged without the commercial policy.

Budget create/update APIs publish a new immutable policy version under
`If-Match`; they never rewrite a period or reservation already admitted under
an older version. Threshold changes take effect at a declared instant,
recompute current projections deterministically, and emit any newly crossed
threshold once. Finance adjustments are new signed ledger entries, not edits
to usage, debt, credit, or invoice history. Only the isolated platform
operator plane can preview, request, approve, and commit them; workspace
billing administrators can inspect the resulting entries but cannot originate
or authorize one.

### 17.4 Notification matrix

| Event class | In-app | Email | Slack/Teams | Webhook | PWA push |
|---|---:|---:|---:|---:|---:|
| Task assigned/due/escalated | Yes | Configurable | Configurable | Yes | Opt-in |
| Approval requested/expiring | Yes | Configurable | Configurable | Yes | Opt-in |
| Mention/comment | Yes | Configurable | Configurable | Optional | Opt-in |
| Run failed/stuck/attention | Yes | Configurable | Configurable | Yes | Opt-in |
| Connector degraded/reauth | Yes | Admin | Admin | Yes | Optional |
| Agent eval/policy/budget | Yes | Admin | Admin | Yes | Optional |
| Usage/limit/payment | Yes | Billing/admin | Optional | Yes | Optional |
| Security/session/credential | Yes | Mandatory security channel | Optional | Yes | Optional |
| Export/deletion complete | Yes | Requester | No | Optional | Optional |

Quiet hours never suppress account-security alerts or an explicitly configured
critical escalation. Notification delivery failure cannot alter the underlying
business state.

### 17.5 Analytics definitions

Metrics must be computed from authoritative events and expose drill-down:

| Metric | Definition |
|---|---|
| Run throughput | Runs reaching a terminal state in selected interval |
| Success rate | Succeeded runs / all terminal runs, with cancellation separated |
| Cycle time | Run start to terminal time |
| Active time | Sum of task running intervals adjusted for concurrency as documented |
| Human wait | Time tasks or approvals spend awaiting people |
| External wait | Time awaiting provider, schedule, or connector |
| Automation rate | Eligible tasks completed without human execution, excluding approvals |
| Returned time | Configured human baseline minus observed human effort; labeled estimate |
| Agent success | Agent tasks accepted without retry, validation failure, or human correction |
| SLA attainment | Tasks completed within configured SLA / due tasks |
| Cost per outcome | Attributable usage cost / successful run outcome |
| Connector freshness | Current time minus last complete authorized sync watermark |

Synthetic/demo metrics are never shown as production activity. Estimated
metrics are labeled with method and confidence.

### 17.6 Help and support

The product includes:

- searchable help center and contextual help links;
- API documentation, recipes, glossary, and keyboard shortcut reference;
- restartable guided tours using an explicitly labeled sandbox;
- feedback, report-a-problem, and citation-quality flows;
- support ticket list/detail with attachment and status history;
- customer-generated redacted diagnostic bundle containing IDs and safe
  metadata, never raw secrets or customer content by default;
- public status, in-product incident banner, maintenance notice, and postmortem
  links;
- changelog and release education;
- configured support entitlement and escalation path.

---

## 18. Environments, deployment, and operations

### 18.1 Environment model

| Environment | Data | External providers | Purpose |
|---|---|---|---|
| Local | Synthetic two-tenant seed | Emulators/recorded contracts; optional developer sandbox | Development and fast integration |
| CI ephemeral | Generated per run | Deterministic fakes and selected sandbox suites | Repeatable verification |
| Development | Synthetic/non-sensitive | Provider development apps | Shared integration |
| Staging | Synthetic plus approved anonymized fixtures | Real provider sandboxes | Production-topology acceptance |
| Production | Customer data | Verified production apps/accounts | Customer service |
| Recovery | Restored encrypted copy during exercises | Disabled writes until reconciliation | DR proof |

Production data and credentials never enter preview, CI, local, or ordinary
development environments.

### 18.2 Typed configuration

Startup validates:

- environment identity and public origins;
- database, Redis, Temporal, queue, S3, KMS, and secrets endpoints;
- cookie, CORS, CSP, trusted proxy, and CSRF policy;
- OpenAI project/region/retention/model role configuration;
- provider client IDs and callback allowlists;
- Stripe account, webhook secret, and server-side price map;
- email sender and notification channels;
- telemetry destinations and redaction policy;
- feature and kill-switch defaults.

Unsafe production defaults fail startup. Secrets are references, not checked-in
values.

### 18.3 AWS topology

- Route 53 and ACM manage DNS and TLS.
- CloudFront fronts static web assets and API as designed.
- AWS WAF protects public surfaces.
- `callbacks.knotline.com` uses an isolated CloudFront distribution and
  callback-origin behavior. WAF query/URI/body fields are redacted, raw
  CloudFront standard access logging is disabled for that distribution, and a
  viewer-request edge function overwrites any viewer-supplied internal
  callback headers, moves any stable SAML-connection/webhook-endpoint path
  locator and OAuth query fields into non-logged origin-only headers, then
  removes the query and rewrites the URI to a stable internal callback route
  before any ALB hop. The callback service verifies signed `state` before
  extracting its one-time authorization locator; no OAuth redirect URI varies
  by transaction.
  Webhook bodies pass byte-for-byte unchanged. The callback service accepts
  those headers only with the rotated CloudFront origin-auth control; ALB sees
  neither sensitive path locator nor query. Sanitized telemetry records a
  request ID, provider, outcome, and keyed locator fingerprint, never the
  locator, code, state, signature, headers, or body. Policy tests reject
  callback access logging, missing WAF redaction, a body-changing edge
  function, direct-origin access, or ordinary application routing for a
  callback.
- The isolated operator origin applies the same no-raw-log, WAF-redaction,
  stable-callback rewrite, origin-auth, and clean-result-exchange controls to
  `/ops/callbacks/v1/auth/oidc`; its distribution, origin credential, headers,
  and telemetry destination are distinct from both customer callbacks and the
  ordinary operator application.
- ALB routes to ECS/Fargate API and SSE tasks.
- S3 uses CloudFront Origin Access Control and blocks public/direct access. ALB
  ingress accepts only the CloudFront origin path/network control plus a
  rotated origin-auth secret; application Host/origin validation rejects
  alternate hosts. Tests prove direct ALB/S3 access cannot bypass WAF, CDN
  headers, rate limits, TLS, or bot controls.
- Separate ECS services/task queues run control plane, general worker,
  connector, ingestion, and notification workloads.
- RDS PostgreSQL Multi-AZ is private, encrypted, PITR-enabled, and access
  controlled.
- ElastiCache Redis is private, encrypted, and non-authoritative.
- S3 buckets separate customer data, exports, audit archive, deployment
  artifacts, and logs with appropriate keys and policies.
- EventBridge/SNS/SQS provide decoupled events and DLQs.
- Temporal Cloud uses isolated namespaces and mTLS/API-key policy.
- Secrets Manager and KMS provide environment-separated secrets and keys.
- SES handles transactional email with bounce/complaint processing.
- OpenTelemetry collectors export approved telemetry.
- Recovery-region infrastructure is reproducible and isolated from primary
  failure.

### 18.4 Deployment units

| Unit | Scaling signal | Isolation reason |
|---|---|---|
| Web assets | CDN request/cache | Static delivery |
| API/SSE | CPU, latency, connections | Interactive control plane |
| General workflow worker | Temporal backlog/latency | Durable transitions |
| Agent worker | activity backlog, model concurrency/spend | Expensive/untrusted work |
| Connector worker | provider backlog/rate limit | Provider fault isolation |
| Ingestion worker | byte/page backlog | CPU/memory/parser isolation |
| Notification worker | delivery backlog | Channel degradation isolation |
| Outbox relay | pending age/count | Mutation-to-event durability |
| Admin/repair task | manual or scheduled | High-privilege isolation |

### 18.5 Delivery strategy

1. CI creates one versioned signed artifact per unit.
2. The same artifact is promoted to staging and production.
3. Database expand migration runs before application rollout.
4. Compatibility checks prove old and new code can coexist.
5. Canary receives synthetic and bounded real traffic.
6. Health, errors, SLO burn, security, migration, and business invariants gate
   progression.
7. Rollback restores the prior application artifact and compatible feature
   configuration.
8. Contract cleanup migration occurs only in a later milestone after old code
   is absent and rollback window closes.

Active Temporal runs remain compatible across worker versions using Temporal
worker versioning or deterministic patch markers.

### 18.6 Service objectives and alerts

Minimum SLIs:

- authentication success/error and latency;
- API availability and latency by route class;
- mutation durability and idempotency conflict;
- outbox pending age and publish failure;
- task readiness-to-dispatch latency;
- active run without recent event;
- Temporal workflow/activity failure and task-queue backlog;
- SSE connections, delivery lag, reconnect rate, and authorization failure;
- connector auth expiry, freshness, rate limit, and failure;
- webhook signature/replay/processing lag;
- document parse/index/ACL freshness;
- model latency, error, refusal, tokens, cost, and fallback;
- tool denial/failure/uncertain operation;
- approval age, SLA, and escalation;
- notification delivery lag/failure;
- usage reservation leakage and billing reconciliation;
- database saturation, replication, lock, storage, and backup;
- Redis, queue, object storage, and KMS dependency health.

Alerts use multi-window error-budget burn where applicable and link to a
versioned runbook.

### 18.7 Required runbooks

- authentication or session outage;
- suspected tenant-isolation incident;
- compromised OAuth/model/Stripe/API credential;
- unsafe agent or tool behavior;
- model provider outage or quality regression;
- connector outage, token revocation, or cursor corruption;
- webhook backlog or forgery spike;
- stuck runs and Temporal backlog;
- uncertain external side effects;
- database saturation, failover, or restoration;
- object-storage or indexing failure;
- billing event gap or incorrect entitlement;
- notification/email outage;
- data export/deletion failure;
- queue/DLQ growth and replay;
- regional outage and recovery;
- emergency global or tenant kill switch.

### 18.8 Residency topology and migration

| Workspace home | Primary data plane | Standby data plane | Independent protection region | Content-bearing services |
|---|---|---|---|---|
| United States | `us-east-1` | `us-west-2` | `us-east-2` | US database/object/index/queue/content logs in active/standby; encrypted WAL/PITR/object versions, recovery journal, and no serving workload in protection |
| European Union | `eu-west-1` | `eu-central-1` | `eu-west-3` | EU database/object/index/queue/content logs in active/standby; encrypted WAL/PITR/object versions, recovery journal, and no serving workload in protection |
| India (post-GA enablement gate) | `ap-south-1` | `ap-south-2` | An approved third India-only protection site/service | Disabled until every stateful service/provider and a three-site India-only protection/re-protection design pass `EXT-022`; two-region failover alone may restore reads but not writes |

- A minimal globally available routing directory stores HMAC-normalized email/
  domain/provider-subject locators, global user/workspace opaque IDs, identity
  home region, workspace home region, entitlement-routing summary, revocation
  epoch, and no display profile, raw email, session verifier, workflow content,
  document, or task payload. Its exact data/legal basis is approved by privacy.
- Each user has one identity home region containing raw identity links, profile,
  magic-link records, and the root rotating session family. Each workspace
  region stores its membership/role/group projection keyed by global user ID
  plus the minimum display attributes needed by that workspace.
- Sign-in resolves the identity home through the HMAC locator. A workspace
  switch exchanges a short-lived signed identity assertion for a workspace-
  region session after that region authoritatively checks current membership,
  role bindings, workspace status, and revocation epoch. Browser-provided
  workspace/region is never trusted routing authorization.
- Root-session revoke publishes a monotonic revocation epoch to every active
  workspace region; workspace suspension/removal is effective in that region’s
  committing transaction. Regional session caches recheck/expire within 60
  seconds, and sensitive/step-up operations contact authoritative identity
  state.
- During identity-home outage, new sign-in, recovery, and step-up fail closed.
  Existing workspace-region sessions may perform only their policy-declared
  low-risk operations until the 60-second revocation-proof freshness expires;
  then access fails closed. No failover creates a second session authority.
- SSO discovery uses an HMAC-domain locator to route to the workspace home.
  Invitations are created/accepted in the workspace home. User/workspace
  export or deletion uses the global opaque directory to fan out durable
  region-scoped jobs, then removes locators only after every region proves
  completion.
- Workspace content is encrypted with region/environment-separated KMS keys and
  is never replicated outside the row above. The protection region stores only
  the minimum encrypted continuous database log/PITR material, object versions,
  deletion/hold ledgers, configuration escrow, and opaque recovery journal
  needed to preserve the stated RPO; it runs no customer-serving API, search,
  worker, connector, or model workload.
- CDN/browser caches use explicit content classification and region policy;
  private content is not cached globally by default.
- Temporal history, queues, telemetry containing customer content, support
  diagnostics, and model/tool requests follow the same home-region matrix.
- A connector provider that necessarily processes outside the workspace policy
  is denied or requires an administrator-visible approved exception; it is
  never silently routed.
- Region migration uses the M32 state machine: eligibility scan, destination
  provision, encrypted bulk copy, continuous change capture, write fence,
  catch-up, validation, routing cutover, observation, source purge, and deletion
  evidence. Rollback is allowed only before the irreversible source purge.
- Every `W`, `I`, `P`, `U`, and `G` scope is `PROTECTED`, `REPROTECTING`, or
  `READ_ONLY_UNPROTECTED`. `PROTECTED` requires active and standby data planes
  plus a healthy distinct protection region, recovery journal, continuous WAL/
  backup/object replication within NFR-008, and verified deletion/hold
  propagation. After primary loss, the standby may accept writes only while
  that same third-region protection remains healthy. If the protection region
  or its RPO stream fails, mutation/effect admission closes before the bound is
  exceeded and the scope becomes `READ_ONLY_UNPROTECTED`. Re-protection
  provisions an approved distinct region/site, seeds encrypted recovery
  material and scope-wide claims, catches up WAL/objects/deletion ledgers, and
  verifies counts/digests and a restore before writes resume. When the old
  journal remains readable, it uses the ordinary source-close/destination-
  prepare generation barrier. When that journal region is actually lost but a
  complete authoritative data plane and possible-effect mirrors remain healthy,
  it uses only the Section 8.7 `LOST_SOURCE_JOURNAL` reconstruction branch and
  its explicit loss manifest. If neither proof source is available, it cannot
  replace protection or resume mutations.
- Protection streams never merge artifacts by wall time or destination object
  name. Every database/WAL/PITR and object/deletion stream has an immutable
  `protection_stream_generation` bound to authority incarnation, recovery
  epoch, source region and exact source cluster/bucket incarnation, PostgreSQL
  timeline/parent LSN or object-version lineage, destination vault/prefix, and
  KMS/role versions. Each checkpoint is append-only and hash-links WAL LSN/
  snapshot or object inventory/version counts/digests plus deletion/hold
  watermark. The protection gateway accepts current-lineage artifacts only
  under a signed `PROTECTION_STREAM` service-class lease; RDS backup
  replication, S3 replication, and custom shippers use epoch-specific
  destination vaults/prefixes and source-role conditions.
- Promotion revokes the old source replication role/rule, closes or marks
  uncertain its final checkpoint, records the promoted database's new
  PostgreSQL timeline/cluster incarnation and object-source incarnation with
  the verified parent checkpoint, and starts a new immutable destination
  namespace before `PROTECTED`. Delayed snapshots, WAL, inventories, object
  versions, or delete markers from the fenced original primary retain the old
  epoch/incarnation and are rejected or quarantined in that closed namespace;
  they can never advance the canonical new timeline or overwrite its restore
  manifest. Restore follows the authority-selected parent/child timeline chain
  and verifies every checkpoint/root.
- If the active standby is subsequently lost while the original primary is
  unavailable, the epoch authority fences it, the independent protection
  region preserves the affected-operation manifest and bounded recovery
  material, and restore targets the recovered original or another
  privacy-approved data-plane region. No mutation/effect is admitted from the
  protection region if doing so would leave no separate journal/protection
  destination. The ordinary four-hour RTO covers one regional loss; a compound
  second-region loss retains the RPO/correctness guarantee but uses its
  separately measured compound-disaster RTO and customer communication.
- Migration acquires a global workspace routing epoch and source-region write
  fence from its three-region MRSC `execution_scope_epochs` authority group.
  Workers, callback/trigger admission, queues, and the outbound proxy obtain a
  signed incarnation/region/epoch/generation/service-class data lease lasting
  no more than 30 seconds, renew no later than every 10 seconds, and fail
  closed when MRSC quorum is unavailable or proof is stale. Both old and new
  regions validate the lease in every authoritative-store mutation/worker
  commit; the credential/egress proxy also requires it before any provider
  request.
- Cutover first closes independent Route 53/edge/trigger admission and network/
  credential egress for the old region and stops old-region lease issuance. A
  conditional authority update fixes the old maximum lease expiry, increments
  the epoch, and sets the new-region lease opening time after that expiry plus
  five seconds of measured clock uncertainty and five seconds of safety. The
  new region cannot receive a lease or commit a mutation before that instant;
  the worst-case drain is 40 seconds. During the drain, the old journal
  generation closes, all old-generation time shards through its inclusive
  barrier are enumerated with strong reads, and the new generation records
  acceptance. Only after the lease drain, both generation records/digests,
  destination catch-up validation, and the authority's conditional transition
  succeed does new admission/egress open. The former primary cannot keep
  writing on a cached epoch; a live-but-partitioned region loses its final
  lease before the new region can receive one and cannot reach provider
  egress. One impaired authority region routes to another strongly consistent
  replica without changing incarnation/epoch; loss of MRSC quorum makes all
  new mutations/external effects fail closed until quorum restores—
  availability never creates two writers.
- A restored backup is filtered through the global deletion ledger before any
  customer route, index, worker, connector, or export can read it.

### 18.9 Operational ownership

Named individuals and deputies replace these role owners before staging. The
RACI/evidence record is part of `EXT-019`.

| Area | Accountable owner | Primary responder | Required review partner |
|---|---|---|---|
| Web/product experience | Product engineering lead | Web on-call | Product, accessibility |
| Identity/tenant boundary | Identity engineering lead | Platform on-call | Security/privacy |
| API/database | Platform engineering lead | Platform on-call | Database/security |
| Workflow/Temporal | Runtime engineering lead | Runtime on-call | Product operations |
| Agents/model/tools/sandbox | AI platform lead | AI on-call | Security, AI product |
| Files/knowledge/retrieval | Knowledge platform lead | Data/knowledge on-call | Privacy/security |
| Connectors/webhooks | Integrations lead | Connector on-call | Security/privacy |
| Billing/entitlements | Commerce engineering lead | Commerce on-call | Finance/support |
| Notifications/email/chat | Communications lead | Platform on-call | Support/privacy |
| AWS/IaC/delivery/DR | Cloud platform lead | Infrastructure on-call | Security/finance |
| Customer support/status | Support lead | Support duty manager | Operations/product |
| Security incident | Security lead | Security incident commander | Legal/privacy/executive |
| Privacy/deletion/residency | Privacy lead | Platform + privacy responder | Legal/security |

Each area must own dashboards, alerts, error budget, runbooks, deploy approval,
kill switches, incident/customer communication, evidence retention for at
least the contractual/audit period, and quarterly access/runbook review.

---

## 19. Backup, recovery, and graceful degradation

### 19.1 Backup controls

- RDS PITR with encrypted automated backups;
- scheduled logical verification/export for critical metadata where useful;
- cross-account standby and independent protection-region copy;
- S3 versioning, object lock for audit archive, replication according to data
  region policy, and lifecycle;
- infrastructure state protected and recoverable;
- Temporal recovery/namespace procedures aligned with service capability;
- versioned model, prompt, tool, schema, and connector code in source control;
- Redis, queues, and derived indexes treated as rebuildable.

### 19.2 Restore exercise

The exercise:

1. provisions isolated recovery infrastructure from Terraform;
2. restores database to a selected point;
3. restores or reconnects object data;
4. validates tenant counts, hashes, referential constraints, and audit chain;
5. holds external writes and notifications;
6. rebuilds caches and search/index generations;
7. reconciles Temporal state and external operation certainty;
8. samples workflows, runs, tasks, approvals, documents, citations, usage, and
   audit;
9. performs controlled read traffic;
10. enables writes only after an approved reconciliation decision;
11. applies the global deletion ledger and legal-hold registry before serving
    restored data;
12. proves that disallowed-region and previously deleted content is absent;
13. records achieved RPO, RTO, gaps, and remediation.

### 19.3 Degradation policy

| Failure | Product behavior |
|---|---|
| OpenAI unavailable | Continue human tasks/control plane; bounded policy fallback or queue agent work |
| One connector unavailable | Pause/retry its work; unrelated workflows continue |
| Redis unavailable | Bypass cache-only reads; presence/approximate hints degrade. Safety-critical claim, rate, budget, schedule, provider-concurrency, model/tool/connector, and external-effect paths use conservative PostgreSQL/Temporal control or fail closed; never become unbounded |
| Event bus delayed | Transactions continue into bounded outbox; alert/backpressure before exhaustion |
| Temporal unavailable | Accept only operations whose durable start intent can be reconciled; show queued |
| Search/index unavailable | Metadata and source browsing continue; retrieval-dependent agents wait/fail closed |
| Stripe unavailable | Existing entitlement cache continues; new checkout delayed; no local subscription guess |
| Email/Slack unavailable | In-app task and notification remain; delivery retries |
| Analytics/telemetry unavailable | Product transaction succeeds; local bounded telemetry buffering/drop policy |
| Object storage unavailable | Metadata reads continue; upload/artifact/retrieval operations pause |
| Primary region unavailable | Execute tested recovery plan; external writes remain frozen until reconciliation |
| Independent protection region/journal unavailable | Close mutation and external-effect admission before the 15-minute RPO bound; serve authorized reads/control only until re-protected |
| Active standby lost while original primary remains unavailable | Fence all writers/effects, preserve the third-region manifest/recovery material, restore to an approved data plane, and communicate the compound-disaster RTO |

Control actions—authentication, authorization, pause, cancellation, approval
denial, and kill switch—receive capacity priority over new expensive work.

### 19.4 Temporal recovery and split-brain fencing

`EXT-003` records the exact Temporal Cloud namespace region, retention,
replication/export/recovery capability, and provider RPO/RTO. Knotline does not
assume workflow-history replication that the contracted service does not
provide.

PostgreSQL remains the workspace product-state recovery source. Identity-home,
platform-control, public-intake, and global-directory state retain their
authoritative regional stores, but use the same recovery protocol. Every
non-terminal run has a pinned definition/policy, task/dependency states,
attempts, durable wait/due times, signals/intents, run events, and
external-operation receipts in the database. The independent protection-region
operation journal makes each scope's RPO-gap manifest derivable even when the
newest primary-store commits are lost:

- Every workspace (`W`), identity-home (`I`), platform-control (`P`),
  public-intake (`U`), and global-directory (`G`) API mutation,
  callback/inbound event, schedule dispatch, billing/usage event, and
  external-effect path deterministically selects its immutable scope and
  independent protection region, then conditionally appends `INTENT` before the
  primary transaction or effect send. If that write is unavailable, the path
  fails before the effect and does not acknowledge. A request cannot fall back
  to another scope class, shard, or journal region.
- After the primary PostgreSQL transaction commits, the path conditionally
  appends `COMMITTED` with its transaction/outbox fingerprint **before**
  returning an HTTP success, acknowledging a provider callback, activating a
  schedule/billing event, or allowing a claimed external operation to send.
  If this durable marker cannot be written, the API returns a stable
  `COMMIT_CONFIRMATION_PENDING` retryable outcome containing the stable
  operation ID and the caller's unchanged required `Idempotency-Key`;
  callbacks receive a retryable non-2xx and reuse their deterministic verified
  event identity, while schedules/work remain blocked under their deterministic
  dispatch ID. A reconciler may append the marker while the primary remains
  available, but no caller is told success first.
- Effect send and authoritative receipt each append their own immutable
  journal record. If an effect may have occurred but the send/receipt marker
  cannot be confirmed, the local operation becomes `UNCERTAIN`, dependent work
  remains blocked, and no success is reported or blind retry attempted.
- An intent may outlive a primary transaction that never committed. Recovery
  classifies every row as `NOT_COMMITTED`, `COMMIT_UNCONFIRMED`, `COMMITTED`,
  `UNCERTAIN`, or reconciled using marker state, restored idempotency/outbox/
  audit state, provider receipts, callback identifiers, and client retry
  evidence. Only `COMMITTED` rows could have received a product success
  acknowledgment.
- Records never erase an earlier record. No raw customer payload crosses
  regions through this journal; residency, retention, legal hold, deletion,
  encryption, and access evidence still apply.

A failed-over standby may acknowledge new writes while the original primary
remains unavailable only in `PROTECTED`: its journal gateway is still in the
distinct third region, encrypted WAL/PITR/object replication to that region is
within NFR-008, and journal/window/directory health is current. Journal or
protection lag closes admission before it exceeds the RPO. The active region
never journals to itself and never reverses the destination toward the failed
primary. `READ_ONLY_UNPROTECTED` permits only policy-safe reads and recovery
controls. `REPROTECTING` cannot enable mutations until the new independent
destination is seeded, caught up, digest/restore verified, and conditionally
registered in `execution_scope_epochs`. If the old protection journal is
unavailable, re-protection follows the `LOST_SOURCE_JOURNAL` branch in Section
8.7: it requires a healthy authoritative data-plane snapshot and complete
local possible-effect mirrors, emits explicit loss/reconstruction manifests,
and quarantines a later-returning source. It does not run the normal source-
close steps below or claim a source-generation root that cannot be read.

On regional recovery:

1. close old-region edge/trigger admission and outbound network/credential
   egress; conditionally stop all registration-lease issuance for the manifest
   boundary by freezing **every fixed `G` registration-admission shard in the
   environment across all control/residency pools**, plus its G-shard data-
   mutation lease issuance; atomically capture every admission cutoff/active-
   token map, fix all maximum expiries, and wait their maximum 30 seconds plus
   the five-second clock and five-second safety drain.

   For a readable G journal, mark its authority state `FENCING`, issue the
   endpoint-bound source-close/destination-prepare pair, and use only the source
   lease to drain/seal through the full client-token ambiguity horizon and fix
   its unsettled/carry/closure roots. Only after those roots verify, use the
   destination lease to create `PREPARING` and copy/verify claims plus carry
   records/pointers. If a G journal is genuinely unavailable, select the
   immutable `LOST_SOURCE_JOURNAL` branch instead: issue no source lease, use
   the frozen MRSC cutoff/active-token map and directory/epoch rows as its
   independent registration mirror, and let only the destination-reconstruct
   lease create `PREPARING` plus `LOST_SOURCE_MANIFEST`/
   `LOST_SOURCE_ACCEPTED`.

   Union every readable-source sealed `REGISTRATION_INTENT`, every frozen active
   token, and a strong enumeration of every directory shard and its `PENDING`,
   `REGISTERING`, `ACTIVE`, migrated, and tombstoned epoch row. Converge both
   target items for every known operation to matching terminal `ACTIVE` or
   `ABORTED`/tombstone state using operation/step-version conditions, strong-
   read them, and append `REGISTRATION_RESOLVED` in the destination `G`
   generation. A delayed initial, intermediate, or final registrar write must
   either serialize before terminalization or fail its condition afterward.
   Write/verify `SCOPE_MANIFEST_FIXED` and the branch-appropriate
   `GENERATION_ACCEPTED` or `LOST_SOURCE_ACCEPTED` over the resolution/scope-set
   digests before proceeding.
   This preliminary `G` barrier remains non-admitting, is the authoritative
   set—including new `W`, `I`, `P`, `U`, and `G` scopes absent from the restored
   product snapshot—and is idempotently recognized rather than repeated by
   step 9;
2. for every manifest scope not already fenced by step 1, conditionally stop
   old-region lease issuance, fix the maximum old lease expiry, increment the
   epoch, and set
   `new_lease_not_before` after that expiry plus five seconds of clock
   uncertainty and five seconds of safety. It issues no new-region data-
   mutation lease until that instant, so the maximum 30-second old lease cannot
   overlap a new writer even if the former primary remains live and
   partitioned. For each preliminary `G` shard, conditionally verify the same
   transition ID, already incremented epoch, fixed maxima, and opening bound;
   the update condition for this step requires no existing matching transition,
   so it performs no epoch-changing update for `G` and can never increment it
   twice. After the drain issue only the transition's missing endpoint-bound
   source-close/destination-prepare recovery-control leases needed for steps
   9–12; each preliminary `G` pair or destination-reconstruct credential
   remains bound to its already accepted branch/barrier, and no credential can
   authorize a data mutation or effect;
3. restore database/object state within the declared RPO and apply deletion/
   legal-hold ledgers;
4. use replicated Temporal history when the certified service provides it;
   otherwise start a deterministic recovery workflow ID
   `knotline/recovery/{epoch}/run/{runId}` from the database recovery snapshot;
5. rehydrate delays, SLA/approval waits, and scheduled signals from their
   absolute due times; never invent an already-missed user/provider signal;
6. treat an activity with a committed successful attempt as complete, retry a
   read/pre-send-safe activity only inside its remaining retry envelope, and
   mark any possibly sent non-idempotent effect `UNCERTAIN`;
7. reconcile every external operation and provider cursor before enabling
   dependent work or outbound egress;
8. compare the execution epoch on every task transition, signal, webhook,
   connector checkpoint, and operation claim so an old namespace/worker cannot
   commit after failover;
9. transition the old journal generation `OPEN` → `DRAINING`, reconcile or
   classify every admitted operation through its fixed cutoff and resolve every
   candidate through the ten-minute client-token horizon, then atomically
   `SEALED`; strongly enumerate every fixed unsettled shard and have the source
   lease record exactly that root/classification in `UNSETTLED_SEALED` and
   `CARRY_MANIFEST`. Use the separately endpoint-bound destination lease to
   prepare the new generation, copy/verify claims and those manifests, and
   write `CARRIED_FORWARD`/`LATE_COMPLETION` plus destination unsettled
   pointers there. Reject any later old append. For a `G` shard completed in
   step 1, verify the exact recorded branch, transition, accepted envelope, and
   digests idempotently instead of creating another generation; a lost-source G
   branch never attempts an old-generation seal/query/carry;
10. strongly query every declared base-table time-bucket shard for each affected
   scope from the restore point through cutover, expanded by the certified
   five-second writer-clock bound and one complete guard hour on each side;
   include every boundary hour, follow every selected or restored-active
   operation through all of its records, dereference and hash-compare every
   base/index pair, and verify acceptance-sequence continuity plus each sealed
   window's count/root/anchors and inclusion proof against the generation
   root. Union the time-window set with restored active operation IDs and every
   member of the old generation's `UNSETTLED_SEALED` root, following each from
   its first intent regardless of age. For a readable source, query through the
   final data sequence named by `GENERATION_CLOSED` and begin the new generation
   at the first/declared next sequence named by `GENERATION_ACCEPTED`; reject
   any gap, overlap, missing pointer/manifest member, unlinked duplicate,
   scope-wide claim mismatch, or digest mismatch. For a lost-source G branch,
   do not assert an old root: verify every frozen MRSC token/directory item,
   reconstructed destination record, and exact observable-category root plus
   the explicit `UNKNOWN` journal-only boundary in
   `LOST_SOURCE_MANIFEST`/`LOST_SOURCE_ACCEPTED`;
11. compare the complete readable-source window with restored data, provider
   receipts, and inbound IDs; publish an affected-operation manifest containing
   every mutation/event/effect intent, including `NOT_COMMITTED`,
   `COMMIT_UNCONFIRMED`, `COMMITTED`, and `UNCERTAIN`. For a lost-source branch,
   publish every observable/acknowledged/mutation/effect-capable operation plus
   the bounded `UNKNOWN` pre-primary journal-only category; never label it a
   complete intent inventory;
12. revoke/fence the former source's protection writer, close or quarantine its
   final immutable stream checkpoint, and prove the promoted standby is
   `PROTECTED` by the unchanged distinct third-region journal and a new
   authority-epoch/source-incarnation/PostgreSQL-timeline chain for WAL/PITR/
   object/deletion streams. Verify the parent checkpoint, per-stream sequence/
   LSN and manifest roots, current role/KMS binding, lag, and an isolated
   restore; then obtain operations/customer-communication approval. For every
   destination, including each already accepted preliminary `G` generation,
   the authority strong-reads either both normal barriers or the verified
   lost-source manifest/acceptance plus protection lineage, then conditionally
   records `OPENING`. Only that branch's endpoint-bound destination-prepare or
   destination-reconstruct lease changes `PREPARING` → `OPEN`. The authority
   then conditionally records `ACTIVE`/`PROTECTED`, revokes every issued control
   credential, and permits the first data lease/admission/egress. If the journal
   is not `OPEN` or independent protection is not healthy, issue no data lease,
   restore policy-safe reads only, and remain `READ_ONLY_UNPROTECTED`.

Recovery tests cover active branches, fan-out, retries, delays, long approvals,
paused/cancelling runs, child workflows, connector waits, model calls, and
uncertain writes; every `W`/`I`/`P`/`U`/`G` scope; a live-but-network-
partitioned former primary; epoch increment at the worst lease-issuance
instant; a maximum 30-second lease plus the full clock/safety drain; stale,
future, wrong-region, wrong-incarnation, and wrong-generation leases; old-store
commit rejection; one MRSC replica-region outage and separate quorum loss;
`INTENT` failure; primary commit followed by `COMMITTED`
marker failure; callback retry; missing/later receipt; journal orphan; boundary
hour and shard transitions with writer clocks at both certified error bounds;
an exact-hour restore point; an operation accepted before the recovery window
whose later send/receipt straddles it; an intent at least two hours before the
restore point whose RPO-gap primary commit loses its marker and is recovered
only through `UNSETTLED_SEALED`; missing or mismatched base/index/unsettled
pointers; acceptance-sequence or unsettled-manifest gaps; source-only carry
attempt; closing/carry/acceptance or scope-wide claim-ledger digest mismatch;
`COMMIT_CONFIRMATION_PENDING`, public-anonymous, and provider-callback retries
across old/new generation handoff; scope created after the restored snapshot
but before incident freeze; incident-mapped registration attempted through
each otherwise unaffected fixed G shard; late old-generation marker/receipt
after `SEALED`; window-manifest inclusion/anchor corruption;
continued acknowledged writes on standby while the original primary remains
unavailable and the third region is healthy; protection-region loss and
fail-closed re-protection using both readable-source and actual
`LOST_SOURCE_JOURNAL` branches; a journal-only non-G intent with no primary
mirror immediately before source loss, which must produce an `UNKNOWN` bounded
population rather than a fabricated identity/count; missing reconstruction
mirror/ledger/provider proof; quarantined returning journal; subsequent standby
loss with original primary still down; delayed old-primary WAL/snapshot/object/
delete-marker delivery after standby promotion, proving it remains in the
closed old timeline and cannot advance/overwrite the canonical manifest;
recovery-control lease attempts
against product DB, `INTENT`, `SEND_STARTED`, task claims, and provider egress,
all of which must fail; one MRSC authority-region isolation with uninterrupted
linearizable issuance and a separate quorum-loss fail-closed/RTO exercise; and
Redis failure are mandatory cases. A reconstructed run retains the same
product run ID and event lineage while recording the new orchestration/recovery
generation.

---

## 20. Universal milestone quality gate

The universal gate manifest runs after every milestone. A row is `ACTIVE`,
`NOT_YET_APPLICABLE`, or `BLOCKED_EXTERNAL`; only `ACTIVE` rows can pass or
fail. `NOT_YET_APPLICABLE` requires the owning activation milestone from
Section 20.6 and is not counted as a pass. `BLOCKED_EXTERNAL` requires the
external gate ID and blocks the corresponding environment state. Once a row
activates, it remains cumulative and release-blocking. M38 activates every row.

### 20.1 Required automated checks

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:property
pnpm test:integration
pnpm test:db
pnpm test:rls
pnpm test:contract
pnpm test:api
pnpm test:e2e
pnpm test:a11y
pnpm test:visual
pnpm test:security
pnpm test:evals               # once agent milestones begin
pnpm build
pnpm verify:brand
pnpm verify:boundaries
pnpm verify:openapi
pnpm verify:events
pnpm verify:migrations
pnpm verify:licenses
pnpm verify:secrets
pnpm verify:dependencies
pnpm verify:containers
pnpm verify:iac               # once infrastructure milestones begin
```

Scripts are introduced no later than their activation milestone. Before then,
the gate manifest records the row as `NOT_YET_APPLICABLE`; a silent no-op script
is prohibited. Once introduced, it remains part of the cumulative gate.

### 20.2 Mandatory test categories

| Category | Required proof |
|---|---|
| Static/build | Formatting, real lint, strict types, brand/provenance guard, package boundaries, reproducible build |
| Unit | State, policy, validation, error classification, pure transformations |
| Property/model-based | Graphs, branches, joins, concurrency, retry, cancel, ledger properties |
| Database | Constraints, RLS, tenant FKs, append-only and immutable behavior |
| Migration | Realistic upgrade, bounded locks, mixed-version compatibility, forward fix |
| API | Schema, errors, pagination, ETag, CSRF, CORS, idempotency, auth |
| Event | Compatibility, duplicate, reordered, delayed, large reference |
| Tenant isolation | Every endpoint, repository, cache, search, stream, object, and worker |
| Browser E2E | New and all previously completed critical journeys |
| Responsive | 320, 480, 768, 1024, 1440, and wide layouts; portrait/landscape where applicable |
| Accessibility | axe plus keyboard and screen-reader critical-flow checks |
| Visual | Stable component and route screenshots with reviewed diffs |
| Concurrency | Conflicting edits, duplicate requests, stale fencing, simultaneous completion |
| Security | Auth replay, BOLA, webhook, injection, upload, agent, SSRF, secret leakage |
| Connector | Contract, sandbox, scopes, refresh, cursor, throttle, outage, deletion |
| Knowledge | Recall, precision, citation, ACL, freshness, deletion |
| Agent | Quality, schema, tool selection/args, safety, injection, latency, cost |
| Billing | Event reorder/duplicate, ledger/reservation, grace, reconciliation |
| Privacy | Export, deletion, retention, hold, backup and subprocessors |
| Performance | Route latency, bundle, UI responsiveness, database query plans |
| Load/resilience | Spike, soak, hot tenant, dependency failure, backlog recovery |
| Observability | Trace continuity, redaction, SLI correctness, synthetic alert |
| Deployment/recovery | Canary, rollback, kill, migration compatibility, restore |

### 20.3 Required manual product review

For every new or changed route:

- desktop, tablet, and mobile visual review;
- keyboard-only completion;
- manual WCAG review of every unique changed component and every `REQUIRED`
  route-state cell from Section 5.8, including keyboard, focus order, visible
  focus, semantics/name-role-value, announcements, zoom/reflow, contrast,
  motion, target size, and the relevant assistive technology;
- copy, labels, destructive consequence, and contextual help;
- real-data truthfulness; no misleading demo metric;
- analytics and audit behavior;
- browser console and network error review;
- cross-workspace cache-switch review.

Required manual assistive-technology combinations for each changed critical
journey are:

| Platform | Browser / assistive technology | Minimum evidence |
|---|---|---|
| Windows | Current Chrome + NVDA | Keyboard transcript, focus screenshots, spoken-output notes, defects |
| macOS | Current Safari + VoiceOver | Rotor/landmark/form/announcement notes and defects |
| iOS | Current Safari + VoiceOver | Touch exploration, form/action completion, rotation/reflow |
| Android | Current Chrome + TalkBack | Touch exploration, form/action completion, keyboard appearance |
| Windows | Current Edge + 200%/400% zoom, high contrast, Voice Access | Reflow, visible focus, target naming, no clipped critical control |

M02 establishes the component/shell matrix; each later milestone tests changed
components, route states, and critical journeys; M33 and M38 rerun the complete
route/component/state inventory and critical-journey AT matrix. Any WCAG 2.2
A/AA failure, inaccessible critical action, focus loss/trap, missing accessible
alternative, or content hidden at 400% zoom blocks acceptance.

### 20.4 Evidence packet

Before the milestone commit, the repository stores its reviewable, non-secret
evidence declaration under:

```text
artifacts/verification/Mxx/
  declaration.json
  traceability.json
  test-results/
  screenshots/
  accessibility/
  security/
  performance/
  migrations/
  evals/
  deployment/
```

Large generated evidence is retained in CI artifact storage when repository
storage is inappropriate and is referenced by stable logical evidence names in
the declaration. The pre-commit declaration records the tests, reviews,
requirements, risks, environment intent, and external gates but deliberately
does not claim its own source commit or a CI run that does not yet exist.

`declaration.json` is schema validated and contains at least:

```json
{
  "schemaVersion": 1,
  "milestone": "M00",
  "targetEngineeringState": "COMMITTED",
  "declaredEnvironmentState": "NOT_DEPLOYED",
  "owners": [],
  "requirements": [],
  "activeGateRows": [],
  "notYetApplicable": [{"row": "name", "activationMilestone": "M00"}],
  "environmentGates": [
    {
      "criterionId": "M34.ENV.fresh-staging-bootstrap",
      "sourceBulletDigest": "sha256:...",
      "requiredTerminalState": "STAGING_VERIFIED",
      "actualState": "NOT_DEPLOYED",
      "environmentId": null,
      "evidenceUris": []
    }
  ],
  "externalGates": [],
  "testRuns": [],
  "manualReviews": [],
  "deployments": [],
  "migrations": [],
  "flags": [],
  "knownRisks": [],
  "evidenceUris": []
}
```

After the commit, CI creates a signed immutable `manifest.json` in the evidence
store. It contains the declaration digest plus actual `sourceCommit`, workflow
and job identifiers, start/end timestamps, artifact/image/SBOM/provenance
digests, test results, deployment identifiers, reviewer attestations, and
immutable evidence URIs. The evidence index is keyed by milestone and source
SHA, so a later milestone or explicit governance commit can reference it
without amending the commit it certifies. The source document never attempts to
contain the hash of its own commit, and absence of a self-referential repository
edit is not treated as missing evidence.

### 20.5 No-waiver invariants

Every milestone re-proves, for the architecture introduced so far:

- all applicable invariants in Section 9.7;
- two-tenant isolation at API, repository, RLS, stream, cache, search, object,
  connector, and worker boundaries introduced so far;
- no secret or configured sensitive content in browser storage, logs, traces,
  queue bodies, analytics, artifacts, or error responses;
- previous critical journeys;
- API/event backward compatibility;
- idempotency and duplicate delivery;
- migration and rollback/forward-fix;
- feature kill and operational rollback;
- performance and cost budgets;
- documentation, data flow, threat model, ownership, dashboards, and runbooks.

An invariant whose owning system does not yet exist is
`NOT_YET_APPLICABLE`, with its activation milestone. After activation, no
waiver or skip is allowed.

### 20.6 Gate lanes and activation matrix

| Lane | Trigger and maximum target duration | Contents |
|---|---|---|
| PR | Every change; target ≤ 20 minutes | Format/lint/type, affected unit/integration/API, schema/contracts, build, secret/dependency/license diff |
| Milestone | Before milestone commit; target ≤ 90 minutes excluding explicitly external suites | All active deterministic suites, complete cumulative critical E2E, evidence/schema, manual changed-surface review |
| Nightly | Scheduled; target ≤ 4 hours | Full property/concurrency, browser matrix automation, visual, security/DAST, eval, connector fixture, migration, soak-lite |
| Staging | Before environment promotion | Real provider sandboxes, migration/canary/rollback, alert/kill-switch exercise, manual AT, selected load/chaos |
| Release | M38 | Every row, full provider certification, Section 4.2 profiles, 24-hour soak, penetration retest, restore/DR, all manual matrices |

Coverage-profile dimensions activate independently:

| Dimension | Owner-milestone `[ENG]` minimum | Cumulative/nightly | Full activation |
|---|---|---|---|
| Locale/content | English plus pseudo-locale, message/placeholder/schema lint, locale-neutral fixtures | Every translation already introduced | M33: all six production locales and human linguistic evidence; M38 reruns |
| Responsive | Automated 320, 768, and 1440 widths plus changed-state manual phone/desktop review | All six Section 5.9 widths in visual/browser automation | M33: physical iOS/Android, portrait/landscape, safe-area/PWA; M38 reruns |
| Browser | Pinned current Chromium for deterministic milestone E2E | Current Chrome/Firefox/WebKit automation and previous-build compatibility nightly | M33: exact current/previous supported desktop browsers and physical mobile browsers; M38 reruns |
| Accessibility | Semantic/unit/axe, keyboard completion, zoom/reflow, and AT smoke for the changed critical control | Changed journey on NVDA or VoiceOver as relevant; accumulated automated matrix nightly | M33: every route/component/state plus complete NVDA, macOS/iOS VoiceOver, TalkBack, zoom/high-contrast, and Voice Access matrix; M38 reruns |
| Visual/manual | Changed components/states at active locales/viewports with owner review | Stable automated screenshot set and reviewed diffs | M33 complete product matrix; M38 release-candidate review |
| Provider/environment | Deterministic recorded fixture/emulator | Available real sandbox rows in staging, each retaining independent state | M38: every provider row with `gaRequired: true` reaches its exact `requiredTerminalState`; every amended row has a truthful non-`LIVE` label |

The ≤90-minute milestone target includes only deterministic automation and the
changed-surface manual review in the owner-milestone column. Nightly, staging,
physical-device, linguistic, independent, soak, and full manual-AT work keeps
separate evidence and may take longer; it cannot be silently counted as a
milestone-lane pass before its activation point.

One infrastructure-caused retry may diagnose a failed test, but a milestone
requires a clean final run with no retry-dependent pass. A flaky test is a
defect: quarantine is time-bounded, owned, and blocks any milestone whose
journey it protects. M38 permits zero quarantine or unexplained skip.

| Activated by | Gate capabilities activated and cumulative thereafter |
|---|---|
| M01 | Format, lint, strict type, unit coverage, build, brand/provenance guard, package boundaries, license, dependency, secret, evidence, docs validation |
| M02 | Browser E2E, automated accessibility, responsive/visual regression, bundle and Web Vitals smoke |
| M03 | Real PostgreSQL integration, migration, RLS/tenant isolation, query plan, backup smoke |
| M04 | Auth/session/CSRF/CORS/abuse security suite |
| M06 | Workflow schema/property, API/OpenAPI, event compatibility |
| M10 | Temporal replay/restart/concurrency/idempotency, outbox/DLQ, runtime load-lite, kill/repair smoke |
| M12 | Restricted task/comment attachment upload, checksum/quota, quarantine/malware, authorization, download, and lifecycle gate |
| M15 | Model contract/live-sandbox gate, structured output, evaluation smoke, AI usage/cost and kill switch |
| M16 | Tool/credential/SSRF/sandbox security |
| M18 | Full agent evaluation, release/canary/rollback |
| M19 | File malware/parser/object lifecycle |
| M20 | Retrieval quality/ACL/citation/performance |
| M22 | Connector contract/OAuth/webhook/sync fixture suites |
| M23–M25 | Each named provider’s real sandbox certification row |
| M27 | Notification delivery/render/access-recheck |
| M29 | Billing/entitlement/ledger/Stripe sandbox |
| M31 | Privacy/export/delete/retention/hold/restore-deletion |
| M32 | SSO/SCIM/policy/residency/migration |
| M33 | Complete browser/device/locale/PWA/guest/support/manual AT matrix |
| M34 | AWS staging Terraform/fresh deploy/canary/rollback plus workforce operator identity, trace/redaction/SLI/alert/runbook/kill/game-day |
| M35 | SAST/DAST/IaC/container/SBOM/signature/penetration evidence |
| M36 | Section 4.2 full load/soak/chaos/backup/restore/DR profiles |
| M37 | Terraform, fresh bootstrap, deployment, migration, canary, rollback |
| M38 | Every gate row above and every external gate in GA scope; zero gate-row N/A/skip/quarantine. Reasoned route-state `NOT_APPLICABLE` remains governed by Section 5.8 |

### 20.7 Quantitative quality thresholds

- Unit coverage after M01: at least 85% statements/lines/functions and 80%
  branches overall; at least 95% branch coverage for authorization, state
  transitions, idempotency, ledger, approval, secret, and policy modules.
- New or changed executable lines: at least 90% covered unless generated or
  declarative code is explicitly excluded by reviewed configuration.
- Static checks allow zero error or warning introduced by the milestone.
- API/event/schema compatibility allows zero unversioned breaking change.
- Accessibility allows zero critical/serious automated violation and zero
  WCAG A/AA manual failure.
- Visual diffs require approval by the product/design owner and accessibility
  owner when semantics change; unreviewed diffs fail.
- Security allows zero unexpired critical/high finding. Medium findings need an
  owner, mitigation, and expiry before the next production environment gate.
- Tenant-isolation, authorization, ledger balance, audit integrity, duplicate
  external effect, secret leakage, deletion resurrection, and citation-
  permission tests allow zero failure.
- Performance uses the exact Section 4.2 profiles; a regression exceeding 10%
  against the stored baseline fails even if the absolute NFR still passes,
  unless a reviewed tradeoff updates the baseline and cost model.
- Database migration lock acquisition must fail fast within five seconds;
  ordinary expand migrations hold blocking locks below one second on the
  reference dataset, while longer backfills are resumable online jobs.

### 20.8 Milestone activation and rollback record

Every milestone evidence packet declares:

1. accountable product and engineering owners;
2. target environment (`local`, `development`, `staging`, or `production`);
3. feature flag and safe default—new external writes and expensive work default
   off outside deterministic tests;
4. data migration compatibility and rollback/forward-fix path;
5. exact smoke journey and synthetic account/tenant;
6. rollout cohort/percentage and minimum observation window;
7. quantitative rollback triggers;
8. kill-switch/in-flight behavior;
9. dashboards, alerts, runbook, and responder;
10. external gates and the public `LIVE`/`BETA`/`DEMO`/`PLANNED` label.

Engineering milestones through M33 may remain `NOT_DEPLOYED` or
`STAGING_VERIFIED`; no customer-facing production activation occurs merely
because code is committed. M34–M37 make the shared operational and delivery
platform production-capable. M38 is the only initial GA promotion authority.

### 20.9 Summative usability and activation gate

Functional success is insufficient if representative users cannot understand
the product. M33 conducts the first complete study against its immutable
candidate digest in the named production-equivalent staging deployment before
an M38 release candidate exists. M38 reruns the summative calculations and
affected/retest tasks against its exact frozen release-candidate deployment.
Both use realistic synthetic data:

| Cohort | Minimum sample and task | Pass threshold |
|---|---|---|
| New workspace owners | 12 target users complete `CJ-03` from sign-in through a real non-demo successful run | At least 10/12 without moderator intervention; median ≤ 20 minutes; zero critical error or accidental external effect; at most 25% need help beyond in-product guidance |
| Workflow builders | 8 target users complete `CJ-05` and diagnose one invalid workflow | ≥ 90% completion; median ≤ 30 minutes; validation cause/remedy correctly explained by ≥ 7/8 |
| Human contributors/approvers | 8 per role complete `CJ-08`/`CJ-09` on desktop and phone | ≥ 90% completion; median ≤ 5 minutes per task/decision; exact consequence correctly understood by every approver before action |
| Agent/integration administrators | 8 administrators complete `CJ-10`/`CJ-13` including scope/risk review | ≥ 90% completion; no participant grants the intentionally over-broad fixture; rollback/reauth location found by ≥ 7/8 |
| Run operators/on-call | 8 operators complete injected failure and containment portions of `CJ-07`/`CJ-23` | ≥ 90% choose a safe action; median diagnosis ≤ 10 minutes; zero blind replay of an uncertain effect |
| Guest and accessibility participants | At least 6 guests; separately, at least 3 regular users for each modality: Windows NVDA/keyboard, macOS VoiceOver, iOS VoiceOver/touch, Android TalkBack/touch, 400% zoom/high contrast, and voice access. One participant may count for at most two modalities | Every modality is reported separately and all 3 complete its assigned journeys without moderator takeover; zero access escape, focus trap, unlabeled consequence, or assistive-technology blocker |

All cohorts target a Single Ease Question median of at least 5.5/7 and overall
System Usability Scale of at least 80. A critical safety/privacy/authorization
error or repeatable task blocker fails regardless of average. Major confusion
must be fixed and retested; lower-severity findings require an owner and M38
review.

Accessibility study assignments include, at minimum: NVDA and macOS VoiceOver
complete CJ-03, CJ-05 outline, CJ-08, and CJ-09; iOS VoiceOver and TalkBack
complete CJ-08, CJ-09, CJ-15, CJ-20, and CJ-22; zoom/high-contrast completes
CJ-03, CJ-05 outline, CJ-09, CJ-18 administration, and CJ-23; voice access
completes CJ-08, CJ-09, and CJ-20. Findings, completion, time, assistance, and
SEQs are reported by modality and journey, never only as a pooled average.

Product telemetry defines activation as: verified user → real workspace
created/joined → non-demo workflow published → real durable run reaches
`SUCCEEDED` and is inspected. Beta exit requires at least 80% of 10 or more
design-partner workspaces that begin guided activation to reach this outcome
within 24 hours, no workspace blocked by an undisclosed product defect, and no
critical support issue open. Funnel exclusions, consent, sample size,
confidence, abandonment reason, help use, and demo/test exclusion are shown;
the percentage is never presented without its denominator.

---

## 21. Git and milestone execution protocol

### 21.1 Before milestone work

1. Confirm every direct dependency has engineering state `COMMITTED`.
2. Read this milestone and its dependencies.
3. Check `git status --short`; preserve unrelated user changes.
4. Record milestone status as `IN_PROGRESS`.
5. Create or update the milestone’s requirement-to-test checklist.
6. Verify required provider credentials or mark exact external gates.

### 21.2 During milestone work

- Keep the product usable throughout the milestone.
- Prefer vertical product slices over disconnected infrastructure.
- Add tests with the behavior, not after all implementation.
- Update schemas, API contracts, events, UI states, audit, analytics,
  authorization, and operations together.
- Use expand/contract database changes.
- Do not mix unrelated cleanup into the milestone.
- Do not silently reduce scope when an implementation is difficult.

### 21.3 Milestone completion

1. Run every milestone-specific test.
2. Run the complete universal gate applicable at that point.
3. Perform required manual product review.
4. Update screenshots/evidence and set this file’s engineering status to
   `COMMITTED` as part of the atomic final milestone commit; record environment
   and external states separately.
5. Confirm no placeholders, skipped tests, accidental secrets, generated junk,
   or misleading product labels.
6. Review `git diff` and `git status`.
7. Commit only verified work using the exact or equivalently clear Conventional
   Commit message specified by the milestone.
8. Let CI create the immutable post-commit evidence manifest keyed to the
   resulting SHA and attach its URI to the milestone/release evidence index.

### 21.4 Commit rules

- One acceptance-complete milestone produces one required final milestone
  commit; broad milestones also use the mandatory green checkpoint commits in
  Section 21.5.
- If intermediate safety commits are necessary, the last commit still uses the
  specified milestone message and milestone acceptance occurs only then.
- Never use `--no-verify` to pass a gate.
- Never amend or force-push user work without explicit instruction.
- A failing test blocks the milestone commit.
- Engineering work may be `COMMITTED` while its independent external state is
  `BLOCKED_EXTERNAL`, but no dependent production gate may treat that
  capability as live.
- Every commit message describes the credible product addition, not only the
  implementation mechanism.

### 21.5 Mandatory green checkpoints for broad milestones

These checkpoints keep each large outcome reviewable and the repository green.
Each checkpoint gets a conventional commit and runs its active gate; the
parent milestone is accepted only by its specified final milestone commit.
Checkpoint commits do not reduce any parent deliverable.

| Parent | Required sequential checkpoint outcomes |
|---|---|
| M02 | `M02a` tokens/primitives/workbench; `M02b` public routes and truthful content states; `M02c` responsive authenticated shell and full accessibility/error-state review |
| M05 | `M05a` workspace/membership/tenant switching; `M05b` invitations/groups/RBAC/ownership; `M05c` persisted onboarding/sample-data foundation |
| M06 | `M06a` typed workflow persistence; `M06b` validation/version/publish/diff; `M06c` templates/import/export/library organization |
| M07 | `M07a` form/outline editor; `M07b` complete canvas command parity; `M07c` autosave/conflict/offline/performance/accessibility |
| M10 | `M10a` persisted DAG/start/outbox/minimal Temporal execution plus authoritative entitlement/budget/reservation ledger; `M10b` branch/join/wait/retry/subworkflow/pause/cancel; `M10c` fencing/reconciliation/DLQ/fairness/operator repair |
| M16 | `M16a` registry/policy/vault; `M16b` broker/credential proxy/external-operation journal; `M16c` isolated sandbox and adversarial certification |
| M22 | `M22a` connection/OAuth lifecycle; `M22b` durable sync/webhook/reconciliation; `M22c` SDK/certification/health/kill controls |
| M29 | `M29a` plan/entitlement enforcement; `M29b` reservation/usage/budget ledgers; `M29c` complete Stripe subscription and billing UX |
| M31 | `M31a` immutable audit; `M31b` retention/hold/export; `M31c` deletion/support-access/privacy proof |
| M33 | `M33a` PWA/push/offline; `M33b` guest access; `M33c` localization/browser/accessibility; `M33d` help/support/diagnostics/legal truth |
| M34 | `M34a` AWS staging/accounts/network/data foundation; `M34b` signed deployment/telemetry/SLOs; `M34c` isolated workforce identity, operator controls, alerts, runbooks, and on-call game day |
| M37 | `M37a` production account/residency/key promotion from M34 modules; `M37b` production workload/delivery hardening; `M37c` migrations/canary/rollback/fresh-production proof |

Checkpoint messages use `feat(Mxxa): <credible outcome>` (or the appropriate
`chore`, `security`, `perf`, or `infra` type). The final checkpoint may be the
parent’s required commit when it contains the remaining parent acceptance and
status/evidence updates.

### 21.6 M38 two-phase release finalization

M38 avoids a commit/tag/evidence cycle:

1. **Release-candidate certification before commit.** All M38 `[ENG]` criteria
   and all prerequisite `[ENV]`/`[EXT]` evidence pass against one immutable
   candidate index-tree hash/artifact digest. The release manifest input,
   migration set, rollback target, flags/config, and proposed version are
   frozen; the release commit is created from that exact staged tree.
2. **Release commit and RC identity.** Commit
   `release: certify Knotline for general availability`. CI verifies that the
   commit tree equals the frozen index tree, adopts the already certified
   build-once artifact, and independently reproduces it byte-for-byte. A tree
   or artifact-digest mismatch rejects the candidate. CI then signs the
   immutable RC evidence manifest and creates a signed `vX.Y.Z-rc.N` tag or
   equivalent candidate identity. No file tries to record its own SHA.
3. **Post-commit `[GA]` qualification.** Deploy only that signed digest to the
   production canary; run safe smoke, migration/compatibility, rollback and
   isolated exact-artifact restore verification, observe quantitative gates,
   and obtain the named promotion approvals. Each result creates a new signed
   append-only successor attestation keyed by the release SHA and referencing
   the preceding digest; no immutable record is mutated.
4. **Promotion or rejection.** On pass, create the signed `vX.Y.Z` GA tag
   pointing to the same SHA and a signed promotion attestation that records
   production deployment IDs, observation window, approvals, and final
   environment/external states. On failure, rollback, mark the RC rejected,
   withhold the GA tag, create a corrective commit, and repeat M38; never amend
   the failed candidate.

The post-commit attestation—not a follow-up source edit—is the terminal M38
evidence. Therefore restoration/tag/canary checks are `[GA]` criteria, not
preconditions for creating the release commit they identify.

---

## 22. Milestone dependency map

This edge list is authoritative and must agree with every detailed `Depends
on` field. A milestone can begin only when all direct dependencies are
`COMMITTED`.

| Milestone | Direct dependencies | Required join or purpose |
|---|---|---|
| M00 | — | Existing baseline |
| M01 | M00 | Engineering contract |
| M02 | M01 | Product shell; may proceed in parallel with M03 |
| M03 | M01 | Data/tenant foundation; may proceed in parallel with M02 |
| M04 | M02, M03 | Authentication joins the final route/layout contract and tenant store |
| M05 | M04 | Workspace/RBAC/onboarding foundation |
| M06 | M05 | Workflow definitions |
| M07 | M02, M06 | Complete studio uses final shell |
| M08 | M07 | Deterministic generation/import/dry run; consumed by M15 and joined explicitly at M38 |
| M09 | M07 | Collaboration; joined by M27 and M38 |
| M10 | M06 | Runtime does not wait for collaboration |
| M11 | M02, M10 | Run operations UX |
| M12 | M05, M10, M11 | Human task vertical |
| M13 | M12 | Approval/SLA vertical |
| M14 | M05, M07 | Agent definition/foundry |
| M15 | M08, M10, M14 | Model gateway plus real generation/first run |
| M16 | M14, M15 | Tool/credential/sandbox |
| M17 | M10, M13, M15, M16 | Governed agent execution with the authorized-context contract |
| M18 | M17 | Agent release/evaluation |
| M19 | M03, M12, M16 | Safe files/document processing |
| M20 | M15, M17, M19 | Permission-aware retrieval and real agent-context integration |
| M21 | M20 | Entity graph/knowledge operations |
| M22 | M03, M16, M19, M20 | Connector platform |
| M23 | M22 | Knowledge provider connectors; joined explicitly at M38 |
| M24 | M22 | Work/communication provider connectors; joined explicitly at M38 |
| M25 | M22 | Microsoft/CRM/generic connectors; joined explicitly at M38 |
| M26 | M10, M13, M22 | Trigger/outbound platform can use fixture connectors |
| M27 | M09, M12, M13, M24, M26 | Notification join, including certified collaboration-channel adapters |
| M28 | M11, M12, M18, M21, M27 | Search/analytics join |
| M29 | M05, M10, M15, M19, M28 | Billing/usage/entitlement join |
| M30 | M05, M10, M22, M26, M29 | Developer platform |
| M31 | M21, M27, M29, M30 | Governance/privacy join |
| M32 | M04, M05, M31 | Enterprise identity/residency |
| M33 | M02, M12, M27, M31, M32 | Global/PWA/guest/support experience |
| M34 | M18, M23, M24, M25, M33 | Joins every product/provider branch, creates AWS staging foundation, and unifies operations |
| M35 | M30, M31, M32, M33, M34 | Security/compliance assurance |
| M36 | M18, M21, M26, M28, M29, M34, M35 | Full load/resilience/DR |
| M37 | M32, M34, M35, M36 | Reproducible AWS delivery |
| M38 | M08, M09, M11, M12, M13, M18, M21, M23, M24, M25, M26, M27, M28, M29, M30, M31, M32, M33, M34, M35, M36, M37 | Explicitly joins every product, provider, enterprise, assurance, and delivery branch |

Parallel work is allowed where the dependency graph permits, but commits land
in an order that keeps the repository green and each milestone credible.

---

## 23. Detailed implementation milestones

### M00 — Knotline visual and repository baseline

**Status:** `COMMITTED`\
**Depends on:** —\
**Commit:** `c1a2f16`\
**Required commit:** `chore: establish Knotline product foundation`

#### Outcome

A user can open an original Knotline operations shell, view a workflow library,
and explore a responsive XYFlow workflow map backed by a small versioned API or
explicit demo fallback.

#### Accepted contents

- pnpm TypeScript monorepo;
- React/Vite web application;
- Fastify API;
- shared workflow contracts;
- original Knotline visual language;
- workflow library and interactive map;
- health, bootstrap, list, detail, and create API baseline;
- local PostgreSQL/pgvector, Redis, and MinIO definitions;
- initial API catalog tests;
- baseline research and product documents.

#### Verified gate

- type check passed;
- API tests passed;
- production build passed;
- live API health and workflow list responded.

#### Known limitations carried into M01

- in-memory workflow repository;
- demo fallback and hard-coded bootstrap identity;
- no authentication, PostgreSQL migrations, RLS, durable runtime, workers,
  connectors, billing, CI, IaC, or production assurance;
- `lint` is not yet a real linting policy;
- web/contracts suites currently allow zero tests.

---

### M01 — Engineering quality system and implementation contract

**Status:** `COMMITTED`\
**Depends on:** M00\
**Required commit:** `chore: establish the verified Knotline engineering system`

#### Product addition

The product gains a reproducible, continuously verified foundation: every
future feature can be implemented without silently breaking the working
experience.

#### Deliverables

- Pin supported Node and pnpm versions using repository configuration.
- Add Prettier and ESLint with React, accessibility, import, promise, security,
  and TypeScript rules.
- Add `verify:brand`, enforced locally and in CI, that scans every authored
  tracked file and generated runtime artifact outside `docs/` for Trace.so
  domains, brand names, identifiers, copied strings, known source-asset hashes,
  and prohibited provenance markers. Keep the narrow, reviewed allowlist
  limited to standard tracing terminology and immutable third-party package
  metadata; the scanner configuration itself uses neutral rule IDs rather than
  embedding the prohibited product branding throughout application code.
- Add package-boundary enforcement.
- Add root scripts named in the universal gate, initially delegating only to
  suites that exist and failing when a required suite has no tests.
- Add Vitest configuration, coverage thresholds, fake clock, deterministic ID
  generator, and shared two-tenant test fixtures.
- Add Playwright browser test project, device profiles, trace/video-on-failure,
  and screenshot baseline mechanism.
- Add axe integration and one keyboard smoke test.
- Add testcontainers or equivalent ephemeral PostgreSQL/Redis/MinIO test
  harness.
- Add typed environment loader that fails on missing or unsafe production
  values.
- Add OpenAPI generation/check from shared transport schemas.
- Add event-schema compatibility registry and checker.
- Add machine-readable requirement, milestone, dependency, route, route-state,
  critical-journey/branch, external-gate, and traceability registries generated
  from or checked against this plan; reject unknown, duplicate, orphaned,
  cyclic, dependency-incomplete, or unevidenced identifiers and map each code
  route/OpenAPI operation back to its contract.
- Add schemas and validators for the pre-commit evidence declaration,
  post-commit immutable manifest, `route-coverage.json`, and per-requirement
  `traceability.json`, including digest and staleness rules.
- Add Changesets or an equivalent internal package version/change mechanism
  where useful.
- Add Dockerfiles for current web/API units using pinned digest-ready images,
  non-root runtime, health/readiness, and minimal contents.
- Expand local Compose with mail capture and Temporal development services
  using pinned versions; keep credentials explicitly local.
- Add GitHub Actions for install, static checks, unit/integration, browser,
  build, dependency/secret/license scans, artifact upload, and concurrency
  cancellation.
- Add Renovate or Dependabot configuration with controlled update grouping.
- Add ADRs inside this document’s implementation record for Fastify/TypeScript,
  PostgreSQL, Temporal, and AWS choices.
- Add capability status metadata (`LIVE`, `BETA`, `DEMO`, `PLANNED`) used by
  product copy and docs.
- Add localization message extraction/schema/placeholder lint and a
  no-hardcoded-user-visible-string rule for application, validation,
  notification, export, and public-copy code; it activates with M02.
- Add the minimum cross-cutting production-control contract used from the first
  feature onward: request/trace IDs, structured redacted logs, metric naming,
  typed feature/kill flags, owner/runbook metadata, usage/spend reservation
  interface, and data-retention/deletion handler registry.
- Add an environment-promotion manifest requiring target environment, safe
  default, smoke, rollback, alert, owner, external gates, and public status.
- Remove generated build metadata from source and ensure a clean build leaves a
  clean worktree.

#### Tests

- Clean checkout with frozen lockfile.
- Reproducible local and CI build.
- Lint has intentional failing fixtures proving rules execute.
- Brand/provenance verification rejects a synthetic inherited name, domain,
  source asset, copied-copy fingerprint, fixture, and generated bundle outside
  `docs/`; it permits the same historical reference under `docs/` and permits
  standard trace/span terminology and immutable third-party package metadata.
- Coverage configuration fails a package with no required tests.
- API OpenAPI output has no uncommitted drift.
- Event compatibility checker rejects a breaking fixture.
- Contract validators reject a missing requirement owner, dependency mismatch,
  code/inventory route drift, unclassified route-state cell, unjustified
  `NOT_APPLICABLE`, orphan critical journey, stale evidence digest, and
  self-referential source-commit claim.
- Environment loader rejects production with local secrets/origins.
- Containers run as non-root and expose correct health/readiness.
- Two-tenant seed is deterministic and contains adversarial same-shaped IDs.
- Browser smoke opens the current app at desktop and mobile widths with no
  console error.
- Secret and dependency scans have no unaccepted critical result.

#### Acceptance

- All M00 behavior still works.
- A contributor can run one documented command to start the full local stack
  and one command to run the complete current verification gate.
- CI produces a versioned evidence artifact.
- Product labels the current hard-coded content as demo rather than live.
- A clean checkout and production build contain no Trace.so-derived branding,
  identifier, copy, asset, seed content, comment, fixture, snapshot, or
  implementation provenance outside `docs/`.

---

### M02 — Design system, route architecture, responsive shell, and public truth

**Status:** `COMMITTED`\
**Depends on:** M01\
**Required commit:** `feat: deliver the responsive Knotline product shell`

#### Product addition

Visitors and signed-in demo users receive a coherent, navigable, accessible
Knotline experience across phone, tablet, desktop, and wide screens.

#### Deliverables

- Extract `packages/ui` with brand tokens, typography, spacing, elevation,
  motion, focus, and semantic state tokens.
- Implement accessible primitives: button, link, input, select, combobox,
  checkbox, radio, switch, textarea, file field, dialog, alert dialog, sheet,
  popover, tooltip, menu, tabs, breadcrumb, toast, table, card, badge, skeleton,
  empty state, error state, pagination, and command palette.
- Add light/high-contrast readiness without copying Trace; dark graphite
  remains default.
- Establish localization at the shell/component boundary: ICU-style messages,
  typed keys, locale negotiation/override/fallback, plural/date/time/number/
  currency/list formatting, pseudo-locale, bidirectional readiness, and CI
  rejection of hardcoded user-visible strings.
- Add React Router route modules and authenticated/public/error layouts.
- Register every implemented Section 5 route with stable route ID, class,
  authorization/entitlement, owner, canonical journeys, and explicit
  `REQUIRED`/reasoned `NOT_APPLICABLE` route-state coverage.
- M02 owns complete behavior for its thirteen Section 5.1 route patterns. Every
  later-owned public path renders an explicit `PLANNED` or review-pending shell
  naming its owner milestone, and every `/app/*` or `/ops/*` path has registered
  route/layout plumbing; `/ops/*` always uses the isolated operator layout.
- The web route manifest must exactly cover all 105 canonical route IDs and
  record route class, authorization plane, entitlement, owner milestone,
  canonical journeys, and declared data-source type. CI rejects omissions,
  duplicates, contract drift, or a route mounted in the wrong layout plane.
- Add query client, error boundary, request correlation display, route-level
  suspense, and safe retry.
- Implement every Section 5.1 public route shell, including all declared
  solution-detail variants, product pages, integration/template details,
  pricing status, security/trust, docs/help/changelog/status, contact,
  accessibility, legal, auth/invitation, and guest entry routes. Later owner
  milestones replace explicitly review-pending content or behavior; no route
  is absent or silently 404.
- Implement authenticated operations shell routes with honest demo status.
- Implement 401, 403, plan-gated, suspended workspace, 404, archived, deleted,
  offline, and dependency-degraded pages.
- Add desktop rail, tablet drawer, mobile header/bottom navigation, workspace
  switcher shell, global create, command search, notification and help shells.
- Preserve navigation/filter context in URLs where appropriate.
- Add SEO metadata, sitemap, robots behavior by environment, social metadata,
  cookie/consent foundation, and noindex for authenticated routes.
- Add Storybook or equivalent component workbench with responsive and
  accessibility stories.
- Replace external font runtime dependency with optimized self-hosted licensed
  assets or system fallbacks.
- Define UI analytics taxonomy without sending customer content.

#### Tests

- Component unit and interaction tests.
- Axe scan of every public route and shell state.
- Keyboard navigation and focus restoration for menus, sheets, dialogs,
  command palette, and mobile navigation.
- Visual snapshots at 320, 480, 768, 1024, 1440, and 1920 widths.
- Reduced-motion and 200% zoom/reflow checks.
- Route, deep-link, not-found, and safe return-target tests.
- Every declared `/solutions/:solution` slug and every other Section 5.1 path
  has content/schema, deep-link, unknown-slug 404, locale, metadata, responsive,
  and truthful-capability-label coverage.
- No horizontal page overflow at 320 CSS px.
- Lighthouse reference budgets for public home and authenticated shell.
- CSP-compatible build with no routine `unsafe-eval`.

#### Acceptance

- All listed routes render intentional states and share the design system.
- The current workflow view remains usable at every supported width.
- A keyboard-only user can navigate public and app shells.
- Public pages never claim unimplemented capabilities are live.
- M02 contributes verified foundation evidence to EX-006, EX-015, NFR-010,
  NFR-016–NFR-020 without claiming the M33/M36 primary completion states.

---

### M03 — PostgreSQL, tenant isolation, migrations, and repository foundation

**Status:** `COMMITTED`\
**Depends on:** M01\
**Required commit:** `feat: persist Knotline data with enforced tenant isolation`

#### Product addition

Demo state becomes real durable workspace data. Users can reload the application
without losing workflow records, and the platform gains enforceable tenant
separation.

#### Deliverables

- Create `packages/db` with Drizzle schema and SQL migration runner.
- Implement initial identity, workspace, membership, workflow, workflow
  version/node/edge, idempotency, audit, and outbox tables.
- Add UUID generation, timestamp, version, and canonical JSON/hash helpers.
- Add tenant-inclusive foreign keys and required unique constraints.
- Enable PostgreSQL Row-Level Security for every tenant table.
- Define runtime, read-only reporting, migration, and repair database roles;
  runtime cannot bypass RLS.
- Derive transaction-local workspace/principal context for RLS.
- Add repository interfaces and PostgreSQL implementations.
- Replace the API in-memory catalog with PostgreSQL repositories.
- Remove automatic demo fallback from normal live mode. A separate explicit
  `VITE_DEMO_MODE` may load labeled static showcase data only on the public
  interactive example.
- Add seed command for two independent synthetic workspaces and users.
- Add health `/health/live` and readiness `/health/ready` including database
  migration compatibility.
- Add transaction helper for aggregate + audit + outbox.
- Add query logging that records safe fingerprint/timing, not values.
- Add migration expand/contract conventions and realistic data generator.
- Add data-class/retention/export/delete registry entries for every introduced
  table, object, cache, and index; validation fails when a durable store has no
  owner or handler declaration.
- Add database/connection/outbox baseline telemetry, staging saturation alerts,
  and an application-wide emergency mutation-disable control.

#### Tests

- Migration from empty database and repeatable environment rebuild.
- Forward migration over realistic volume with lock-time measurement.
- RLS direct SQL tests for every tenant table.
- Repository two-tenant negative tests using same-shaped resource IDs.
- Cross-tenant foreign-key insertion rejection.
- Published/versioned immutability and append-only audit/outbox constraints.
- Transaction rollback leaves no partial aggregate/audit/outbox state.
- Concurrent workflow creation and optimistic version tests.
- API persistence across process restart.
- Query-plan assertions for workflow list/detail.

#### Acceptance

- The authenticated-shell seed loads from PostgreSQL.
- Creating a workflow through the API persists after API restart.
- No API, repository, or direct runtime SQL can read or mutate the other seed
  tenant.
- A migration failure fails readiness without corrupting the current schema.

---

### M04 — Authentication, secure sessions, and personal account controls

**Status:** `COMMITTED`\
**Depends on:** M02, M03\
**Required commit:** `feat: add secure passwordless and Google authentication`

#### Product addition

A real user can sign in with email or Google, maintain a secure session, inspect
devices, and sign out without browser-readable tokens.

#### Deliverables

- Implement email magic-link request, SES/local capture delivery, token
  exchange, expiry, single use, intent binding, and non-enumerating responses.
- Implement Google OIDC exchange with issuer/audience/nonce/expiry/signature
  validation.
- Implement durable Google and SSO authorization-start transactions with
  server-generated state/nonce/S256 PKCE, browser-initiation cookie binding,
  provider application/environment binding, SAML AuthnRequest/RelayState
  correlation, exact return-target allowlist, expiry, and atomic one-time
  consumption.
- Implement the distinct durable authorization-result record and
  high-entropy verifier from Section 10.3; callback consumption never directly
  issues a browser session, and result exchange requires the original
  host-only initiation binding before atomic one-time session issuance.
- Implement rotating server-side session family with hashed verifier, reuse
  detection, absolute/idle expiry, and revocation.
- Set HttpOnly Secure SameSite cookies; add CSRF token/origin protection.
- Add strict CORS, proxy trust, security headers, and rate limits.
- Implement `/v1/me/bootstrap`, profile preferences, sessions list, individual
  revoke, revoke others, and logout.
- Add sign-in, check-email, callback, expired/used link, provider denial,
  suspended account, and session-expired UX.
- Add asset-isolated `no-referrer` callbacks, magic token fragment/body
  exchange, isolated-edge OAuth callback/result-handle flow from Sections 10.3
  and 18.3, one-time exchange, safe return destination, and immediate clean
  URL.
- Add security notification for new session and session-family reuse.
- Add step-up/recent-auth framework for later sensitive actions.
- Add email bounce/complaint handling foundation.

#### Tests

- Magic-link happy path, expiry, replay, wrong intent, tampering, race, and
  enumeration.
- Email rate limits by IP and normalized identity.
- Authorization-start and callback tests cover state/nonce/PKCE, initiation
  cookie, provider application/environment, exact return target, expiry,
  authorization-result expiry/replay/cross-browser exchange, callback/result
  transaction races, replay/double-consume, concurrent tabs, login CSRF, and
  IdP mix-up, followed by issuer, audience, signature, subject, and
  domain-negative cases.
- Session rotate, simultaneous refresh, reuse detection, expiry, suspend, and
  revocation.
- CSRF and CORS adversarial tests.
- Cookies never exposed to JavaScript or logs.
- Magic/OAuth credential test proves no token/code/state in browser history
  after exchange, referrer, third-party requests, analytics, error tracker, or
  CDN/WAF/ALB/application access logs.
- XSS fixture cannot read the session credential.
- Browser E2E for email and Google sandbox/fake OIDC flows on desktop/mobile.
- Accessibility and error-state coverage.

#### Acceptance

- Hard-coded bootstrap identity is removed from live mode.
- A user signs in, refreshes, sees/revokes sessions, and signs out.
- A revoked or reused session loses API and SSE access promptly.
- Auth secrets do not enter local/session storage, URLs after callback, logs, or
  analytics.

---

### M05 — Workspaces, invitations, onboarding, members, roles, and groups

**Status:** `COMMITTED`\
**Depends on:** M04\
**Required commit:** `feat: enable complete workspace onboarding and access control`

#### Product addition

A new customer can create a workspace, invite a teammate, choose a role/use
case, switch workspaces, and preserve progress through the workflow-selection
stage of onboarding.

#### Deliverables

- Workspace create, rename, timezone/locale/region preference, archive, restore,
  and guarded deletion request.
- Workspace selection and cache-safe switching.
- Invitations: create, email, preview, accept, decline, resend, cancel, expiry,
  already-used, and existing-member behavior.
- Member list/detail, role change, suspend, restore, remove, ownership transfer,
  and content reassignment.
- System roles and custom role CRUD using the permission catalog.
- Group CRUD and membership; foundation for SCIM-sourced groups.
- Versioned `reports_to` organization relationships from verified manual admin
  entry and later SCIM/provider sources, with precedence, effective dates,
  cycle rejection, conflict visibility, and fallback owner; M13 consumes this
  for manager-derived approvals/escalations.
- RBAC middleware plus resource-grant/assignment ABAC hooks.
- Permission-aware navigation and disabled-action explanations.
- Onboarding state machine: workspace, role/use case, optional connection,
  workflow source, teammate invite, readiness checklist, and a disabled
  “first real run” step that names M10/M15 as unavailable dependencies; it does
  not display a fake or simulated success.
- Explicit labeled sandbox workspace/sample data creation and removal.
- Role-aware home modules and empty states.
- Guest/external-task identity and grant data model, disabled behind a future
  server flag until M33.
- Audit for membership, role, invitation, ownership, and workspace policy.

#### Tests

- Persona-to-capability matrix tests for every permission.
- Two-workspace switching with cache invalidation and deep links.
- Invitation race, forwarding, email mismatch policy, replay, expiry, and
  revocation.
- Last-owner and ownership-transfer safeguards.
- Custom role cannot grant a permission the creator lacks.
- Suspended/removed user loses API/SSE/service access.
- Onboarding skip/resume across session/device.
- Mobile onboarding and member administration.
- RLS and BOLA across all new resources.

#### Acceptance

- Two independent users create or join a workspace and see only their
  authorized data.
- An owner invites a teammate, assigns a role, and the teammate accepts.
- Onboarding progress persists and all optional steps can be skipped/resumed.
- Sample data is visibly labeled and removable.
- `ON-003` is intentionally not accepted here; its real build/generate/test/run
  journey is accepted only after M10 and M15 and is re-proved by M38.

---

### M06 — Workflow definitions, typed nodes, validation, versions, and templates

**Status:** `COMMITTED`\
**Depends on:** M05\
**Required commit:** `feat: deliver versioned workflow definitions and publishing`

#### Product addition

Builders can create a real typed workflow, validate it, publish an immutable
version, inspect history, restore an old version into a new draft, and create a
reusable template.

#### Deliverables

- Complete workflow, version, node, edge, trigger, subworkflow, tag, folder,
  template, and validation-finding schema.
- Node types and configuration schemas specified in WF-005.
- Versioned restricted expression language for conditions and mappings.
- Graph validation engine with stable finding codes and node/edge locations.
- Draft create/read/update, autosave revision, ETag/`If-Match`, and atomic batch
  operations.
- Publish transaction with canonical definition hash, immutable rows, release
  note, audit, and outbox.
- Version list, semantic/graph diff, and draft-from-version.
- Workflow list/detail, tags, folders, favorite, duplicate, archive, restore,
  guarded delete, and ownership transfer.
- First-party and workspace template versions, variables, preview, instantiate,
  and create-from-workflow.
- Import/export canonical versioned JSON format with validation.
- Entitlement hooks for workflow/node/template limits.
- API/event schemas and OpenAPI coverage.

#### Validation minimums

- unique stable keys;
- allowed node and edge types;
- no forbidden cycles;
- loop nodes contain bounded iteration;
- every non-trigger node is reachable;
- terminal paths exist;
- schemas are valid and mappings type-check;
- assignments and required integrations/agents/tools exist and are allowed;
- conditions reference available upstream data;
- approval policies are valid;
- external writes declare idempotency and risk;
- subworkflow contracts match;
- all secret/config references are opaque allowed references.

#### Tests

- Unit/property tests over generated DAGs, branches, joins, cycles, loops, and
  subworkflows.
- Canonical hash stability.
- Concurrent edit conflict and retry.
- Published-version database immutability.
- Import/export round trip and malicious/oversized file rejection.
- Template variable validation and tenant visibility.
- Two-tenant and permission matrix across every route.
- Migration and query plans.
- API contract and browser library/version flows.

#### Acceptance

- A builder creates, validates, publishes, diffs, and restores a workflow using
  persisted data.
- Invalid graphs cannot publish and findings deep-link to the responsible
  element.
- A run API cannot use a draft version.
- Published data remains byte/hash stable.

---

### M07 — Complete accessible workflow studio

**Status:** `COMMITTED`\
**Depends on:** M02, M06\
**Required commit:** `feat: deliver the complete responsive workflow studio`

#### Product addition

The workflow studio becomes a polished production editor rather than a static
map.

#### Deliverables

- Load and save real draft nodes/edges through TanStack Query.
- Canvas toolbar: select, pan, zoom, fit, minimap, auto-layout direction,
  alignment, distribution, grouping, and help.
- Add/connect/move/reconnect/duplicate/group/split/disable/delete node actions.
- Multiselect, clipboard, undo/redo, and keyboard shortcuts.
- Node palette by category and searchable command insertion.
- Typed inspector for every node type, input/output schema, mappings,
  assignments, retry, timeout, risk, approval, and failure path.
- Edge inspector for condition, mapping, path type, and label.
- Accessible synchronized outline/tree/table with full edit parity.
- Validation panel grouped by severity with element focus.
- Draft saved/saving/offline/conflict/invalid indicators.
- Local crash recovery encrypted/disabled according to tenant policy.
- Large graph culling and worker-based auto-layout.
- Tablet drawer and mobile outline-first behavior.
- Read-only published version and side-by-side diff views.
- Contextual documentation and shortcut sheet.

#### Tests

- Reducer/command unit tests and undo/redo properties.
- Browser E2E for every node/edge operation.
- Conflict simulation between two browser sessions.
- 500-node reference graph performance and layout worker responsiveness.
- Visual tests at all supported widths and zoom.
- Full keyboard graph construction and edit flow.
- Screen-reader outline workflow construction.
- Touch alternatives; no drag-only action.
- Offline draft recovery and conflict UX.
- Validation deep links and focus.

#### Acceptance

- A keyboard-only user can build and publish a representative workflow.
- Mobile can fully configure the same workflow through the outline.
- Two editors never silently overwrite each other.
- A 500-node graph remains within the milestone interaction budget.

---

### M08 — Workflow generation, import, dry run, and policy preflight

**Status:** `COMMITTED`\
**Depends on:** M07\
**Required commit:** `feat: add guided workflow generation and safe test mode`

#### Product addition

A user can exercise the complete schema-driven generation, review, import, and
safe dry-run experience against deterministic fixtures; real provider
generation is activated and accepted in M15.

#### Deliverables

- Asynchronous workflow-generation resource and worker interface.
- Versioned generation prompt and strict output schema.
- Deterministic local generation provider and recorded model fixtures.
- Generation uses Section 9.6 lifecycle states; `generating`, `validating`,
  `repairing`, and `ready_to_accept` are progress phases while lifecycle is
  `RUNNING`, not competing terminal states.
- UI displays source prompt, inferred assumptions, assignments, missing
  integrations, validation findings, model usage/cost when real, and diff before
  applying.
- Bounded repair loop; user-controlled accept/discard/regenerate.
- Import from canonical JSON and documented CSV step/dependency format.
- Dry-run engine executes conditions/mappings, human fixture submissions, agent
  fixtures, and connector fixtures without external writes.
- Policy preflight covers permissions, entitlements, connector health, budgets,
  risky side effects, approval coverage, schedule/timezone, and expected cost.
- Test-run report with path, values, findings, and fixture lineage.
- Onboarding may use this deterministic path only with a persistent
  `SIMULATED` label; it cannot complete `ON-003` until M15.

#### Tests

- Structured output schema, refusal, truncated, invalid, repair, timeout, and
  cancellation cases.
- Prompt-injection strings remain data and cannot widen system behavior.
- Generation creates no resource until accepted.
- Dry run never invokes production connector or credential code.
- Condition/mapping/path fixture coverage.
- Policy/entitlement/connection-health negative cases.
- Cost/usage record with deterministic provider.
- Browser E2E prompt-to-valid-published workflow at mobile/desktop.

#### Acceptance

- A new user reaches a valid published workflow from one deterministic fixture
  prompt with the result labelled `SIMULATED`.
- Every generated assumption and validation issue is visible.
- Dry-run evidence proves no real side effect occurred.
- Real OpenAI activation remains feature-gated until M15 passes its provider
  acceptance.

---

### M09 — Collaboration, comments, mentions, activity, and edit conflict model

**Status:** `COMMITTED`\
**Depends on:** M07\
**Required commit:** `feat: add collaborative workflow and work discussions`

#### Product addition

Teams can discuss workflows and work, mention teammates, follow changes, and
handle concurrent editing without confusion.

#### Deliverables

- Generic resource comments/thread model and workflow comments; M12 adds the
  task-specific projection after the task schema exists.
- Mentions, watchers/following, reactions, attachment references, edit window,
  deletion policy, and moderation/audit metadata.
- Workflow activity feed separate from immutable audit.
- Comment composer with safe Markdown, preview, mention search, and upload.
- Notification intents emitted for mention/followed activity; in-app delivery
  completed in M27.
- Collaborator presence as ephemeral optional signal.
- Durable collaborator-update banner and changed-section summary.
- ETag conflict UX supports reload, compare, and reapply user operations where
  safe.
- Shared/private saved draft filters foundation.
- Shareable internal resource links with permission check.

#### Tests

- Mention parsing does not allow cross-tenant/user disclosure.
- Comment authorization, editing, deletion, attachment, and sanitization.
- XSS/unsafe URL fixtures.
- Concurrent workflow updates and deterministic merge/reapply.
- Presence loss does not affect durable edits.
- Activity event accuracy and audit separation.
- Browser E2E discussion and conflict flow.
- Keyboard/screen-reader composer and thread.

#### Acceptance

- Two members can discuss and edit a workflow without silent data loss.
- A mention targets only an authorized workspace member.
- Product activity can be deleted/edited by policy without mutating security
  audit history.

---

### M10 — Durable workflow runtime, outbox, orchestration, and reconciliation

**Status:** `COMMITTED`\
**Depends on:** M06\
**Required commit:** `feat: execute workflows durably across failures`

#### Product addition

A published workflow can start and finish durably; its state survives API and
worker restarts, duplicates, and deployment, while an authoritative
provider-neutral admission ledger prevents concurrent work from escaping hard
usage or spend bounds.

#### Deliverables

- Complete run/task/dependency/attempt/run-event/external-operation/dead-letter
  schemas.
- Central state-transition service with expected state/version/fencing token.
- Transactional outbox relay and event receipts.
- Temporal workflow for run orchestration with deterministic workflow IDs.
- Activity task queues separated by work class.
- Dependency, branch, join, loop, delay, subworkflow, retry, failure-path, and
  terminal semantics from Section 12.
- Start transaction and idempotent Temporal starter.
- Run pause/resume/cancel/fork/retry intents and Temporal signals.
- Provider-neutral entitlement/budget/admission foundation from Sections 8.7
  and 17.3: default/free entitlements, versioned budget policy and period,
  exact hard/soft limits, atomic worst-case reservation, fenced lease renewal,
  immutable reserve/increment/finalize/release entries, conservative unknown-
  usage hold, debt and credit ledgers, threshold events, and spend-stop fence.
  It has no Stripe dependency; M29 adds commercial plans/provider projection
  and UX on this one authoritative core.
- Transactional admission service and worker activities require a declared
  policy/version/period and maximum quantity before dispatch. They return a
  stable reservation ID used unchanged by model, tool, file/storage,
  connector, notification, and later billing paths.
- Stuck-run, missing-start, expired-lease, missing-signal, outbox, DLQ, and
  uncertain-operation reconcilers.
- Operator-safe repair CLI using dry-run/confirm and audit.
- Run/task API resources and event timeline.
- Synthetic no-op, transform, delay, condition, and fixture action activities.
- Backpressure, workspace concurrency, and fairness controls.
- Worker deployment/versioning compatibility policy.
- Minimum runtime dashboards, stuck/DLQ/outbox/dispatch alerts, runbook,
  per-workspace/global start kill switches, and a staging rollback/replay
  procedure; M34 later unifies these controls.

#### Tests

- State-machine and property tests for generated graphs.
- API/worker/Temporal worker restart at every meaningful crash window.
- Duplicate outbox/event/signal/activity completion.
- Stale fencing-token commit rejection.
- Concurrent branch/join completion ordering.
- Delay, retry, timeout, pause, resume, cancel, subworkflow, and bounded loop.
- Idempotent start between DB commit and Temporal start.
- `UNCERTAIN` external operation does not auto-retry.
- Exact fixed-precision arithmetic, immutable reservation lifecycle, stale
  lease/fence rejection, concurrent reservation at the last available unit,
  threshold crossing, spend stop, unknown usage/debt, reconciliation, and
  hash-conflicting idempotency tests.
- DLQ and reconciler repair.
- Two-tenant queue/worker isolation.
- Initial dispatch latency/load test.
- Temporal replay/determinism test across worker version.

#### Acceptance

- A representative workflow completes across deliberate API/worker restarts.
- Duplicate delivery produces one logical state transition.
- Pause, resume, and cancel behave consistently during in-flight work.
- Every transition appears in a durable ordered event history.
- Concurrent dispatch cannot exceed the exact hard entitlement/budget, and a
  failure releases only quantity proved unused.

---

### M11 — Run room and live operations

**Status:** `COMMITTED`\
**Depends on:** M02, M10\
**Required commit:** `feat: deliver the live Knotline run room`

#### Product addition

Operators can understand a live or historical run, identify what needs
attention, inspect evidence, and take safe recovery actions from desktop or
mobile.

#### Deliverables

- Run list with workspace, workflow, status, attention state, initiator, trigger,
  duration, cost, date, owner, and tag filters.
- Saved run views, filter URL serialization, column preferences, density
  controls, sorting, pagination, and CSV export.
- Run-room header with status, elapsed time, workflow/version, trigger,
  initiator, environment, usage, and permitted actions.
- Graph, outline, and chronological views with the same semantic state.
- Live node/task state over resumable SSE, including heartbeat, cursor replay,
  stale connection indication, and polling fallback.
- Ordered event timeline with actor, cause, correlation identifiers, retries,
  state transitions, approvals, tool calls, artifacts, and redacted errors.
- Attempt inspector with structured input/output, logs, timing, token/usage
  details, artifacts, and provenance.
- Safe pause, resume, cancel, retry, fork, and replay controls with reason,
  confirmation, authorization, idempotency, and audit.
- Attention center for failed, blocked, overdue, uncertain, dead-lettered, and
  policy-stopped work.
- Failure explanation, retry eligibility, downstream impact, and recommended
  next action; no unsupported claim that a repair is safe.
- Artifact preview/download with authorization, expiry, malware status, and
  content-disposition protection.
- Internal share links that preserve resource authorization.
- Responsive condensed run room with sticky primary controls and no
  horizontally trapped critical information.
- Run comparison for two versions/attempts, including definition, input,
  output, duration, usage, and outcome differences.

#### Tests

- API contract and authorization tests for every run-room resource and action.
- SSE disconnect, cursor replay, duplicate event, heartbeat loss, and polling
  fallback.
- Large event histories, logs, artifacts, long names, and high-fan-out graphs.
- Redaction fixtures for secrets, credentials, personal data, and provider
  payloads.
- Pause/resume/cancel/retry/fork race tests against active workers.
- Retry-eligibility and downstream-impact rules.
- Permission changes while a run room is open.
- CSV formula-injection protection and export scope.
- Browser E2E from run list through failure diagnosis and recovery.
- Phone, tablet, keyboard, zoom, reduced-motion, and screen-reader review.

#### Acceptance

- An operator can locate, diagnose, and safely retry a failed task without
  database or Temporal access.
- A dropped live connection resumes without missing or duplicating visible
  events.
- The same run is understandable in graph, outline, and timeline views.
- Restricted payloads and artifacts never appear to an unauthorized viewer.

---

### M12 — Human task inbox, forms, queues, and assignment

**Status:** `COMMITTED`\
**Depends on:** M05, M10, M11\
**Required commit:** `feat: deliver complete human task execution`

#### Product addition

People can receive, claim, complete, delegate, reopen where policy permits,
reassign, and audit structured work created by workflows.

#### Deliverables

- Personal, assigned-to-me, created-by-me, group, unassigned, watched,
  completed, and all-authorized task views.
- Task filters for status, queue, workflow, assignee, group, priority, SLA,
  created/due date, tags, and attention; saved private or workspace views.
- Assignment to a user or group, claim/unclaim, reassign, return-to-queue,
  watchers, priority, due date, and workload counters.
- Task delegation validates delegate eligibility, scope, effective interval,
  delegator authority, separation policy, current state, and optional retained
  watcher/recall behavior; delegation never grants broader workspace access.
- Atomic claim and assignment rules that prevent dual ownership.
- Server-defined form renderer for text, number, date/time, boolean, choice,
  multiselect, person, group, file, URL, rich text, JSON, and repeatable fields.
- Conditional fields, validation, help text, defaults, computed read-only
  fields, and schema/version retention.
- Draft autosave, dirty-state protection, optimistic conflict handling, and
  explicit final submission.
- Task detail with workflow/run context, instructions, history, comments,
  mentions, attachments, related records, and permitted actions.
- Completion outcomes and typed output mapped back into the workflow.
- Request-information/send-back loop with reason and prior-answer history.
- Reopen is allowed only by node/workspace policy. It creates a linked new human
  task and output revision while leaving the completed task immutable; already
  executed downstream external effects are not silently undone and require an
  explicit remediation/fork path.
- Bulk assignment, priority, due-date, and complete actions only where the same
  policy and schema make the action safe.
- Queue configuration with membership, routing mode, capacity, fallback owner,
  and business-hours reference.
- Versioned workspace business calendars/time zones/holidays and queue calendar
  binding foundation used by M13 SLA timers.
- Queue administration/API, ordered typed routing rules, dry-run simulation,
  skills/load/capacity selection, deterministic fallback, and versioned
  routing-decision evidence.
- Versioned task templates with immutable publications, form/output schemas,
  instruction/assignment/queue/SLA defaults, usage references, guarded archive,
  and task-preview mode in the workflow studio.
- Accessible mobile task completion, including camera/file attachment.
- Restricted secure-attachment foundation for task/comment artifacts creates
  canonical `files`, immutable `file_versions`, resumable
  `file_upload_sessions`, short-lived object-store upload operations,
  checksum/size/type/quota enforcement, malware-scanner adapter, quarantine,
  authorization-checking download proxy, retention/delete hooks, and audit.
  It permits only declared task/comment purposes and cannot feed a parser,
  model, or general knowledge index; M19 generalizes this exact contract.
- Durable task event and audit history distinct from editable discussion.

#### Tests

- Form-schema validation and rendering for every field type and condition.
- Malformed, oversized, stale-version, and adversarial form submissions.
- Atomic simultaneous claim and reassignment races.
- Delegation eligibility/expiry/recall/member-removal/race and cross-tenant
  scope tests.
- Reopen authorization, linked-task lineage, output revision, simultaneous
  reopen, downstream-safe versus already-effected behavior, and audit/events.
- Autosave retry, offline interruption, stale ETag, and final-submit
  idempotency.
- Authorization for personal, group, unassigned, completed, and bulk views.
- Group membership removal during assignment and completion.
- Restricted attachment upload interruption/checksum/quota/idempotency,
  malware/quarantine, purpose allowlist, download reauthorization, retention/
  delete, and cross-tenant behavior.
- Typed task output correctly resumes dependent workflow nodes.
- Queue routing fairness and fallback.
- Queue/template CRUD authorization, routing-policy version/conflict, member/
  group removal, capacity race, calendar, simulation/live parity, template
  publication immutability, in-use archive, and event/audit cases.
- Browser E2E for create, assign, claim, delegate, draft, comment, attach,
  submit, reopen, and workflow continuation/remediation.
- Keyboard, screen-reader, 200% zoom, phone, and touch-target testing.

#### Acceptance

- A workflow-created task can be completed by an authorized person and
  deterministically resume the run.
- Two users cannot successfully claim the same task.
- A saved draft survives navigation and reconnect without becoming a submitted
  answer.
- Delegation and reopen preserve immutable prior decisions and exact lineage
  without widening access or replaying a downstream external effect.
- A malicious, unscanned, or quarantined attachment cannot be downloaded,
  submitted as clean, parsed, indexed, or sent to an agent.
- The inbox remains usable with at least 100,000 authorized tasks through
  indexed server pagination.

---

### M13 — Approval policies, SLA timers, delegation, and escalation

**Status:** `COMMITTED`\
**Depends on:** M12\
**Required commit:** `feat: add durable approvals and escalation policies`

#### Product addition

High-impact workflow actions can wait for recorded human authorization, while
deadlines, delegation, and escalation continue reliably across restarts.

#### Deliverables

- Approval node and policy builder for single, any-of, all-of, quorum,
  sequential, role/group, manager, and expression-derived approvers.
- Approve, reject, request changes, abstain, cancel, and revoke-before-action
  outcomes with mandatory reason policy.
- Two-phase `APPROVED_PENDING_EXECUTION` authorization; revocation and durable
  operation consumption use one compare-and-set boundary from Section 9.5.
- Separation-of-duties and self-approval policy.
- Approval packet with proposed action, affected resources, diff, risk,
  evidence, model/tool provenance, and expiration.
- Immutable decision record containing policy/version, eligible approvers,
  actual actor, outcome, reason, timestamp, IP/session context, and packet hash.
- Delegation and out-of-office windows with delegator, delegate, scope,
  effective dates, exclusions, and audit.
- SLA definitions using workspace time zone, business calendar, holidays,
  warning thresholds, breach action, and pause rules.
- Durable Temporal timers for reminders, expiry, escalation tiers, and
  auto-outcome only when explicitly configured.
- Escalation to user/group/manager/on-call webhook, with deduplicated
  notification intents.
- Recalculation rules for group membership, policy edits, delegation changes,
  and workflow version changes after an approval has opened.
- Approval inbox and detail optimized for fast, accessible mobile decisions.
- Studio simulator showing resolved approvers and SLA timeline against fixture
  identities before publish.
- Approval analytics for volume, decision time, breach, rejection, and
  bottleneck without ranking individuals by opaque scores.

#### Tests

- Truth tables for any/all/quorum/sequential and nested policy expressions.
- Self-approval, separation-of-duties, group membership, and delegation
  boundaries.
- Manager-derived resolution across manual/SCIM sources, precedence, effective
  dates, missing manager, suspended manager, cycle, conflict, and fallback.
- Duplicate, concurrent, late, revoked, expired, and unauthorized decisions.
- Approval revocation versus operation-consumption race proves exactly one CAS
  winner and no effect after a successful revocation.
- DST changes, leap day, time zones, weekends, holidays, and paused SLA clocks.
- Worker/API restart while each reminder or escalation timer is pending.
- Policy/version change after request creation preserves the recorded contract.
- Approval packet hash/provenance tamper detection.
- Notification intent deduplication before M27 delivery.
- Browser E2E for request, delegate, approve/reject, request changes, expire,
  and escalate.
- Phone and screen-reader decision flow.

#### Acceptance

- Each approval resolves exactly once under its recorded policy.
- SLA warnings and breaches occur at the correct business-calendar instant
  after restarts.
- A reviewer can see exactly what will happen before deciding.
- No self-approval or unauthorized delegation bypasses workspace policy.

---

### M14 — Agent foundry, versioning, prompt studio, and catalog

**Status:** `NOT_STARTED`\
**Depends on:** M05, M07\
**Required commit:** `feat: deliver the Knotline agent foundry`

#### Product addition

Workspace builders can design reusable governed agents, understand their
capabilities, and publish immutable versions for workflow use.

#### Deliverables

- Agent list, filters, ownership, tags, lifecycle status, usage references, and
  private/workspace visibility.
- Agent create/edit experience for purpose, instructions, model role,
  temperature/reasoning policy, structured output, tools, knowledge, memory,
  limits, fallback, and human-approval policy.
- Prompt studio with system/developer/user template separation, variables,
  type validation, sample data, safe preview, and token estimate.
- JSON Schema editor with form mode, raw mode, examples, validation, and
  reusable schemas.
- Tool and knowledge selectors that display granted scope, risk, environment,
  and missing configuration.
- Model-role selector based on capability and policy, never a provider-specific
  model identifier in the product definition.
- Draft, immutable version, release channel, deprecated, and archived states.
- Semantic diff across prompts, settings, schemas, tools, knowledge, policy,
  and limits.
- Publish validation for unresolved variables, unavailable tools, excessive
  privileges, missing approval, invalid schema, and unsupported capability.
- Agent catalog cards with owner, description, inputs, outputs, tools,
  knowledge, latest release, verification status, and cost/latency band.
- Agent templates, duplicate/fork, import/export, and workflow-node selection.
- Test console shell using deterministic fixture adapters until M15–M17; every
  result is visibly labelled `SIMULATED`.
- Reference tracking prevents destructive archive while active workflow
  versions depend on an agent version.
- Agent activity and immutable security audit events.

#### Tests

- Draft/version/release lifecycle and immutability.
- Prompt-variable escaping, missing/type-invalid variables, and injection
  fixtures.
- JSON Schema round-trip, nested objects, unions, arrays, and invalid schemas.
- Capability/policy validation for tool, knowledge, model role, and approval.
- Semantic diff accuracy.
- Archive/reference safety and cross-tenant authorization.
- Import rejects unknown, privileged, or malicious definitions.
- Simulated test results can never be mistaken for provider execution.
- Browser E2E create, configure, preview, publish, diff, fork, and select in a
  workflow.
- Responsive and assistive-technology editor review.

#### Acceptance

- A builder can publish an immutable, valid agent version without editing JSON.
- A reviewer can identify every capability and permission changed between
  versions.
- A workflow references an exact agent version or an explicit governed release
  channel.
- No placeholder execution is presented as a real model result.

---

### M15 — Provider-neutral model gateway and OpenAI Responses integration

**Status:** `NOT_STARTED`\
**Depends on:** M08, M10, M14\
**Required commit:** `feat: integrate the governed OpenAI model gateway`

#### Product addition

Knotline agents can invoke OpenAI reliably through a provider-neutral,
observable, policy-controlled gateway with structured results and honest usage.

#### Deliverables

- Gateway interfaces and canonical request/result/error/stream types from
  Section 13.
- Model-role registry (`fast`, `balanced`, `quality`, `embedding`, `judge`,
  `moderation`) mapped per environment to approved provider models and
  capabilities.
- OpenAI adapter built on the Responses API, including streaming, tool calls,
  strict structured output, refusals, incomplete responses, and usage.
- Provider credentials loaded only in the gateway process from the secret
  backend; never returned to API, browser, worker activity payload, or logs.
- Default OpenAI request policy uses `store: false` and a one-way-hashed stable
  safety identifier where appropriate.
- Request correlation without logging raw private content by default.
- Deadline, cancellation, retry, backoff, rate-limit, circuit-breaker, and
  provider-concurrency behavior.
- Retry classification distinguishes safe pre-acceptance failure from unknown
  provider outcome; unknown non-idempotent tool side effects are not replayed.
- Strict schema validation with bounded repair attempt and typed failure.
- Cost catalog, token/usage normalization, estimated reservation, final charge,
  and provider-reconciliation fields.
- Workspace/model-role budgets, allowlists, region/data-policy hooks, and
  emergency disable.
- Content-policy hooks for input and output, with user-visible refusal and
  operator reason codes.
- Provider health, latency, error, rate-limit, token, cost, and refusal
  telemetry without high-cardinality prompt labels.
- Encrypted recorded contract fixtures and optional live sandbox suite; raw
  customer prompts are not committed.
- Adapter boundary and conformance suite for future additional providers.
- Replace M08’s generation fixture behind the same schema with the OpenAI
  Responses execution path, preserving assumptions, repair bounds, cost,
  refusal, cancellation, and visible environment/provider status; recorded
  contracts keep the engineering path deterministic.
- Complete the real `ON-003` onboarding journey by generating or selecting a
  workflow, dry-running it, publishing it, starting its durable test run, and
  inspecting the result; sample/provider test data remains clearly labelled.

#### Tests

- Recorded contract tests for Responses request/response, streaming, tool call,
  refusal, truncation, malformed output, and rate-limit shapes.
- Strict schema success/failure and bounded repair behavior.
- Timeout, cancellation, retry-after, network reset, circuit breaker, and
  provider outage.
- Secret absence, rotation, revocation, and accidental-log scanning.
- Usage/cost normalization and reconciliation arithmetic.
- Policy deny, budget exhaustion, emergency disable, and data-region mismatch.
- Stream aggregation produces the same canonical result as non-streaming.
- [EXT] Under `EXT-004`, run the live OpenAI sandbox smoke test when
  credentials are available; otherwise the provider evidence remains
  `BLOCKED_EXTERNAL`, never falsely complete.
- API/worker integration test through the gateway rather than a direct SDK
  import.

#### Acceptance

- A valid request returns typed text or JSON with reconciled usage through the
  neutral interface.
- The product clearly distinguishes refusal, policy block, timeout, invalid
  output, and provider outage.
- No service except the gateway can access the OpenAI credential.
- Switching a model-role mapping requires configuration and validation, not a
  workflow or agent migration.
- A new user completes `ON-003` through the blank/template or recorded-contract
  generation path, a real durable run, and persisted results.
- [EXT] With `EXT-004` at least `SANDBOX_VERIFIED`, the same `ON-003` journey
  completes through a real provider-backed generation with reconciled usage
  and provider receipt.

---

### M16 — Tool broker, credential vault, policy, and isolated sandbox

**Status:** `NOT_STARTED`\
**Depends on:** M14, M15\
**Required commit:** `feat: secure agent tools with isolated execution`

#### Product addition

Agents can use narrowly scoped tools and optional code execution without seeing
credentials or gaining unrestricted access to Knotline or the network.

#### Deliverables

- Tool registry with name/version, owner, input/output schema, risk class,
  idempotency, side-effect class, required connection scopes, timeout, and
  deprecation state.
- Tool broker as the only agent-facing execution path.
- Pre-execution policy combining workspace, agent version, workflow version,
  user, environment, connection, data classification, budget, and approval.
- Credential records store opaque secret references and display only provider,
  account, scopes, owner, rotation state, and last use.
- Local encrypted secret backend for development and AWS Secrets Manager/KMS
  adapter for deployed environments.
- Credential proxy injects a secret into the outbound request boundary and
  scrubs it before any result, error, trace, or event leaves that process.
- OAuth refresh serialization, revocation handling, least-scope validation,
  and rotation without redefining agents.
- Tool input/output size limits, schema validation, URL/IP validation, SSRF
  defenses, allowlisted destinations, redirect revalidation, and response
  content-type controls.
- Confirmation/approval requirements for destructive, financial, public,
  privileged, and non-idempotent actions.
- External-operation protocol from Sections 8.4 and 12.4 with unique logical
  identity, provider account/destination binding, request-hash conflict
  rejection, approval reference, immutable fenced attempts, provider
  idempotency/request IDs, receipts, events, and reconciliation certainty.
- Dedicated code sandbox service with ephemeral filesystem, read-only base
  image, non-root user, dropped capabilities, resource/time/process limits,
  no platform credentials, deny-by-default egress, explicit file mounts, and
  full teardown.
- Supported sandbox runtimes pinned by digest; package installation disabled by
  default and allowlisted by policy when enabled.
- Safe file/artifact transfer and malware scan at the sandbox boundary.
- Per-workspace and per-agent tool kill switches plus global emergency stop.
- Execution receipt with sanitized input/output, policy decision, connection
  reference, timing, usage, side-effect result, and provenance.

#### Tests

- Policy matrix across role, agent, workflow, environment, risk, connection,
  classification, and approval.
- Secret canary tests across logs, traces, errors, events, database, artifacts,
  and model-visible output.
- OAuth refresh race, rotation, revoked token, and reduced-scope cases.
- SSRF fixtures for loopback, link-local, private ranges, DNS rebinding,
  redirects, alternate IP notation, and oversized responses.
- Destructive tool cannot execute without the recorded approval.
- Duplicate/hash-conflicting idempotency keys, every send crash window, stale
  epoch/fence, response loss, provider receipt, and uncertain external
  operation reconciliation.
- Sandbox escape regression corpus, fork bomb, memory/disk exhaustion, timeout,
  symlink, malicious archive, forbidden syscall, and egress denial.
- Sandbox cleanup and concurrent tenant isolation.
- Kill switches interrupt new work and safely handle in-flight work.
- Deterministic model/tool and credential-proxy emulators prove the complete
  brokered tool-call path without external credentials.
- [EXT] Under `EXT-004`, a live non-production OpenAI model-requested tool-call
  smoke test proves the same broker path when credentials exist; missing
  credentials leave only that external criterion blocked and do not skip an
  engineering test.

#### Acceptance

- Model-visible data never includes a raw provider credential.
- A tool executes only when all recorded policy dimensions allow it.
- A hostile sandbox program cannot access host/platform secrets or unapproved
  network destinations.
- An uncertain side effect becomes operator-visible and is never blindly
  repeated.

---

### M17 — Governed agent execution, provenance, memory, and workflow integration

**Status:** `NOT_STARTED`\
**Depends on:** M10, M13, M15, M16\
**Required commit:** `feat: execute governed agents with full provenance`

#### Product addition

Published agents can perform real workflow work under budgets, permissions, and
human gates, with every consequential result traceable.

#### Deliverables

- Durable agent-execution activity integrated with run/task state machines.
- Input assembly from typed node inputs, workflow variables, scoped memory,
  explicit conversation context, and a provider-neutral authorized-context
  contract that returns a recorded retrieval manifest. M17 certifies that
  contract with deterministic fixtures; M20 supplies the real indexed
  knowledge adapter without changing the agent-execution protocol.
- Execution loop with model call, validated tool call, policy/approval,
  broker execution, result continuation, and bounded turn count.
- Per-execution limits for turns, tokens, cost, wall time, tool calls, output
  bytes, and retrieved context.
- Deterministic budget reservation and reconciliation with partial-usage
  handling on failure.
- Output schema enforcement before downstream workflow consumption.
- Human-review modes: before any run, before selected tools, on confidence or
  policy condition, and before final effect.
- Memory scopes: none, execution, user-private, and workspace-shared;
  each has retention, provenance, access, edit, and delete controls.
- Memory writes are explicit structured operations, policy checked, and
  separately auditable; arbitrary model text is not silently made durable.
- Versioned memory records distinguish current value from immutable correction/
  deletion history, record purpose, subject, scope, sensitivity, provenance,
  source/permission dependencies, expiry, legal-hold state, authorizer, and
  every execution that read or wrote the record.
- Memory APIs and `/app/profile/memory` plus `/app/agents/:agentId/memory`
  surfaces support inspect, search, provenance, correction, scope change,
  export, delete, retention preview, and authorized workspace administration;
  user-private records are never exposed through workspace administration.
- Source deletion, access revocation, membership removal, workspace deletion,
  retention expiry, and subject deletion tombstone affected records and purge
  them from future context within their declared bound while preserving only
  the minimum separately protected audit fact allowed by policy.
- Memory lifecycle events drive cache/context invalidation and deletion
  reconciliation; a prepared prompt must reauthorize every referenced record
  immediately before dispatch and fails closed on stale proof.
- Provenance graph links run, task, attempt, agent/version, prompt hash,
  model-role mapping snapshot, knowledge chunks, memory records, tool receipts,
  approvals, output, and usage.
- User-facing execution summary reports decisions and evidence without storing
  or exposing private chain-of-thought.
- Safe resume after approval, restart, rate limit, or transient outage.
- Cancel/timeout propagation through gateway, broker, sandbox, and external
  operation journal.
- Agent node inspector and live event rendering in the run room.
- Agent preview in test mode using fixture or sandbox data and an unmistakable
  environment label.

#### Tests

- End-to-end agent loop with zero, one, and multiple validated tool calls.
- Turn/token/cost/time/tool/output limits at exact boundaries.
- Tool approval pauses and resumes once after restart or duplicate signal.
- Output schema failure, bounded repair, and downstream block.
- Knowledge/memory authorization changes during execution.
- Memory create/read/search/correct/scope/export/delete/retention APIs, version
  history, and cross-user/workspace isolation.
- User/source/permission/membership/workspace deletion propagation through
  caches and already prepared agent context, including fail-closed dispatch.
- Corrected or deleted memory is absent from new model context while the
  immutable audit record reveals no prohibited prior content.
- Cancellation at model, approval, tool, sandbox, and post-side-effect stages.
- Provenance completeness and hash consistency.
- No chain-of-thought appears in logs, events, exports, or product surfaces.
- Provider outage/fallback policy and `UNCERTAIN` external-outcome handling.
- Browser E2E publish agent, add to workflow, run, approve tool, inspect result.

#### Acceptance

- A real agent completes a workflow task and produces a typed, provenance-backed
  output.
- Every tool effect is linked to the policy and approval that allowed it.
- Budget and loop limits stop runaway work durably.
- Workspace or user memory is never written implicitly.

---

### M18 — Agent evaluation, regression, release, and monitoring

**Status:** `NOT_STARTED`\
**Depends on:** M17\
**Required commit:** `feat: add agent evaluations and controlled releases`

#### Product addition

Teams can prove that an agent version is good enough to release, compare it
fairly with another version, and detect quality regressions in production.

#### Deliverables

- Knotline-owned evaluation runner, dataset store, result store, grader
  registry, comparison engine, and scheduled execution; production readiness
  does not depend on the deprecated OpenAI Evals platform.
- Evaluation datasets with immutable versions, typed inputs, expected
  properties, optional references, tags, difficulty, risk, and encrypted
  sensitive fixtures.
- Dataset creation from synthetic cases, curated examples, redacted run
  snapshots with consent, CSV/JSONL import, and manual authoring.
- Deterministic, schema, exact-match, rule, model-graded, pairwise,
  tool-trajectory, citation, safety, latency, and cost graders.
- Human review queues with blinded randomized comparison, calibrated rubric,
  disagreement capture, and adjudication.
- Adversarial suites for prompt injection, tool misuse, data exfiltration,
  authorization, unsafe content, malformed files, and budget exhaustion.
- Baseline/candidate comparison with confidence intervals where meaningful,
  per-slice results, regression thresholds, and failure examples.
- Release gates by agent/environment/risk class with required suites and
  minimum scores.
- Release channels, canary percentage, shadow execution where policy permits,
  instant rollback, and immutable promotion record.
- Online monitoring for schema failure, fallback, refusal, safety block,
  approval, tool error, citation coverage, latency, and cost drift.
- Evaluation reproducibility snapshot includes agent version, model-role
  mapping/provider revision, tool versions, knowledge fixture version, policy,
  and grader version.
- Product dashboards show uncertainty and sample size; no fabricated or
  cherry-picked quality number.
- CI command for small deterministic suites and scheduled pipeline for full or
  provider-backed suites.

#### Tests

- Dataset immutability, encryption, access, import validation, and deletion.
- Grader unit tests including adversarial attempts to influence a model grader.
- Pairwise randomization and human-review authorization.
- Reproducibility from a stored evaluation snapshot.
- Gate blocks a regressed version and permits a passing version.
- Canary allocation stability, rollback, and in-flight version pinning.
- Online metric aggregation and low-sample warning.
- Scheduled evaluation retry/idempotency and provider budget cap.
- Golden suite covering tool, knowledge, safety, schema, and workflow behavior.
- Browser E2E create dataset, run comparison, inspect failures, promote, and
  rollback.

#### Acceptance

- A new agent release cannot pass a configured gate when a required evaluation
  regresses.
- A promoted version can be rolled back without changing historical runs.
- Results identify both aggregate movement and the concrete cases that changed.
- Evaluation evidence is reproducible from stored versions and policy.

---

### M19 — Secure files, uploads, previews, and document processing

**Status:** `NOT_STARTED`\
**Depends on:** M03, M12, M16\
**Required commit:** `feat: add secure file ingestion and document processing`

#### Product addition

Users, tasks, runs, knowledge sources, and agents can safely exchange files
with accurate status, searchable extraction, preview, retention, and deletion.
This milestone generalizes the restricted task-attachment foundation accepted
in M12 rather than introducing a second upload, file-identity, scan, or
download model.

#### Deliverables

- Extend M12’s canonical file/upload/version/scanning/download contracts to
  every declared file purpose and knowledge-processing lifecycle.
- Multipart and resumable upload sessions using short-lived signed object-store
  operations, checksums, size/type policy, quota reservation, and idempotent
  completion.
- Upload states: `initiated`, `uploading`, `uploaded`, `quarantined`,
  `scanning`, `processing`, `ready`, `rejected`, `failed`, `deleted`.
- Malware scanner adapter, archive-bomb detection, extension/MIME/content
  mismatch detection, password-protected file policy, and quarantine bucket.
- Canonical file record with workspace, owner, purpose, object version,
  checksum, media type, classification, scan, retention, and legal-hold fields.
- Safe browser preview for PDF, common image/text/office formats through
  sanitized derived artifacts; unsafe active content is never served inline.
- Download through an authorization-checking proxy/private CloudFront origin
  that validates current session/grant and a short-lived one-time token on
  every request/range request, supports a deny list, safe filename/content
  disposition, audit, and prompt revocation. Ordinary irrevocable S3 presigned
  download URLs are not returned to browsers.
- Document processing jobs for PDF, text, Markdown, HTML, DOCX, PPTX, XLSX/CSV,
  images with OCR, and common email exports.
- Extraction preserves page/sheet/slide/section coordinates, source checksum,
  parser version, language, tables where feasible, and error/warning details.
- User-visible progress, retry, partial extraction warning, unsupported type,
  and remediation.
- Version replacement creates a new immutable file version; existing run
  provenance continues to reference the old version.
- Lifecycle/retention jobs, deletion tombstone, derived-artifact purge, cache
  invalidation, and downstream knowledge deletion event.
- Workspace storage usage accounting and limits.
- Files panel with search, filters, owner/source/status/size/date, preview,
  usage references, replace, download, and delete.

#### Tests

- Multipart interruption, duplicate part, checksum mismatch, expiry, quota
  race, and idempotent finalization.
- Standard malware test corpus, malicious archives, polyglot, spoofed MIME,
  path traversal, SVG/HTML script, and oversized document.
- Quarantined/rejected files cannot be previewed, downloaded, parsed, or sent
  to a model.
- Parser fixtures for every declared format including corrupt, encrypted,
  multilingual, OCR, large table, and partially supported cases.
- Download-token expiry, one-time/range behavior, deny-list/session/grant
  revocation, direct S3/origin denial, and authorization recheck.
- Retention, legal hold, deletion, derived artifacts, and usage reconciliation.
- File replacement preserves historical provenance.
- Browser E2E upload, progress, failure, preview, attach, replace, and delete.
- Mobile upload/camera and accessible preview alternatives.

#### Acceptance

- A clean supported document becomes previewable and extractable with source
  coordinates.
- A malicious or unknown file remains quarantined and cannot reach any parser,
  agent, or user download path.
- Deleting a file removes all unprotected derivatives and initiates downstream
  index removal.
- Historical runs continue to identify the exact immutable file version used.

---

### M20 — Permission-aware hybrid retrieval, citations, and reindexing

**Status:** `NOT_STARTED`\
**Depends on:** M15, M17, M19\
**Required commit:** `feat: deliver permission-aware hybrid retrieval`

#### Product addition

Agents and people can search authorized workspace knowledge and receive
source-linked answers without leaking content through retrieval, metadata, or
citations.

#### Deliverables

- Source/document/version/section/chunk/embedding schemas with source checksum,
  parser/chunker/embedder version, coordinates, classification, and ACL
  snapshot/reference.
- Configurable deterministic chunking by document type with overlap, table
  handling, metadata, and content hashes.
- Embedding gateway through the provider-neutral model interface, batching,
  cache, retry, quota, and cost accounting.
- PostgreSQL full-text and `pgvector` indexes with workspace/source partition
  strategy and measured query plans.
- Hybrid retrieval pipeline: query normalization, authorization, keyword and
  vector candidates, reciprocal/rank fusion, optional reranking, deduplication,
  diversity, context packing, and token limit.
- Authorization filter is applied before content is returned and verified again
  at materialization/citation time.
- Search response includes stable source/version, title, excerpt, coordinates,
  relevance components, classification, freshness, and permitted preview URL.
- Citation component opens the exact authorized page/section/sheet/slide and
  handles deleted, superseded, or permission-revoked sources honestly.
- Query API supports source, type, owner, date, tag, classification, and
  connector filters.
- Reindex coordinator supports full, incremental, changed-version, parser
  upgrade, chunker upgrade, embedder upgrade, ACL-only update, and delete.
- Dual-index/version cutover prevents mixed or partially rebuilt results.
- Retrieval trace records query hash, policy, selected chunk identifiers,
  scoring/version, and latency without exposing unauthorized text.
- Knowledge search UI with result list, preview, source health/freshness, and
  “why this result” detail.
- Prompt-injection metadata and content scanning; retrieved instructions are
  treated as untrusted data and cannot override agent policy.
- Permission-proof leases and invalidation events enforce NFR-023: local grant
  removal denies in the committing transaction, connector-origin proof older
  than five minutes fails closed, and cache/search/citation/entity/agent-
  context consumers share one revocation contract and observable lag metric.
- Persisted ACL projection/version service and signed authorization-proof
  service from Sections 8.6 and 14.4, including monotonic epochs, provider
  revision/observation/expiry, atomic invalidation, signing-key rotation, and
  server/client proof verification. M33 consumes the same proof for its
  registered offline-device/cache/key-lease protocol.
- Reusable `ACL-REVOKE-1` harness accepts connector adapters and asserts local,
  webhook, polling, backlog, cached-result, open-session, citation-open, entity,
  and prepared-agent-context cases; M20 certifies local/file fixtures, each
  connector milestone certifies its adapter, and M36 reruns the full `LIVE`
  matrix at launch scale.
- Retrieval evaluation suite for recall, precision, citation correctness,
  authorization, freshness, latency, and cost.
- Production adapter from M17’s authorized-context contract to this retrieval
  pipeline, including manifest/provenance handoff, final pre-dispatch
  reauthorization, cancellation, budget, and memory/source invalidation.
- Milestone-scale `SEARCH-1M-M20` profile uses the same seeded distribution and
  query/ACL corpus as `SEARCH-100M-1` at one million chunks; the full 100
  million-chunk launch profile runs only after M34 staging foundation in M36.

#### Tests

- Cross-workspace, private-source, group ACL, removed-user, revoked-share, and
  connector-permission leakage corpus.
- ACL changes during query and between result display and citation open.
- ACL projection reordering/incompleteness, epoch rollback, stale observation,
  proof expiry, signing-key rotation/revocation, and subject/group/workspace/
  device/resource substitution.
- Local/file `ACL-REVOKE-1` cases meet transaction, p95, five-minute maximum,
  fail-closed, and zero-metadata-leak thresholds; delayed/missing invalidation,
  stale lease, open SSE/session, cache, entity, and prepared-context fault
  cases are included.
- Keyword-only, semantic-only, hybrid, rerank, dedupe, and context-budget
  behavior.
- Exact citation coordinates for every supported parser format.
- Embedding outage, partial batch, retry, dimension/version mismatch, and quota.
- Full/incremental/reversion/delete/ACL-only reindex and dual-index cutover.
- Query-plan and p95 latency test on `SEARCH-1M-M20`; schema/index/query choices
  must extrapolate within the capacity model and are revalidated at 100M in
  M36.
- Prompt-injection retrieval fixtures and policy-boundary assertions.
- Deleted/superseded source behavior in historical run provenance.
- Browser E2E upload, index, search, cite, revoke permission, and disappear.

#### Acceptance

- A user sees only chunks and citation metadata they are currently allowed to
  access.
- Every displayed citation resolves to an exact source location or clearly
  states why it is no longer available.
- Reindexing or changing an embedding model does not expose a partial mixed
  index.
- `SEARCH-1M-M20` meets the same relevance/ACL correctness thresholds and its
  scaled latency budget; final `SEARCH-100M-1` acceptance remains owned by M36
  and M38.

---

### M21 — Entity graph, provenance explorer, and knowledge administration

**Status:** `NOT_STARTED`\
**Depends on:** M20\
**Required commit:** `feat: add the provenance-backed knowledge graph`

#### Product addition

Users can understand how people, work, documents, systems, and decisions relate,
and administrators can inspect and repair the knowledge used by agents.

#### Deliverables

- Versioned entity schema for people, teams, organizations, projects, tasks,
  workflows, runs, documents, records, systems, decisions, and custom types.
- Versioned edge schema with source/target, relationship type, direction,
  confidence, validity interval, source provenance, creator/extractor, and
  policy.
- Entity resolution pipeline with deterministic provider identifiers,
  configurable matching, merge candidates, manual merge/split, aliases, and
  false-match protection.
- Explicit distinction among provider facts, user-authored facts, inferred
  facts, and model suggestions.
- Every graph fact links to an authorized source location or explicit
  user/system action.
- Graph ACL derives from all contributing sources; mixed-visibility evidence
  cannot broaden access.
- Entity profile with fields, aliases, connected records, source freshness,
  conflicts, history, and permitted edit/merge controls.
- Provenance explorer from answer/output to retrieval chunk, document version,
  connector sync, external record, tool effect, approval, agent version, and
  run.
- Graph visualization for bounded neighborhoods plus accessible outline/table,
  filtering, grouping, pagination, and “load more”; no unbounded client graph.
- Knowledge administration for sources, documents, versions, parse/index
  status, permissions, errors, freshness, reindex, disable, and delete.
- Conflict handling shows competing values and their sources instead of
  silently selecting truth.
- Custom entity/relationship type administration with schema validation and
  migration/reference safety.
- Graph query service with traversal depth, result, time, and cost limits.
- Export of authorized entity profiles and provenance packets.

#### Tests

- Entity resolution duplicate, collision, merge, split, alias, and provider-ID
  change cases.
- Temporal and conflicting facts remain attributable.
- ACL intersection for facts derived from multiple differently shared sources.
- Removed source/permission and deleted document behavior.
- Traversal depth/fan-out/cycle limits and query-plan performance.
- Provenance completeness from a run output to exact source and tool receipts.
- Graph visualization and outline convey equivalent content.
- Custom type evolution and in-use deletion protection.
- Browser E2E inspect entity, traverse relation, verify source, merge/split,
  repair index, and export.
- Keyboard, screen-reader, phone, and large-graph degradation review.

#### Acceptance

- A user can explain where an important agent claim or workflow output came
  from.
- Conflicting facts remain visible and sourced.
- Graph traversal never reveals a restricted entity, edge, title, count, or
  excerpt.
- Administrators can diagnose and repair a failed or stale knowledge source
  without direct database access.

---

### M22 — Secure connector framework, OAuth, sync engine, and SDK

**Status:** `NOT_STARTED`\
**Depends on:** M03, M16, M19, M20\
**Required commit:** `feat: establish the secure connector platform`

#### Product addition

Knotline has one reliable, observable, least-privilege platform for connecting
external systems instead of bespoke integrations with inconsistent security.

#### Deliverables

- Connector manifest/interface from Section 15 with provider, capabilities,
  auth methods, scopes, object types, triggers/actions, rate limits, permission
  model, webhook support, and regional availability.
- Connection lifecycle: `draft`, `authorizing`, `active`, `degraded`,
  `reauthorization_required`, `disabled`, `revoked`, `deleting`, `deleted`.
- OAuth 2.0 authorization code with S256 PKCE, signed one-time state,
  nonce/expiry, and safe popup/redirect UX. The durable transaction binds the
  workspace/user/session/browser nonce, one draft integration, connector
  manifest/version, provider, exact environment-specific client application
  ID/config version, exact registered redirect URI, requested scope snapshot,
  and clean return target; callback activation revalidates all bindings and
  stores the actual granted scopes.
- Support for OAuth, API key, service account, basic/custom auth only through
  the credential proxy and declared connector policy.
- Scope preview before authorization, actual-scope reconciliation after
  authorization, reduced-scope support, and re-consent on required expansion.
- Sync engine for discover, initial backfill, incremental cursor, page, retry,
  rate-limit, checkpoint, deletion/tombstone, permission update, and rescan.
- Per-connection ordered checkpoint and idempotent external-object/version
  identity.
- Webhook subscription lifecycle, signature/timestamp verification, replay
  protection, deduplication, fast acknowledgement, and asynchronous
  processing. Endpoint registration explicitly selects connection-scoped or
  provider-application-scoped verification. An application-scoped callback
  verifies exact raw bytes against the endpoint's application/environment
  secret before parsing, then resolves the trusted installation/account/tenant
  ID and provider-authenticated event sequence/time through exactly one
  historical `provider_installation_bindings` version. Cross-workspace
  installation reassignment is forbidden; an event without authenticated
  ordering after any detach/rebind ambiguity is quarantined. Zero, duplicate,
  disabled-at-event-time, wrong-application, or cross-environment mappings fail
  closed before any workspace queue or state is selected. Event dedupe includes
  the authenticated installation/account scope.
- Polling fallback with jitter and adaptive interval where webhooks are absent.
- Provider permission/ownership metadata normalized for downstream ACL policy;
  unsupported permission fidelity is declared in the UI.
- Standard provider error taxonomy and user remediation: auth, scope, rate
  limit, quota, permission, deleted object, unsupported type, outage, and bug.
- Connection health, last success, freshness lag, object/error counts, current
  operation, next retry, granted scopes, account identity, and disable/delete.
- Workspace limits, provider concurrency, adaptive throttling, backpressure,
  and fair scheduling.
- Reconciliation compares provider inventory/checkpoints with local state and
  repairs safe divergence.
- Connector SDK, fixture server, contract test harness, recorded sanitized
  responses, certification checklist, and scaffold generator.
- The certification harness requires an `ACL-REVOKE-1` adapter that can inject
  provider permission changes, report observation time, exercise webhook and
  polling/backlog paths, and prove serving-cache/search/citation/entity/agent-
  context invalidation or fail-closed behavior.
- Operator runbooks and kill switches by provider, connector version,
  connection, workspace, capability, and direction.
- Connector version compatibility, staged rollout, rollback, and migration.

#### Tests

- OAuth state/PKCE/nonce/replay/session/workspace mix-up, authorization-locator
  guessing/collision/expiry/double-consume, connector-manifest swap, draft-
  integration swap, client-application/environment/config-version mismatch,
  callback URI mismatch, cross-browser initiation, unsafe redirect, query-log
  disclosure, and callback-to-clean-URL attacks.
- Scope escalation, reduced consent, revoked token, concurrent refresh, and
  reauthorization.
- Initial/incremental sync with page crash, duplicate page, cursor expiry,
  reordering, update, delete, and permission-only change.
- Webhook endpoint-locator guessing/collision, wrong tenant/application/account/
  secret binding, exact-raw-body mutation, invalid signature, stale timestamp,
  replay, duplication, reorder, secret rotation, and flood.
- Application-scoped webhook fixtures use one application URL/secret across at
  least two tenants/installations and cover valid post-signature routing,
  zero/multiple/disabled installation mappings, trusted-installation/payload
  account mismatch, wrong application/environment, tenant mix-up, and proof
  that an unverified payload field cannot select a tenant or secret.
- Detach/reconnect fixtures deliver an old signed event after the original
  binding closes, attempt forbidden cross-workspace installation-ID reuse, and
  cover providers with and without authenticated event order/time. Only a
  unique historical interval match may route; ambiguous/no-time delivery is
  quarantined, and identical provider event IDs on two installations remain
  distinct while a duplicate inside one installation is suppressed.
- Rate-limit headers, provider 5xx/outage, quota, backoff, cancellation, and
  kill switch.
- Two-tenant credential, cursor, object, webhook, and queue isolation.
- Reconciliation finds and safely repairs deliberately injected divergence.
- Connector certification suite passes against fixture provider.
- No secret or unauthorized provider payload in logs/traces/events.
- Connection UX browser E2E authorize, sync, diagnose, reauthorize, disable,
  and delete.

#### Acceptance

- A certified fixture connector survives restart, duplication, rate limiting,
  permission changes, and revoked authorization.
- Users can see exactly which external account and scopes a connection uses.
- Deleting a connection stops activity, revokes when supported, and initiates
  local data deletion under retention policy.
- A new connector can be implemented through the SDK without inventing a new
  auth, sync, error, or observability model.

---

### M23 — Google, Notion, and Confluence knowledge connectors

**Status:** `NOT_STARTED`\
**Depends on:** M22\
**Required commit:** `feat: connect Google Notion and Confluence knowledge`

#### Product addition

Workspaces can make authorized Google Drive, Google Docs/Sheets, Notion, and
Confluence content searchable and available to agents with source fidelity.

#### Deliverables

- Google Drive connector with personal drive and shared-drive discovery,
  folders, shortcuts, files, revisions, exports, deletions, changes cursor, and
  permission metadata.
- Google Docs extraction preserving headings, lists, tables, links, comments
  when authorized, and structural coordinates.
- Google Sheets extraction with workbook/sheet/range coordinates, values,
  formulas according to policy, hidden/protected sheet handling, and size
  limits.
- Notion connector for pages, databases/data sources, properties, blocks,
  hierarchy, comments when authorized, updates, archive/delete, and sharing
  metadata.
- Confluence Cloud connector for spaces, pages, blog posts, hierarchy,
  versions, labels, attachments, restrictions, updates, archive/delete, and
  rendered/storage-format sanitization.
- Confluence Data Center capability only when its version/auth/API contract is
  explicitly certified; otherwise the UI says unsupported rather than implying
  parity.
- Source pickers for all-account, selected drives/spaces/pages/databases, and
  include/exclude rules with estimated scope.
- Provider-native link and exact source/version coordinates on citations.
- Google action adapters implement Drive file create/export and
  append/update of an explicitly selected Sheets range. The immutable action
  schema binds connection/account, drive/file/sheet/range, expected version,
  exact values/content hash, risk, and approval policy.
- Notion action adapters implement create/update page and database row plus
  comment where supported; Confluence Cloud adapters implement create/update
  page and comment where certified. Every action shows an exact target/diff,
  uses the M16 broker, declares provider idempotency or a deterministic lookup
  strategy, and returns a stable receipt or visible `UNCERTAIN` state.
- Each action adapter implements `executeAction` and `reconcileAction` from
  Section 15.1 with fixture-visible provider state, conflict/version behavior,
  duplicate suppression, receipt capture, and repair metadata. M26 later
  composes these adapters into trigger-to-write workflows; it does not invent
  the provider write implementation.
- Permission-change ingestion has priority over content freshness.
- Incremental sync, periodic inventory reconciliation, reauthorization,
  provider account removal, and connector migration.
- Connector-specific dashboards and remediation for unsupported file,
  export limit, deleted source, inaccessible child, permission ambiguity, API
  quota, and provider outage.
- Sandboxed HTML/rich-content transformation and malware-safe attachments.
- Sanitized recorded contract fixtures and opt-in live sandbox suites for each
  provider.

#### Tests

- Google shared drive, shortcut, move, revision, deleted file, permission,
  shared link, group access, and changes-cursor reset.
- Docs/Sheets structural extraction and citation coordinates.
- Notion nested blocks, database row/property changes, archive, sharing, and
  pagination.
- Confluence restricted page/child, page version, attachment, move, deletion,
  macro/HTML sanitization, and pagination.
- Source selection/include/exclude and removal.
- Permission revocation disappears from search before ordinary content backlog.
- Every provider’s `ACL-REVOKE-1` adapter meets NFR-023 across direct, group,
  inherited, link, shared-drive/space, webhook, polling, and backlog cases.
- Provider rate-limit/outage/reconsent and full reconciliation.
- Google Drive/Sheets, Notion, and Confluence action fixtures cover target
  binding, preview/diff, approval, duplicate key, version conflict, partial or
  response-lost write, receipt, `UNCERTAIN`, reconciliation, and provider-
  visible result.
- [EXT] Under separate `EXT-007` and `EXT-009` criterion rows, live
  non-production certification includes every declared Google and
  Notion/Confluence read/write action with a reconciled receipt; an unavailable
  provider advances neither the other row nor an aggregate pass.
- End-to-end connect, select, sync, search, cite, change permission, and delete.

#### Acceptance

- A supported source syncs incrementally and produces exact, authorized
  citations.
- Removing external access removes the corresponding searchable content within
  the permission-revocation SLO.
- Provider limitations are visible at connection and source-selection time.
- Each provider passes its recorded deterministic suite before engineering
  completion.
- Each provider action declared by the GA capability matrix has a deterministic
  brokered write/reconciliation implementation before engineering completion.
- [EXT] Each `EXT-007` Google and `EXT-009` Notion/Confluence provider row
  passes real sandbox certification, including a provider-visible write and
  reconciled receipt, before that provider is labelled `LIVE`.

---

### M24 — Work tracking, source control, collaboration, and X connectors

**Status:** `NOT_STARTED`\
**Depends on:** M22\
**Required commit:** `feat: connect Linear Jira GitHub and collaboration systems`

#### Product addition

Workflows and agents can read and, with explicit policy, update the systems
where teams plan, build, communicate, and publish.

#### Deliverables

- Linear connector for teams, projects, cycles, issues, comments, labels,
  members, webhooks, search, create/update/comment, and stable receipts.
- Jira Cloud connector for sites, projects, issue types, issues, fields,
  comments, users, transitions, JQL search under bounded policy, webhooks, and
  create/update/comment/transition.
- GitHub App connector for organizations, repositories, issues, pull requests,
  reviews, checks, comments, commits, files, webhooks, create comment/issue,
  and policy-gated branch/PR actions. Its shared application webhook endpoint
  verifies with the GitHub App/environment secret first and only then binds the
  signed installation ID to one Knotline integration/workspace.
- Slack connector for workspaces, channels, permitted history/search, threads,
  users, files, events, post/update/delete where scopes permit, and signed
  interactivity.
- Microsoft Teams collaboration capabilities implemented through Microsoft
  Graph for teams/channels/messages/files/actions where the tenant permission
  model permits.
- X connector for explicitly supported API-tier capabilities such as account
  identity, permitted reads, and policy-gated draft/publish/delete; capability,
  cost, rate, and policy limitations are shown before setup.
- Object pickers and action forms use provider metadata through the connector
  adapter with cached, expiry-aware fallback; deterministic fixture metadata
  satisfies engineering tests and live metadata requires the provider gate.
- Every write action declares risk, idempotency/receipt semantics, required
  scope, approval recommendation, and compensation limitations.
- Provider identities map to Knotline users only through verified identifiers
  or explicit administration.
- Source records may enter knowledge indexing only under connector-specific
  ACL fidelity and workspace policy.
- Connector action previews show exact target/account and a semantic diff when
  supported.
- Sandbox/fixture tenants, recorded contracts, certification matrices, and
  provider-specific runbooks.

#### Tests

- Provider object pagination, update, deletion, webhook, permission, and rate
  limit fixtures.
- Jira custom fields/transitions, GitHub installation/repository scope, Slack
  private-channel scope, Teams tenant consent, and Linear workspace scope.
- External write duplicate, conflict, partial failure, `UNCERTAIN` outcome,
  receipt, and reconciliation.
- Every provider’s `ACL-REVOKE-1` adapter meets NFR-023 before its permission-
  bearing read/index capability can be labelled `LIVE`.
- Message/comment escaping, mention safety, Markdown/rich-text conversion,
  attachment policy, and injection.
- Provider-account identity and target confirmation.
- GitHub/Slack webhook signature and replay corpus. The GitHub App corpus uses
  one shared application URL/secret and two installations in different
  Knotline tenants, proves correct post-verification routing, and rejects
  installation/account substitution, zero/multiple mappings, disabled
  installation, and cross-tenant payload mix-up. It also sends a delayed event
  across uninstall/reinstall and attempted workspace rebinding, proving
  historical binding-version selection or quarantine and installation-scoped
  event-ID deduplication.
- X capability changes are configuration-gated; unsupported operations cannot
  appear in the UI.
- [EXT] Separate `EXT-008`, `EXT-010`, `EXT-011`, `EXT-012`, and `EXT-014`
  criterion rows certify every Microsoft/Teams, Linear/Jira, GitHub,
  Slack/Teams, and X capability proposed as `LIVE`; no provider pass advances
  another row.
- Browser E2E against the provider fixture covers connection, read trigger,
  approval, write, receipt, and provider-visible result.

#### Acceptance

- [EXT] Each applicable `EXT-008`, `EXT-010`, `EXT-011`, `EXT-012`, and
  `EXT-014` row completes at least one read and one declared write journey with
  a reconciled provider receipt before its provider is `LIVE`.
- A workflow cannot post, transition, merge, or publish to the wrong account or
  target through stale metadata.
- Private or ungranted provider content is neither searched nor shown.
- Tier-, tenant-, or scope-limited capabilities are labelled accurately.

---

### M25 — Microsoft 365, email/calendar, CRM, and generic data connectors

**Status:** `NOT_STARTED`\
**Depends on:** M22\
**Required commit:** `feat: add Microsoft CRM and generic data connectors`

#### Product addition

Knotline can coordinate documents, mail, calendars, customer records, object
storage, and arbitrary authorized APIs through production-certified connectors.

#### Deliverables

- Microsoft Graph connector for OneDrive, SharePoint sites/libraries/files,
  Outlook Mail shared/delegated rules, Outlook Calendar events, and identity
  metadata with least-privilege delegated/application consent modes.
- Google Gmail and Calendar capabilities with explicit mailbox/calendar scope,
  history/sync tokens, thread/event identity, delegated access policy, and
  create/update/send actions.
- Salesforce connector for org identity, objects, fields, records, SOQL under
  bounded query construction, CDC/platform events where available, and
  policy-gated create/update.
- HubSpot connector for account, CRM schema/objects/associations, owners,
  timelines where permitted, webhooks, and policy-gated create/update.
- S3-compatible connector with endpoint allowlist, bucket/prefix restriction,
  object versions, events/polling, server-side encryption requirements, and
  safe file handoff.
- CSV import connector with mapping, type inference/override, preview, errors,
  resumability, deduplication/upsert key, provenance, and rollback batch.
- Generic REST connector builder with base URL allowlist, auth reference,
  OpenAPI import, typed operations, pagination, rate-limit, retry,
  request/response mapping, secret redaction, and risk classification.
- Generic inbound/outbound webhook connection with signing secret rotation,
  payload schema/version, replay protection, delivery log, and retry policy.
- Connection/action UI surfaces tenant/account, data direction, objects,
  scopes, delegated/shared access, destructive capability, and data residency.
- Each connector implements incremental sync or states clearly that only
  action/query mode is supported.
- Provider-specific reconciliation, deletion, contract tests, sandbox
  certification, dashboards, limits, and runbooks.

#### Tests

- Microsoft tenant consent, SharePoint inheritance/sharing, OneDrive delta,
  delegated/shared mailbox and calendar authorization.
- Gmail history reset/thread identity and Calendar sync-token/time-zone/
  recurring-event behavior.
- Salesforce schema changes, pagination, CDC replay, field security, and
  `UNCERTAIN` write outcome.
- HubSpot association/schema/webhook and reduced-scope behavior.
- S3 endpoint/SSRF, bucket/prefix escape, version/delete marker, event duplicate,
  malware, and encryption policy.
- CSV encoding, delimiter, huge row, formula injection, type error, duplicate,
  resume, and rollback.
- REST OpenAPI malicious reference/schema, redirect/SSRF, pagination loop,
  oversized response, secret echo, retry, and non-idempotent operation.
- Webhook signature rotation, replay, out-of-order, schema version, and DLQ.
- [EXT] Separate `EXT-025`, `EXT-007`, `EXT-008`, and `EXT-013` rows certify
  the S3-compatible, Google, Microsoft, and Salesforce/HubSpot capabilities
  proposed as `LIVE`; generic fixture-only connectors retain a non-`LIVE`
  label until their own declared external dependency is added to the register.
- Every provider’s `ACL-REVOKE-1` adapter meets NFR-023, including delegated/
  shared-resource, field/record, prefix, and imported-batch permission cases.

#### Acceptance

- Each deterministic certified provider journey preserves external identity,
  permission, version, and receipt.
- [EXT] The same preservation and reconciliation contract passes separately
  under each applicable `EXT-025`, `EXT-007`, `EXT-008`, and `EXT-013` sandbox
  row before that provider capability is labelled `LIVE`.
- Shared/delegated Microsoft or Google resources never become accessible merely
  because the connection owner can access them.
- The generic REST builder cannot bypass the broker, egress, schema, secret, or
  approval controls.
- CSV and S3 imports can be traced and deleted as coherent ingestion batches.

---

### M26 — Production triggers, schedules, inbound events, and outbound sync

**Status:** `NOT_STARTED`\
**Depends on:** M10, M13, M22\
**Required commit:** `feat: add production triggers and reconciled outbound sync`

#### Product addition

Published workflows can start from real schedules and external events and can
write back safely with deduplication, approvals, and repair.

#### Deliverables

- Trigger types: manual, API, signed webhook, schedule/cron, connector event,
  record-created/updated, email/message, calendar, file, and parent workflow.
- Trigger configuration is versioned with the workflow and validates required
  connection, scope, schema, filter, environment, and deduplication strategy.
- Schedule engine supports IANA time zones, DST policy, calendar exclusions,
  missed-run/catch-up policy, jitter, start/end dates, pause, and next-run
  preview.
- Inbound event normalization to the Section 11 envelope with raw-payload
  encryption/retention policy, schema validation, source identity, and receipt.
- Trigger filters and field mappings use typed expressions with fixture
  simulator.
- Deduplication keys, reorder windows, per-source sequence/checkpoint, and
  explicit behavior when a provider supplies no stable event identifier.
- Burst buffering, workspace fairness, per-trigger concurrency, rate limits,
  pause/disable, and backpressure.
- Outbound action library uses the tool broker and external-operation journal.
- Write preview/diff, approval, idempotency, provider receipt, compensation
  metadata, and `UNCERTAIN` attention state.
- Reconciliation jobs query provider state where possible and offer
  operator-confirmed repair where not.
- Trigger/action health with last received, last started, filtered count,
  duplicate count, lag, errors, next schedule, and disabled reason.
- Test-event capture/replay redacts secrets and can target only test mode unless
  explicitly confirmed.
- End-to-end lineage from external event through run to outbound provider
  receipt.

#### Tests

- Cron/time-zone/DST/leap-day/missed-run/catch-up truth-table suite.
- Signed webhook replay, reorder, duplicate, flood, malformed payload, schema
  version, clock skew, and secret rotation.
- Connector event cursor reset and no-stable-ID policy.
- Burst/backpressure/fairness and per-workspace concurrency.
- Trigger version change while events are queued.
- Duplicate and unknown outbound side effects, approval interruption, provider
  conflict, and reconciliation.
- Disabled/revoked connection stops new triggers and actions.
- Simulator and captured event cannot affect production accidentally.
- End-to-end provider fixture event → run → approval → write → receipt.
- Operator E2E diagnose and repair a stuck/uncertain sync.

#### Acceptance

- One external event produces at most one logical run under its recorded
  deduplication policy.
- Schedules fire at the documented local instant across DST transitions.
- Every external write has a known receipt or visible uncertain state.
- Operators can pause a noisy trigger without disabling unrelated workflows.
- [EXT] Separate criteria for each applicable `EXT-007`, `EXT-008`, `EXT-009`,
  `EXT-010`, `EXT-011`, `EXT-012`, `EXT-013`, `EXT-014`, and `EXT-025` row
  prove every provider-backed trigger/action proposed as `LIVE` from inbound
  event through reconciled receipt; one provider cannot satisfy another.

---

### M27 — In-app, email, chat, webhook, digest, and escalation notifications

**Status:** `NOT_STARTED`\
**Depends on:** M09, M12, M13, M24, M26\
**Required commit:** `feat: deliver multichannel notifications and escalation delivery`

#### Product addition

People receive timely, actionable notifications through their chosen channels
without duplicates, leaks, alert storms, or dead links.

#### Deliverables

- Notification intent, recipient resolution, preference, template/version,
  delivery attempt, receipt, digest, and suppression schemas.
- Event taxonomy for assignment, mention, approval, request changes, SLA
  warning/breach, run failure/attention, agent release, connection degradation,
  billing, security, and administrator announcements.
- In-app notification center with unread state, grouping, filters, bulk mark,
  deep links, and real-time badge.
- Transactional email with verified domains/configuration, accessible HTML and
  text, safe links, reply/contact policy, and no secret payload.
- Slack and Teams delivery through workspace-authorized installations, with
  signed interactive actions for eligible approval/task responses.
- Signed outbound notification webhook with versioned schema, retries, receipt,
  replay protection, and DLQ.
- Per-user and workspace preferences by event/channel, immediate/digest/off,
  quiet hours, time zone, language, and protected mandatory-security events.
- Daily/weekly digest compilation with authorization recheck at render and send
  time.
- Escalation bypass rules are explicit, policy-bound, rate-limited, and audited.
- Deduplication, grouping, collapse window, rate limit, circuit breaker,
  provider fallback, bounce/complaint handling, and invalid-target suppression.
- Template administration with variable schema, preview, localization,
  versioning, and protected security language.
- Delivery health dashboards and end-user troubleshooting.
- Deep links require current authorization and show an honest unavailable state
  after resource deletion or access loss.

#### Tests

- Intent deduplication, grouping, collapse, digest membership, and exact-once
  logical read state.
- Recipient resolution after assignment/group/delegation/membership changes.
- Authorization revoked between intent, digest generation, delivery, and click.
- Preference, quiet-hour, time-zone, language, escalation override, and
  mandatory-event truth tables.
- Email link/header injection, template escaping, tracking/privacy policy,
  bounce, and complaint.
- Slack/Teams signature, replay, identity binding, interactive duplicate, and
  stale approval.
- Webhook retry, signature rotation, DLQ, and redelivery.
- Notification storm load and per-user/workspace caps.
- Browser E2E configure preferences, receive, deep-link, act, and mark read.
- Email/chat rendering and screen-reader review.
- [EXT] Separate `EXT-006`, `EXT-008`, and `EXT-012` rows certify SES,
  Microsoft Teams identity/consent, and Slack/Teams distribution delivery,
  action, and receipt behavior for every channel proposed as `LIVE`.

#### Acceptance

- A user receives one actionable notification for a task assignment through
  each enabled deterministic channel adapter.
- [EXT] The same journey succeeds under every applicable `EXT-006`, `EXT-008`,
  and `EXT-012` channel row before that channel is labelled `LIVE`.
- Quiet hours and digests respect the user’s time zone without delaying a
  configured critical escalation.
- A notification never reveals resource content after access is removed.
- Operators can distinguish provider failure, invalid destination, suppression,
  and recipient preference.

---

### M28 — Global search, saved views, operational analytics, and reporting

**Status:** `NOT_STARTED`\
**Depends on:** M11, M12, M18, M21, M27\
**Required commit:** `feat: deliver global search saved views and operational analytics`

#### Product addition

Users can find work across Knotline, preserve operational views, and measure
real throughput, quality, cost, and bottlenecks from authoritative data.

#### Deliverables

- Unified search index/API for authorized workflows, runs, tasks, approvals,
  agents, files, knowledge entities, connections, members, comments, and
  settings destinations.
- Search respects object and field visibility before indexing and at query/
  materialization time; restricted titles/counts are not leaked.
- Command palette for navigation, recent resources, creation, and safe actions
  with keyboard-first behavior.
- Saved private/workspace views for run/task/approval/agent/connection tables,
  including filters, sort, columns, grouping, ownership, sharing, default, and
  reference-safe deletion.
- Dashboard builder using curated metric/query definitions rather than raw SQL.
- Replace every demo operations-home card with role-aware authoritative
  aggregates, attention queues, freshness, drill-through, and an empty state;
  demo workspaces remain separately labelled.
- Operational dashboards for workflow volume/success/attention/duration,
  task/approval queue/SLA, agent quality/latency/cost/tool use, connector
  health/freshness, and workspace adoption.
- Metric catalog defines exact source event, inclusion/exclusion, dimensions,
  time zone, late-arrival window, correction, owner, and version.
- Materialized aggregates and incremental correction from immutable domain
  events; every number can drill to the authorized contributing records.
- Time ranges, comparison periods, filters, segmentation, table/chart
  alternatives, CSV export, and scheduled report delivery.
- No invented trends, percentages, benchmark claims, or demo production data;
  demo workspaces are labelled and excluded by default.
- Product analytics taxonomy for consented usage events with data minimization,
  schema/version validation, sampling policy, and opt-out where required.
- Custom reporting API limited to curated measures/dimensions with query cost,
  timeout, row, and export limits.
- Data freshness and partial-data notices on every report.

#### Tests

- Search leakage corpus across tenant, role, group, private object, field, and
  access revocation.
- Search indexing update/delete/rebuild and result materialization recheck.
- Saved-view authorization, schema evolution, broken field, share, and delete.
- Metric calculations against hand-computed fixtures for every catalog metric.
- Late, duplicate, reordered, corrected, and deleted source event aggregation.
- Time-zone, DST, date boundary, comparison period, and empty/partial data.
- Drill-through totals reconcile exactly with aggregates under the same scope.
- CSV formula injection, huge export, cancellation, and signed-link expiry.
- Dashboard query cost/load and cache invalidation.
- Browser E2E search, save/share view, build dashboard, drill, export, schedule.
- Accessible table/chart equivalence and mobile analytics review.

#### Acceptance

- A displayed KPI reconciles to its authorized underlying records and states
  freshness.
- Removing access removes the resource from search and drill-through within the
  defined revocation SLO.
- Empty or partial data is labelled honestly rather than replaced with sample
  production metrics.
- A user can reproduce a saved operational view from its stored definition.

---

### M29 — Stripe billing, plans, entitlements, usage, and spend controls

**Status:** `NOT_STARTED`\
**Depends on:** M05, M10, M15, M19, M28\
**Required commit:** `feat: add Stripe billing usage and enforced entitlements`

#### Product addition

Knotline can sell plans, enforce limits before cost is incurred, reconcile
usage and payments, and give customers transparent control of spend.

#### Deliverables

- Extend the single M10 entitlement/budget/reservation/ledger core with
  commercial catalog, Stripe projection, finance policy, reporting, and
  customer UI; no second reservation or usage ledger is introduced.
- Product/price/plan catalog with versioned features, quotas, metered
  dimensions, overage policy, regional currency/tax metadata, and effective
  dates.
- Workspace subscription states for trial, active, past due, unpaid, paused,
  canceled, incomplete, grace, and enterprise-contract.
- Stripe Customer, Checkout, Billing Portal, subscription, invoice, credit,
  payment-method, and webhook integration; Knotline does not store raw card
  data.
- Signed Stripe webhook verification, event receipt/deduplication, out-of-order
  projection, periodic reconciliation, and operator repair.
- Entitlement service used by API and workers, with fail-safe cached policy,
  version, reason, grace, and emergency override.
- Usage ledger with immutable reservation, increment, finalize, release,
  adjustment, source reference, exact fixed-precision original/converted
  amount, currency/unit/scale, price and FX versions/times, invoice-rounding
  residual, and idempotency.
- Dimensions include runs, task executions, model tokens/cost, tool calls,
  storage, indexed chunks, connector sync, seats, and premium capabilities as
  commercially configured.
- Limit checks and reservations occur before dispatch/model/tool/storage work;
  final actuals reconcile after completion, failure, cancellation, or unknown
  provider usage.
- Workspace budget by period and optional workflow/agent/provider sub-budget,
  alerts, soft/hard threshold, forecast with disclosed method, and kill switch.
- Complete authorization-checked workspace budget/threshold CRUD and
  spend-stop/resumption APIs from Section 10.9. Append-only finance adjustment
  preview/request/approval/commit uses only the platform-finance operations in
  Section 10.10 and the deterministic platform-identity policy interface until
  M34 activates the real workforce plane; it fails closed in live
  environments before that activation.
- Billing UI for plan, trial, usage by dimension, costs, budget, invoices,
  payment method portal, seat count, upgrade/downgrade/cancel, and effective
  date.
- Proration/downgrade effects, retention/export after cancellation, reactivation,
  and plan-change confirmation.
- Enterprise invoice/contract mode without fake Stripe state.
- Internal finance view with fixed `finance_operator` duty scope, step-up,
  immutable preview, reason/ticket/evidence, separation-of-duties threshold,
  append-only commit, enhanced audit, and no card data. Workspace billing
  administrators receive a read-only projection of committed adjustments.
- Meter export and invoice-line reconciliation report.

#### Tests

- Webhook endpoint-locator guessing/collision, wrong environment/account/secret,
  exact-raw-body mutation, signature/replay/reorder/duplicate/missing event,
  secret rotation, and reconciliation.
- Checkout success/cancel, trial end, payment failure/recovery, plan change,
  proration, cancel/reactivate, refund/credit fixture, and enterprise mode.
- Entitlement matrix for every paid capability and plan version.
- Concurrent usage reservations at exact quota/budget boundary.
- Failure/cancel releases only proven unused quantity; unknown provider usage
  retains its conservative reservation, later reconciles, and exercises
  over-reservation debt/lock behavior.
- Sub-cent/nano-cost aggregation, currency/decimal/unit rounding only at the
  declared boundary, immutable price/FX-version arithmetic, cross-currency
  budgets, and reconciliation residuals.
- Cached entitlement during Stripe outage and safe expiry behavior.
- Seat invitation/removal and billable-seat rules.
- Billing authorization, audit, and privacy.
- Budget/threshold create/update/version/precedence authorization,
  spend-stop/resumption fences, and append-only finance adjustment
  preview/request/approval/commit with platform-operator identity, step-up,
  reason/evidence, distinct-approver threshold, expiry, duplicate, hash
  conflict, workspace-credential denial, and audit cases.
- [EXT] Under `EXT-005`, Stripe test-mode API and browser E2E cover upgrade,
  budget, limit, invoice portal, cancellation, and retention messaging.

#### Acceptance

- A workspace cannot exceed a hard paid limit through concurrent requests.
- Invoice-relevant usage reconciles to immutable source operations.
- Stripe retries and out-of-order events never create duplicate subscriptions
  or ledger entries.
- Customers can see current plan, effective entitlements, usage, budget, and
  invoice path without contacting support.
- A workspace owner or billing administrator cannot create a ledger
  adjustment; a platform finance operator can commit an approved immutable
  adjustment once, and the customer-visible usage view explains it.

---

### M30 — Public API, service accounts, webhooks, SDKs, and developer portal

**Status:** `NOT_STARTED`\
**Depends on:** M05, M10, M22, M26, M29\
**Required commit:** `feat: deliver the Knotline developer platform`

#### Product addition

Customers can integrate Knotline into their own systems through a stable,
documented, secure API and event platform.

#### Deliverables

- Versioned public API boundary distinct from internal browser endpoints, with
  published compatibility and deprecation policy.
- OpenAPI 3.1 document generated/validated from implementation contracts,
  examples, error catalog, pagination, idempotency, rate-limit, and webhook
  schemas.
- Service accounts with owner, purpose, workspace role/scopes, optional
  resource restrictions, environment, expiration, last use, rotation, revoke,
  and audit.
- Personal access tokens only if workspace policy permits; one-time secret
  display, hashed storage, scoped expiration, rotation, and leak-safe prefix.
- OAuth 2.0/OIDC customer-app authorization design and implementation for
  delegated integrations, including consent, PKCE, redirect registration,
  scope, revoke, and client rotation.
- Endpoints for workflows/versions/publish, runs/actions/events, tasks/
  approvals, agents/releases/evaluations, knowledge search, files, connections,
  usage, audit references, and health as permitted by Section 10.
- Explicit `public_customer` allowlist under `/public/v1`: workflow list/read/
  create/update/version/publish; run start/read/events/pause/resume/cancel/
  retry/fork; task and approval list/read plus eligible actions; agent read/
  release/evaluation status; file upload/status/download; authorized knowledge
  search; connection health and manifest-declared trigger/action use; usage;
  service-account/OAuth self-introspection; and developer-webhook management.
  Workspace membership, SSO/SCIM/domain, browser sessions, support access,
  Stripe/provider callbacks, guest exchange, and operator repair are never
  public-customer operations.
- API rate limits by workspace/credential/route/cost with response headers,
  retry guidance, burst policy, and quota dashboard.
- Developer webhook subscriptions with event selection, endpoint verification,
  HMAC signature/version, secret rotation overlap, retry/backoff, receipt,
  replay, disable, test event, redelivery, and delivery logs.
- Developer portal for credentials, OAuth apps, webhook endpoints, API usage,
  errors, logs, documentation, changelog, and status.
- Generated TypeScript SDK and CLI; SDK conformance test ensures it exercises
  the published HTTP API, not internal code.
- Copyable examples use placeholders and test environments; no embedded
  secrets.
- API changelog, migration guides, sunset headers, and minimum support window.
- Abuse, token compromise, webhook flood, and per-credential kill controls.

#### Tests

- OpenAPI lint, schema round-trip, undocumented endpoint/response detection,
  and backwards-compatibility diff.
- Scope/role/resource/environment matrix for every public endpoint.
- Token hash, prefix lookup, expiry, rotation overlap, revoke, and accidental
  log/display scanning.
- OAuth redirect/PKCE/state/consent/scope/revoke/client-secret rotation.
- OAuth discovery/JWKS/signature/JTI/audience, authorization-code binding,
  refresh rotation/reuse detection, token revocation, and `userinfo` claim
  minimization.
- Idempotency, cursor pagination, conditional update, rate-limit headers, and
  error-envelope conformance.
- Webhook signature, replay, order, retry, redelivery, rotation, disable, and
  endpoint takeover.
- Generated SDK integration and CLI smoke tests.
- Abuse/load tests by credential and workspace.
- Documentation examples run as tests against an ephemeral environment.
- Browser E2E create service account, call API, subscribe webhook, inspect and
  redeliver event, rotate, and revoke.

#### Acceptance

- A customer can authenticate, start a run idempotently, follow it, and receive
  a signed terminal event using only published documentation.
- Revoking a credential prevents new access promptly without breaking
  unrelated credentials.
- Every API response and webhook payload validates against its published
  version.
- A backwards-incompatible API change fails CI unless it follows the declared
  version/deprecation process.

---

### M31 — Governance, immutable audit, privacy, retention, export, and deletion

**Status:** `NOT_STARTED`\
**Depends on:** M21, M27, M29, M30\
**Required commit:** `feat: deliver audit privacy export and deletion governance`

#### Product addition

Workspace administrators can prove what happened, govern how data is used,
export it, honor retention and legal holds, and complete verifiable deletion.

#### Deliverables

- Tamper-evident audit ledger with canonical event serialization, sequence,
  prior/event hash, actor/delegation, session/service, tenant, action, resource,
  before/after references, reason, correlation, IP/user agent where lawful, and
  policy decision.
- Audit search, filter, detail, authorized export, saved view, and signed
  integrity-verification manifest.
- Audit taxonomy covers authentication, membership, role/policy, workflow/
  agent release, run recovery, approval, secret/connection, file/knowledge,
  billing, export/delete, support access, and operator action.
- Audit events never store raw secrets, full prompts by default, payment data,
  or unrestricted sensitive payloads.
- Workspace retention policy by data class with allowed ranges, default,
  effective date, preview, exception, and immutable policy-change audit.
- Legal hold by case, custodian/resource/query scope, reason, creator,
  approver, dates, release, and access log; held data is excluded from purge
  without silently widening normal product access.
- Deletion engine with dependency graph, tombstone, grace where policy allows,
  irreversible confirmation, queued steps, retry, proof, provider revocation,
  index/cache/derived/backup handling, and failure attention.
- User privacy export/delete and full workspace export/delete are distinct,
  authorized workflows.
- Portable export manifest and versioned files for identities, configuration,
  workflows, agents, tasks, runs, comments, audit, files, knowledge metadata,
  usage, billing references, and receipts, subject to policy/legal hold.
- Data inventory and classification registry maps every table, object prefix,
  cache/index, queue/event, log/trace, external processor, retention, owner, and
  delete/export handler.
- Workspace policy administration for retention, telemetry, model/provider,
  connector, file, memory, public sharing, support access, and allowed region.
- Consent/notice records where required, privacy request case tracking, and
  due-date/escalation.
- Time-bounded support access with customer request/approval, scope, named
  operator, reason, ticket, session banner, read/write constraint, revocation,
  and enhanced audit; emergency access is separately governed and reviewed.
- Restore-time deletion ledger prevents a backup restore from resurrecting
  data whose deletion deadline has passed.
- Privacy/security center shows effective settings, subprocessors/reference
  links, export/delete status, and contact route.
- M31 owns `/ops/privacy` case behavior, privacy-duty authorization policy, and
  all supporting APIs behind a deterministic, fail-closed platform-identity
  interface. Test identities can exercise it in CI, but the route remains
  disabled in shared/live environments until M34 supplies and verifies the
  workforce operator session, role, step-up, lifecycle, and break-glass plane.

#### Tests

- Audit completeness for every declared high-impact action and failure path.
- Hash-chain tamper, missing event, reordering, export signature, and verifier.
- Audit redaction corpus for secret, token, prompt, personal, payment, and file
  content.
- Retention boundaries, policy changes, legal hold overlap/release, clock, and
  concurrent delete.
- User export/delete versus workspace export/delete scope and authorization.
- Deletion fault injection at every subsystem and idempotent resume.
- Permission/source removal, connector revocation, derived/index/cache purge,
  and external processor requests.
- Backup restore consults the deletion ledger before serving data.
- Support access expiry, revocation, scope, read/write, customer visibility, and
  emergency review.
- `/ops/privacy` denies every workspace/guest/customer-service credential and
  enforces privacy duty scope, step-up, reason/ticket, separation of duties,
  support-access grant for content, and enhanced audit against deterministic
  operator-policy fixtures; M34 reruns the same contract on real workforce
  sessions and origin isolation.
- Export scale, encryption, expiry, checksum, and download authorization.
- Browser E2E set policy, search/export audit, legal hold, privacy export,
  support session, delete, and proof.

#### Acceptance

- An auditor can verify the integrity and origin of an exported audit segment.
- A deletion case either completes across every registered store or remains
  visibly failed with an owned retry; it never claims success prematurely.
- Legal hold prevents purge without granting new product visibility.
- Support cannot access customer data without an active, scoped, auditable
  authorization path.

---

### M32 — Enterprise SSO, domain control, SCIM, policy, and residency

**Status:** `NOT_STARTED`\
**Depends on:** M04, M05, M31\
**Required commit:** `feat: add enterprise identity provisioning and data policy`

#### Product addition

Enterprise customers can centrally authenticate and provision users, enforce
access policy, control verified domains, and keep data in a supported region.

#### Deliverables

- SAML 2.0 and OIDC enterprise connection administration with verified
  metadata, certificate/key rotation overlap, encrypted configuration, test
  mode, and safe activation. GA SAML is explicitly SP-initiated: every request
  binds exact connection, signed AuthnRequest ID, one-time RelayState, ACS,
  application/environment, clean return target, and initiating browser;
  unsolicited IdP-initiated SSO is rejected and documented as unsupported.
- Domain verification by DNS challenge, claim/capture policy, conflict support
  workflow, and explicit effect preview before enforcement.
- SSO discovery and enforced-SSO policy by verified domain with named break-
  glass accounts, recovery review, and no lockout on failed setup test.
- Just-in-time provisioning policy, attribute mapping, default role/group,
  allowed domain, name/email changes, deprovision behavior, and audit.
- SCIM 2.0 service-provider endpoints for Users and Groups, bearer-token
  lifecycle, schema discovery, filtering, pagination, PATCH/bulk behavior where
  declared, idempotency, and normalized errors.
- SCIM group-to-Knotline-group mapping and optional group-to-role policy with
  privilege-escalation preview and protected-owner constraints.
- Deactivation terminates sessions, disables credentials, releases/reassigns
  work by policy, and preserves audit/history.
- Enterprise session policy for maximum/idle duration, MFA claim requirement,
  trusted network/IP policy where lawful, and step-up authentication for
  sensitive actions.
- Policy engine with versioned organization/workspace rules, dry-run impact,
  conflict/precedence, staged enforcement, exception, reason, and audit.
- Supported residency regions at launch: United States and European Union;
  India is enabled only after the full data-service/provider matrix passes the
  same certification.
- Workspace has one home region; primary database rows, object data, indexes,
  queues, logs containing customer content, and backups stay within approved
  replication boundaries.
- Region/provider matrix declares processing and retention behavior for model,
  email, observability, support, Temporal, and every connector.
- Region migration workflow with eligibility scan, freeze/change capture,
  encrypted transfer, validation, DNS/routing cutover, rollback window,
  deletion of old-region copies, and signed completion evidence.
- Enterprise admin UI for identity providers, domains, provisioning, groups,
  sessions, policy, residency, and test/event logs.

#### Tests

- SAML signature, audience, recipient, destination, issuer, clock, replay,
  encrypted assertion, certificate rotation, and malformed assertion,
  including byte-preserving isolated callback-edge POST, exact
  `InResponseTo`/AuthnRequest/RelayState/connection/ACS/browser-result-exchange
  binding, locator mix-up, explicit unsolicited IdP-initiated rejection, and
  zero assertion/query leakage in edge or application logs.
- OIDC issuer/discovery/JWKS rotation, nonce/state/PKCE, claims, and replay.
- Domain verification ownership change, conflict, expiry, and enforcement
  lockout prevention.
- JIT mapping, duplicate email/subject, rename, deactivation, and reactivation.
- SCIM conformance suite for Users/Groups/filter/page/PATCH/bulk/error/token
  rotation and duplicate requests.
- Group/role mapping cannot create or remove the last owner accidentally.
- Session termination and API/service credential policy on deprovision.
- Policy dry-run/precedence/exception/staged enforcement and audit.
- Region routing, log/object/index/backup placement, provider deny, and
  cross-region access attempts.
- Region migration fault injection, consistency validation, rollback, and old
  copy deletion.
- [EXT] Under `EXT-015`, real non-production IdP/SCIM certification passes
  before enterprise identity is labelled `LIVE`.

#### Acceptance

- [EXT] Under `EXT-015`, an enterprise can verify a domain, test SSO, provision
  users/groups through SCIM, and enforce SSO without losing administrative
  access.
- Deprovisioning promptly removes interactive and programmatic access under the
  configured policy.
- A workspace operation cannot silently use a service outside its allowed
  region/provider matrix.
- [ENV] In the named M32 staging environment, a region migration ends with
  reconciled data and evidence that obsolete copies entered deletion.

---

### M33 — Installable PWA, guest collaboration, localization, help, and support

**Status:** `NOT_STARTED`\
**Depends on:** M02, M12, M27, M31, M32\
**Required commit:** `feat: deliver the installable accessible global Knotline experience`

#### Product addition

Knotline is a polished installable web product for global users and tightly
scoped external collaborators, with complete help, diagnostics, support, and
legal/accessibility surfaces.

#### Deliverables

- Web app manifest, install experience, icons/splash/theme, standalone
  navigation, update notification, and safe service-worker lifecycle.
- Offline shell and read-only cache only for explicitly classified resources;
  secrets, approvals, sensitive task payloads, and unencrypted customer data
  are not indiscriminately cached.
- Offline-created drafts use encrypted-at-rest browser storage where supported,
  clear workspace/user binding, expiry, user-visible pending state, conflict
  flow, and sign-out/device purge.
- Implement Section 6.7 cache classification, five-minute authorization/key
  leases, offline fail-closed display, reconnect reauthorization, outstanding-
  device deletion evidence, enterprise offline-disable policy, and the honest
  powered-off-device convergence disclosure.
- Implement `offline_devices`, cache registrations, wrapped-key leases, purge
  attempts/evidence, device activation/key-lease APIs, signed-proof validation,
  wrapper destruction, and client invalidation events from Sections 8.7 and
  14.4. Push subscription is optional and never substitutes for the offline
  device/cache registry.
- Web Push subscriptions per user/device with permission education, VAPID/key
  rotation, endpoint expiry/revocation, payload-minimization, click routing, and
  workspace/user authorization.
- Background sync only for safe idempotent drafts/uploads and never for an
  approval or destructive action without foreground confirmation.
- Guest invitation for exact task/approval/resource, email/domain restriction,
  optional verified identity, one-time acceptance, expiry, max-use, view/action
  scope, download/comment policy, revoke, and audit.
- Asset-isolated fragment-token exchange from Section 16.3 plus guest
  session/device inventory, current-session logout, owner revocation, lost-
  device revocation, and immediate clean URL.
- Guest cannot browse workspace navigation, search, member directory, unrelated
  metadata, notification recipients, or sequential identifiers.
- Guest session/device management and clear external-user banner.
- Complete the M02 localization foundation for every UI, validation, email/chat/
  push template, help article, export/PDF, public page, and legal surface;
  retain message/schema lint, formatting, negotiation, override, fallback,
  pseudo-localization, and bidirectional readiness.
- Implemented GA-scope locale packs: English (`en`), Hindi (`hi`), Spanish
  (`es`), French (`fr`), German (`de`), and Japanese (`ja`); user-generated
  content is not silently machine translated. Certification remains an
  external criterion and no locale is called production-certified from
  automated checks alone.
- Bidirectional-layout readiness and no hardcoded string/width assumptions even
  though an RTL locale is not a GA translation in this milestone.
- Browser support: current and previous major Chrome, Edge, Firefox, and Safari;
  current iOS Safari and Android Chrome; graceful notice for unsupported
  versions. Every release manifest pins the exact OS/browser builds tested.
- Pinned physical-device PWA matrix and executable certification protocol
  include at least one minimum-supported iPhone/iOS Safari, current
  iPhone/iOS Safari, a mid-tier minimum-supported Android/Chrome device, and a
  current Android/Chrome device; emulator evidence alone cannot certify
  install, push, offline storage, camera upload, safe-area, or update behavior.
- Automated WCAG 2.2 AA conformance coverage and a versioned manual-audit
  protocol span every unique route template, component, applicable state,
  public/help/legal/operator flow, and export.
- [ENV+EXT] Representative participants and accessibility specialists execute
  the complete manual and multi-AT audit for critical journeys against the
  named M33 staging deployment and immutable M33 candidate digest under
  `EXT-023`; no A/AA exception is allowed at GA.
- Help center with versioned articles, workflow/agent/connector guides,
  troubleshooting, security guidance, release notes, status link, and search.
- Contextual help, keyboard shortcut reference, onboarding replay, feedback,
  citation-quality report, and feature-status labels.
- Support ticket lifecycle with category, severity, workspace, reporter,
  consented diagnostics, messages, attachments, SLA, assignee, status, and
  resolution; email confirmation and customer history.
- Customer-generated diagnostic bundle with explicit preview/consent,
  redaction, expiry, encryption, checksum, access log, and no raw secrets.
- Product incident banner consuming a signed, cached status feed with fallback.
- Production `/contact` form with validated purpose/contact/company/message,
  consent/version, rate/bot/honeypot protection and accessible challenge only
  when risk requires it, durable receipt, honest acknowledgement, routed email/
  CRM or sales queue receipt, retry/DLQ, owner/SLA, retention, export/delete,
  and abuse-safe attachment policy.
- Versioned publication mechanics and review-ready drafts for final marketing
  pricing content, terms, privacy notice, cookie/telemetry choices,
  acceptable-use policy, security/trust content, accessibility statement, and
  subprocessor list.
- [EXT] Authorized owners approve the exact published versions under
  `EXT-016` and `EXT-020`; draft or automated evidence cannot substitute.

#### Tests

- Install/update/offline/reconnect/service-worker rollback across supported
  desktop and mobile browsers.
- Browser cache/storage inspection, sign-out purge, user/workspace switch, lost
  device subscription revoke, and XSS origin access assumptions.
- `ACL-REVOKE-1` across service-worker memory/cache, Cache Storage, IndexedDB,
  installed/offline PWA, expired proof/key lease, reconnect, membership/source/
  workspace deletion, powered-off-device evidence, and 24-hour active-client
  purge deadline.
- Offline device activation/registration, proof subject/workspace/device/cache
  binding, signing-key rotation, wrapper release/destruction, push-absent
  invalidation, purge retry/deadline/evidence, lost-device revoke, and
  enterprise offline-disable cases.
- Offline draft conflict, duplicate sync, expiry, quota, and unsupported
  storage.
- Push subscribe/send/click/revoke/expired endpoint/key rotation and sensitive
  payload scanning.
- Guest token guess/replay/forward/expiry/revoke/domain/account mismatch,
  direct-object reference, search, attachment, and metadata leakage.
- Guest/invitation link test proves no token in history after exchange,
  referrer, analytics, error tracker, CDN/WAF/ALB/application logs, or third-
  party asset requests; session inventory/logout/lost-device revocation works.
- Locale completeness, placeholder parity, pseudo-localization, long strings,
  plurals, date/number/currency/time-zone, font fallback, and screenshot set.
- [ENV+EXT] Under `EXT-023`, named professional/human linguistic review for all
  six locales against the named M33 staging deployment and immutable M33
  candidate digest covers UI, validation, notifications, help, exports/PDF,
  public/pricing, and legal copy, including terminology, tone, truncation,
  comprehension, and locale-specific task usability; machine translation
  alone cannot certify GA.
- Browser/device compatibility matrix and reduced-bandwidth/offline modes.
- [ENV] Physical iOS/Android install, launch, push, offline draft, camera
  upload, rotation/safe-area, update waiting/activation, sign-out purge, and
  rollback run against the named M33 staging deployment and exact immutable
  M33 candidate digest on the pinned device/OS/browser matrix.
- WCAG automated checks plus deterministic keyboard, focus, zoom/reflow, and
  contrast regression coverage.
- [ENV+EXT] Manual keyboard, focus, zoom/reflow, contrast, voice-control, and
  screen-reader matrix from Section 20 uses the `EXT-023` cohort, named M33
  staging deployment, and exact immutable M33 candidate digest. M38 separately
  reruns the summative matrix against its frozen release candidate.
- [ENV+EXT] The complete Section 20.9 study runs against the same named M33
  staging candidate: every owner, builder, contributor/approver,
  agent/integration administrator, operator/on-call, guest, accessibility, and
  design-partner cohort meets its per-task threshold; SEQ/SUS, safety,
  denominator/exclusions, activation, findings, fixes, and retests are
  retained under `EXT-023`.
- Support ticket authorization, diagnostic consent/redaction/expiry, incident
  banner authenticity, and help search.
- Contact submit/duplicate/rate/bot/consent/provider-outage/routing-retry/DLQ/
  acknowledgement/export/delete E2E; no request is claimed routed without a
  durable receipt.
- Legal/pricing link crawl and version-publication mechanics.
- [EXT] Exact `EXT-016`, `EXT-020`, and `EXT-023` rows retain legal/privacy,
  pricing/tax/support, and accessibility/linguistic owner approval evidence for
  the published versions.

#### Acceptance

- [ENV] Knotline installs and completes the supported mobile task journey on iOS and
  Android browsers.
- An external guest can perform only the invited action and loses access on
  expiry or revocation.
- [ENV+EXT] Under `EXT-023`, every launch locale completes every applicable
  canonical journey in the named M33 staging deployment and all first-party
  content categories without missing, broken, or linguistically rejected
  messages.
- [ENV+EXT] Under exact `EXT-016`, `EXT-019`, and `EXT-023` rows, a customer
  can find help, open a support case with safe diagnostics, follow status, and
  read current legal/accessibility information in the named M33 staging
  deployment.
- [ENV+EXT] Under `EXT-023`, every Section 20.9 cohort, SEQ/SUS threshold,
  safety rule, and design-partner activation threshold passes on the immutable
  M33 candidate; any failure keeps the M33 environment/external criterion
  incomplete.
- A prospect can submit a consented contact request, receive an honest durable
  acknowledgement, and the accountable queue receives or visibly retries it.

---

### M34 — AWS staging foundation, observability, operator controls, and on-call

**Status:** `NOT_STARTED`\
**Depends on:** M18, M23, M24, M25, M33\
**Required commit:** `feat: operationalize Knotline with SLOs and kill switches`

#### Product addition

The engineering-complete Knotline product gains reproducible
production-equivalent AWS staging and safe operator controls. Base staging can
run deterministic provider fixtures while each real provider journey retains
its independent external-evidence state; no blocked credential is disguised as
a staging pass.

#### Deliverables

- Terraform staging foundation using the same modules M37 will promote:
  isolated development/staging accounts, encrypted locked state, three-AZ VPC,
  CloudFront/WAF/ALB/origin controls, ECS services/tasks, RDS PostgreSQL
  Multi-AZ, ElastiCache, private S3/KMS/Secrets, queues/events/DLQs, SES test
  identity, Temporal Cloud staging namespace, OTel pipeline, budgets, DNS, and
  GitHub OIDC deploy roles, plus the three-region MRSC execution-scope epoch/
  scope-directory authority group and per-scope independent protection-region
  operation journal with data/window/unsettled/control namespaces, endpoint-
  bound recovery roles and lost-source reconstruction quarantine, plus
  WAL/PITR/object protection and deletion/hold streams.
- Signed build-once artifact deployment, expand migration, smoke, canary,
  health gate, rollback, feature/kill flag, environment parity, drift, quota,
  and safe synthetic/provider-sandbox configuration for staging.
- Parameterized active, standby, and distinct protection-region stacks capable
  of Section 4.2 topology, disabled/zero-scaled by default with TTL/cost guard;
  M36 activates and measures them.
- OpenTelemetry instrumentation standard for trace/context propagation across
  HTTP, Temporal, queues/outbox, model, tool, connector, file, notification,
  billing, and webhook boundaries.
- Structured log schema with service/environment/version/request/correlation/
  trace/workspace-hash fields and centralized redaction; no raw secrets or
  high-cardinality user content.
- Metrics taxonomy and cardinality budgets for traffic, errors, latency,
  saturation, queue lag, workflow state, model/tool, connector freshness,
  notification, billing, security, and cost.
- Service-level indicators and objectives with window, target, exclusions,
  owner, error budget, burn alerts, and user journey mapping.
- Availability, latency, freshness, and durability dashboards for each
  critical journey and dependency.
- Multi-window burn-rate, paging, ticket, warning, security, cost, and data-
  quality alerts with symptom-first wording, owner, runbook, and deduplication.
- Operator console for health, deploy versions, incidents, queues, stuck work,
  DLQs, reconcilers, provider state, workspace throttles, flags, and kill
  switches.
- Dedicated `ops.knotline.com` workforce identity plane from Sections 8.2 and
  10.10: isolated origin/cookies/keys/session store, allowlisted workforce OIDC
  plus directory/SCIM lifecycle, no JIT/local/customer login, phishing-
  resistant MFA, risk-based recent step-up, fixed least-privilege roles and
  duty scopes, separation of duties, session inventory/revocation, immediate
  offboarding, access review, and alerting. It adopts and activates the
  deterministic operator-policy interfaces introduced by M29 and M31.
- No-standing-access break glass with exact scope, active incident/change
  ticket, two distinct approvers, five-minute hardware step-up, maximum
  30-minute grant, visible banner, immutable session evidence, immediate
  revocation, security alert, and next-business-day independent review.
- [EXT] The named workforce OIDC client/tenant, directory/SCIM lifecycle
  source, FIDO2 authenticators, emergency hardware identities, and
  provisioning/offboarding owners satisfy `EXT-024`; fixtures cannot activate
  production operator access.
- Repair actions are typed, previewable, scoped, idempotent where possible,
  require reason/confirmation/step-up by risk, and emit enhanced audit.
- Global/provider/workspace/workflow/agent/connector/tool/trigger kill switches
  with declared in-flight behavior and regular exercise.
- Feature flags with owner, purpose, environment, cohort, expiry, dependency,
  safe default, audit, and cleanup.
- Runbooks for every alert and high-risk subsystem, including validation,
  containment, repair, rollback, escalation, customer communication, and
  post-incident evidence.
- Incident management roles, severity rubric, on-call rotations, escalation,
  handoff, status-page/customer communication templates, and post-incident
  review.
- [EXT] Named primary/deputy rotations, escalation contacts, response targets,
  status/customer-communication authority, training, and game-day attendance
  satisfy `EXT-019`.
- Synthetic canaries for signup/login, workflow run, task/approval, agent,
  search, connector fixture, webhook, notification, billing test account, and
  public status.
- Telemetry retention, sampling, access control, residency, export/delete
  integration, and cost budget.
- Minimum operational controls, kill switches, usage/spend signals, and
  retention hooks introduced earlier are migrated into this unified platform.

#### Tests

- Terraform validate/lint/security/policy/plan, bootstrap/deployment/canary/
  rollback automation, origin-bypass policy tests, secret/config validation,
  isolated-callback distribution redaction/rewrite/no-raw-access-log policy,
  byte-preserving webhook-body fixture, and safe teardown/TTL fixtures.
- [ENV] Fresh staging bootstrap, signed artifact admission, migration, canary
  bad-build rollback, drift injection, origin bypass, and safe teardown.
- [ENV] Production-equivalent staging smoke for every core `CJ-*` path using
  deterministic provider fixtures and synthetic accounts.
- [ENV+EXT] Separate criterion rows for each applicable `EXT-004`, `EXT-005`,
  `EXT-006`, `EXT-007`, `EXT-008`, `EXT-009`, `EXT-010`, `EXT-011`,
  `EXT-012`, `EXT-013`, `EXT-014`, `EXT-015`, and `EXT-025` real sandbox
  branch run and retain their own state; one pass cannot advance another and a
  blocked branch cannot be labelled `LIVE`.
- Telemetry schema/required field and redaction tests across success/failure.
- Trace propagation and correlation through every asynchronous boundary.
- Cardinality and telemetry-volume budget tests.
- SLI calculation against synthetic events and missing/late telemetry.
- Alert injection verifies route, dedupe, page/ticket, runbook, acknowledge,
  escalation, status communication, and resolution.
- [ENV] Every kill switch is exercised in staging, including in-flight semantics and
  re-enable.
- Operator repair dry-run/confirm/auth/audit/idempotency and unsafe-input cases.
- Deterministic workforce OIDC/WebAuthn claim and directory/SCIM emulators
  cover issuer/tenant/client/redirect/state/nonce/PKCE/subject/audience/
  assurance negatives; idempotent directory provision/disable/offboard/
  duplicate/reconcile receipt and cursor behavior;
  platform-session rotation/reuse/idle/absolute/revoke; role/duty-scope and
  separation-of-duties matrix; access-review population/decision/remediation/
  recertification; 15-minute/5-minute step-up boundaries; and
  workspace/customer/guest credential rejection at CDN, origin, API, SSE, and
  WebSocket boundaries.
- Cross-origin cookie, CORS, CSRF, audience, signing-key, session-store, and
  direct-origin isolation tests prove neither operator nor workspace
  fixture credentials cross planes.
- [ENV+EXT] In named staging, the approved `EXT-024` workforce application,
  directory, and hardware identities execute login/step-up, provisioning,
  role assignment, M29 finance adjustment, M31 privacy case, access review,
  session revoke, and offboarding-during-operation flows; origin isolation is
  verified against the exact deployed digest.
- Deterministic break-glass request/dual approval/scope/expiry/use/revoke,
  approver
  independence, hardware assurance, concurrent grant, no-ticket denial,
  alert/banner/audit, and overdue post-use-review cases.
- Dashboard-as-code and alert-as-code lint/review.
- [ENV+EXT] Under `EXT-019`, a staffed on-call game day covers model outage,
  database saturation, connector storm, stuck workflows, billing webhook loss,
  and credential compromise.
- Synthetic canary detects deliberately injected journey failures.

#### Acceptance

- The reviewed Terraform, artifact, fixture, observability, and operator-control
  automation passes deterministically and is ready to recreate staging.
- [ENV] A clean production-equivalent staging environment is recreated from the
  reviewed modules and runs every non-external/core journey; M35 and M36 consume
  this exact environment/module digest.
- [EXT] Each `EXT-004`, `EXT-005`, `EXT-006`, `EXT-007`, `EXT-008`,
  `EXT-009`, `EXT-010`, `EXT-011`, `EXT-012`, `EXT-013`, `EXT-014`, and
  `EXT-015`, and `EXT-025` provider branch advances only its own state; a
  blocked row prevents that capability's staging/`LIVE` claim and blocks M38
  only while `gaRequired`. An approved scope amendment may remove that
  capability from GA without affecting the M34 engineering commit or fixture-
  backed base staging verification.
- [ENV+EXT] Under `EXT-019`, an on-call operator detects and contains each
  rehearsed critical failure from documented signals and controls.
- [ENV+EXT] Under `EXT-019`, every page has a named owner/deputy and runnable
  runbook; every runbook has a tested alert or explicit manual trigger.
- [ENV] A kill switch stops the targeted new work without widening the blast radius.
- [ENV+EXT] Under `EXT-024`, a newly provisioned operator can perform only the
  actions of the assigned duty/environment scope; disabling that workforce
  identity revokes active sessions and support/break-glass access promptly,
  while workspace credentials can never reach an operator route.
- [ENV+EXT] A staffed break-glass exercise proves dual control, hardware
  step-up, exact 30-minute-or-shorter scope, immediate revocation, complete
  audit/session evidence, security notification, and independent post-use
  review under `EXT-019` and `EXT-024`.
- Telemetry itself does not become a secret, privacy, residency, or
  uncontrolled-cost leak.

---

### M35 — Application, infrastructure, supply-chain, and compliance assurance

**Status:** `NOT_STARTED`\
**Depends on:** M30, M31, M32, M33, M34\
**Required commit:** `security: complete product and supply-chain assurance`

#### Product addition

Knotline has evidence-backed security controls, an independently tested attack
surface, and the policies and operating evidence needed for customer security
review and formal assurance.

#### Deliverables

- Living threat models for product, tenant boundary, auth/SSO/SCIM, workflow
  runtime, agents/prompts/tools, sandbox, files/knowledge, connectors/OAuth,
  webhooks/API, billing, operator/support, build/deploy, and recovery.
- Abuse cases and mitigations mapped to automated tests, control owner,
  evidence, residual risk, and review cadence.
- Secure development lifecycle with design review thresholds, change review,
  protected branches, mandatory status checks, code ownership, and emergency
  process.
- SAST, dependency, license, secret, IaC, container, API, DAST, and malware-
  fixture scanning with severity SLA and documented suppression approval.
- Reproducible/pinned builds where practical, lockfile integrity, provenance
  attestation, SBOM, signed images/artifacts, protected registry, and deployment
  verification.
- Dependency update/patch process, end-of-life inventory, vulnerability
  disclosure/security contact, triage, coordinated response, and customer
  notification.
- Encryption/key inventory, KMS separation, rotation, access review, backup
  encryption, certificate lifecycle, and emergency revoke exercise.
- Automated quarterly identity/access-review workflow and evidence report for
  cloud, production, support, CI, source, provider, and emergency identities;
  policy rejects shared routine administrator accounts.
- [ENV+EXT] Named security and system owners complete the initial launch access
  review, remove unexplained access, and sign the evidence under `EXT-017`.
- [EXT] Under `EXT-017`, the independent penetration test covers web/API,
  tenant isolation, auth/SSO/SCIM, agent prompt/tool boundaries, sandbox,
  files, connectors/OAuth/webhooks, operator/support, and cloud configuration.
- [EXT] Under `EXT-017`, all external-test critical/high findings are fixed and
  independently retested; accepted lower risk has named owner, rationale,
  expiry, and customer-impact assessment.
- SOC 2 readiness/control matrix and evidence collection for security,
  availability, confidentiality, and privacy commitments; certification is
  claimed only after the independent auditor issues it.
- [EXT] Exact `EXT-016` and `EXT-022` rows retain privacy/security legal review
  of data flows, subprocessors, DPA/SCC needs, retention, consent, incident
  notice, AI terms, and supported regions.
- Security and trust center content generated from actual controls and current
  assurance; no unsupported badge or compliance claim.
- Security incident response plan and tabletop including credential leak,
  cross-tenant exposure, malicious connector, model data incident, ransomware,
  insider/support misuse, and dependency compromise.

#### Tests

- CI security suite passes with no unexpired critical/high exception.
- Manual tenant-isolation and authorization attack corpus.
- Prompt injection, indirect injection, tool exfiltration, SSRF, sandbox escape,
  file parser, webhook replay, token theft, and OAuth mix-up regression suites.
- SBOM/provenance/signature verification from release artifact back to commit.
- [ENV] Key/secret/certificate rotation and emergency revocation exercises.
- [ENV+EXT] Under exact `EXT-017` and `EXT-024` rows, break-glass access and
  post-use review pass in the named security environment.
- [EXT] Under `EXT-017`, independent penetration-retest evidence closes every
  release-blocking finding.
- [EXT] Exact `EXT-016` and `EXT-019` rows retain staffed incident-tabletop
  action, communication, and legal-timing evidence.
- Restore artifacts pass malware, integrity, deletion-ledger, and access checks.
- [EXT] Under exact `EXT-016`, `EXT-017`, and conditional `EXT-018` rows, every
  trust-center claim links to the owner-approved control/evidence record that
  permits that exact claim.

#### Acceptance

- Release artifacts are signed, attributable, scanned, and verifiable.
- No unresolved critical or high finding from engineering scanners/corpora
  remains at engineering completion.
- [EXT] Under `EXT-017`, independent penetration testing confirms closure of
  release-blocking findings.
- [EXT] Under exact `EXT-016`, `EXT-017`, and conditional `EXT-018` rows,
  public security/compliance claims exactly match obtained evidence.

---

### M36 — Performance, scale, chaos, backup, resilience, and disaster recovery

**Status:** `NOT_STARTED`\
**Depends on:** M18, M21, M26, M28, M29, M34, M35\
**Required commit:** `perf: prove Knotline capacity resilience and recovery`

#### Product addition

Knotline has reproducible evidence that it meets its target workload, degrades
safely under pressure, survives common failures, and can recover from a
regional disaster without violating deletion or residency.

#### Deliverables

- Versioned reference workload profiles from Section 4.2 define topology,
  dataset generator, tenant distribution, workflow graph mix, payload/object
  sizes, knowledge queries, provider fixtures, cache state, ramp, steady
  duration, percentile window, error budget, and cost ceiling.
- k6/worker/load harness and reproducible seeded datasets for browser API,
  workflow dispatch/transitions, task inbox, run room/SSE, search/retrieval,
  file upload, connectors/webhooks, notifications, analytics, and public API.
- Query-plan baselines, slow-query budgets, connection-pool policy, partition/
  index maintenance, vacuum/analyze, bloat, and database capacity alerts.
- Worker/queue autoscaling, fairness policies, instrumentation, and load
  harnesses cover noisy-neighbor, large fan-out, slow provider, retry storm,
  and backlog catch-up; `[ENV]` profiles establish the proof.
- Browser performance-budget definitions and measurement harnesses name
  desktop/mobile devices, network profiles, cold/warm navigation, and
  representative data sizes; `[ENV]` runs establish measured results.
- Cache strategy, stampede protection, invalidation, degradation, and safe
  bypass tests.
- Chaos matrix for process/task/AZ loss, database failover, Redis loss,
  Temporal interruption, S3/error, network partition, DNS, provider outage,
  rate limit, clock skew, and corrupted/duplicate events.
- Automated encrypted backups, point-in-time recovery, object versioning/
  replication under regional policy, configuration/secrets escrow, and
  independent backup access controls.
- Restore-drill automation targets isolated accounts/environments and verifies
  checksums, schema migration, audit integrity, malware, deletion ledger,
  legal hold, and application reconciliation. The `[ENV]` suite below executes
  the drill.
- Regional recovery plan with traffic freeze/cutover, data selection, approved
  active/standby/protection triple, RPO/RTO and compound-disaster measurement,
  protection loss/re-protection, provider/connector reactivation, outbound-
  side-effect safety, and customer communication.
- Independent protection-region operation journal/WAL/PITR/object streams and
  three-region MRSC execution-scope epoch/directory/short-lease control from
  Sections 8.7, 18.8, and 19.4, including independent edge/egress fencing,
  append-fenced generation sealing, sealed-window and unsettled-operation
  proofs, source-only carry classification/destination-only carry creation,
  complete affected-scope enumeration, affected-operation manifest generation,
  and the separately fenced `LOST_SOURCE_JOURNAL` reconstruction/quarantine
  branch.
- Degraded modes for model, connector, email/chat, analytics, search, object
  store, Redis, Temporal, and database read-only scenarios; the UI states which
  operations are safe/unavailable.
- Capacity-model and scaling/cost-forecast schema, calculation code, evidence
  inputs, and alarm thresholds; `[ENV]` qualification populates measured unit
  economics.
- Performance/resilience regression lanes in CI/nightly/staging with baseline
  comparison and approved change process.

#### Tests

- [ENV] Every reference profile runs for its declared duration with exact pass/fail
  percentiles, error rate, queue lag, correctness checks, and cost.
- [ENV] Hot-key/noisy-tenant, retry storm, webhook flood, large graph/document/log,
  slow consumer, and export workload.
- [ENV] Fault injection at every critical runtime crash window and infrastructure
  dependency.
- [ENV] Single-AZ failover and recovery during active workflows and external writes.
- [ENV] RPO-window API/callback/schedule/billing/effect intents with lost
  primary commits, orphan journal intents, post-commit/pre-marker failures,
  verified absence of false success acknowledgements, missing receipts, and
  complete manifest reconciliation.
- [ENV] The fixed-shard MRSC scope directory stops registration and G-shard data
  leases on every fixed admission shard in the environment across all control/
  residency pools, including shards with no currently affected scope; captures
  each serialized admission cutoff and bounded active-token map; waits every
  recorded lease/clock/safety drain; and then finds every affected workspace,
  identity, platform, public, and global scope across all declared shards. A
  registration intentionally routed through a previously unaffected/empty
  shard but mapped to the incident region is rejected or included before
  `SCOPE_MANIFEST_FIXED`. A readable G journal seals normally; a separately
  unavailable G journal reconstructs from its MRSC token/directory mirror under
  a destination-reconstruct lease and never asserts an old root. The test also
  fills the 128-token admission cap, verifies deterministic queuing rather than
  shard bypass, and includes a
  `PENDING`/`REGISTERING` scope, a scope created after the restore point, and a
  migrated/tombstoned scope absent from restored product state. It delays an
  admitted initial put and final activation until enumeration/terminalization
  is underway; exact operation/step-version conditions prove each write either
  serialized before the manifest outcome or failed afterward, with no omitted
  or resurrected mutable scope. Crash injection after G-shard lease-pair issue,
  source `DRAINING`, source `SEALED`, destination `PREPARING`, each per-item
  terminalization, `REGISTRATION_RESOLVED`, `SCOPE_MANIFEST_FIXED`, and the
  branch-appropriate `GENERATION_ACCEPTED`/`LOST_SOURCE_ACCEPTED` proves
  idempotent resume and proves the later generic barrier does not create a
  duplicate G generation. Assertions require exactly one G-scope recovery epoch
  increment, the same transition/epoch on every issued endpoint credential and
  acceptance envelope, explicit authority `OPENING`, destination journal
  `OPEN`, then authority `ACTIVE`/`PROTECTED` in that order before the first
  post-recovery G data lease.
- [ENV] Live-but-partitioned former primary, stale 30-second epoch lease,
  isolation of each MRSC authority region in turn with linearizable operation
  through the other replicas, separate quorum-loss fail-closed and measured
  restoration, edge/credential/network egress fence, and no-second-writer
  proof.
- [ENV] An epoch transition triggered immediately after a maximum-duration
  old-region lease issuance proves: issuance closes atomically, the recorded
  maximum expiry cannot move afterward, no new-region lease is issued during
  the 30-second lease plus five-second clock and five-second safety drain, the
  old authoritative store rejects a late commit, and no mutation/effect lease
  overlaps across regions.
- [ENV] Recovery-journal qualification covers workspace, identity-home,
  platform-control, public-intake, and global-directory scope classes; first/
  last records on hour and shard boundaries; both certified clock-skew bounds;
  an exact-hour restore point; long-straddling operations; strongly consistent
  enumeration of every shard; missing, duplicate, or hash-mismatched
  base/index pointers; hundreds of concurrent appenders with forced sequence
  conflicts; definite conflict retry under a new candidate token; ambiguous
  response retry under only the same token for the full horizon; acceptance-
  sequence continuity; sealed-window counts, roots, adjacent anchors, and
  generation-root inclusion proofs; atomic unsettled-pointer create/advance/
  terminal-delete; all fixed unsettled-shard counts/roots; and proof that
  non-indexed control envelopes neither mutate nor self-reference a sealed
  root. An `INTENT` begins two hours before the restore point, its primary
  commit occurs inside the RPO gap, and its `COMMITTED` marker is deliberately
  lost; despite falling outside both guard hours and restored active state, its
  unsettled pointer must place the complete chain in the affected manifest.
  The suite finishes with a gap-free, non-overlapping old-generation close/
  new-generation acceptance handoff.
- [ENV] `OPEN`/`DRAINING`/`SEALED` generation tests delay primary commit
  confirmation and provider receipts across the seal. New intents/effects stop
  at the cutoff, eligible drain records are included in the final root, an
  old-generation late append is conditionally rejected, and verified late
  completion appears only as linked `LATE_COMPLETION`/`CARRIED_FORWARD` in the
  new generation. The source lease may reconcile and write only
  `UNSETTLED_SEALED`/`CARRY_MANIFEST`; an attempted source
  `CARRIED_FORWARD` fails. The destination is created `PREPARING` before it
  copies the carry root and writes carry records/pointers, and no
  `GENERATION_ACCEPTED` precedes their verified digest.
- [ENV] Recovery-control lease tests exercise every allowed drain/seal/manifest/
  claim-copy/carry/registration-resolve/scope-manifest verb and attempt
  DB/product commit, task claim, new `INTENT`, `SEND_STARTED`, credential
  retrieval, provider call, and egress.
  Distinct source-close and destination-prepare leases move between different
  journal tables/regions; exchanging either lease across endpoints or invoking
  the other's verbs fails. Key audience, IAM, gateway, journal ARN/region,
  state, transition, incident, scope, epoch, generation, expiry, and nonce
  checks reject every authority escalation while the barrier completes without
  waiting for a data lease. The separate lost-source destination-reconstruct
  lease rejects every normal source-close claim and cannot be issued unless the
  authority state, missing-source identity, data-plane snapshot, effect-mirror
  inventory, and lease drain match `LOST_SOURCE_JOURNAL`. If the source
  disappears midway through a normal close, the test requires that transition
  and both leases to be fenced/expired before a new epoch and immutable branch
  selection can issue the reconstruct lease.
- [ENV] A pending browser/API `COMMIT_CONFIRMATION_PENDING`, public-anonymous
  mutation, and provider callback each retry across a journal generation and,
  separately, a recovery-table-region change; the scope-wide claim
  digest preserves one request hash, one logical operation/effect identity,
  and the original current/final result without duplicate mutation or receipt.
- [ENV] Redis loss during schedule, model, connector, tool, paid-limit, and provider-
  concurrency load proves conservative fallback/fail-closed rather than flood
  or duplicate ownership.
- [ENV] Full point-in-time restore and regional recovery exercises measured from
  declared incident start to verified service.
- [ENV] With the original primary held unavailable, the standby acknowledges
  mutations/effects only while the distinct third-region journal and WAL/PITR/
  object/deletion streams meet NFR-008. Protection loss closes writes before
  breach. One drill keeps the old journal readable and uses the normal sealed
  handoff. A separate drill makes the journal/protection region wholly
  unavailable while the authoritative data plane remains healthy: it proves
  the single `LOST_SOURCE_JOURNAL` epoch/fence, fixed DB LSN and object/
  deletion/hold inventories, complete local effect mirrors, provider
  reconciliation, reconstructed claims/records, independently recomputed
  `LOST_SOURCE_MANIFEST`/`LOST_SOURCE_ACCEPTED`, new-lineage seed/catch-up/
  digest/restore, and `OPEN` before writes resume. Immediately before total
  journal-region loss, the fixture commits one non-G journal `INTENT` but no
  primary/local row; reconstruction must declare that bounded population and
  count `UNKNOWN`, must not invent the operation/count/root, and must prove it
  could not mutate, send, or receive success. Removing any required mirror or
  losing the data plane keeps the scope read-only; a later-returning old
  journal is quarantined and cannot merge. Re-protection to a new distinct
  destination then passes, and a separately injected standby loss preserves
  the complete manifest and bounded recovery material with measured compound-
  disaster RTO. Promotion creates a new authority-epoch/source-incarnation/
  PostgreSQL-timeline manifest; deliberately delayed old-primary WAL,
  snapshot, object version, and delete-marker deliveries stay in the closed
  old namespace and cannot advance or overwrite the canonical restore chain.
- [ENV] Restore never serves previously deleted data or moves a workspace outside its
  allowed region.
- [ENV] Queue/backlog drain preserves fairness and does not duplicate logical work.
- [ENV] Browser Web Vitals and interaction budgets across the support matrix.
- [ENV] 24-hour soak for leaks, bloat, stuck work, cursor drift, usage mismatch, and
  telemetry/cardinality growth.
- [ENV+EXT] Exact `EXT-002`, `EXT-003`, `EXT-004`, `EXT-019`, and `EXT-022`
  rows retain the staffed regional disaster game day, dependency owners,
  status/customer/support communication, and after-action review.

#### Acceptance

- Every workload, chaos, backup, restore, journal/fencing, and DR harness is
  versioned, deterministic at reduced scale, safety-guarded, cost/TTL bounded,
  and produces the Section 4.2 evidence schema.
- [ENV] All Section 4.2 launch profiles pass in production-equivalent staging within
  their cost ceilings.
- [ENV] Measured recovery meets the declared RPO/RTO and preserves audit, deletion,
  residency, and side-effect correctness.
- [ENV] Losing one availability zone does not lose an acknowledged durable operation.
- [ENV] Overload produces bounded queues, fair throttling, and honest degradation
  rather than silent corruption.

---

### M37 — AWS infrastructure as code, environments, delivery, and rollback

**Status:** `NOT_STARTED`\
**Depends on:** M32, M34, M35, M36\
**Required commit:** `infra: deliver reproducible AWS production environments`

#### Product addition

Knotline can be provisioned, deployed, migrated, scaled, rolled back, and
recovered consistently across isolated AWS environments.

#### Deliverables

- Target AWS organization/account topology as code for management,
  security/log archive, shared services, development, staging, and production,
  with SCP policy and required ownership fields.
- Terraform bootstrap for encrypted/versioned/locked remote state, recovery,
  least-privilege execution roles, review, drift detection, and state access
  audit.
- Region module and environment stacks for VPC, public/private/isolated
  subnets, routing/NAT/egress controls, VPC endpoints, security groups, WAF,
  CloudFront, Route 53, ACM, and load balancers.
- Residency-triple modules explicitly assign active and standby data-plane
  regions plus a distinct protection region; an exactly three-replica
  readable/writable MRSC scope-directory/epoch authority in the approved
  control pool; the recovery journal; and continuous encrypted WAL/PITR/object/
  deletion streams. The modules codify fixed directory shards, conditional
  single-item authority writes without unsupported MRSC transactions,
  registration/data/control lease drains, immutable epoch-bound protection-
  stream namespaces/checkpoints, stale-source IAM/KMS fences, lag admission
  guards, fail-closed topology states, and both audited re-protection branches.
  The lost-source branch provisions its isolated destination-reconstruct role,
  fixed-snapshot inventory job, manifest verifier, new-lineage target, and
  returning-source quarantine with no normal source-close permission. A two-
  region deployment cannot pass production validation for mutation service.
- ECS/Fargate services and one-off tasks for web/API/worker/scheduler/outbox/
  reconciler/sandbox/file processing/migrations with separate IAM roles,
  autoscaling, health, graceful drain, and deployment circuit breakers.
- RDS PostgreSQL Multi-AZ with encryption, parameter policy, backups/PITR,
  replicas where needed, connection pooling, maintenance, and deletion
  protection.
- ElastiCache Redis, S3 buckets and lifecycle/replication policy, ECR,
  Secrets Manager, KMS keys, SES/email, CloudWatch/OTel pipeline, SNS/SQS where
  selected, and AWS Budgets/Cost Anomaly Detection.
- Temporal Cloud production-integration configuration follows the immutable
  decision in Section 1.3; network, namespace, encryption, credential
  references, retention, recovery/export capability, and outage behavior are
  codified. Moving to a self-hosted Temporal stack requires an explicit plan
  amendment and new DR evidence.
- [ENV+EXT] **Required environment terminal: `PRODUCTION_VERIFIED`.** The
  approved `EXT-003` Temporal production account/namespace passes
  configuration, network, retention, credential, outage, and recovery/export
  verification.
- GitHub Actions uses OIDC and environment protection, never long-lived AWS
  deploy keys.
- Build-once signed-image promotion workflow moves one digest from test to
  staging to production with SBOM, provenance, vulnerability gate, and
  deployment-record schema.
- [ENV] **Required environment terminal: `PRODUCTION_VERIFIED`.** The exact
  signed image digest is promoted through the named environments and its
  deployment record is retained.
- Database expand/migrate/backfill/contract protocol, migration lock,
  compatibility window, progress, failure repair, and rollback/roll-forward
  decision.
- Progressive delivery by service/feature: preview, staging, internal, canary,
  cohort, percentage, GA; health gates and automatic/manual rollback.
- Static web asset versioning and service-worker compatibility across rollback.
- Secrets/configuration schema validation, rotation, environment parity report,
  and no production secret in developer/CI contexts.
- Ephemeral preview environment policy with synthetic data, TTL, budget, safe
  teardown, and no provider production credentials.
- [ENV+EXT] **Required environment terminal: `PRODUCTION_VERIFIED`.**
  Exact `EXT-006` and `EXT-021` rows retain domain/email production
  verification, status page, support tooling, and public endpoint monitoring.
- Infrastructure diagrams, inventory, service ownership, quotas, cost budgets,
  runbooks, break-glass, and disaster bootstrap.
- Promotion policy requires production to use the exact M34 staging modules
  and M36-tested topology parameters. Any material network, data, compute,
  security, queue, Temporal, deployment, or recovery change invalidates and
  reruns affected M35 security and M36 performance/DR evidence before
  production.

#### Tests

- Terraform format/validate/lint/security/policy/plan and deterministic module/
  environment contract tests.
- [ENV] **Required environment terminal: `PRODUCTION_VERIFIED`.** Reviewed
  apply in development, staging, and the fresh production bootstrap target.
- Account/role/route/security-group/egress/KMS/S3/RDS/IAM policy tests.
- [ENV] The deployed MRSC authority has exactly the approved three readable/
  writable replicas, strong conditional single-item scope transitions, no
  application transaction call, independent regional epoch services/signing
  permissions, successful one-region routing isolation, and fail-closed quorum
  loss. Directory activation/freeze and data/recovery-control lease policies
  match the M36-tested configuration byte for byte.
- [ENV] Direct ALB/S3/origin attempts prove CloudFront/WAF/origin-auth controls cannot
  be bypassed.
- [ENV] Infrastructure drift injection, detection, review, and repair.
- [ENV] Fresh-environment bootstrap and full application deploy from documented
  prerequisites.
- [ENV] Migration against previous production version, mixed-version window,
  interruption, rollback/roll-forward, and large backfill.
- [ENV] Canary bad-build injection triggers health-gate rollback.
- [ENV] Signed image/SBOM/provenance verification at deployment admission.
- [ENV] Service drain/restart/autoscale/AZ failure and scheduled task singleton.
- [ENV+EXT] **Required environment terminal: `PRODUCTION_VERIFIED`.** Under
  exact `EXT-002` and `EXT-022`, fresh production validation proves all active/
  standby/protection region IDs are distinct and privacy-approved, no
  protection region serves customer traffic, journal/protection lag closes
  writes before NFR-008, and the documented re-protection workflow can replace
  a failed protection destination without split brain. The test separately
  proves readable-source sealed handoff and genuinely unavailable-source
  reconstruction; the latter cannot apply when any required authoritative
  snapshot/effect-mirror/ledger proof is missing.
- [ENV+EXT] **Required environment terminal: `PRODUCTION_VERIFIED`.**
  Exact `EXT-002`, `EXT-006`, and `EXT-021` rows retain secret, certificate,
  domain, and email rotation with the approved external accounts and owners.
- [ENV] Production-like staging smoke of every critical journey.
- Evidence-invalidation test proves a material Terraform/topology diff blocks
  promotion until its mapped M35/M36 suites rerun.
- [ENV] Cost/TTL guard and safe teardown for preview environments.

#### Acceptance

- The source modules, policies, deployment workflow, migration protocol,
  evidence-invalidation rules, and rollback target pass deterministic
  engineering checks.
- [ENV] **Required environment terminal: `PRODUCTION_VERIFIED`.** A clean
  production account/region can be bootstrapped from the exact M34/M36-tested
  modules, approved secret references, and signed artifact digests without
  undocumented console changes; staging remains reproducible from the same
  modules.
- [ENV] **Required environment terminal: `PRODUCTION_VERIFIED`.** The exact
  tested artifact digest reaches production and can be rolled back with
  compatible data/schema behavior.
- [ENV] **Required environment terminal: `PRODUCTION_VERIFIED`.** Production
  uses isolated identities, networks, data stores, encryption keys, and
  budgets.
- [ENV] Drift, failed migration, unhealthy canary, expired certificate, and quota
  pressure are detected before they become silent customer failures.

---

### M38 — Final release assurance, migration, launch, and general availability

**Status:** `NOT_STARTED`\
**Depends on:** M08, M09, M11, M12, M13, M18, M21, M23, M24, M25, M26, M27,
M28, M29, M30, M31, M32, M33, M34, M35, M36, M37\
**Required commit:** `release: certify Knotline for general availability`

#### Product addition

Knotline becomes a supported general-availability product: every promised
capability is verified end to end, externally gated features are honestly
labelled, operations are staffed, and production launch is reversible.

#### Deliverables

- Traceability audit proves every requirement ID has one primary milestone,
  implementation evidence, automated test or justified manual control,
  authorization rule, operational owner, and release state.
- [GA] All milestone engineering states are `COMMITTED`; every prerequisite
  environment criterion has reached its declared terminal state
  (`STAGING_VERIFIED` for staging-only assurance such as M34/M36 and
  `PRODUCTION_VERIFIED` only for production deployment/promotion criteria);
  every individually selected external gate has reached its
  `requiredTerminalState`.
- [ENV+EXT] Under `EXT-023`, Section 20.9 usability studies and beta activation
  thresholds pass against the frozen release-candidate deployment; every fixed
  major finding is retested and every accepted lower-severity finding has
  owner and expiry.
- [ENV+EXT] Separate `EXT-002`, `EXT-003`, `EXT-004`, `EXT-005`, `EXT-006`,
  `EXT-007`, `EXT-008`, `EXT-009`, `EXT-010`, `EXT-011`, `EXT-012`,
  `EXT-013`, `EXT-014`, `EXT-015`, `EXT-019`, `EXT-023`, `EXT-024`, and
  `EXT-025` evidence rows back the applicable branches of the complete
  critical-journey E2E suite in production-equivalent staging: discover →
  sign up → onboard → build/import/generate → test → publish → trigger →
  agent/tool/knowledge → task/approval → external action → observe → analyze →
  bill → audit/export/delete → get support.
- [GA] Production smoke uses safe synthetic tenant/provider accounts and performs no
  uncontrolled external effect.
- [GA] Provider capability matrix is frozen for GA; unavailable approvals/scopes
  result in an approved scope amendment and explicit `BETA`, `PLANNED`, or
  unavailable label, never a false `LIVE` claim.
- Migration/import path for any pre-GA Knotline data and configuration with
  rehearsal, mapping report, validation, rollback, and customer communication.
- GA seed templates, demo workspace, sample data, and product tours are useful,
  deterministic, resettable, labelled `DEMO`, and excluded from real analytics
  and billing.
- [ENV+EXT] Exact `EXT-001`, `EXT-016`, `EXT-020`, `EXT-021`, and `EXT-023`
  rows retain the final visual, copy, responsive, accessibility, localization,
  browser/device, email/chat, PDF/export, empty/error/offline/degraded, and
  legal review against the frozen release-candidate deployment.
- [ENV+EXT] Exact `EXT-002`, `EXT-003`, `EXT-004`, `EXT-017`, `EXT-019`,
  `EXT-022`, and `EXT-024` rows retain named-owner acceptance of final
  performance, resilience, security/penetration retest, privacy/residency,
  backup/restore, DR, cost, and operational evidence.
- [EXT] Exact `EXT-016`, `EXT-019`, and `EXT-021` rows retain completed
  support/help content, escalation roster, on-call schedule, incident roles,
  status page, response targets, customer communication, known limitations,
  release notes, and internal launch runbook.
- [EXT] Exact `EXT-005` and `EXT-020` rows retain commercial readiness:
  plan/price approval, Stripe production configuration, invoicing/tax/legal
  path, trial/cancellation, sales/support handoff, and no test-mode dependency.
- [GA] Controlled launch: internal → design partners → limited beta → release
  candidate → canary production → GA, with cohort, duration, telemetry, feedback,
  entry/exit criteria, freeze, rollback trigger, and decision owner.
- [ENV+EXT] Separate `EXT-002`, `EXT-003`, `EXT-004`, `EXT-005`, `EXT-006`,
  `EXT-007`, `EXT-008`, `EXT-009`, `EXT-010`, `EXT-011`, `EXT-012`,
  `EXT-013`, `EXT-014`, `EXT-015`, `EXT-019`, `EXT-021`, `EXT-022`, and
  `EXT-024`, and `EXT-025` rows retain the applicable backup, rollback,
  data/schema compatibility, kill-switch, provider-disable, customer-
  communication, and post-rollback-reconciliation rehearsal completed within
  seven days of GA.
- [GA] Known-risk register contains no critical/high unresolved item; accepted lower
  risks have owner, mitigation, expiry, and customer disclosure where needed.
- Frozen pre-commit release-manifest input and schema contain proposed version,
  candidate index-tree hash, artifact digests, SBOM, provenance, migrations,
  config/flag/model/tool/connector versions, test/evidence indexes, expected
  approvals, promotion plan, and rollback target. They do not claim a commit,
  tag, production deployment, or post-commit result.
- [GA] Signed GA tag and immutable release/evidence bundle are created after the
  release commit; the signed successor attestation adds commit/tag, final
  approvals, deployment records/identities, observation window, rollback
  evidence, and terminal states while avoiding a self-referential file edit.
- [GA] Thirty-day heightened monitoring and review schedule plus ownership of every
  post-launch metric, alert, customer issue, and follow-up.

#### Tests

- [GA] Clean full universal gate with every row active; no unexplained skip,
  quarantine, flaky rerun, or stale evidence.
- Traceability validator finds zero orphan requirement, route, API, state,
  event, migration, alert, dashboard, runbook, or external gate.
- Route registry validator finds zero unclassified route-state cell, zero
  unevidenced `REQUIRED` cell, and zero unjustified `NOT_APPLICABLE` cell; every
  `CJ-*` journey is linked to its routes, requirements, tests, owner, and
  release evidence.
- [ENV+EXT] Separate `EXT-004`, `EXT-005`, `EXT-006`, `EXT-007`, `EXT-008`,
  `EXT-009`, `EXT-010`, `EXT-011`, `EXT-012`, `EXT-013`, `EXT-014`,
  `EXT-015`, `EXT-023`, and `EXT-025` rows back their applicable critical
  journeys on the browser/device/locale/assistive-technology matrix.
- [ENV+EXT] Under `EXT-023`, the summative usability and activation calculation
  reruns against the exact frozen release-candidate deployment, including
  denominator, exclusions, findings, fixes, and retest evidence.
- Production configuration and secret-reference validation without printing
  secret values.
- [GA] Safe production canary and synthetic smoke, followed by evidence-backed
  rollback drill.
- [GA] Under `EXT-024`, the production workforce IdP client, directory
  lifecycle, FIDO2 step-up, role/duty denial, session revocation, customer-
  credential origin rejection, and a tightly scoped no-customer-data/no-op
  break-glass exercise pass against the exact release digest.
- [EXT] Separate `EXT-004`, `EXT-005`, `EXT-006`, `EXT-007`, `EXT-008`,
  `EXT-009`, `EXT-010`, `EXT-011`, `EXT-012`, `EXT-013`, `EXT-014`, and
  `EXT-015`, and `EXT-025` rows retain full provider `LIVE` capability
  certification and real receipt verification.
- [ENV+EXT] Exact `EXT-005` and `EXT-020` rows retain billing penny/unit
  reconciliation and entitlement-boundary evidence.
- [ENV+EXT] Exact `EXT-016`, `EXT-017`, `EXT-019`, `EXT-022`, and `EXT-024`
  rows retain the audit/export/deletion/legal-hold/support-access evidence
  review.
- [ENV] Final load/soak/chaos/AZ/restore/regional DR and cost profiles.
- [EXT] Exact `EXT-002`, `EXT-017`, `EXT-019`, and `EXT-024` rows retain the
  security suite, independent penetration retest, access review, secret/key
  rotation, and incident-tabletop evidence.
- [EXT] Exact `EXT-006`, `EXT-016`, `EXT-019`, `EXT-020`, `EXT-021`, and
  `EXT-023` rows retain help/legal/status/support/contact link and ownership
  review.
- Release-manifest schema, artifact/SBOM/provenance/signature verification,
  proposed-version collision check, and isolated restore of the frozen RC
  artifact pass before the release commit.
- [GA] RC/GA tags, post-commit manifest/promotion signature, production
  deployment identity, and restoration of the exact release SHA/digest pass
  under Section 21.6.

#### Acceptance

- [GA] The complete launch journey succeeds using production-equivalent services
  and real sandbox provider accounts before canary.
- [GA] Every GA-visible control performs real work and every non-GA capability is
  labelled accurately.
- [GA] Named product, engineering, security, privacy, operations, support, finance,
  and legal owners approve their evidence.
- [GA] Canary stays within all rollback thresholds for the declared observation
  window, then the authorized release owner promotes GA.
- [GA] Same-region deployment rollback and single-AZ failover lose no acknowledged
  durable operation. Regional recovery stays within the declared RPO/RTO,
  produces the complete affected-operation manifest for the possible RPO gap,
  never blindly repeats an uncertain external effect, and neither resurrects
  deleted data nor violates region policy.

---

## 24. Requirement-to-delivery traceability

### 24.1 Traceability contract

The following matrix assigns exactly one **primary** implementation owner to
every requirement in Sections 3 and 4. Inclusive range notation (for example,
`WF-005–WF-012`) expands to every integer ID in the range. Comma-separated IDs
are individual. The M01 validator parses the canonical requirement tables,
expands this primary-owner column, and fails on a missing, duplicate, or unknown
ID.

The matrix defines the minimum route/API/data/event and evidence family.
Implementation adds exact source symbols, migration IDs, OpenAPI operations,
test file/case IDs, screenshots, dashboards, alerts, runbooks, deployment IDs,
and external evidence to the per-milestone `traceability.json`. An ID is not
complete because a row exists here; its linked evidence must pass.

Canonical evidence-family abbreviations:

| Code | Evidence family |
|---|---|
| `UT` | Unit/schema/state/policy tests |
| `PT` | Property/model-based/concurrency tests |
| `DB` | Database, migration, constraint, RLS, and query-plan tests |
| `API` | HTTP/OpenAPI/idempotency/authorization contract tests |
| `EVT` | Event/SSE/webhook compatibility and delivery tests |
| `E2E` | Browser critical-journey tests |
| `A11Y` | Automated and manual assistive-technology evidence |
| `SEC` | Security/abuse/tenant-isolation/adversarial evidence |
| `PROV` | Real provider sandbox or production certification |
| `EVAL` | Agent/retrieval quality, safety, cost, and release evaluation |
| `PERF` | Section 4.2 performance/load/soak profile |
| `OPS` | Dashboard, alert, runbook, kill/rollback, game-day evidence |
| `PRIV` | Data inventory, export, retention, hold, deletion, restore proof |
| `FIN` | Billing ledger, Stripe, reconciliation, finance evidence |
| `MAN` | Product/design/content/legal/manual review |

### 24.2 Primary ownership matrix

| Requirement IDs | Primary milestone | Primary surfaces and contracts | Required evidence | External gate |
|---|---|---|---|---|
| ID-001, ID-004–ID-005 | M04 | Auth/profile/session routes; auth/session APIs; `magic_link_tokens`, `sessions`; auth/session events | UT, DB, API, SEC, E2E, A11Y | EXT-006 for delivered magic links |
| ID-002 | M04 | Google sign-in/callback; OIDC exchange; `identity_links` | UT, API, SEC, E2E, PROV | EXT-007 |
| ID-003 | M32 | SSO discovery/admin; SAML/OIDC exchange; `sso_connections` | UT, API, SEC, E2E, PROV | EXT-015 |
| ID-006–ID-010 | M05 | Workspace/member/role/group/onboarding routes and APIs; tenant/RBAC tables/events | UT, DB, API, SEC, E2E, A11Y | — |
| ID-011 | M30 | Developer credentials/service accounts; public API; credential tables/audit | UT, DB, API, SEC, E2E | — |
| ID-012–ID-013 | M32 | Identity/domain/SCIM routes and standards endpoints; SCIM/domain tables/events | UT, DB, API, SEC, E2E, PROV | EXT-015 |
| ID-014–ID-015 | M03 | Tenant-inclusive schema, transaction context, RLS, repositories | DB, API, SEC | EXT-002 for deployed proof |
| ON-001, ON-004–ON-007 | M05 | `/app/onboarding`, bootstrap/onboarding APIs, progress/sample data | UT, DB, API, E2E, A11Y, MAN | — |
| ON-002 | M08 | New-workflow prompt/template/blank/import and generation/dry-run APIs | UT, API, E2E, MAN | — |
| ON-003 | M15 | Real provider or blank/template onboarding through durable run result | API, E2E, PROV, OPS | EXT-004 for provider path |
| WF-001–WF-002, WF-004, WF-013, WF-015–WF-020 | M06 | Workflow library/settings/version/template routes and APIs; workflow/version tables/events | UT, PT, DB, API, EVT, E2E | — |
| WF-003 | M15 | Prompt generation UI/API; model gateway; generation/model records | UT, API, EVAL, E2E, PROV | EXT-004 |
| WF-005–WF-012 | M07 | Studio canvas/outline/inspectors; draft node/edge/operation APIs | UT, PT, API, E2E, A11Y, PERF, MAN | — |
| WF-014 | M08 | Dry-run/preflight UI/API and fixture execution records | UT, PT, API, E2E, SEC | — |
| RN-001 | M26 | Trigger/schedule/webhook UI and APIs; endpoint/delivery/schedule records | UT, PT, DB, API, EVT, SEC, E2E | Provider gates by trigger |
| RN-002–RN-015, RN-017–RN-018 | M10 | Run/task APIs, Temporal/outbox/reconcilers; runtime tables/events | UT, PT, DB, API, EVT, SEC, PERF, OPS | EXT-003 for production |
| RN-016 | M11 | Run room stream/polling; `run_events` sequence | API, EVT, E2E, A11Y, PERF | — |
| HU-001–HU-005, HU-011 | M12 | Inbox/task/queue/detail/forms; task APIs/tables/events | UT, PT, DB, API, E2E, A11Y, PERF | — |
| HU-006–HU-010 | M13 | Approval/SLA/delegation routes/APIs/tables/timers | UT, PT, DB, API, EVT, SEC, E2E, A11Y | — |
| AG-001–AG-002, AG-004 | M14 | Agent catalog/builder/version routes/APIs/tables | UT, DB, API, E2E, A11Y | — |
| AG-003, AG-005–AG-006 | M15 | Model policy/gateway; invocation/registry tables/events | UT, API, SEC, EVAL, PROV, OPS | EXT-004 |
| AG-007–AG-008, AG-011–AG-012, AG-014 | M17 | Governed execution loop/run inspector; grants/invocations/provenance | UT, PT, API, EVT, SEC, E2E, EVAL | EXT-004 where real model used |
| AG-009–AG-010, AG-013 | M16 | Tool/vault/broker/sandbox; tool/grant/operation records | UT, PT, API, SEC, PERF, OPS | Cloud sandbox gate within EXT-002 |
| AG-015–AG-017 | M18 | Eval datasets/runs/comparisons/releases; eval/release tables | UT, API, EVAL, E2E, OPS | EXT-004 for live suites |
| AG-018 | M34 | Operator console and hierarchical execution kill switches | UT, API, SEC, OPS | — |
| AG-019–AG-022 | M17 | Memory policy/admin routes and APIs; memory record/version/access/use tables and lifecycle events | UT, PT, DB, API, EVT, SEC, PRIV, E2E | EXT-004 where context reaches a real model |
| KN-001–KN-004 | M19 | Files/source/document views/APIs; upload/file/document records | UT, DB, API, SEC, E2E, A11Y, PERF | EXT-002 for Knotline-owned AWS object storage |
| KN-005–KN-009, KN-013–KN-014 | M20 | Search/debug/citation API; chunks/embeddings/manifests/tombstones | UT, PT, DB, API, SEC, EVAL, PERF, PRIV | EXT-004 for embeddings |
| KN-010–KN-012 | M21 | Knowledge admin/entity/provenance routes/APIs; entity/relation records | UT, DB, API, SEC, E2E, A11Y, PERF | — |
| CN-001–CN-006, CN-008–CN-009 | M22 | Connection setup/health/sync APIs; connection/credential/cursor/webhook records | UT, PT, DB, API, EVT, SEC, E2E, OPS | Provider-specific |
| CN-007 | M26 | Brokered outbound action/receipt/reconciliation | UT, PT, API, EVT, SEC, PROV, OPS | Provider-specific |
| CN-010 | M38 | Complete Section 15.3 certification matrix | PROV, SEC, OPS, MAN | EXT-007–EXT-014 and EXT-025 as applicable |
| CO-001–CO-003 | M09 | Generic threads/comments/follows/activity and notification intents | UT, DB, API, SEC, E2E, A11Y | — |
| CO-004–CO-009 | M28 | Search/command/saved-view/analytics/report routes/APIs and records | UT, DB, API, SEC, E2E, A11Y, PERF, MAN | — |
| BL-001–BL-004 | M29 | Commercial plan/price/subscription/entitlement projection and billing APIs | UT, PT, DB, API, EVT, SEC, FIN, E2E, OPS | EXT-005, EXT-020 |
| BL-005–BL-006 | M10 | Provider-neutral hard reservations, immutable usage/debt/credit ledgers, fenced leases, and spend-stop admission | UT, PT, DB, API, EVT, SEC, FIN, PERF, OPS | — |
| BL-007–BL-010 | M29 | Customer usage/budget/invoice UX, lifecycle/outage behavior, and source reconciliation | UT, PT, DB, API, EVT, SEC, FIN, E2E, OPS | EXT-005, EXT-020 |
| AD-001–AD-007, AD-009 | M31 | Audit/data/privacy/support-access routes/APIs; audit/hold/export/delete records | UT, PT, DB, API, SEC, PRIV, E2E, OPS | EXT-016 |
| AD-008, AD-010 | M32 | Security/policy/identity/residency admin; policy/identity/migration records | UT, DB, API, SEC, PRIV, E2E, PROV | EXT-015, EXT-022 |
| OP-001–OP-002 | M01 | Local stack, scripts, CI, evidence manifest | UT, API, E2E, SEC, OPS | — |
| OP-003–OP-006 | M37 | Terraform/environments/delivery/migrations/rollback | DB, SEC, PERF, OPS | EXT-002, EXT-003, EXT-021, EXT-022 |
| OP-007–OP-008 | M34 | Telemetry correlation, SLO alerts, dashboards, runbooks | UT, EVT, SEC, OPS | EXT-019 |
| OP-009–OP-011 | M36 | Backup/restore/DR/capacity/fairness/spend | PT, DB, SEC, PERF, OPS, PRIV | EXT-022 |
| OP-012 | M35 | Supply-chain and application security assurance | SEC, OPS | EXT-017; EXT-018 only for claims |
| OP-013 | M34 | Isolated workforce OIDC/session/step-up/directory/role/review/break-glass plane and operator APIs | UT, PT, DB, API, SEC, E2E, OPS, MAN | EXT-019, EXT-024 |
| EX-001–EX-016 | M33 | PWA/guest/locales/help/support/legal routes/APIs/tables | UT, API, EVT, SEC, E2E, A11Y, PRIV, MAN, OPS | EXT-001, EXT-006, EXT-016, EXT-019–EXT-021, EXT-023 as applicable |
| EX-017 | M33 | `/contact`; contact request/receipt/routing API, table, event, notification, retention, and deletion | UT, DB, API, EVT, SEC, E2E, A11Y, PRIV, MAN, OPS | EXT-006, EXT-013, EXT-016 as applicable |
| NFR-001–NFR-002 | M34 | SLI/SLO/error budgets and seven-day staging qualification | PERF, OPS | EXT-019 |
| NFR-003–NFR-006 | M36 | `API-MIX-1`, `RUNTIME-1`, SSE profile | PERF, OPS | EXT-002, EXT-003 |
| NFR-007 | M35 | Complete tenant-isolation attack corpus | DB, API, SEC | EXT-017 |
| NFR-008–NFR-009 | M36 | `DR-REGION-1` restore/recovery | PERF, OPS, PRIV | EXT-022 |
| NFR-010 | M33 | Full WCAG/browser/AT matrix | A11Y, E2E, MAN | EXT-023; independent audit if commercially required |
| NFR-011 | M35 | Scanners, threat models, penetration retest | SEC | EXT-017 |
| NFR-012 | M36 | Bounded loop/retry/queue/spend fault and load profiles | PT, PERF, OPS | — |
| NFR-013 | M34 | Timed tenant kill-switch exercise | UT, API, OPS | — |
| NFR-014–NFR-015 | M36 | Crash/AZ/duplicate external-effect profiles | PT, PERF, OPS | EXT-002, EXT-003 |
| NFR-016–NFR-017 | M33 | Complete responsive browser/device matrix | E2E, A11Y, MAN | — |
| NFR-018–NFR-020 | M36 | `WEB-MOBILE-1` Web Vitals profile | PERF, E2E | — |
| NFR-021–NFR-022 | M34 | Telemetry redaction and alert-delivery exercise | SEC, OPS | EXT-019 |
| NFR-023 | M20 | `ACL-REVOKE-1` across local grants, every `LIVE` connector, retrieval, citation, entity, cache, and agent context | PT, DB, API, EVT, SEC, EVAL, PERF, PRIV, OPS | Every connector gate used by the profile |

### 24.3 Runtime traceability artifact

For each individual requirement ID, `traceability.json` contains:

```json
{
  "requirementId": "WF-001",
  "primaryMilestone": "M06",
  "regressionMilestones": ["M38"],
  "routes": [],
  "openapiOperationIds": [],
  "tablesAndObjects": [],
  "events": [],
  "authorizationRules": [],
  "routeStateEvidence": [],
  "journeyIds": [],
  "journeyBranchIds": [],
  "dataLifecycleRules": [],
  "sourceSymbols": [],
  "automatedTests": [],
  "manualEvidence": [],
  "operationalControls": [],
  "externalGates": [],
  "engineeringState": "NOT_STARTED",
  "environmentState": "NOT_DEPLOYED"
}
```

M38 fails if any array required by the owning matrix row is empty, any linked
test/evidence is stale or failed, or the product label exceeds the recorded
environment/external state.

---

## 25. Final definition of done and GA launch checklist

M38 may promote GA only when every checkbox below is evidenced. A verbal
approval or “works on my machine” is not evidence.

### 25.1 Product and experience

- [ ] Every Section 3 requirement and Section 5 route is implemented with
  persisted real behavior.
- [ ] No GA-visible placeholder, fake KPI, inert control, unlabelled demo, dead
  end, or “coming soon” remains.
- [ ] Every Section 5 route has a registry entry; every Section 5.8
  `REQUIRED` route-state cell is implemented and evidenced, and every
  `NOT_APPLICABLE` cell has an approved intrinsic reason.
- [ ] Desktop, tablet, phone, supported browsers, six locales, PWA, guest, and
  assistive-technology critical journeys pass.
- [ ] Public product, pricing, connector, security, status, help, changelog,
  accessibility, and legal claims match actual verified capability.

### 25.2 Functional end-to-end behavior

- [ ] Identity, workspace, invitation, role, group, onboarding, and enterprise
  provisioning journeys pass.
- [ ] Workflow blank/template/import/real generation, studio, validation,
  dry-run, publish, version diff, trigger, durable run, retry/fork/cancel, and
  run-room journeys pass.
- [ ] Human task, form draft, assignment/queue, approval, delegation,
  request-revision, SLA, escalation, and notification journeys pass.
- [ ] Agent definition, model, retrieval, memory, tool, approval, sandbox,
  evaluation, canary, rollback, and provenance journeys pass.
- [ ] Files, parsing/OCR, hybrid retrieval, citation, entity graph, permission
  change, source delete, and reindex journeys pass.
- [ ] Every Section 15.3 provider marked `LIVE` completes read, change, write
  where declared, receipt/reconciliation, permission change, and deletion.
- [ ] Search, saved views, analytics, reports, billing, public API/webhooks,
  audit, privacy export/delete, and support journeys pass.

### 25.3 Correctness, security, privacy, and enterprise

- [ ] All state machines and Section 9.7 invariants pass under concurrency,
  duplicate delivery, crash, deployment, and dependency failure.
- [ ] RLS plus application authorization proves zero cross-tenant or
  unauthorized metadata/content exposure.
- [ ] No raw secret reaches browser, model, sandbox, logs, traces, events,
  analytics, exports, evidence, or error response.
- [ ] Threat-model abuse corpus, security scanners, signed SBOM/provenance, and
  independent penetration retest have no unresolved critical/high finding.
- [ ] Audit integrity, support access, retention, legal hold, export, deletion,
  restore deletion ledger, and residency evidence pass.
- [ ] SSO/SCIM/domain/session/policy and region migration pass certified
  enterprise tests.

### 25.4 Reliability, performance, and operations

- [ ] Every Section 4.2 profile passes from a production artifact in
  production-equivalent staging within cost.
- [ ] One-AZ loss, provider outage, queue/backlog, retry storm, database
  failover, restore, and regional recovery exercises meet correctness and
  RPO/RTO.
- [ ] Same-region rollback and single-AZ failover lose zero acknowledged
  durable operations; regional recovery accounts for every operation in its
  possible RPO gap and completes reconciliation/customer communication.
- [ ] Every critical journey has an SLI/SLO, dashboard, actionable alert,
  staffed owner/deputy, tested runbook, kill switch, and customer communication
  path.
- [ ] Backup/PITR/object/Temporal/config restore and deletion/residency
  reconciliation pass.
- [ ] Staging/prod infrastructure is reproducible, drift checked, cost bounded,
  least-privilege, encrypted, and independently recoverable.

### 25.5 Commercial, legal, support, and launch

- [ ] Stripe production plan/price/tax/invoice/refund/trial/cancel behavior and
  entitlement/usage reconciliation are approved.
- [ ] Every individual Section 16.9 manifest row with `gaRequired: true` has
  reached its exact `requiredTerminalState`; every false row has an approved
  scope amendment and truthful product/commercial/legal label, and
  `EXT-018` remains conditional on the actual certification claim.
- [ ] Terms, privacy, DPA/SCC, AUP, subprocessors, AI/data use, accessibility,
  security, pricing, and support commitments are approved and published.
- [ ] On-call/support rotations, incident roles, status page, contact paths,
  service targets, escalation, and launch staffing are active.
- [ ] Controlled cohort launch completes its observation windows with no
  rollback trigger.
- [ ] Section 20.9 usability cohorts, task thresholds, safety criteria, and
  design-partner activation threshold pass on the release candidate, with
  findings and retests retained.
- [ ] Release manifest/tag/evidence and exact rollback/restore target are
  signed, immutable, and accessible to authorized responders.

---

## 26. Self-contained implementation rules and decision defaults

These defaults remove common implementation-time ambiguity:

- Product requirements, architecture, APIs, states, integrations, tests,
  milestones, and final acceptance come from this file. Earlier research is
  context only.
- When product copy or exact commercial values need owner approval, implement
  the complete data model/admin flow with a clearly gated draft; do not invent
  a public claim.
- When a provider credential is unavailable, finish deterministic contracts,
  fixtures, security, UI, and operations, commit the engineering milestone, and
  record `BLOCKED_EXTERNAL`. Never substitute a mock acceptance.
- Choose the simplest design that preserves the state machines, invariants,
  NFRs, provider contracts, and product behavior. Complexity is not a goal.
- PostgreSQL is durable business truth; Redis, queues, search generations, and
  browser caches are rebuildable/derived unless this file explicitly says
  otherwise.
- All external writes use the tool/operation journal, idempotency where
  available, and reconciliation. No connector bypass is allowed.
- All model/embedding access uses the gateway; all agent tools use the broker;
  all credentials use the proxy/vault.
- Feature activation is independent from code merge. New risky, billable,
  external-write, or customer-data ingestion features default off until their
  staging gate and owner approval pass.
- A requirement conflict is resolved in this order: tenant/security/privacy
  invariant, durable correctness, explicit requirement, product truth,
  accessibility, operability, simplicity. The plan must be amended when the
  resolution changes scope or customer behavior.
- No milestone is time-boxed. If its acceptance cannot be reached safely,
  split work into additional green checkpoints without removing the original
  final gate.

---

## 27. Milestone status and evidence ledger

Engineering state is updated in the final milestone commit. Environment and
external-gate state are updated when independently verified. Actual source SHAs
and evidence URIs live in immutable CI/release manifests, avoiding a
self-referential commit.

### 27.1 Required environment terminal state

This table supplies the default `requiredTerminalState` inherited by every
tagged `[ENV]` or compound criterion in that milestone. `NOT_APPLICABLE` means
the milestone has no independent environment run; its deterministic deployment
automation may still be `[ENG]`, and later operational milestones deploy it.
When a milestone mixes named environments, each non-default criterion declares
its own exact terminal state. M01 validates one declaration row and
source-bullet digest for every environment criterion and rejects evidence whose
environment class does not equal the declared state.

| Milestone | Default criterion terminal | Scope |
|---|---|---|
| `M00` | `NOT_APPLICABLE` | Existing local baseline only |
| `M01` | `NOT_APPLICABLE` | Engineering/CI system |
| `M02` | `NOT_APPLICABLE` | Deterministic shell and browser fixtures |
| `M03` | `NOT_APPLICABLE` | Local/CI database proof; shared deployment joins M34 |
| `M04` | `NOT_APPLICABLE` | Deterministic auth/edge fixtures; provider evidence is external |
| `M05` | `NOT_APPLICABLE` | Deterministic workspace/onboarding slice |
| `M06` | `NOT_APPLICABLE` | Deterministic workflow definition slice |
| `M07` | `NOT_APPLICABLE` | Deterministic studio slice |
| `M08` | `NOT_APPLICABLE` | Fixture-only generation/dry run |
| `M09` | `NOT_APPLICABLE` | Deterministic collaboration slice |
| `M10` | `NOT_APPLICABLE` | Local/CI Temporal and ledger proof; shared deployment joins M34 |
| `M11` | `NOT_APPLICABLE` | Deterministic run-room slice |
| `M12` | `NOT_APPLICABLE` | Deterministic human-task/attachment slice |
| `M13` | `NOT_APPLICABLE` | Deterministic approval slice |
| `M14` | `NOT_APPLICABLE` | Simulated foundry slice |
| `M15` | `NOT_APPLICABLE` | Provider account evidence is external |
| `M16` | `NOT_APPLICABLE` | Deterministic broker/sandbox proof; deployed topology joins M34 |
| `M17` | `NOT_APPLICABLE` | Deterministic governed-agent slice |
| `M18` | `NOT_APPLICABLE` | Deterministic eval/release slice |
| `M19` | `NOT_APPLICABLE` | Deterministic object/file fixtures; shared storage joins M34 |
| `M20` | `NOT_APPLICABLE` | Milestone-scale deterministic retrieval profile |
| `M21` | `NOT_APPLICABLE` | Deterministic knowledge graph slice |
| `M22` | `NOT_APPLICABLE` | Fixture connector framework; providers are external |
| `M23` | `NOT_APPLICABLE` | Provider sandboxes are external |
| `M24` | `NOT_APPLICABLE` | Provider sandboxes are external |
| `M25` | `NOT_APPLICABLE` | Provider sandboxes are external |
| `M26` | `NOT_APPLICABLE` | Deterministic trigger/action fixtures |
| `M27` | `NOT_APPLICABLE` | Channel sandboxes are external |
| `M28` | `NOT_APPLICABLE` | Deterministic analytics slice |
| `M29` | `NOT_APPLICABLE` | Stripe test/merchant evidence is external |
| `M30` | `NOT_APPLICABLE` | Deterministic developer-platform slice |
| `M31` | `NOT_APPLICABLE` | Deterministic governance/deletion slice |
| `M32` | `STAGING_VERIFIED` | Named staging IdP/policy/residency migration criteria |
| `M33` | `STAGING_VERIFIED` | Named M33 staging candidate, devices, cohorts, support/locales |
| `M34` | `STAGING_VERIFIED` | Recreated production-equivalent staging and operations |
| `M35` | `STAGING_VERIFIED` | Environment security/rotation/break-glass exercises |
| `M36` | `STAGING_VERIFIED` | Load, chaos, restore, and regional DR assurance |
| `M37` | `STAGING_VERIFIED` | Staging/preview criteria by default; named production criteria explicitly require `PRODUCTION_VERIFIED` |
| `M38` | `STAGING_VERIFIED` | Frozen-RC pre-commit criteria; post-commit `[GA]` promotion advances the milestone environment to `PRODUCTION_VERIFIED` |

### 27.2 Initial status and evidence ledger

In this initial ledger, every listed `EXT-*` gate without an inline state is
`BLOCKED_EXTERNAL`; `NOT_APPLICABLE` means no external evidence is required for
that milestone; and `SIMULATED` never satisfies a live acceptance. Later
evidence manifests record the state of each gate ID individually rather than
replacing the IDs with an ambiguous word such as “clear.”
The production-boundary column may also list a downstream live-activation
dependency that the milestone does not itself own as a tagged criterion; it
does not transfer ownership or let that milestone advance the gate. Conversely,
every `[EXT]` or `[ENV+EXT]` criterion names exact gate IDs, and every such ID
must appear in that milestone's boundary cell.

| Milestone | Engineering | Environment | External gates at production boundary | Required final commit / evidence |
|---|---|---|---|---|
| M00 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `c1a2f16`; baseline verification |
| M01 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `chore: establish the verified Knotline engineering system` |
| M02 | `COMMITTED` | `NOT_DEPLOYED` | EXT-001 | `feat: deliver the responsive Knotline product shell` |
| M03 | `COMMITTED` | `NOT_DEPLOYED` | EXT-002 | `feat: persist Knotline data with enforced tenant isolation` |
| M04 | `COMMITTED` | `NOT_DEPLOYED` | EXT-006, EXT-007 | `feat: add secure passwordless and Google authentication` |
| M05 | `COMMITTED` | `NOT_DEPLOYED` | EXT-006 | `feat: enable complete workspace onboarding and access control` |
| M06 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: deliver versioned workflow definitions and publishing` |
| M07 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: deliver the complete responsive workflow studio` |
| M08 | `COMMITTED` | `NOT_DEPLOYED` | `SIMULATED`; EXT-004 `BLOCKED_EXTERNAL` for real activation | `feat: add guided workflow generation and safe test mode` |
| M09 | `COMMITTED` | `NOT_DEPLOYED` | EXT-006 for email mention delivery later | `feat: add collaborative workflow and work discussions` |
| M10 | `COMMITTED` | `NOT_DEPLOYED` | EXT-003 | `feat: execute workflows durably across failures` |
| M11 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: deliver the live Knotline run room` |
| M12 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: deliver complete human task execution` |
| M13 | `COMMITTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: add durable approvals and escalation policies` |
| M14 | `NOT_STARTED` | `NOT_DEPLOYED` | `SIMULATED` for test console | `feat: deliver the Knotline agent foundry` |
| M15 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-004 | `feat: integrate the governed OpenAI model gateway` |
| M16 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-002 for deployed sandbox/vault; EXT-004 for live model-requested tool smoke | `feat: secure agent tools with isolated execution` |
| M17 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-003, EXT-004 | `feat: execute governed agents with full provenance` |
| M18 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-004 | `feat: add agent evaluations and controlled releases` |
| M19 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-002 | `feat: add secure file ingestion and document processing` |
| M20 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-004 | `feat: deliver permission-aware hybrid retrieval` |
| M21 | `NOT_STARTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: add the provenance-backed knowledge graph` |
| M22 | `NOT_STARTED` | `NOT_DEPLOYED` | Base framework `SIMULATED`; optional provider branches retain EXT-007, EXT-008, EXT-009, EXT-010, EXT-011, EXT-012, EXT-013, EXT-014, EXT-015, EXT-025 individually | `feat: establish the secure connector platform` |
| M23 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-007, EXT-009 | `feat: connect Google Notion and Confluence knowledge` |
| M24 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-008, EXT-010, EXT-011, EXT-012, EXT-014 | `feat: connect Linear Jira GitHub and collaboration systems` |
| M25 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-007, EXT-008, EXT-013, EXT-025 | `feat: add Microsoft CRM and generic data connectors` |
| M26 | `NOT_STARTED` | `NOT_DEPLOYED` | Each provider branch retains EXT-007, EXT-008, EXT-009, EXT-010, EXT-011, EXT-012, EXT-013, EXT-014, or EXT-025 individually | `feat: add production triggers and reconciled outbound sync` |
| M27 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-006, EXT-008, EXT-012 | `feat: deliver multichannel notifications and escalation delivery` |
| M28 | `NOT_STARTED` | `NOT_DEPLOYED` | `NOT_APPLICABLE` | `feat: deliver global search saved views and operational analytics` |
| M29 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-005, EXT-020 | `feat: add Stripe billing usage and enforced entitlements` |
| M30 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-001, EXT-021 | `feat: deliver the Knotline developer platform` |
| M31 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-016, EXT-022 | `feat: deliver audit privacy export and deletion governance` |
| M32 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-015, EXT-022 | `feat: add enterprise identity provisioning and data policy` |
| M33 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-001, EXT-006, EXT-016, EXT-019, EXT-020, EXT-021, EXT-023 | `feat: deliver the installable accessible global Knotline experience` |
| M34 | `NOT_STARTED` | `NOT_DEPLOYED` | Base staging: EXT-002, EXT-003, EXT-019, EXT-021, EXT-022, EXT-024; per-capability branches retain EXT-004, EXT-005, EXT-006, EXT-007, EXT-008, EXT-009, EXT-010, EXT-011, EXT-012, EXT-013, EXT-014, EXT-015, EXT-025 individually | `feat: operationalize Knotline with SLOs and kill switches` |
| M35 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-016, EXT-017, EXT-018, EXT-019, EXT-022, EXT-024 | `security: complete product and supply-chain assurance` |
| M36 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-002, EXT-003, EXT-004, EXT-019, EXT-022 | `perf: prove Knotline capacity resilience and recovery` |
| M37 | `NOT_STARTED` | `NOT_DEPLOYED` | EXT-002, EXT-003, EXT-006, EXT-021, EXT-022 | `infra: deliver reproducible AWS production environments` |
| M38 | `NOT_STARTED` | `NOT_DEPLOYED` | Default required rows: EXT-001, EXT-002, EXT-003, EXT-004, EXT-005, EXT-006, EXT-007, EXT-008, EXT-009, EXT-010, EXT-011, EXT-012, EXT-013, EXT-014, EXT-015, EXT-016, EXT-017, EXT-019, EXT-020, EXT-021, EXT-022, EXT-023, EXT-024, EXT-025; EXT-018 only when a certification claim is approved | `release: certify Knotline for general availability` |

Plan adoption itself uses the dedicated documentation commit named in the file
header. M01 implementation starts only after that commit exists and this
document’s Markdown, requirement ownership, dependency, and commit-message
validators pass.

---

## 28. Completion statement

This plan is complete when its own validation and independent review pass. The
product is complete only when M38 is `COMMITTED`,
`PRODUCTION_VERIFIED`, every individual external-gate manifest row with
`gaRequired: true` has reached its `requiredTerminalState`, and the signed GA
evidence manifest proves every requirement and final checklist item.

No amount of implementation time, code volume, or milestone count substitutes
for that evidence.
