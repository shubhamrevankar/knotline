# Enterprise identity and residency operations

Enterprise SAML and OIDC connections remain drafts until an administrator completes a non-locking test. Activation is a separate transition and must preserve named break-glass accounts. SAML is SP initiated: bind the connection, AuthnRequest ID, one-time RelayState, exact ACS, browser nonce, environment, and clean return target. Reject unsolicited assertions and any mismatch, replay, expiry, or untrusted signature.

Domain ownership uses a one-time DNS challenge. Verification does not enforce SSO; enforcement is a revisioned `none`, `discover`, or `required` policy with an effect preview. A failed test must never lock out owners.

SCIM credentials are shown once and stored only as verifiers. Rotation revokes the prior token and issues a new bounded credential. Provisioning resources use stable external IDs, weak ETags, idempotent updates, pagination, normalized SCIM errors, protected-owner constraints, and deactivation that terminates sessions and governed programmatic credentials.

Enterprise rules progress from `dry_run` through `staged` to `enforced`; exceptions have the narrowest precedence and always carry reason, owner, and expiry. Policy decisions and identity lifecycle changes emit audit records.

United States and European Union are the supported home regions. Region migrations are durable workflows: eligibility, freeze/change capture, encrypted copy, validation, cutover, rollback window, old-copy purge, and signed proof. Real IdP, SCIM, and region-provider certification remains externally blocked and is never inferred from fixtures.
