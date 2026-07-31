# Collaboration and conflict operations

## Scope

Milestone M09 provides durable workflow discussions, authorized mentions,
reactions, attachment references, following, product activity, optional
presence, share links, and explicit concurrent-edit recovery. Notification
intents are durable; channel delivery is activated in M27.

## Authorization and isolation

- Every thread operation first authorizes the resource in its workspace.
- Mention targets must have an active membership in the same workspace. Unknown
  and cross-workspace identifiers return a generic authorization failure and do
  not disclose membership.
- Thread, comment, mention, reaction, follow, activity, intent, and saved-filter
  rows are protected by workspace RLS.
- Share URLs contain only an internal resource path. Opening the URL performs
  ordinary resource authorization; possession of a URL grants no access.
- Run and task resource types remain inactive until their authoritative schemas
  arrive in M10 and M12.

## Comment lifecycle

Comments accept bounded Markdown and render an allowlisted representation. Raw
HTML and unsafe URL schemes are escaped. Attachments are references to already
authorized file objects, never inline executable content. Authors may edit
within 15 minutes. Deletion creates a tombstone, preserving thread shape while
removing the body and attachment references. Moderation metadata is separate
from the immutable security audit.

Mentions and followed-resource changes write notification intents in the same
database transaction as the collaboration mutation. Retries use stable database
identities. M27 consumes those intents into authorized channels.

## Activity and audit separation

The product activity stream is an explanatory, mutable projection for members.
It may follow product retention and deletion policies. Security audit records
remain append-only and are never rewritten by comment edits or deletion.

## Concurrent workflow editing

Workflow saves use an expected version/ETag. A conflict never silently replaces
either side. The studio fetches the durable remote version and shows changed
sections. Operators can:

1. reload the collaborator version;
2. compare the local base, local draft, and remote document; or
3. reapply only independently changed top-level sections.

If both sides changed the same section, the reapply operation reports that
section as a conflict and keeps the local recovery copy. Presence is only a
short-lived hint and is never consulted for correctness.

## Operational checks

Run the following from the repository with the workspace-local public package
configuration:

```sh
pnpm test:property
pnpm test:api
pnpm exec playwright test tests/e2e/collaboration.spec.ts tests/e2e/workflow-studio.spec.ts
pnpm verify:migrations
pnpm verify
```

Investigate failures by request ID, workspace ID, resource type/id, thread ID,
comment ID, expected workflow version, and content-free finding code. Do not log
comment bodies, attachment content, or mention search text.

## Recovery

- If presence is unavailable, continue normal ETag-protected editing.
- If notification delivery is unavailable, retain pending intents for M27's
  bounded retry/dead-letter processing; do not roll back the comment.
- If a collaboration mutation commits but the response is lost, reload the
  thread before retrying and use the returned durable state.
- For a conflicting workflow save, preserve the encrypted local recovery copy
  until the user reloads or resolves all conflicting sections.

