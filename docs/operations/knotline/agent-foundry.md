# Agent foundry operations

## Scope and truth boundary

The M14 foundry stores governed, provider-neutral agent definitions and immutable
versions. Its test console is a deterministic fixture renderer. Every result is
persisted and displayed as `SIMULATED`; it performs no model or tool invocation
and is not valid evidence of provider execution. Real model execution activates
only through the separately governed model gateway.

## Data ownership and invariants

- Every record is workspace-scoped and protected by forced PostgreSQL row-level
  security. Private definitions are additionally owner-visible.
- Draft writes use an expected revision. A stale writer receives a conflict and
  must reload before merging.
- Published definitions, reusable schema versions, and activity events are
  append-only. Workflows bind an exact version or a governed release channel.
- Archive is rejected while any workflow, template, or agent version has an
  active version reference.
- Product definitions select capability roles (`fast`, `balanced`, `reasoning`,
  or `vision`), never provider model identifiers.
- Prompt fixture values are JSON encoded and wrapped in explicit `<data>`
  boundaries. Missing and type-invalid variables are reported before publish.
- Production tool declarations are invalid until the tool broker is available;
  high and critical risk tools require human approval.

## Routine checks

Run the contract/property suite, migration and repository suite, agent browser
suite, and bundle budget. Confirm that the event registry contains agent create,
draft update, publish, simulation, and archive events. Inspect the data-store
registry after every schema change.

## Conflict and recovery

For `STALE_AGENT_DRAFT`, preserve the local draft, fetch the new revision, show a
semantic section diff, and require an explicit merge before retrying. Never
blindly overwrite a newer revision. A failed publish leaves the draft unchanged.
If publishing commits but the client loses its response, read the version list
and compare the canonical content hash before retrying; duplicate content is not
published twice.

## Security response

For suspected cross-workspace access, disable foundry mutations, preserve audit
and activity events, record the request ID, and run the tenant-isolation suite.
For an unsafe definition, deprecate its release channel, identify version
references, and migrate dependants before archive. Published history must never
be edited or deleted during incident response.

## Simulation diagnostics

The simulation record captures the source version or draft revision, fixture,
rendered prompt layers, validation findings, token estimate, deterministic
output, actor, and time. A result lacking `execution_class = SIMULATED` is invalid
and must not be displayed. Simulation data should not contain secrets; use typed
non-sensitive fixtures and remove accidental sensitive data under the workspace
retention procedure.
