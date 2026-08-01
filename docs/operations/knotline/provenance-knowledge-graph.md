# Provenance knowledge graph operations

## Purpose and ownership

This runbook covers the M21 entity graph, provenance explorer, and knowledge administration surface. The knowledge-platform team owns graph ingestion, identity resolution, ACL safety, repair, and export. Security owns proof-key response; privacy owns governed export and deletion policy.

## Data model and invariants

- `knowledge_type_versions` contains immutable, versioned entity and relation schemas. Built-ins include person, team, organization, project, task, workflow, run, document, record, system, and decision. Custom keys use lowercase snake case. In-use versions are superseded, never destructively rewritten.
- `knowledge_entities` stores identity-only canonical metadata. Provider facts, user facts, inferences, and suggestions live separately in `knowledge_entity_facts` and retain confidence and validity intervals.
- Every fact and relation has at least one evidence row pointing to a source location or explicit user/system action. Content hashes and exact coordinates make changes detectable.
- Effective visibility is the intersection of all contributing evidence ACLs. Empty intersection means invisible. A title, count, conflict, alias, relation, or excerpt is not returned merely because another contributing source is readable.
- History, query receipts, and exported provenance packets are append-only. Merge and split actions retain reversible lineage.

## Entity resolution

Provider plus provider ID is the only automatic exact identity. The normalized identity hash is deterministic across display-name changes. Alias/name similarity can create a review candidate but never auto-merges. Scores below 0.72 create a new entity; ambiguous top scores within 0.08 stay pending. Review collisions, provider-ID changes, and false matches before accepting a merge.

Manual merge locks both entities in stable ID order, moves facts, aliases, and relations, marks the source merged, and records a change. Split creates a new entity and moves only selected fact/alias IDs. Never repair a false match by editing historical evidence.

## Traversal and provenance

Traversal requires a current workspace authorization proof. Limits are depth 4, 200 results, 40 edges per node, cycle detection, and server-side pagination. ACL predicates are applied before rows enter recursive traversal. The accessible outline and graph visualization must use the same returned node set.

A provenance packet links an entity fact or relationship to chunk/document coordinates or action receipts. Runtime lineage may additionally include connector sync, external record, tool effect, approval, agent version, and run references. Re-open each content reference under current authorization; stale proof or deleted evidence fails closed.

## Knowledge administration

`/app/knowledge` reports sources, index state, freshness, ACL epoch/expiry, and open fact conflicts. Repair workflow:

1. Confirm source is enabled and its latest file version is clean and processed.
2. Compare source checksum, parser/chunker/embedder version, index generation, and ACL epoch.
3. Advance or refresh ACL before reindexing; never serve a building generation.
4. Request fenced reindex. Promote only after counts, hashes, permission samples, citation samples, and entity extraction checks pass.
5. For stale or failed sources, disable serving first, preserve historical lineage, then delete through the governed deletion workflow.

## Alerts and response

- `graph_acl_denied_total` increase: expected after revocation; verify no response metadata remains.
- `graph_query_truncated_total` increase: inspect fan-out and advise narrower relation filters; do not raise global limits ad hoc.
- `graph_resolution_collision_total` increase: pause auto-ingestion for the affected provider/type and review provider-ID stability.
- `graph_orphan_evidence_total > 0`: stop graph promotion and repair/deactivate affected facts.
- `graph_query_p95_ms` above budget: inspect recursive query receipt, indexes, type filter, and noisy tenant. Keep depth/result caps.
- `graph_conflict_open_age` above policy: route to a steward; never silently choose a value.

## Deletion and access revocation

Local grant revocation takes effect in the committing transaction and revokes current proofs. Provider-origin revocation must converge within five minutes. Deleted documents disable source evidence and derived graph visibility; historical packets retain only what policy allows. Offline/client caches must discard protected graph payloads on expiry, reconnect, logout, or invalidation.

## Verification

Run `pnpm --filter @knotline/knowledge-graph test`, `pnpm test:api`, `pnpm verify:migrations`, and `pnpm exec playwright test tests/e2e/knowledge-graph.spec.ts`. Production promotion additionally requires provider-connected ACL revocation evidence from later connector milestones.
