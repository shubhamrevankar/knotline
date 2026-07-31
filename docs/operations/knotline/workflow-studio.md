# Workflow studio operations and keyboard reference

## Scope

The Knotline workflow studio edits the current versioned draft at
`/app/workflows/:workflowId/studio`. It supports all ten workflow step kinds,
conditional typed connections, synchronized canvas and outline editing,
optimistic concurrency, encrypted same-session crash recovery, and responsive
operation without drag-only controls.

## Save and conflict behavior

- Every command updates a local immutable reducer state and enters the undo log.
- A 900 ms quiet period autosaves the complete canonical draft with `If-Match`.
- The header announces saved, saving, invalid, offline, or conflict state.
- A `409` or `412` never overwrites the remote revision. The editor encrypts the
  local graph with an ephemeral AES-GCM session key and offers an explicit server
  reload. Other network failures use the same encrypted recovery path.
- Recovery ciphertext is stored locally, while its key remains session-scoped.
  Clearing the session or completing a save removes recoverable content.
- Validation findings link back to the affected step or connection and focus its
  inspector. Errors block readiness but do not destroy draft edits.

## Keyboard reference

| Shortcut | Action |
|---|---|
| `Tab` / `Shift+Tab` | Traverse palette, outline, inspector, and canvas controls |
| `Cmd/Ctrl+S` | Save immediately |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+C` | Copy selected steps |
| `Cmd/Ctrl+V` | Paste copied steps |
| `Delete` / `Backspace` | Delete selected steps and attached edges |
| `?` | Open the shortcut sheet |

The outline exposes selection, duplication, deletion, edge selection, and every
typed inspector without requiring pointer dragging. On narrow screens it appears
before the canvas; the searchable palette and inspector remain fully available.

## Large graphs

The canvas culls off-screen elements. Deterministic layout runs in a module worker,
with a synchronous fallback if worker construction is unavailable. The reference
performance contract is a 500-step graph laid out in less than 250 ms locally.

## Support triage

1. Capture the content-free request ID and workflow/version/revision identifiers.
2. Confirm whether the header says offline, conflict, or invalid.
3. For conflict, preserve the encrypted local recovery until the builder chooses
   the server draft or intentionally reapplies the local edits.
4. Never request raw node configuration, credentials, connection secrets, or
   recovery storage values in a support ticket.
