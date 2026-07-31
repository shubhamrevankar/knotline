# Knotline authentication and session security

## Scope and status

M04 owns customer email magic-link authentication, Google OIDC, root sessions,
personal session controls, profile preferences, CSRF/CORS controls, secure
callback handling, recent-auth primitives, and email delivery-event storage.
The local and CI path is fully runnable using the capture mailer and local OIDC
provider. Production email delivery and Google consent/application approval are
external gates `EXT-006` and `EXT-007`; neither is represented as live before
provider evidence exists.

This is the customer identity plane. It must never share cookies, issuers,
clients, keys, subjects, or session tables with the platform-operator plane
introduced later.

## Trust boundaries

| Boundary | Accepted credential | Important rejection rule |
|---|---|---|
| `/edge/v1/auth/*` | Narrow one-time request or browser-bound result | Never accepts an ambient workspace identity as proof of an external callback |
| `/callbacks/v1/identity/oauth/google` | Provider code plus durable state transaction | Never creates a browser session and never redirects a provider credential to the application |
| `/v1/*` | `__Host-knotline-session` plus CSRF for mutations | Tenant and principal are derived from the authenticated session, never a caller header |
| local capture/fake provider | Local and CI environment only | Routes are absent outside local/CI construction |

Fastify does not trust proxy headers by default. Non-local environments must
provide one reviewed `KNOTLINE_TRUSTED_PROXY` CIDR/address; forwarding headers
are accepted only from that source. CORS uses one exact configured
web origin with credentials and a narrow method/header list. Responses set a
deny-by-default CSP, `frame-ancestors 'none'`, `nosniff`, `no-referrer`, and a
restrictive permissions policy. Production adds preload-capable HSTS.

## Email magic-link flow

1. The browser posts normalized email, intent, and an allowlisted return-target
   ID. The public response is always `202 {"accepted":true}` for a syntactically
   valid address.
2. Durable one-hour rate windows independently cap source IP and normalized
   identity. The identity key, IP, and token are SHA-256 hashes of high-entropy
   or normalized values; raw token material is not persisted.
3. A 256-bit token is delivered in the URL fragment of
   `/auth/magic/callback`. It expires after 15 minutes and is bound to its
   intent and return-target ID.
4. The callback reads the fragment once, immediately calls `replaceState`, and
   posts the token in a JSON body. Ordinary application assets do not need the
   credential.
5. PostgreSQL locks and consumes the token atomically. Expiry, wrong intent,
   tampering, replay, and concurrent double-consumption fail without issuing a
   session.
6. Unknown and known addresses follow the same outward response. A new user is
   created without revealing whether a prior identity existed. Workspace
   creation belongs to M05.

Local/CI delivery is available only through the capture mailer. Non-local
delivery uses SES v2. `auth_email_deliveries` stores the provider message ID and
delivery state; `applyEmailDeliveryEvent` supplies the durable delivered,
bounced, complained, and failed transition foundation. Bounce and complaint
transitions create personal security notifications. Provider webhook
verification and live deliverability evidence remain part of `EXT-006` and the
deployment milestone.

## Google OIDC flow

Authorization start generates independent 256-bit state, nonce, PKCE verifier,
authorization locator, and browser initiation binding. The transaction binds:

- provider, exact client application, and environment;
- byte-exact registered callback URI;
- state and nonce hashes;
- an S256 PKCE verifier hash plus AES-256-GCM ciphertext;
- host-only HttpOnly initiation-cookie hash;
- requested scopes, expiry, and exact return-target ID.

The callback atomically consumes the transaction before exchange. The remote
Google adapter exchanges the code server-side, selects an RSA key by `kid` from
the configured JWKS, requires `RS256`, and verifies the compact JWT signature.
The authentication service then requires exact issuer, audience containing the
configured client, nonce hash, unexpired token, sane issue time, non-empty
subject, normalized email, and verified-email claim. Provider/application/
environment/callback mismatches fail as IdP mix-up attempts.

Successful callback validation creates a distinct short-lived authorization
result. The row contains no provider code or token. The provider callback
redirects only a random result handle in the fragment to the isolated
application callback. Result exchange requires the original initiation cookie,
transaction/browser binding, expiry, success result, and atomic one-time
consumption. Cross-browser exchange, callback replay, and result replay fail.

## Session model

The browser credential is `session UUID.random verifier`. Only the verifier
hash is stored. A session contains user, family, optional active workspace,
issued/last-used times, 12-hour idle expiry, 30-day absolute expiry, device/IP
summaries, recent step-up time, and revocation reason/time.

Refresh locks the verifier and session, marks the old verifier `rotated`,
inserts exactly one new active verifier, advances idle expiry without exceeding
absolute expiry, and rotates CSRF. Reuse of any rotated verifier revokes every
session in the family, revokes its active verifiers, and writes a
`session_reuse` security notification. Simultaneous refresh therefore has one
winner; a replaying loser triggers family revocation rather than silently
creating parallel authority.

Account suspension is checked on each authenticated request and revokes the
family. Idle/absolute expiry, individual revoke, revoke-others, and logout are
server-side changes and take effect on the next API/SSE authentication check.
The `assertRecentAuthentication` primitive requires a bounded `lastStepUpAt`
for future sensitive actions; a step-up magic intent creates a session carrying
that fact.

## Cookie and CSRF contract

| Cookie | JavaScript | Attributes | Purpose |
|---|---|---|---|
| `__Host-knotline-session` | HttpOnly | Secure, SameSite=Lax, Path=/, no Domain | Opaque rotating session credential |
| `__Host-knotline-auth-init` | HttpOnly | Secure, SameSite=Lax, Path=/, no Domain, 10-minute expiry | OAuth browser initiation binding |
| `__Host-knotline-csrf` | readable | Secure, SameSite=Lax, Path=/, no Domain | Double-submit mutation token only; not authentication |

Every cookie-authenticated mutation requires the exact configured `Origin` and
a timing-safe match between the CSRF header and cookie. Refresh rotates both
the session verifier and CSRF token. Logout or current-session revocation emits
zero-age session and CSRF cookies.

No auth credential is stored in local storage, session storage, analytics, or
error tracking. Request logging is disabled; completion logs include only
method, route template, status, timing, request ID, and trace ID. Cookie,
authorization, and CSRF headers are redacted if logger request data is ever
added. Callback logs use the route template, never query values.

## Secrets and environment

- `AUTH_TRANSACTION_ENCRYPTION_KEY`: high-entropy, independently rotated key
  for authorization PKCE ciphertext; use secret-manager injection outside
  local/CI.
- `GOOGLE_OIDC_CLIENT_ID`, issuer, authorization endpoint, token endpoint, and
  JWKS URI: exact environment-specific application registration.
- `AWS_SES_REGION` and `AUTH_EMAIL_FROM`: approved SES identity and region.
- Database runtime role: no superuser or `BYPASSRLS`; it receives only explicit
  identity-table and safe identity-workspace-function grants.

Never reuse production registrations, keys, or sender identities in local,
preview, CI, staging, recovery, or another company environment.

## Operations and incident response

For suspected verifier theft:

1. Revoke the session or all user sessions and confirm active verifier rows are
   revoked.
2. Inspect `security_notifications`, session family, device summary, and safe
   request correlation data. Do not copy cookie values into a ticket.
3. If reuse occurred, treat the entire family as compromised. Preserve audit
   evidence and notify the user through the security channel.
4. If widespread, disable sign-in mutations, rotate transaction encryption
   material, and invalidate affected sessions. Do not restore a verifier.

For provider mix-up or callback anomalies, disable the affected provider
application, preserve authorization transaction/result rows, verify exact
environment/client/callback configuration, and keep email sign-in available
only if independent evidence says it is safe.

For SES bounce/complaint spikes, stop repeated delivery to affected identities,
inspect sender reputation and provider events, and keep the public response
non-enumerating.

## Verification

`pnpm test:auth` runs against a pinned, localhost-only PostgreSQL 17 container
and proves magic expiry, replay, intent binding, atomic races, two-dimensional
rate limits, cookie attributes, authenticated bootstrap, CSRF/origin rejection,
session rotation/reuse family revocation, security notifications, Google
state/nonce/S256 PKCE, issuer/audience/nonce/expiry/verified-identity negative
cases, callback/result replay, browser binding, clean redirects, and strict
CORS. Unit tests independently exercise RSA/JWKS signature acceptance and
tampering rejection. Playwright covers email, local Google, and session
inventory journeys on desktop and mobile, along with accessibility and clean
callback URLs.

The integration-owned API/auth orchestration and browser auth pages are
excluded from the unit-coverage denominator because the live PostgreSQL and
browser lanes execute their real boundaries. Unit thresholds remain unchanged
for unit-owned modules; the M04 gate requires all three lanes.
