# Developer platform operations

The public API is a separately contracted `/public/v1` boundary. Only explicitly allowlisted operations may be registered there; browser, membership, session, enterprise identity, provider callback, support, billing callback, guest, and operator routes are forbidden. Public responses use the standard error envelope, API version, request ID, rate-limit headers, and idempotency where mutations are accepted.

Service credentials contain a leak-safe prefix and 256-bit secret. Cleartext is displayed exactly once; storage contains only the verifier. Rotation creates a new credential and gives the old credential a ten-minute overlap before revocation. Revocation is immediate for new authorization decisions. Never log authorization headers, tokens, signing secrets, OAuth codes, or PKCE verifiers.

Outgoing webhooks sign `timestamp.raw-body` with a versioned HMAC secret. Delivery identity is stable across retries, while an explicit replay gets a new idempotency key and records its parent attempt. Disable an endpoint after repeated terminal failures or suspected takeover. Secret rotation must retain a bounded overlap and expose the active signature version.

The public OpenAPI document is generated from implementation contracts. An undocumented public route, response, or breaking schema change fails CI. Examples use placeholder hosts and environment variables. The compatibility promise is additive within a major version, with changelog, migration guidance, `Deprecation`/`Sunset` headers, and the declared support window before removal.
