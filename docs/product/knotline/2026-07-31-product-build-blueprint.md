# Knotline Product Build Blueprint

**Working product name:** Knotline  
**Document type:** Product and implementation baseline  
**Date:** 2026-07-31  
**Status:** Active build plan  
**Architecture source:** [Trace end-to-end system design](../../system-design/trace/2026-07-29-trace-end-to-end-system-design.md)

## Product thesis

Knotline is an operations fabric for work shared by people, AI agents, and
business systems. A team expresses a process as a versioned graph, starts one or
many durable runs, delegates bounded steps to people or agents, pauses at
explicit judgment gates, and retains the context, decisions, costs, and
side-effects needed to understand what happened.

Knotline is not a visual clone of Trace. The underlying product category and
production requirements are informed by the Trace research, while the brand,
interaction model, information architecture, component system, API contract,
security posture, and implementation are original.

## Working brand system

The name is centralized and can be replaced without changing domain concepts.

### Positioning

- **Name:** Knotline
- **Descriptor:** Operations, in motion
- **Primary promise:** Design the path. Assign the judgment. Keep every run
  legible.
- **Voice:** Direct, calm, precise, operational
- **Core metaphor:** Lines of responsibility tied into a durable operating
  system

### Visual direction

- Deep graphite workspace instead of Trace's beige canvas
- Mineral blue for structure and trusted system state
- Acid lime for live execution and primary action
- Coral reserved for irreversible risk and failure
- Editorial typography with compact monospace operational metadata
- Spatial operations maps with visible ownership, state, and provenance
- Dense but quiet UI: information-rich without dashboard ornament

### Design tokens

| Token | Initial value | Purpose |
|---|---:|---|
| Ink | `#111315` | Main application background |
| Panel | `#171a1d` | Primary surface |
| Panel raised | `#1d2124` | Interactive/raised surface |
| Text | `#eef2f0` | Primary copy |
| Muted | `#8e9a9e` | Secondary copy |
| Signal lime | `#c8ff52` | Live state and primary action |
| Mineral blue | `#64a4ff` | Trusted, completed, selected |
| Risk coral | `#ff765e` | Destructive or failed state |

## Repository architecture

```text
apps/
  api/                    Fastify control-plane API
  web/                    React/Vite product application
packages/
  contracts/              Shared transport and domain contracts
infra/
  docker-compose.yml      PostgreSQL/pgvector, Redis, and object storage
docs/
  product/knotline/       Product decisions and build specifications
  system-design/          Complete architecture
  research/               External evidence and competitive research
```

This starts as a TypeScript modular monorepo. Deployment boundaries may split
when execution load or fault isolation justifies it, but the business modules
remain explicit from the beginning.

## Product surfaces

### Marketing and activation

- Public product narrative
- Interactive workflow example
- Pattern/template gallery
- Security and architecture pages
- Pricing and plan comparison
- Email and Google authentication
- Workspace creation and invitations
- Guided first-workflow onboarding

### Operations home

- Current runs and blocked work
- Human tasks and approval inbox
- Reliability, throughput, and returned-time metrics
- Recent execution history
- Connector and agent health
- Saved operational views

### Workflow studio

- Natural-language workflow generation
- Pattern-based creation
- Graph editing and auto-layout
- Human, agent, approval, trigger, and action nodes
- Typed input/output mappings
- Validation and policy preview
- Immutable publishing and version history
- Diff and rollback into a new draft

### Run room

- Durable run timeline
- Task dependency view
- Live event stream
- Inputs, outputs, artifacts, and citations
- Agent reasoning summary and tool actions
- Human task submission
- Approval, rejection, revision, and delegation
- Pause, resume, cancel, retry, and fork controls
- Cost, latency, and provenance

### Agent foundry

- Versioned agent definitions
- Model and retrieval policies
- Tool grants and risk classes
- Input/output schemas
- Prompt/configuration release history
- Evaluation datasets and release gates
- Budget, latency, and safety constraints

### Connections and knowledge

- OAuth and API-key connection flows
- Notion, Google Drive, Linear, Slack, Jira, and generic webhook connectors
- Sync status, cursors, errors, and replay
- Source document browser
- Permission-aware hybrid search
- Entity and relationship explorer
- Citation and deletion provenance

### Administration

- Team members, roles, and service principals
- SSO/SCIM and domain controls
- Plans, usage, credits, and invoices
- Audit event explorer and export
- Retention, residency, and deletion policy
- Notification and escalation policy
- Kill switches and operational controls

## Technical baseline

### Web application

- React 19 and TypeScript
- Vite build system
- XYFlow for the workflow studio
- CSS token system with responsive layouts
- Server-authoritative state with bounded optimistic updates
- SSE for run status with sequence resume and ETag polling fallback
- Accessible non-canvas alternatives for tasks and dependencies

### Control-plane API

- Fastify with `/v1` resources
- Zod validation at transport boundaries
- HttpOnly rotating session cookie in production
- Server-derived membership and authorization
- Request correlation and structured errors
- Idempotency records for creation and side effects
- Append-only audit and transactional outbox

### Data and infrastructure

- PostgreSQL as transactional source of truth
- `pgvector` for the initial permission-aware vector index
- Redis for ephemeral cache, limits, and coordination
- S3-compatible object storage for raw sources and artifacts
- Durable workflow engine for timers, signals, retries, and long waits
- Queue/event bus for connector, ingestion, notification, and usage consumers
- Secrets manager and envelope encryption for credentials
- OpenTelemetry, structured logs, error tracking, and product analytics

## Delivery slices

### Slice 1: Product shell and safe control plane

- Branded application shell
- Workflow library and map
- Shared contracts and versioned API
- Session and workspace bootstrap
- PostgreSQL schema and migrations
- Tenant authorization and negative tests
- Workflow drafts, versions, validation, and publishing
- Audit/outbox foundations

### Slice 2: Durable execution

- Runs, tasks, attempts, and run events
- Dependency scheduler
- Human tasks and approvals
- Retry, cancellation, timeout, and escalation
- SSE stream and recovery
- Idempotent external-operation records

### Slice 3: Agent execution

- Agent, prompt, tool, and model-policy versions
- Model gateway
- Retrieval manifest and provenance
- Capability-scoped tool broker
- Isolated task execution
- Token, time, cost, and network budgets
- Evaluation and release gates

### Slice 4: Context and integrations

- Connector framework and credential vault
- Webhook verification and deduplication
- Incremental ingestion and cursor reconciliation
- Parsing, chunking, embeddings, entities, and relations
- Permission-aware hybrid retrieval
- Source deletion propagation
- Outbound synchronization

### Slice 5: Commercial and enterprise readiness

- Stripe checkout and webhook-authoritative billing
- Entitlements, usage reservations, and ledgers
- SSO, SCIM, retention, residency, and export
- Multi-AZ deployment, backups, and disaster recovery
- Capacity, fairness, spend protection, SLOs, alerts, and runbooks
- Security, privacy, supply-chain, and agent-safety assurance

## Current implementation

The first vertical slice now includes:

- pnpm monorepo boundaries;
- shared TypeScript workflow contracts;
- a Fastify API with health, bootstrap, workflow list, workflow detail, and
  workflow creation routes;
- request IDs, CORS scoping, security headers, structured errors, and log
  redaction;
- a responsive React application shell;
- an original Knotline operations dashboard;
- a workflow library and interactive XYFlow map;
- API-connected behavior with a deliberate demo-data fallback;
- local PostgreSQL/pgvector, Redis, and MinIO infrastructure definitions.

The API catalog is intentionally an in-memory adapter in this first visual
slice. It is a replaceable repository boundary, not the persistence design.
PostgreSQL migrations, tenant-aware repositories, sessions, and immutable
workflow versioning are the immediate next implementation target.

## Non-negotiable invariants

The complete build continues to follow the 20 invariants in the system design,
especially:

1. tenant ownership is immutable and server-verified;
2. published workflow versions cannot change;
3. every run pins one definition and policy snapshot;
4. delivery may repeat but logical effects do not;
5. approvals bind to the exact payload executed;
6. agent authority is narrower than user authority;
7. credentials never enter prompts, browser storage, artifacts, or logs;
8. retrieval enforces permissions before model access;
9. output preserves source, version, model, tool, cost, and review provenance;
10. unsafe execution can be stopped without deploying code.

## Naming decision

Knotline is a working name. Before public-domain registration, trademark,
production OAuth configuration, payment-provider setup, or customer-facing
deployment, the name must receive a domain and trademark screen. All code uses
brand-neutral domain nouns so a rename is low cost.
