# Environment-promotion manifest

Every shared-environment promotion supplies a validated
`EnvironmentPromotionManifest` from `@knotline/operations`. The same immutable
artifact digest advances between environments; rebuilding for production is
not promotion.

Required fields are:

- target environment and artifact commit/SHA-256 digest;
- fail-closed defaults for external writes and expensive work, plus typed flag
  defaults;
- an exact smoke journey, command, synthetic tenant, and expected result;
- rollback procedure and quantitative triggers;
- alerts, accountable owner, responder contact, and runbook;
- every applicable external gate with state and required/optional status;
- the truthful public capability label.

`assertPromotionManifest` is the blocking gate. Production rejects a required
external gate unless it is `PRODUCTION_VERIFIED` or explicitly
`NOT_APPLICABLE`; the latter must be justified in the external-gate ledger.
Verified gate states carry an evidence reference, and `NOT_APPLICABLE` entries
carry a manifest justification. A `LIVE` label does not weaken this rule and is
invalid for a non-production target; `BETA` is invalid below staging.

## Operator procedure

1. Resolve the immutable candidate commit and artifact digest.
2. Validate the manifest and verify that approvals refer to those exact values.
3. Confirm dashboards, alerts, kill switches, rollback access, and responder
   availability before changing traffic or feature cohorts.
4. Deploy with risky work at its safe default, run the declared smoke journey,
   then start the observation window.
5. Activate only the approved cohort. Record timestamps, results, alert state,
   and the deployed digest as promotion evidence.
6. If a rollback trigger fires, stop expansion, engage the applicable kill
   switch, run the rollback procedure, and reconcile in-flight operations.

If validation or evidence is incomplete, keep the current environment and
public label unchanged. A successful local build is engineering evidence, not
staging or production verification.
