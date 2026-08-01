# Permission-aware retrieval operations

## Scope and guarantees

This runbook owns document indexing, deterministic chunking, embedding, hybrid search, authorization proofs, citation materialization, ACL invalidation, reindexing, and deletion propagation. Retrieval is fail-closed: no title, count, snippet, score, coordinate, source-health fact, or citation metadata is returned unless the source has a complete authoritative ACL projection observed within five minutes and the caller presents a current signed proof.

The local implementation uses the provider-neutral model role contract and a deterministic 16-dimensional fixture embedder. Live provider embeddings remain blocked by EXT-004. The schema and cost records are identical for fixture and live adapters; dimensions and embedder version must match the active generation.

## Data path

1. A clean, ready immutable file version is submitted to document indexing.
2. Source checksum, file version, parser, chunker, embedder, classification, owner, and ACL revision are validated in one tenant transaction.
3. Sections retain page, sheet, slide, line, image, or semantic-section coordinates and immutable content hashes.
4. `deterministic-v1` chunks normalized text at stable boundaries, preserves overlap and table row groups, records tags and prompt-injection signals, and hashes each chunk.
5. Embeddings are batched by the adapter contract, cached by content hash plus embedder version, dimension checked, and charged to `knowledge_embedding_usage`. Fixture cost is still recorded.
6. Chunks enter the active generation only after source and ACL rows are durable. A reindex creates a separate `building` generation; the existing `active` generation remains authoritative until an explicit verified promotion.
7. Search normalizes the query, verifies the proof, prefilters by workspace, source state, active generation, classification, freshness, and current ACL membership, then computes lexical and vector candidates and deterministic hybrid ranking.
8. Context packing enforces overall token and per-source diversity limits. Retrieved instructions remain untrusted data; injection signals never modify system or agent policy.
9. The immutable retrieval manifest records only the query hash, policy/filter snapshot, selected chunk IDs, exclusion counts, scoring version, proof hash, and latency.
10. Citation open repeats proof, epoch, source-state, generation, and ACL checks before returning exact source version and coordinate.

## Authorization proof protocol

- The proof binds signing key ID, workspace, principal, group-resolution hash, resource namespace, ACL epoch/hash, optional device and session, issue time, and expiry.
- Lifetime is never more than five minutes. Unknown or retired key, signature mismatch, subject/workspace/resource/device/session substitution, epoch rollback, expiry, or a revoked persisted proof fails closed.
- Keys must be at least 256 bits. Outside local/CI, `AUTHORIZATION_PROOF_SIGNING_KEY` is required as base64 and must be sourced from the approved secret manager.
- Rotation introduces a new key ID, mints only with the new key, permits the prior verify-only key for at most the declared overlap, then retires it. Retired proofs fail immediately.
- Browser clients never extend a proof and must discard results, snippets, and open citations when refresh fails.

## ACL projection and `ACL-REVOKE-1`

Each projection has a strictly increasing epoch, complete flag, provider revision, predecessor, observation time, hard expiry, projection hash, and invalidation reason. An incomplete, out-of-order, expired, or rollback projection cannot become authoritative.

For a local grant removal, the transaction:

1. locks the authoritative projection;
2. verifies a higher epoch;
3. makes the prior projection non-authoritative;
4. writes the complete next membership set;
5. revokes every outstanding workspace retrieval proof;
6. writes a permission-invalidation record and five-minute downstream deadline;
7. commits before acknowledging success.

The reusable test corpus covers prepared search, cached result, open citation, cross-tenant principal, stale proof, epoch rollback, subject substitution, key retirement, and empty post-revocation results. Connector milestones add webhook, polling, backlog, and provider-revision cases to the same contract. Alert if `completed_at` is absent, if `cache_deadline` is crossed, or if `knowledge_permission_invalidation_lag_seconds` exceeds 120 seconds p95 or 300 seconds maximum.

## Ranking, evaluation, and capacity

- Keyword: PostgreSQL `websearch_to_tsquery('simple', query)` over a generated `tsvector` with a GIN index.
- Semantic: cosine distance over `pgvector` HNSW and the generation's exact embedder version/dimension.
- Hybrid: deterministic score fusion, stable ID tie-break, deduplication, maximum three chunks per source, and caller token budget.
- Filters: source, type, owner, date, tags, classification, and connector. Authorization is never implemented as a post-filter.
- Required evaluation dimensions: must-find recall@20, nDCG@10, citation correctness, ACL leakage, freshness, p50/p95 latency, tokens, embedding cache hit rate, and cost.
- `SEARCH-1M-M20` uses the canonical one-million-chunk seeded distribution. The local fixture proves query shape and plan selection; the launch-scale 100-million profile remains M36/M38 work.

## Reindex and cutover

Modes are `full`, `incremental`, `changed_version`, `parser_upgrade`, `chunker_upgrade`, `embedder_upgrade`, `acl_only`, and `delete`. A job owns exactly one building generation. Workers are idempotent by source checksum and component versions, keep cursors durable, reject dimension/version mismatch, and never mutate an active generation. Promotion requires complete source count, no failed batches, current ACL projections, evaluation thresholds, and a single transaction that retires the old generation and activates the new one. Rollback reverses the generation pointer without rebuilding.

## Failure handling

- Embedding outage: retry bounded batches with jitter; keep prior generation active; mark job failed after budget exhaustion.
- Partial batch/dimension mismatch: reject the entire batch and do not publish its source.
- ACL stale/incomplete: omit the source entirely and increment an authorization exclusion metric without revealing its identity.
- Search/index outage: source metadata browsing continues; retrieval-dependent agent dispatch waits or fails closed.
- Deleted/superseded source: new search excludes it; citation returns an honest unavailable reason without stale text.
- Prompt-injection signal: retain the signal as provenance, treat content as quoted data, and apply the agent policy unchanged.

## Deletion and reconciliation

Document deletion first changes every derived source to `deleted`, invalidates authoritative ACLs and proofs, and removes chunks from all serving queries. Durable source/file tombstones prevent restore resurrection. Reconciliation covers normalized sections, chunks, embeddings, caches, entity evidence, prepared agent context, exports, and citations under their retention policy. Audit/manifests retain hashes and identifiers only where policy requires and never retain deleted prohibited text.

## Metrics and alerts

Monitor search latency by warm/cold and mode, result/exclusion counts, zero-result rate, citation-open failures, ACL proof mint/verify/revoke counts, proof age, invalidation lag, embedding batch latency/retries/cache hit/cost, active/building generation age, failed reindex jobs, injection-signal rate, and deletion reconciliation backlog. Logs and traces use query/content/proof hashes and IDs only; raw queries, snippets, embeddings, and credentials are prohibited.

## Verification commands

Run `pnpm test:retrieval`, `pnpm verify:migrations`, `pnpm verify:query-plan`, `pnpm verify:events`, `pnpm verify:openapi`, the retrieval Playwright spec, and the universal gate. Production promotion also requires EXT-004 live embedding evidence and the later M36 scale profile.
