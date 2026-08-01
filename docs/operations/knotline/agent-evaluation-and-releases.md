# Agent evaluation and controlled release operations

## Scope

This runbook covers evaluation datasets, reproducible runs, graders, human review,
comparisons, release gates, shadow and canary allocation, promotion, rollback, and
online quality monitoring. It applies to the evaluation package, API, PostgreSQL
stores, worker schedules, and agent evaluation/activity screens introduced in M18.

## Dataset lifecycle

An evaluation dataset is a named container whose published versions are immutable.
Each case has a stable key, typed JSON input, optional expected value and references,
tags, difficulty, risk, sensitivity, and optional consent evidence. Accepted sources
are synthetic generation, curation, consented redacted run snapshots, CSV, JSONL,
and manual authoring. Imports validate every row and return its one-based failing
row; never partially publish a failed import.

Sensitive input is encrypted with AES-256-GCM before insertion. Its ordinary JSON
column contains JSON null, while the encrypted fixture records its key reference.
Production must supply a 32-byte `EVALUATION_FIXTURE_KEY`; rotate it through a
versioned key migration, not an in-place rewrite. Access to a dataset never returns
encrypted fixture bytes or decrypted sensitive input in list/detail responses.
Run snapshots require a consent reference. Deletion follows the workspace retention
and legal-hold policy; published versions referenced by retained runs are tombstoned
rather than rewritten.

## Reproducible execution

Every run pins the agent version, dataset and suite versions, model-role mapping,
provider revision, tool versions, knowledge fixture, policy version, and grader
versions. An idempotency key prevents duplicate scheduled or retried runs. A run
must remain pinned when a canary changes while it is in flight. Cancellation is a
persisted terminal transition and must be forwarded to any active provider work.

The local CI suite uses deterministic fixtures only. Full model-backed, pairwise,
and live tool suites are scheduled after the external provider gate is satisfied.
The scheduler orders due work, skips completed idempotency keys, and admits work
only while its declared provider cost fits the remaining budget. Retry attempts use
the original snapshot and idempotency identity.

## Graders and human review

Supported graders are deterministic, exact match, JSON schema, rule, model, blinded
pairwise, tool trajectory, citation coverage, safety, latency, and cost. Grader
configuration and version are immutable within a run. Model graders receive a
trusted rubric separately from candidate and case material; case content is marked
untrusted and cannot edit the rubric or threshold. Safety failures are counted
independently and may hard-block release.

Human pairwise reviews randomize A/B placement deterministically per case and review
round. Reviewers see no candidate identity. Rubric version, reviewer authorization,
score, confidence, disagreement, and adjudication are append-only. Operators must
not resolve disagreement by deleting an unfavorable review.

## Comparison and release gates

Comparisons join cases by stable key and report baseline score, candidate score,
delta, sample size, confidence interval, low-sample warning, slice results, and the
concrete regressed cases. A gate may require suites, minimum score, maximum
regression, minimum sample size, zero safety failures, and a risk class. Promotion
accepts only a stored comparison whose gate decision passed. Never override a gate
by editing a comparison row.

Release channels are shadow, canary, and stable. Canary assignment hashes release
and subject identifiers into a stable bucket; the percentage can change without
moving subjects unnecessarily. A release record contains the immutable comparison
and gate snapshot. Rollback creates a new append-only rollback record referencing
the release; it never edits historical runs or promotion evidence. In-flight work
continues on its pinned version unless the emergency policy requires cancellation.

## Adversarial coverage

Required high-risk suites include prompt and grader injection, tool misuse, data
exfiltration, cross-workspace authorization, unsafe content, malformed documents,
schema confusion, citation fabrication, provider failure, and budget exhaustion.
Keep adversarial fixtures separate from public examples. Any new tool or knowledge
capability must add a corresponding adversarial slice before production promotion.

## Monitoring and alerts

Aggregate schema failures, fallback, refusal, safety block, approval, tool error,
citation coverage, latency, and cost in bounded time buckets. Dashboards must show
sample count and uncertainty beside every score. Mark samples below the configured
minimum as `LOW SAMPLE — UNCERTAIN`; do not extrapolate or suppress the warning.

Page when a stable release breaches its safety or schema threshold, a canary exceeds
its regression budget, online cost or latency drifts beyond policy, a scheduled
required suite misses its freshness window, or a rollback fails to take effect.
Record metric definitions and aggregation versions with incident evidence.

## Incident response

1. Stop promotion and set candidate allocation to zero through a rollback record.
2. Disable unsafe tools or model routes with their existing kill switches.
3. Preserve the release, comparison, run snapshots, provider receipts, and hashes.
4. Compare affected slices and concrete cases; do not rely on the aggregate alone.
5. For possible fixture leakage, revoke evaluation access and rotate the fixture key.
6. Re-run deterministic and adversarial suites against a fixed immutable version.
7. Resume with a new comparison and promotion record after the gate passes.

## Verification

Run `pnpm test:evals`, the Docker-backed migration/API suite, event and contract
verification, and browser tests for evaluation and activity routes. Confirm dataset
immutability and tenant isolation, encrypted sensitive input, idempotent runs,
blocked and passing gates, stable canary allocation, persisted cancellation,
append-only rollback, online low-sample warnings, and reproducible snapshots.

Live provider suites and production canary evidence remain blocked until EXT-004 is
provisioned. Local verification uses the public package registry, localhost services,
workspace-owned configuration, and temporary directories only.
