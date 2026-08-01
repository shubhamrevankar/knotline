# Secure files and document processing operations

## Scope

This runbook covers canonical files, immutable versions, resumable multipart
uploads, quota reservation, malware and content-policy scanning, quarantine,
document extraction, sanitized preview, one-time downloads, replacement,
retention, legal hold, and deletion. It extends the restricted M12 attachment
foundation for tasks, comments, runs, agents, knowledge, profile assets, and
exports.

## Upload and quota lifecycle

An upload request creates or selects one canonical file ID, reserves its full
declared byte count under a row lock, pins media type, checksum, classification,
part count, and expiry, and returns only workspace-private object-operation
coordinates. Duplicate idempotency keys return the original session. Each part
has an immutable number, size, SHA-256 checksum, and object-store ETag. Repeating
an identical part is safe; changing a recorded part fails with a conflict.

Completion requires the exact part set, total size, object checksum, and a
scanner attestation signed with `FILE_SCANNER_ATTESTATION_KEY`. Browser claims
of a clean scan are never trusted. Expired or incomplete sessions cannot consume
quota permanently. A periodic reconciler marks abandoned reservations expired
and releases their reserved bytes.

## Scan and quarantine policy

The scanner records engine and signature versions, detected media type,
signatures, archive depth, expanded bytes, password protection, and active
content. Malware, suspicious or unsupported results, extension/type mismatch,
archive depth/expansion limits, disallowed encryption, SVG/HTML active content,
and unrecognized formats fail closed. Quarantined/rejected versions cannot be
previewed, downloaded, processed, indexed, attached to model context, or copied
to a serving bucket.

The scanner attestation key must be at least 32 bytes, independently rotated,
and available only to the scanner and API verifier. During rotation, accept a
short, explicit prior-key window and record which version attested the scan.
Never log raw file bytes, scan secrets, download tokens, or extracted restricted
content.

## Processing and preview

Processing jobs pin file version, source checksum, parser and parser version.
Supported adapters cover PDF, text, Markdown, sanitized HTML, DOCX, PPTX,
XLSX/CSV, raster OCR, and common email exports. Sections retain page, sheet,
slide, section, line, or image coordinates plus content hashes, language,
warnings, and partial-support state. A retry creates a new attempt against the
same immutable version.

Only sanitized derived artifacts may be served as previews. PDF and safe
image/text types use sanitized output; office types produce a derived PDF;
other images produce a derived PNG. HTML, SVG, scripts, macros, embedded active
content, and arbitrary originals are never served inline. Preview remains
blocked while scanning, quarantined, rejected, failed, or deleted.

## Download authorization

Browsers receive no ordinary irrevocable object-store URL. They request a
60-second one-time token bound to workspace, principal, optional session,
current grant revision, exact immutable file version, and optional byte range.
The download proxy rechecks the active session/grant and file scan/lifecycle on
every consumption or range request, atomically consumes the token, uses a safe
content disposition and normalized filename, audits the result, and then reads
from a private origin. Reuse, expiry, revocation, deletion, quarantine, or
principal substitution fails closed.

## Replacement, retention, and deletion

Replacement retains the canonical file ID and appends a new immutable version;
historical runs and provenance continue referencing the old version. Current
serving state moves only after the replacement passes scan and processing.
Storage accounting includes every retained object version and derivative.

Deletion is denied under legal hold. Otherwise it atomically marks the file
deleted, revokes outstanding download tokens, purges unprotected derivatives,
reduces usage, writes a minimal checksum-hash tombstone, and emits a downstream
knowledge-deletion event. Raw objects and caches are deleted asynchronously
within the retention SLO. Tombstones contain no filename or extracted content.

## Monitoring and incident response

Track quota reservation age, failed parts, integrity mismatch, scanner latency,
quarantine rate by reason, parser latency and partial/failure rates by type,
preview generation, download-token denial/reuse, deletion lag, derivative purge
lag, and storage reconciliation drift. Alert on scanner attestation failures,
any quarantined content reaching processing/preview/download, quota underflow,
or deleted content remaining in a serving/index cache.

For a suspected scanner bypass, disable upload completion and preview/download,
rotate the scanner key, quarantine affected versions by attestation/key range,
revoke outstanding tokens, and rescan originals from the private quarantine
origin. For malicious content exposure, invalidate downstream knowledge and
agent context before restoring service.

## Verification

Run `pnpm test:files`, the PostgreSQL migration/API suite, registry/RLS checks,
security/event/contract verification, and `tests/e2e/files.spec.ts`. Verify
interrupted/duplicate/conflicting parts, quota races, scanner attestation,
malware/polyglot/archive/active-content cases, parser coordinates and warnings,
preview/download denial, token expiry and single use, immutable replacement,
legal hold, deletion/purge, usage reconciliation, mobile upload, and accessible
preview alternatives.

AWS object storage and deployed malware-scanner proof remain blocked by EXT-002.
Local verification uses only public package metadata, localhost containers,
workspace-owned configuration, and temporary directories.
