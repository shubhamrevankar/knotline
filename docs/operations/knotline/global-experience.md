# Installable, guest, help, and support experience

The installable web app caches only the public shell allowlist. API responses, approvals, credentials, tokens, billing, guest sessions, and customer content are always network-only. A service-worker update waits safely, removes obsolete caches on activation, and accepts explicit purge on sign-out or device revocation. Offline drafts and background synchronization are not enabled until device-bound encryption, a five-minute authorization/key lease, reconnect reauthorization, conflict UI, and deletion proof are available.

Guest invitations bind one email/domain, exact resource, actions, expiry, maximum uses, and a verifier stored only as a hash. The fragment is exchanged on the no-referrer guest page, immediately removed with `replaceState`, and never sent to third-party assets. Guest sessions cannot browse workspace navigation, search, members, unrelated metadata, or sequential resources.

Support cases retain category, severity, reporter, consent, messages, status, assignment, and timestamps. Diagnostic bundles first show a redacted preview; collection begins only after explicit consent and expires after 24 hours. Exclude secrets and customer content by default.

Contact submissions validate purpose, email, message, consent version, and a honeypot, then return an honest durable queue receipt. Provider routing may be queued or retrying; it is never described as delivered without a routing receipt.

Help, status, trust, accessibility, and legal publications are versioned surfaces. Human linguistic, legal, pricing, physical-device, accessibility, and usability certification remains blocked by the declared external/environment gates; automated fixtures do not satisfy those reviews.
