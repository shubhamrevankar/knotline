# Data and productivity connector operations

## Support state

Microsoft 365, Gmail/Calendar, Salesforce, HubSpot, S3-compatible storage, CSV import, generic REST, and signed webhooks have deterministic recorded contracts. Microsoft, Google, CRM, and S3 live claims are independently blocked by `EXT-008`, `EXT-007`, `EXT-013`, and `EXT-025`. CSV, REST, and generic webhook connections remain local-certification only until an explicit external dependency is registered.

## Access and identity

Record tenant/account, consent mode, granted scopes, delegated/shared resource grant, field/record or bucket/prefix restriction, direction, region, and destructive actions. Connection ownership never grants access to shared mailboxes, calendars, sites, drives, CRM fields/records, or object prefixes. Recheck grants during sync, before indexing, and immediately before every action. Process revocation ahead of content backlog and meet `ACL-REVOKE-1` before a permission-bearing capability can be live.

## Sync and reconciliation

- Microsoft Drive/OneDrive and Google Calendar/Gmail use durable delta/history tokens. Expiry or reset enters a bounded rescan; it never silently advances past unknown changes.
- Preserve message thread identity, calendar time zone, recurrence instance ID, CRM record/version, S3 object version/delete marker, and provider receipt.
- Schema changes pause affected mappings. Unknown write outcomes enter `UNCERTAIN`; reconcile provider state before retry.
- S3 endpoints require HTTPS, an exact origin allowlist, explicit bucket/prefix, server-side encryption, version identity, malware handoff, and redirect/private-network rejection.

## CSV imports

Preview encoding, delimiter, headers, inferred/overridden types, mappings, row errors, and upsert key. Neutralize spreadsheet formula cells. Persist checkpoints and row receipts for resume and deduplication. Rollback operates on one import batch and records each reversed row; it never deletes unrelated matching records.

## REST and webhook builders

Import only bounded OpenAPI operations under an exact HTTPS base-origin allowlist. Reject remote/malicious references, duplicate operation IDs, path traversal, oversized responses, pagination loops, secret echoes, unsafe redirects, and non-idempotent mutations without high-risk classification and approval. All execution flows through the broker, egress policy, schema validation, secret references, operation journal, and receipt reconciliation.

Webhook schemas are immutable versions. Verify the raw body against current or rotating prior secrets before parsing, enforce timestamp and delivery replay windows, retain payload hashes rather than secrets, and send exhausted outbound attempts to a visible DLQ. Redelivery preserves the logical delivery ID and increments the attempt.

## Incident response

Pause the affected resource or connection, preserve redacted cursor/schema/receipt evidence, and classify authentication, permission, schema drift, rate limit, provider outage, endpoint policy, or uncertain write. Never log tokens, secrets, raw mail/calendar content, CRM field values, file bodies, CSV rows, or webhook bodies. Reauthorize scope loss, bound token resets, quarantine invalid signatures, reconcile writes, and require renewed preview/approval after target or schema changes.
