# Workflow generation and safe test mode

## Scope and invariant

M08 provides local deterministic guided generation, canonical JSON and CSV
import preview, policy preflight, and fixture-only execution. Every generated
surface carries a persistent `SIMULATED` label. The fixture provider does not
use a network client, provider credential, production connector, or external
write path. Real model activation remains feature-gated until M15 and EXT-004.

The primary safety invariant is: generation cannot create a workflow until an
authorized user accepts the reviewed result, and a dry run must report exactly
zero external writes. The `workflow_test_runs.external_write_count = 0`
constraint makes that assertion durable for persisted reports.

## Generation lifecycle

The authoritative lifecycle is `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`,
`CANCELLING`, or `CANCELLED`. While `RUNNING`, the non-authoritative progress
phase is `GENERATING`, `VALIDATING`, `REPAIRING`, or `READY_TO_ACCEPT`.
`READY_TO_ACCEPT` is review state, not permission to create a workflow.

The worker uses prompt contract `workflow-generation.v2` and provider
`fixture-v1`. User text is passed only as data to deterministic parsing. The
fixture implementation has no instruction interpreter. Invalid output receives
at most two repairs; refusal, truncation, timeout, schema exhaustion, and
cancellation fail closed. A retry creates a new generation linked through
`retryOf`; the original terminal resource remains immutable evidence.

## Review and acceptance

The review surface shows the source prompt, inferred assumptions, assignments,
missing integrations, validation findings, provider, prompt contract, repair
count, usage, zero cost, and node/edge diff. Users may safely test, accept,
discard, cancel, or regenerate. Acceptance is explicit and idempotent. When
`publish=true`, the server imports the accepted canonical definition and uses
the normal immutable publication contract. Onboarding cannot claim ON-003 from
this path because the result is simulated.

## Import format

Canonical JSON must match `workflowDefinitionSchema` exactly. CSV is UTF-8 text
with this header:

```csv
key,name,kind,depends_on
start,Request received,trigger,
prepare,Prepare request,human,start
review,Review request,approval,prepare
```

`depends_on` contains pipe-separated node keys. Preview parses the complete
document, constructs deterministic node positions and edge keys, runs graph
validation, and returns `createsResource: false`. Import remains blocked while
any error finding is present.

## Dry-run fixtures and preflight

Fixture input includes workflow input, keyed human submissions, keyed agent
outputs, keyed connector outputs, permissions, entitlements, healthy connection
references, budget in minor units, and timezone. The report records traversed
path, each resolved fixture source and value, validation findings, and fixture
lineage. Every step is marked `externalWrite: false`.

Preflight checks workflow-run permission, workflow entitlement, required
connection health, expected agent cost against budget, approval coverage for
high-risk integration actions, explicit timezone, and graph validity. A failed
check sets `allowed=false`; it is never converted into a warning by the client.

## Operations and incident response

- If generations remain `QUEUED`, inspect worker availability and queue age.
- If repair counts rise, compare output against the pinned schema and fixture.
- If a dry-run report has a nonzero side-effect count, disable generation and
  dry-run capability immediately; the database constraint should reject it.
- If acceptance retries, read the generation's `acceptedWorkflowId` before
  importing; do not create a second workflow.
- Never log source prompts, fixture values, generated configuration, or import
  content. Telemetry may include resource IDs, lifecycle, phase, prompt version,
  provider key, repair count, duration, and content-free finding codes.
- Cancellation is terminal. Resume by creating a linked retry, never by
  rewriting the cancelled resource.

## Verification

Focused verification covers strict schema output, refusal, truncation, invalid
output repair, timeout, cancellation, prompt injection, no pre-accept resource,
CSV dependency import, all preflight failures, deterministic usage/cost, API
lifecycle, tenant isolation, zero-write dry-run reports, responsive browser
review, and accept-and-publish. The cumulative milestone gate also reruns every
prior unit, contract, database, security, browser, accessibility, localization,
visual, migration, query-plan, backup, bundle, and route check.
