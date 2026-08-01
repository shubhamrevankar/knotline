# Governed agent runtime and memory operations

## Scope

This runbook covers durable agent workflow tasks, authorized context manifests,
model and tool dispatch, approvals, provenance, explicit memory, cancellation,
and lifecycle invalidation. It applies to the worker, model gateway, tool broker,
sandbox, API, and PostgreSQL stores introduced through M17.

## Runtime contract

Every execution is pinned to a workspace, principal, run, task, attempt, immutable
agent version, prompt version, and model-policy version. The worker accepts only a
schema-valid `AgentExecutionRequest`. Its context is a finite manifest containing
content hashes, permission-proof identifiers and revisions, classifications, and
reauthorization deadlines. The runtime verifies the manifest at admission and
immediately before every model dispatch. An expired or revoked proof fails closed.

The durable loop is model call → optional structured memory write or validated
tool call → policy/approval → broker receipt → continuation → schema-validated
output. Limits independently cap wall time, turns, model calls, tool calls, input
tokens, output tokens, cost, context bytes, and output bytes. Cancellation flows
through the Temporal activity signal to fetch, the gateway, and the broker. A
provider-accepted outcome that cannot be observed must be recorded as uncertain
and must not be replayed automatically.

The worker can use deterministic `fixtureAgentSteps` only when the workflow node
is explicitly marked as test data. Product surfaces must label those results as
simulated. Production requests call the internal model gateway and tool broker;
workers never call a model provider or external tool directly.

## Durable records and provenance

`agent_executions` is the current state and usage projection.
`agent_execution_turns` and `agent_context_manifests` are append-only.
`provenance_nodes` and `provenance_edges` link agent and prompt versions,
authorized inputs, model invocations, tool receipts, approvals, typed output, and
usage. Output and referenced content are identified by SHA-256 hashes. The run
room exposes decisions, evidence, limits, and receipts; private chain-of-thought
is neither requested nor stored.

On restart, Temporal replays orchestration state and reruns only idempotent
activities. Execution attempts and external operations retain stable identifiers.
Gateway operation IDs and broker operation IDs provide deduplication. Approval
consumption is fenced and single-use. Never manually change append-only rows.

## Memory policy

Memory is disabled unless an agent has an explicit versioned policy. The policy
controls allowed scopes, retention days, record count, sensitivity, source
requirements, and the global disabled state. Supported scopes are execution,
user-private, and workspace-shared; `none` is represented by a policy that allows
no durable scope. Model prose is never implicitly persisted. Every write must be
a validated `MemoryWriteOperation` with purpose, subject, scope, sensitivity,
sources, permission dependencies, expiry, authorizer, and originating execution.

`memory_records` points to the current version. `memory_versions` is immutable
and retains correction/scope/deletion facts. `memory_uses` records every explicit
write and context read. `memory_tombstones` retains only the minimum audit fact
and prior-value hash; current tombstoned values are null. User-private values are
available only to their owner. Workspace administration queries return only
workspace-shared metadata and never private values.

## Lifecycle invalidation

Source deletion, permission revocation, membership removal, workspace deletion,
retention expiry, and subject deletion enqueue dependency invalidation. The
repository locks affected records, appends a null tombstone version, advances the
current pointer, and records a minimal tombstone. Cache/context consumers handle
the matching lifecycle event and reject prepared manifests containing stale
proofs. The declared purge bound begins at the tombstone timestamp. Legal holds
may preserve separately protected audit facts, never restore a value to context.

Operators should verify:

1. affected records have state `tombstoned` or `expired`;
2. their current version contains no value or source content;
3. prepared executions fail with `AUTHORIZED_CONTEXT_STALE`;
4. new searches and workspace administration omit prohibited values;
5. the audit trail contains a reason and hash but no deleted content.

## Configuration

Required worker settings are `DATABASE_URL`, `MODEL_GATEWAY_URL`,
`MODEL_GATEWAY_INTERNAL_TOKEN`, `TOOL_BROKER_URL`, and
`TOOL_BROKER_INTERNAL_TOKEN`. Bind internal services to private or loopback
interfaces, rotate service tokens independently, and never expose those routes at
the public edge. Provider credentials remain exclusively in the gateway or
credential backend. Local development uses only the public package registry,
localhost containers, and workspace-owned configuration.

## Monitoring and alerts

Track execution terminal-state ratio, approval-wait age, turn and cost
distributions, stale-context failures, schema failures, cancellation latency,
uncertain external outcomes, memory invalidation lag, and tombstone purge lag.
Page when uncertain effects rise above zero, cancellation breaches its SLO,
permission invalidation exceeds the declared bound, or a terminal task lacks a
typed output/provenance root. Alert on any private-memory result returned from a
workspace-administration route.

## Incident controls

- Disable model dispatch with the model-gateway emergency switch.
- Disable all tools or one tool/connection with broker kill switches.
- Pause affected runs before changing policy or credentials.
- For an uncertain side effect, reconcile against the provider receipt; never
  retry by hand until the journal resolves it.
- For suspected context leakage, disable the agent memory policy, invalidate the
  relevant source/permission dependency, rotate affected credentials, and retain
  hashes and audit events without copying sensitive values into tickets or logs.
- Resume only after a fresh context manifest and new authorization proofs exist.

## Recovery verification

Run unit tests for the bounded loop, the Docker-backed migration/API suite, and
browser coverage for memory and the run inspector. Confirm exact-limit cases,
single-use approval resume, tenant and user isolation, dependency invalidation,
null tombstoned values, provenance hash consistency, and absence of private
reasoning in logs and exports. Live provider activation remains blocked until its
external credential and production evidence gate is satisfied.
