# Tool broker, credential proxy, and sandbox operations

## Security boundary

Agents never call tool adapters, provider endpoints, secret backends, or the code
sandbox directly. They send a canonical request to the authenticated internal tool
broker. Only the broker process may read a provider credential. It resolves an
opaque secret reference immediately before adapter execution, injects the value in
memory, and recursively replaces it in outputs and receipts before data leaves the
process. Credential list surfaces return provider, account label, scopes, owner,
rotation state, and last use only; they omit the secret reference as well as the
secret value.

Development secrets use AES-256-GCM with a separately supplied local key. Deployed
environments use the injected Secrets Manager/KMS adapter and never persist secret
material in PostgreSQL. Refreshes are serialized per credential. Revoked or
reduced-scope credentials fail closed, and rotation changes the secret reference or
backend version without changing agent definitions.

## Policy and external effects

Every invocation binds workspace, principal, immutable agent version, optional
workflow version, environment, connection, credential, data classification,
budget, and approval. The registry additionally binds tool version, schemas, risk,
idempotency class, side-effect class, scopes, destination allowlist, limits, and
deprecation state. Global, workspace, agent, and tool switches deny new work.

High-risk, destructive, financial, public, privileged, and non-idempotent actions
require a recorded approval. The durable external-operation protocol uses one
logical operation ID, SHA-256 request hash, provider account/destination binding,
monotonic fence, provider request/idempotency ID, immutable send/receipt records,
and reconciliation state. A duplicate with a different hash is rejected. A crash
or reset after possible provider acceptance becomes `uncertain`; operators must
reconcile it and the broker never blindly repeats it.

## Network and payload controls

Outbound URLs permit only HTTP(S), no URL credentials, and an exact or wildcard
allowlisted hostname. DNS is resolved and every address is checked at each request
and redirect hop. Loopback, unspecified, private, link-local, multicast, reserved,
IPv6 loopback/link-local/ULA, alternate-IP encodings, empty DNS results, and mixed
public/private answers are denied. Adapters must reject redirects before following
them unless the destination is revalidated. Input/output byte caps, strict schemas,
timeouts, content-type allowlists, and malware/file-boundary checks apply before
model-visible output.

## Sandbox

The sandbox is a dedicated non-root container with a read-only root filesystem,
`no-new-privileges`, all Linux capabilities dropped, a no-execute 16 MB temporary
filesystem, process/memory/CPU limits, and no platform credentials. It is attached
only to an internal Compose network shared with the API, so it has no public
egress. The JavaScript 24.18.1 runtime executes in a fresh child process with a 64
MB heap and then in a VM context that exposes only a structured clone of input and
a no-op console. `process`, `require`, `fetch`, string code generation, WebAssembly,
package installation, and host file mounts are unavailable. Deadline or output
overflow kills the child; teardown happens on every terminal path.

The container is the isolation boundary; the VM is defense in depth. Deployed
images must replace the local image label with the immutable registry digest that
was scanned and admitted. Package installation stays disabled unless a future
policy names a digest-pinned package set and separate builder boundary.

## Operations

For suspected credential exposure: globally disable tools, revoke the provider
credential, rotate the backend value and broker token, scan logs/events/receipts,
then run the credential-canary suite before restoring scoped traffic. For uncertain
effects: keep the operation fenced, query the provider by request/receipt ID,
append the reconciliation outcome, and resume only from the reconciled state.

For sandbox pressure: disable new sandbox admissions, inspect timeout/exit/resource
metrics, preserve only sanitized manifests, and destroy affected containers. Never
mount a Docker socket, cloud metadata credential, workspace source tree, or general
network into a sandbox.

Verification includes broker policy matrices, credential canaries, refresh races,
SSRF fixtures, external-operation crash windows, sandbox escape/resource tests,
RLS and immutable receipt checks, container policy, browser agent-tool selection,
and the complete quality gate. A live model-requested tool smoke remains part of
`EXT-004`; deployed cloud sandbox/vault evidence remains part of `EXT-002`. Both
stay `BLOCKED_EXTERNAL` until real approved environments produce receipts.
