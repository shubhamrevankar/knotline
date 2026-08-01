# Billing, entitlements, usage, and spend controls

## Scope and authority

The durable M10 admission reservation and ledger remain the admission authority. M29 adds commercial catalog, subscription projection, customer budgets, invoice references, and a fixed-precision usage ledger; it does not create a competing run-admission path. Raw card data is never accepted or stored.

Provider billing is externally gated by `EXT-005`. Local and CI modes use deterministic fixtures and explicitly return `fixture_only`; they must never be presented as a live provider checkout or portal. Webhook processing must verify exact raw bytes before parsing, deduplicate provider event IDs, reject the wrong endpoint locator/environment, and apply only causally newer projection data.

## Spend-stop procedure

1. Confirm workspace, budget period, current committed/reserved usage, and the operator's billing role.
2. Record a reason and invoke the spend-stop API. This fences new paid admission through the existing `budget_periods.spend_stop` field.
3. Do not release unknown provider-use reservations. Reconcile them when authoritative usage arrives.
4. Resume only after recording a new reason and confirming debt, thresholds, and entitlement version.

## Reconciliation

Every invoice-relevant entry carries a source, idempotency key, meter, exact decimal quantity and amount, currency, and immutable price/FX version. Reconciliation compares provider invoice lines with summed immutable source operations and records residuals rather than silently rounding intermediate values. Customer views label freshness, partial data, forecast method, adjustments, enterprise-contract mode, and provider outages.

## Failure handling

- Cached entitlement policy may be used only until its explicit safe expiry; hard paid work fails closed after expiry.
- Duplicate or reordered provider events remain receipts but do not roll projection state backward.
- Payment failure follows configured grace; grace is visible in every decision.
- A failed spend-stop is an incident because new cost may be incurred. Activate the runtime control switch if the billing fence cannot be proven.
- Finance ledger adjustment APIs require the platform finance duty plane and stay disabled in shared/live environments until its workforce identity gate activates.
