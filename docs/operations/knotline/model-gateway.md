# Governed model gateway operations

## Purpose and trust boundary

The model gateway is the only Knotline process permitted to load a provider API
credential. The browser, API, durable workflow payloads, worker activities, and
database records use the provider-neutral contracts in
`packages/contracts/src/model-gateway.ts`. Repository boundary verification fails
if `OPENAI_API_KEY` is referenced outside the gateway service package.

The API reaches the gateway over the authenticated internal
`POST /internal/v1/model-invocations` endpoint. Requests are capped at 2 MB and
responses are marked `no-store`. The local compose network publishes the service
only on `127.0.0.1:4200`; the container itself listens on its private interface so
the API container can reach it.

## Runtime modes

`MODEL_GATEWAY_PROVIDER=recorded` is the deterministic default. It returns a
schema-valid, visibly recorded contract with zero cost. Recorded mode proves the
complete engineering path without claiming that a third-party call occurred.

`MODEL_GATEWAY_PROVIDER=openai` activates the Responses API adapter. Startup
fails closed unless all of the following are supplied by an approved secret and
configuration backend:

- `OPENAI_API_KEY`;
- `OPENAI_PRICE_VERSION`;
- input and output price-per-million values for each configured role;
- `MODEL_GATEWAY_SAFETY_SALT` and `MODEL_GATEWAY_INTERNAL_TOKEN`.

Never put values in source, compose files used outside local development, tickets,
logs, screenshots, or workflow payloads. Rotate the provider key and internal
token independently. Revoke a suspected provider key first, disable the gateway,
replace the secret reference, restart the gateway only, and run the recorded plus
live smoke suites before re-enabling traffic.

## Model roles and price truth

Workflows request a role, not a provider model ID. The environment mapping is:

| Role | Default OpenAI mapping | Intended use |
| --- | --- | --- |
| `fast` | `gpt-5.6-luna` | low-latency bounded generation |
| `balanced` | `gpt-5.6-terra` | default workflow and agent generation |
| `quality` | `gpt-5.6-sol` | difficult generation and synthesis |
| `judge` | `gpt-5.6-sol` | evaluation and adjudication |

Embedding and moderation roles exist in the neutral contract but require a
separately approved mapping and adapter capability before use. Model IDs,
snapshots, capabilities, residency, and prices are versioned records. Prices are
never inferred: live mode refuses startup without an explicit price catalog
version and exact decimal rates. Usage is normalized to input, cached-input, and
output tokens, calculated with fixed 12-place decimal arithmetic, and stored with
the exact model and price version for later provider reconciliation.

Review current mappings against the official [model selection
guide](https://developers.openai.com/api/docs/guides/latest-model/) before changing
them. The implementation follows the official [Responses migration
guide](https://developers.openai.com/api/docs/guides/migrate-to-responses/) and
[Responses API reference](https://platform.openai.com/docs/api-reference/responses).

## Request and response controls

Every request carries a workspace, unique operation ID, immutable prompt and
policy versions, deadline, model role, residency, and `retention: no-store`.
OpenAI requests always set `store: false`; the safety identifier is a one-way
SHA-256 value salted only in the gateway. Provider metadata contains correlation
and version IDs, never raw prompts.

Structured results use strict JSON Schema at the provider and are validated again
inside the adapter. An explicitly completed but invalid result receives at most
one correction request. A second invalid result becomes typed `INVALID_OUTPUT`.
Refusal and incomplete results remain distinct from timeouts, policy denials, and
provider outages.

Input and output policy hooks may deny content with a stable operator reason code.
Workspace policy additionally enforces roles, providers, final cost, emergency
disable, and permitted residency. Unknown policy versions and missing mappings
fail closed.

## Reliability semantics

- Caller cancellation becomes `CANCELLED`; deadline expiry becomes `TIMEOUT`.
- Only failures explicitly classified as retryable and not provider-accepted are
  retried with bounded exponential backoff or `Retry-After`.
- A transport or server failure with an unknown provider outcome is never replayed.
  This prevents duplicate non-idempotent tool effects.
- Provider/model circuits open after the configured failure threshold and recover
  after the reset interval. Gateway-wide concurrency exhaustion returns a typed
  retryable limit.
- Results are deduplicated by workspace and operation ID for the process lifetime;
  durable invocation and charge records provide the persistent audit boundary.

## Telemetry and incident response

The observation hook emits phase, correlation ID, role, provider, exact model,
status/error code, latency, aggregate tokens, and decimal cost. It never emits
messages, tool arguments, parsed output, safety identity, or credential material.
Dashboards should aggregate health, latency, rate limit, errors, token/cost, and
refusal rates by the bounded role/provider/model dimensions. Do not use prompts,
workspace IDs, users, or operation IDs as metric labels.

For elevated errors: enable the emergency disable, inspect error classes and
circuit state, confirm deadlines and provider status, and replay only operations
whose recorded outcome is definitely pre-acceptance. For cost anomalies: disable
the affected role, compare exact model/price-version usage with the provider
statement, post an immutable reconciliation adjustment, and never rewrite the
original charge.

## Verification and external boundary

Run gateway unit/conformance tests, API integration, migrations/RLS, secret and
package-boundary scans, workflow-generation browser tests, and the full gate. The
recorded contract is valid engineering evidence. A live smoke test requires an
approved non-production provider project, retention/residency decision, budgets,
prices, and credential lifecycle. Until that exists, `EXT-004` remains
`BLOCKED_EXTERNAL`; recorded output must never be described as provider-verified.
