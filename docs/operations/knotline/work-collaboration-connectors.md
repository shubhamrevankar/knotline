# Work, source control, collaboration, and publishing connectors

## Support state

Linear, Jira Cloud, GitHub App, Slack, Microsoft Teams through Microsoft Graph, and X have complete deterministic recorded contracts. They are not labelled live. Production use remains blocked independently by `EXT-010`, `EXT-011`, `EXT-012`, `EXT-008`, and `EXT-014`. A pass for one provider never advances another provider.

The catalog exposes provider account, required and optional scopes, objects, actions, permission fidelity, region, limitations, and external gate before authorization. X actions are derived from the configured API tier; an unavailable read, publish, or delete operation must not be rendered or accepted.

## Security invariants

- Resolve provider identities only by a verified identifier or explicit administrator binding. Never infer identity from a display name.
- Fetch target metadata at execution. A cached snapshot may support browsing, but an expired snapshot is never writable. Reject an account or revision mismatch.
- Every write captures provider, account, exact target, semantic diff, content hash, scope, risk, approval mode, idempotency strategy, and compensation limit before broker execution.
- Escape HTML and provider control syntax. Neutralize mass mentions. Apply attachment malware, size, and content policy before handoff.
- Process permission revocations and deletions ahead of content changes. Permission-bearing content is searchable only when exact ACL fidelity is enabled and `ACL-REVOKE-1` meets NFR-023.
- Treat lost provider responses as `UNCERTAIN`. Reconcile by native idempotency key or deterministic receipt lookup before any retry.

## GitHub App webhook routing

The application endpoint verifies the raw request with the environment-specific GitHub App secret before reading an installation ID. It then selects exactly one historical binding matching application, environment, installation, and event time. Zero or multiple matches are quarantined. Bindings are versioned across uninstall/reinstall; installation IDs cannot be rebound across workspaces. Delivery deduplication is installation scoped.

Never route from unsigned payload fields, account labels, repository names, or current-only installation state. Quarantine substitution, disabled-installation, delayed ambiguous, and cross-workspace events with payload hash only.

## Provider-specific checks

- Linear: constrain team/workspace, pagination, webhook ordering, issue/comment mutation receipts, and reduced scopes.
- Jira Cloud: refresh custom fields and transition metadata, bound JQL construction, validate site/project/issue target, and detect transition conflicts.
- GitHub: restrict installation repositories and permissions, validate branch base SHA, and require approval for branch/PR/review/check writes.
- Slack: distinguish public and private channel scopes, verify signing timestamp/signature, bind interactive user identity, and neutralize special mentions.
- Microsoft Teams: record tenant consent and delegated/application mode, respect team/channel/file permission inheritance, and validate interactive identity.
- X: show tier, cost/rate limits, and policy constraints; require approval for publish/delete and reconcile by returned post ID or deterministic content lookup.

## Incident response

Pause only the affected connection. Preserve operation and webhook receipts, metadata revision, binding version, normalized provider error, and correlation IDs. Never log OAuth tokens, signing secrets, message bodies, file contents, or raw provider payloads. Reauthorize on scope loss; quarantine ambiguous webhooks; reconcile uncertain writes; require a new preview and approval after metadata or provider-version conflict.

## Certification

The recorded suite must enumerate every manifest object/action and cover pagination, update, deletion, rate limiting, ACL priority, stale metadata, wrong account, missing scope, unsafe rich text, duplicate/conflict/partial or uncertain writes, reconciliation, and identity binding. The GitHub corpus additionally covers two tenants and installations, signature-before-routing, substitution, replay, uninstall/reinstall, delayed delivery, and historical selection.

Production certification must run the same journeys in the named provider sandbox, retain redacted receipts, meet `ACL-REVOKE-1`, and record the exact manifest/API version and expiry. Until the corresponding external row reaches its required terminal state, UI and APIs must report `BLOCKED_EXTERNAL`.
