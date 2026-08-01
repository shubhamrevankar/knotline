# Knowledge provider connector operations

## Scope and truthful status

This runbook covers the Google Workspace knowledge, Notion, and Confluence Cloud adapters introduced in M23. Their complete deterministic read, source-selection, permission, structural extraction, action, receipt, conflict, uncertainty, and reconciliation contracts run against sanitized recorded fixtures. They are not live provider connections until their independent external gates pass:

| Provider | Engineering status | Live status | External gate |
|---|---|---|---|
| Google Drive, Docs, and Sheets | `RECORDED` | `BLOCKED_EXTERNAL` | `EXT-007` |
| Notion | `RECORDED` | `BLOCKED_EXTERNAL` | `EXT-009` |
| Confluence Cloud | `RECORDED` | `BLOCKED_EXTERNAL` | `EXT-009` |

Confluence Data Center is unsupported. Do not present Data Center parity unless an exact version, authentication mode, API surface, pagination, permission model, change contract, and action suite has a separate certification record.

## Security boundaries

- Provider credentials are resolved only through the credential proxy. Database and browser records contain `credential://` references, never tokens.
- Source selection is workspace-scoped, revisioned, and protected by PostgreSQL RLS. A stale selection update fails with a conflict.
- Permission and deletion changes take priority over content backlog. Search, citations, entity evidence, and agent context must fail closed while an authorization proof is stale.
- Provider HTML is treated as hostile. Scripts, event handlers, active frames/objects/forms, and JavaScript URLs are removed before text or preview use. Attachments still pass the M19 malware and quarantine pipeline.
- Every write binds connection, external account, exact target, expected version, content hash, risk, approval ID, broker operation ID, and stable idempotency key.
- A response-lost write is `UNCERTAIN`; it is reconciled by provider-visible identity/version/content hash before any retry. Version mismatch is `CONFLICT`, never overwrite.

## Source selection and fidelity

The picker supports all selectable sources or an explicit drive, folder, space, page, or database set. Include and exclude rules are normalized globs; exclusion wins. The UI displays estimated object count, disabled/unavailable sources, permission fidelity, recorded/live status, external gate, and provider limitations before saving.

Google citations retain document body coordinates and workbook/sheet/range coordinates. Hidden or protected sheets are excluded; formulas appear only under the configured policy. Unauthorized comments are excluded.

Notion citations retain page version, block ID, hierarchy path, and database properties. The integration share boundary is authoritative: a page not shared to the integration is unavailable.

Confluence citations retain cloud ID/space/page/version coordinates. Restrictions and inherited visibility must be preserved. Storage-format HTML is sanitized before text extraction or rendering.

## Provider action response

1. Inspect the immutable preview, target, expected version, content hash, risk, and approval evidence.
2. Confirm the operation entered through the M16 tool broker and has a stable idempotency key.
3. For `CONFIRMED`, verify provider object ID, provider version, visible hash, and receipt.
4. For `CONFLICT`, refresh the provider version, generate a new diff, and obtain a new approval. Never reuse the stale approval.
5. For `UNCERTAIN`, run reconciliation. Do not retry until provider state proves absence of the write.
6. For permission revocation, prioritize invalidation over content sync and verify stale authorization proofs can no longer serve the object.

## Rate limits and recovery

Honor provider retry headers, normalized quota/error kinds, adaptive polling, and the M22 provider/workspace fair scheduler. Cursor reset triggers bounded inventory reconciliation, not an unbounded full scan. Source removal creates tombstones and invalidates derived serving state. Account removal disables activity and begins governed local deletion.

## Verification

Run:

```sh
pnpm --filter @knotline/connector-sdk test
pnpm test:api
pnpm verify:migrations
pnpm verify:events
pnpm exec playwright test tests/e2e/connections.spec.ts
pnpm verify
```

The recorded suite certifies structural extraction, selection rules, exact citation coordinates, HTML sanitization, permission ordering, duplicate suppression, target/version conflict, response-lost write, provider-visible reconciliation, tenant isolation, and responsive accessibility. It does not satisfy `EXT-007` or `EXT-009`.

## Live certification checklist

Each provider advances independently. Record the developer application and non-production tenant, exact requested/granted scopes, API versions, test objects, cursor reset, webhook/subscription configuration, rate and export limits, permission revocation timing, provider-visible writes, reconciled receipts, delete evidence, terms/DPA approval, owner, run date, and review expiry. An unavailable provider must not advance another provider or an aggregate label.
