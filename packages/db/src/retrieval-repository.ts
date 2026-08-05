import { createHash } from "node:crypto";

import {
  authorizationProofRequestSchema,
  knowledgeIndexRequestSchema,
  knowledgeSearchRequestSchema
} from "@knotline/contracts";
import {
  chunkDocument,
  deterministicEmbedding,
  normalizeQuery,
  signAuthorizationProof,
  verifyAuthorizationProof
} from "@knotline/retrieval";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { createId } from "./values.js";

const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const proofHash = (value: string) => createHash("sha256").update(value).digest("hex");
const vectorLiteral = (values: readonly number[]) => `[${values.join(",")}]`;

export interface RetrievalRepository {
  indexDocument(
    context: TenantContext,
    documentId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  mintAuthorizationProof(
    context: TenantContext,
    input: unknown
  ): Promise<{ proof: string; expiresAt: string }>;
  search(context: TenantContext, input: unknown, debug?: boolean): Promise<Record<string, unknown>>;
  openCitation(
    context: TenantContext,
    manifestId: string,
    chunkId: string,
    proof: string
  ): Promise<Record<string, unknown>>;
  advanceAcl(
    context: TenantContext,
    sourceId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  reindex(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  deleteDocument(context: TenantContext, documentId: string): Promise<{ removedChunks: number }>;
}

export class PostgresRetrievalRepository implements RetrievalRepository {
  readonly #keyId = "retrieval-local-v1";
  readonly #keys: ReadonlyMap<string, Buffer>;

  constructor(
    private readonly pool: Pool,
    proofSigningKey: Buffer
  ) {
    if (proofSigningKey.byteLength < 32) throw new Error("AUTHORIZATION_PROOF_KEY_TOO_SHORT");
    this.#keys = new Map([[this.#keyId, proofSigningKey]]);
  }

  async indexDocument(context: TenantContext, documentId: string, input: unknown) {
    const value = knowledgeIndexRequestSchema.parse(input);
    const observedAt = Date.parse(value.acl.observedAt);
    const expiresAt = Date.parse(value.acl.expiresAt);
    if (expiresAt <= Date.now() || expiresAt - observedAt > 300_000)
      throw new HumanTaskAuthorizationError("ACL_PROJECTION_STALE");
    return withTenantTransaction(this.pool, context, async (client) => {
      const file = await client.query<{ owner_id: string; state: string; checksum: string }>(
        `SELECT file.owner_id,file.state,version.checksum FROM files file
         JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=$3
         WHERE file.workspace_id=$1 AND file.id=$2 AND file.deleted_at IS NULL AND version.malware_state='clean' FOR UPDATE OF file`,
        [context.workspaceId, documentId, value.version]
      );
      if (!file.rows[0] || !["processing", "ready"].includes(file.rows[0].state))
        throw new HumanTaskAuthorizationError("DOCUMENT_NOT_INDEXABLE");
      if (file.rows[0].checksum !== value.sourceChecksum)
        throw new HumanTaskConflictError("DOCUMENT_CHECKSUM_MISMATCH");
      let generation = (
        await client.query<{ id: string }>(
          `SELECT id FROM knowledge_index_generations WHERE workspace_id=$1 AND state='active' FOR UPDATE`,
          [context.workspaceId]
        )
      ).rows[0];
      if (!generation) {
        generation = { id: createId() };
        await client.query(
          `INSERT INTO knowledge_index_generations(workspace_id,id,state,reason,parser_version,chunker_version,embedder_version,created_by,activated_at)
           VALUES($1,$2,'active','full',$3,$4,$5,$6,clock_timestamp())`,
          [
            context.workspaceId,
            generation.id,
            value.parserVersion,
            value.chunkerVersion,
            value.embedderVersion,
            context.principalId
          ]
        );
      }
      const priorEpoch = await client.query<{ epoch: string }>(
        `SELECT max(projection.epoch) epoch FROM knowledge_acl_projections projection
         JOIN knowledge_sources source ON source.workspace_id=projection.workspace_id AND source.id=projection.source_id
         WHERE source.workspace_id=$1 AND source.document_id=$2`,
        [context.workspaceId, documentId]
      );
      if (Number(priorEpoch.rows[0]?.epoch ?? 0) >= value.acl.epoch)
        throw new HumanTaskConflictError("ACL_EPOCH_ROLLBACK");
      await client.query(
        `UPDATE knowledge_sources SET state='superseded' WHERE workspace_id=$1 AND document_id=$2 AND state='ready'`,
        [context.workspaceId, documentId]
      );
      const sourceId = createId();
      await client.query(
        `INSERT INTO knowledge_sources(workspace_id,id,document_id,document_version,generation_id,source_type,owner_id,title,source_checksum,parser_version,chunker_version,embedder_version,classification,state,indexed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'indexing',clock_timestamp())`,
        [
          context.workspaceId,
          sourceId,
          documentId,
          value.version,
          generation.id,
          value.sourceType,
          file.rows[0].owner_id,
          value.title,
          value.sourceChecksum,
          value.parserVersion,
          value.chunkerVersion,
          value.embedderVersion,
          value.classification
        ]
      );
      const aclHash = digest(
        JSON.stringify({
          subjects: [...value.acl.subjects].sort(),
          groups: [...value.acl.groups].sort(),
          revision: value.acl.providerRevision
        })
      );
      await client.query(
        `INSERT INTO knowledge_acl_projections(workspace_id,source_id,epoch,projection_hash,provider_revision,complete,authoritative,observed_at,expires_at)
         VALUES($1,$2,$3,$4,$5,true,true,$6,$7)`,
        [
          context.workspaceId,
          sourceId,
          value.acl.epoch,
          aclHash,
          value.acl.providerRevision,
          value.acl.observedAt,
          value.acl.expiresAt
        ]
      );
      for (const subjectId of value.acl.subjects)
        await client.query(
          `INSERT INTO knowledge_acl_members(workspace_id,source_id,epoch,subject_kind,subject_id) VALUES($1,$2,$3,'user',$4)`,
          [context.workspaceId, sourceId, value.acl.epoch, subjectId]
        );
      for (const groupId of value.acl.groups)
        await client.query(
          `INSERT INTO knowledge_acl_members(workspace_id,source_id,epoch,subject_kind,subject_id) VALUES($1,$2,$3,'group',$4)`,
          [context.workspaceId, sourceId, value.acl.epoch, groupId]
        );
      let chunkCount = 0;
      let cacheHits = 0;
      for (const [sectionOrdinal, section] of value.sections.entries()) {
        const sectionId = createId();
        await client.query(
          `INSERT INTO knowledge_document_sections(workspace_id,id,source_id,ordinal,coordinate,content_hash,text_content,tags)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.workspaceId,
            sectionId,
            sourceId,
            sectionOrdinal,
            JSON.stringify(section.coordinate),
            digest(section.text),
            section.text,
            section.tags
          ]
        );
        const chunks = chunkDocument([section], {
          maximumCharacters: 1_600,
          overlapCharacters: 200,
          tableRowsPerChunk: 25
        });
        for (const chunk of chunks) {
          const cached = await client.query<{ embedding: string }>(
            `SELECT embedding::text FROM knowledge_embedding_cache WHERE workspace_id=$1 AND content_hash=$2 AND embedder_version=$3`,
            [context.workspaceId, chunk.contentHash, value.embedderVersion]
          );
          const embedding =
            cached.rows[0]?.embedding ?? vectorLiteral(deterministicEmbedding(chunk.text));
          if (cached.rows[0]) cacheHits += 1;
          else
            await client.query(
              `INSERT INTO knowledge_embedding_cache(workspace_id,content_hash,embedder_version,dimensions,embedding) VALUES($1,$2,$3,16,$4::vector) ON CONFLICT DO NOTHING`,
              [context.workspaceId, chunk.contentHash, value.embedderVersion, embedding]
            );
          await client.query(
            `INSERT INTO knowledge_chunks(workspace_id,id,source_id,section_id,generation_id,ordinal,text_content,content_hash,coordinate,tags,injection_signals,token_count,embedding)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector)`,
            [
              context.workspaceId,
              createId(),
              sourceId,
              sectionId,
              generation.id,
              chunkCount,
              chunk.text,
              chunk.contentHash,
              JSON.stringify(chunk.coordinate),
              chunk.tags,
              chunk.injectionSignals,
              Math.max(1, Math.ceil(chunk.text.length / 4)),
              embedding
            ]
          );
          chunkCount += 1;
        }
      }
      await client.query(
        `UPDATE knowledge_sources SET state='ready' WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, sourceId]
      );
      await client.query(
        `UPDATE knowledge_index_generations SET source_count=(SELECT count(*) FROM knowledge_sources WHERE workspace_id=$1 AND generation_id=$2 AND state='ready'),chunk_count=(SELECT count(*) FROM knowledge_chunks WHERE workspace_id=$1 AND generation_id=$2) WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, generation.id]
      );
      await client.query(
        `INSERT INTO knowledge_embedding_usage(workspace_id,id,generation_id,embedder_version,input_count,input_tokens,cache_hits,retry_count,cost_decimal)
         VALUES($1,$2,$3,$4,$5,$6,$7,0,$8)`,
        [
          context.workspaceId,
          createId(),
          generation.id,
          value.embedderVersion,
          chunkCount,
          value.sections.reduce((sum, section) => sum + Math.ceil(section.text.length / 4), 0),
          cacheHits,
          ((chunkCount - cacheHits) * 0.000001).toFixed(12)
        ]
      );
      return {
        sourceId,
        generationId: generation.id,
        chunks: chunkCount,
        aclEpoch: value.acl.epoch
      };
    });
  }

  async mintAuthorizationProof(context: TenantContext, input: unknown) {
    const value = authorizationProofRequestSchema.parse(input);
    if (value.resourceId !== context.workspaceId)
      throw new HumanTaskAuthorizationError("AUTHORIZATION_PROOF_RESOURCE_FORBIDDEN");
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.#refreshOwnedAclProjections(client, context);
      const epoch = await this.#currentEpoch(client, context, value.groupIds);
      if (!epoch) throw new HumanTaskAuthorizationError("NO_CURRENT_KNOWLEDGE_GRANT");
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + 300_000);
      const groupHash = digest([...value.groupIds].sort().join(":"));
      const payload = {
        keyId: this.#keyId,
        workspaceId: context.workspaceId,
        subjectId: context.principalId,
        groupHash,
        resourceId: value.resourceId,
        aclEpoch: epoch.epoch,
        aclHash: epoch.hash,
        ...(value.deviceId ? { deviceId: value.deviceId } : {}),
        ...(value.sessionId ? { sessionId: value.sessionId } : {}),
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      };
      const proof = signAuthorizationProof(payload, this.#keys.get(this.#keyId)!);
      await client.query(
        `INSERT INTO knowledge_authorization_proofs(workspace_id,proof_hash,key_id,subject_id,group_hash,group_ids,resource_id,acl_epoch,acl_hash,device_id,session_id,issued_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          context.workspaceId,
          proofHash(proof),
          this.#keyId,
          context.principalId,
          groupHash,
          value.groupIds,
          value.resourceId,
          epoch.epoch,
          epoch.hash,
          value.deviceId ?? null,
          value.sessionId ?? null,
          payload.issuedAt,
          payload.expiresAt
        ]
      );
      return { proof, expiresAt: payload.expiresAt };
    });
  }

  async search(context: TenantContext, input: unknown, debug = false) {
    const value = knowledgeSearchRequestSchema.parse(input);
    const started = Date.now();
    return withTenantTransaction(this.pool, context, async (client) => {
      const proof = await this.#proof(client, context, value.authorizationProof);
      const epoch = await this.#currentEpoch(client, context, proof.group_ids);
      if (!epoch) throw new HumanTaskAuthorizationError("NO_CURRENT_KNOWLEDGE_GRANT");
      verifyAuthorizationProof(value.authorizationProof, this.#keys, {
        workspaceId: context.workspaceId,
        subjectId: context.principalId,
        resourceId: context.workspaceId,
        ...(proof.device_id ? { deviceId: proof.device_id } : {}),
        ...(proof.session_id ? { sessionId: proof.session_id } : {}),
        minimumAclEpoch: epoch.epoch,
        now: new Date()
      });
      const normalized = normalizeQuery(value.query);
      const queryVector = vectorLiteral(deterministicEmbedding(normalized));
      const rows = await client.query<{
        source_id: string;
        document_id: string;
        document_version: number;
        chunk_id: string;
        title: string;
        text_content: string;
        coordinate: Record<string, unknown>;
        content_hash: string;
        classification: string;
        indexed_at: Date;
        generation_id: string;
        acl_hash: string;
        keyword_score: number;
        semantic_score: number;
      }>(
        `SELECT source.id source_id,source.document_id,source.document_version,chunk.id chunk_id,source.title,chunk.text_content,chunk.coordinate,
          chunk.content_hash,source.classification,source.indexed_at,source.generation_id,acl.projection_hash acl_hash,
          ts_rank_cd(chunk.search_vector,websearch_to_tsquery('simple',$2))::float8 keyword_score,
          (1-(chunk.embedding<=>$3::vector))::float8 semantic_score
         FROM knowledge_chunks chunk
         JOIN knowledge_sources source ON source.workspace_id=chunk.workspace_id AND source.id=chunk.source_id AND source.state='ready'
         JOIN knowledge_index_generations generation ON generation.workspace_id=chunk.workspace_id AND generation.id=chunk.generation_id AND generation.state='active'
         JOIN knowledge_acl_projections acl ON acl.workspace_id=source.workspace_id AND acl.source_id=source.id AND acl.authoritative AND acl.complete AND acl.expires_at>clock_timestamp()
         WHERE chunk.workspace_id=$1
           AND EXISTS(SELECT 1 FROM knowledge_acl_members member WHERE member.workspace_id=acl.workspace_id AND member.source_id=acl.source_id AND member.epoch=acl.epoch AND ((member.subject_kind='user' AND member.subject_id=$4) OR (member.subject_kind='group' AND member.subject_id=ANY($5::uuid[]))))
           AND ($6::uuid[] IS NULL OR source.id=ANY($6)) AND ($7::text[] IS NULL OR source.source_type=ANY($7))
           AND ($8::uuid[] IS NULL OR source.owner_id=ANY($8)) AND ($9::text[] IS NULL OR source.classification=ANY($9))
           AND ($10::timestamptz IS NULL OR source.indexed_at>=$10)
           AND ($11='semantic' OR chunk.search_vector@@websearch_to_tsquery('simple',$2) OR (1-(chunk.embedding<=>$3::vector))>0.25)
         ORDER BY CASE WHEN $11='keyword' THEN ts_rank_cd(chunk.search_vector,websearch_to_tsquery('simple',$2)) WHEN $11='semantic' THEN 1-(chunk.embedding<=>$3::vector) ELSE ts_rank_cd(chunk.search_vector,websearch_to_tsquery('simple',$2))+(1-(chunk.embedding<=>$3::vector)) END DESC,chunk.id
         LIMIT $12`,
        [
          context.workspaceId,
          normalized,
          queryVector,
          context.principalId,
          proof.group_ids,
          value.sourceIds ?? null,
          value.sourceTypes ?? null,
          value.ownerIds ?? null,
          value.classifications ?? null,
          value.updatedAfter ?? null,
          value.mode,
          Math.min(200, value.limit * 5)
        ]
      );
      let tokenCount = 0;
      const candidateCount = rows.rowCount ?? rows.rows.length;
      const sourceCounts = new Map<string, number>();
      const selected = rows.rows
        .filter((row) => {
          const tokens = Math.max(1, Math.ceil(row.text_content.length / 4));
          const count = sourceCounts.get(row.source_id) ?? 0;
          if (tokenCount + tokens > value.tokenLimit || count >= 3) return false;
          tokenCount += tokens;
          sourceCounts.set(row.source_id, count + 1);
          return true;
        })
        .slice(0, value.limit);
      const manifestId = createId();
      const latencyMs = Math.max(0, Date.now() - started);
      await client.query(
        `INSERT INTO knowledge_retrieval_manifests(workspace_id,id,principal_id,generation_id,query_hash,policy_snapshot,selected_chunk_ids,excluded_counts,scoring_version,permission_proof_hash,latency_ms)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'hybrid-rrf-v1',$9,$10)`,
        [
          context.workspaceId,
          manifestId,
          context.principalId,
          selected[0]?.generation_id ?? (await this.#activeGeneration(client, context.workspaceId)),
          digest(normalized),
          JSON.stringify({
            mode: value.mode,
            limit: value.limit,
            tokenLimit: value.tokenLimit,
            filters: {
              sourceIds: value.sourceIds,
              sourceTypes: value.sourceTypes,
              ownerIds: value.ownerIds,
              tags: value.tags,
              classifications: value.classifications,
              connectorIds: value.connectorIds,
              updatedAfter: value.updatedAfter
            },
            debug
          }),
          selected.map((row) => row.chunk_id),
          JSON.stringify({ authorization: 0, contextBudget: candidateCount - selected.length }),
          proofHash(value.authorizationProof),
          latencyMs
        ]
      );
      return {
        manifestId,
        corpusGeneration:
          selected[0]?.generation_id ?? (await this.#activeGeneration(client, context.workspaceId)),
        normalizedQueryHash: digest(normalized),
        results: selected.map((row) => ({
          sourceObjectId: row.source_id,
          documentId: row.document_id,
          documentVersion: row.document_version,
          chunkId: row.chunk_id,
          title: row.title,
          snippet: row.text_content.slice(0, 500),
          coordinate: row.coordinate,
          score: Number((row.keyword_score + row.semantic_score).toFixed(8)),
          scoreBreakdown: { keyword: row.keyword_score, semantic: row.semantic_score },
          contentHash: row.content_hash,
          permissionEvidenceHash: digest(`${row.acl_hash}:${context.principalId}`),
          classification: row.classification,
          freshness: row.indexed_at.toISOString(),
          previewUrl: `/v1/documents/${row.document_id}/citations?chunkId=${row.chunk_id}`
        })),
        exclusions: { authorization: 0, contextBudget: candidateCount - selected.length },
        latencyMs,
        ...(debug
          ? {
              debug: {
                query: normalized,
                candidates: candidateCount,
                tokenCount,
                injectionSignalsAreUntrusted: true
              }
            }
          : {})
      };
    });
  }

  async openCitation(context: TenantContext, manifestId: string, chunkId: string, proof: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const stored = await this.#proof(client, context, proof);
      const epoch = await this.#currentEpoch(client, context, stored.group_ids);
      if (!epoch) throw new HumanTaskAuthorizationError("CITATION_PERMISSION_REVOKED");
      verifyAuthorizationProof(proof, this.#keys, {
        workspaceId: context.workspaceId,
        subjectId: context.principalId,
        resourceId: context.workspaceId,
        ...(stored.device_id ? { deviceId: stored.device_id } : {}),
        ...(stored.session_id ? { sessionId: stored.session_id } : {}),
        minimumAclEpoch: epoch.epoch,
        now: new Date()
      });
      const row = (
        await client.query<Record<string, unknown>>(
          `SELECT chunk.id chunk_id,chunk.coordinate,chunk.text_content,chunk.content_hash,source.document_id,source.document_version,source.title,source.state,source.classification
         FROM knowledge_retrieval_manifests manifest JOIN knowledge_chunks chunk ON chunk.workspace_id=manifest.workspace_id AND chunk.id=ANY(manifest.selected_chunk_ids)
         JOIN knowledge_sources source ON source.workspace_id=chunk.workspace_id AND source.id=chunk.source_id
         JOIN knowledge_acl_projections acl ON acl.workspace_id=source.workspace_id AND acl.source_id=source.id AND acl.authoritative AND acl.complete AND acl.expires_at>clock_timestamp()
         WHERE manifest.workspace_id=$1 AND manifest.id=$2 AND manifest.principal_id=$3 AND chunk.id=$4 AND source.state='ready'
           AND EXISTS(SELECT 1 FROM knowledge_acl_members member WHERE member.workspace_id=acl.workspace_id AND member.source_id=acl.source_id AND member.epoch=acl.epoch AND ((member.subject_kind='user' AND member.subject_id=$3) OR (member.subject_kind='group' AND member.subject_id=ANY($5::uuid[]))))`,
          [context.workspaceId, manifestId, context.principalId, chunkId, stored.group_ids]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("CITATION_UNAVAILABLE");
      await client.query(
        `INSERT INTO knowledge_citation_accesses(workspace_id,id,manifest_id,chunk_id,principal_id,outcome,permission_proof_hash) VALUES($1,$2,$3,$4,$5,'opened',$6)`,
        [
          context.workspaceId,
          createId(),
          manifestId,
          chunkId,
          context.principalId,
          proofHash(proof)
        ]
      );
      return row;
    });
  }

  async advanceAcl(context: TenantContext, sourceId: string, input: unknown) {
    const value = z
      .object({
        epoch: z.number().int().positive(),
        providerRevision: z.string().min(1),
        subjects: z.array(z.uuid()),
        groups: z.array(z.uuid()).default([]),
        observedAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        reason: z.string().min(1)
      })
      .strict()
      .parse(input);
    if (
      Date.parse(value.expiresAt) <= Date.now() ||
      Date.parse(value.expiresAt) - Date.parse(value.observedAt) > 300_000
    )
      throw new HumanTaskAuthorizationError("ACL_PROJECTION_STALE");
    return withTenantTransaction(this.pool, context, async (client) => {
      const prior = (
        await client.query<{ epoch: string }>(
          `SELECT epoch FROM knowledge_acl_projections WHERE workspace_id=$1 AND source_id=$2 AND authoritative FOR UPDATE`,
          [context.workspaceId, sourceId]
        )
      ).rows[0];
      if (!prior) throw new HumanTaskConflictError("ACL_SOURCE_NOT_FOUND");
      if (value.epoch <= Number(prior.epoch))
        throw new HumanTaskConflictError("ACL_EPOCH_ROLLBACK");
      await client.query(
        `UPDATE knowledge_acl_projections SET authoritative=false,invalidation_reason=$3 WHERE workspace_id=$1 AND source_id=$2 AND authoritative`,
        [context.workspaceId, sourceId, value.reason]
      );
      const hash = digest(
        JSON.stringify({
          subjects: [...value.subjects].sort(),
          groups: [...value.groups].sort(),
          revision: value.providerRevision
        })
      );
      await client.query(
        `INSERT INTO knowledge_acl_projections(workspace_id,source_id,epoch,projection_hash,provider_revision,complete,authoritative,predecessor_epoch,observed_at,expires_at) VALUES($1,$2,$3,$4,$5,true,true,$6,$7,$8)`,
        [
          context.workspaceId,
          sourceId,
          value.epoch,
          hash,
          value.providerRevision,
          prior.epoch,
          value.observedAt,
          value.expiresAt
        ]
      );
      for (const id of value.subjects)
        await client.query(
          `INSERT INTO knowledge_acl_members(workspace_id,source_id,epoch,subject_kind,subject_id) VALUES($1,$2,$3,'user',$4)`,
          [context.workspaceId, sourceId, value.epoch, id]
        );
      for (const id of value.groups)
        await client.query(
          `INSERT INTO knowledge_acl_members(workspace_id,source_id,epoch,subject_kind,subject_id) VALUES($1,$2,$3,'group',$4)`,
          [context.workspaceId, sourceId, value.epoch, id]
        );
      await client.query(
        `UPDATE knowledge_authorization_proofs SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND revoked_at IS NULL`,
        [context.workspaceId]
      );
      const invalidationId = createId();
      await client.query(
        `INSERT INTO knowledge_permission_invalidations(workspace_id,id,source_id,prior_epoch,next_epoch,reason,cache_deadline,completed_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '5 minutes',clock_timestamp())`,
        [context.workspaceId, invalidationId, sourceId, prior.epoch, value.epoch, value.reason]
      );
      return { invalidationId, epoch: value.epoch };
    });
  }

  async reindex(context: TenantContext, input: unknown) {
    const value = z
      .object({
        mode: z.enum([
          "full",
          "incremental",
          "changed_version",
          "parser_upgrade",
          "chunker_upgrade",
          "embedder_upgrade",
          "acl_only",
          "delete"
        ]),
        parserVersion: z.string().min(1),
        chunkerVersion: z.string().min(1),
        embedderVersion: z.string().min(1)
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const generationId = createId();
      const jobId = createId();
      await client.query(
        `INSERT INTO knowledge_index_generations(workspace_id,id,state,reason,parser_version,chunker_version,embedder_version,created_by) VALUES($1,$2,'building',$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          generationId,
          value.mode,
          value.parserVersion,
          value.chunkerVersion,
          value.embedderVersion,
          context.principalId
        ]
      );
      await client.query(
        `INSERT INTO knowledge_reindex_jobs(workspace_id,id,generation_id,mode,state,created_by) VALUES($1,$2,$3,$4,'queued',$5)`,
        [context.workspaceId, jobId, generationId, value.mode, context.principalId]
      );
      return {
        jobId,
        generationId,
        state: "queued",
        servingGeneration: await this.#activeGeneration(client, context.workspaceId)
      };
    });
  }

  async deleteDocument(context: TenantContext, documentId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const sources = await client.query<{ id: string }>(
        `UPDATE knowledge_sources SET state='deleted',deleted_at=clock_timestamp() WHERE workspace_id=$1 AND document_id=$2 AND state<>'deleted' RETURNING id`,
        [context.workspaceId, documentId]
      );
      let removedChunks = 0;
      for (const source of sources.rows) {
        removedChunks += Number(
          (
            await client.query<{ count: string }>(
              `SELECT count(*) count FROM knowledge_chunks WHERE workspace_id=$1 AND source_id=$2`,
              [context.workspaceId, source.id]
            )
          ).rows[0]?.count ?? 0
        );
        await client.query(
          `UPDATE knowledge_acl_projections SET authoritative=false,invalidation_reason='document_deleted' WHERE workspace_id=$1 AND source_id=$2 AND authoritative`,
          [context.workspaceId, source.id]
        );
      }
      await client.query(
        `UPDATE knowledge_authorization_proofs SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND revoked_at IS NULL`,
        [context.workspaceId]
      );
      return { removedChunks };
    });
  }

  async #proof(client: PoolClient, context: TenantContext, proof: string) {
    const row = (
      await client.query<{
        group_ids: string[];
        device_id: string | null;
        session_id: string | null;
      }>(
        `SELECT group_ids,device_id,session_id FROM knowledge_authorization_proofs WHERE workspace_id=$1 AND proof_hash=$2 AND subject_id=$3 AND expires_at>clock_timestamp() AND revoked_at IS NULL`,
        [context.workspaceId, proofHash(proof), context.principalId]
      )
    ).rows[0];
    if (!row) throw new HumanTaskAuthorizationError("AUTHORIZATION_PROOF_INVALID");
    return row;
  }

  async #currentEpoch(client: PoolClient, context: TenantContext, groupIds: readonly string[]) {
    const row = (
      await client.query<{ epoch: string; hash: string }>(
        `SELECT max(acl.epoch)::text epoch,$4::text hash FROM knowledge_acl_projections acl
       WHERE acl.workspace_id=$1 AND acl.authoritative AND acl.complete AND acl.expires_at>clock_timestamp()
         AND EXISTS(SELECT 1 FROM knowledge_acl_members member WHERE member.workspace_id=acl.workspace_id AND member.source_id=acl.source_id AND member.epoch=acl.epoch AND ((member.subject_kind='user' AND member.subject_id=$2) OR (member.subject_kind='group' AND member.subject_id=ANY($3::uuid[]))))
       HAVING count(*)>0`,
        [
          context.workspaceId,
          context.principalId,
          groupIds,
          digest(`${context.workspaceId}:${context.principalId}:${[...groupIds].sort().join(":")}`)
        ]
      )
    ).rows[0];
    return row ? { epoch: Number(row.epoch), hash: row.hash } : undefined;
  }

  async #refreshOwnedAclProjections(client: PoolClient, context: TenantContext) {
    const stale = await client.query<{ source_id: string; epoch: string }>(
      `SELECT source.id source_id,acl.epoch::text
         FROM knowledge_sources source
         JOIN knowledge_acl_projections acl
           ON acl.workspace_id=source.workspace_id
          AND acl.source_id=source.id
          AND acl.authoritative
          AND acl.complete
        WHERE source.workspace_id=$1
          AND source.owner_id=$2
          AND source.state='ready'
          AND acl.expires_at<=clock_timestamp()+interval '30 seconds'
        FOR UPDATE OF acl`,
      [context.workspaceId, context.principalId]
    );
    let refreshed = false;
    for (const source of stale.rows) {
      const members = await client.query<{ subject_kind: "user" | "group" | "workspace"; subject_id: string }>(
        `SELECT subject_kind,subject_id
           FROM knowledge_acl_members
          WHERE workspace_id=$1 AND source_id=$2 AND epoch=$3
          ORDER BY subject_kind,subject_id`,
        [context.workspaceId, source.source_id, source.epoch]
      );
      const nextEpoch = Math.max(Date.now(), Number(source.epoch) + 1);
      const providerRevision = `owned-source:${source.source_id}:${String(nextEpoch)}`;
      const projectionHash = digest(
        JSON.stringify({
          members: members.rows.map(({ subject_kind, subject_id }) => ({
            kind: subject_kind,
            id: subject_id
          })),
          revision: providerRevision
        })
      );
      await client.query(
        `UPDATE knowledge_acl_projections
            SET authoritative=false,invalidation_reason='owned_source_refresh'
          WHERE workspace_id=$1 AND source_id=$2 AND epoch=$3 AND authoritative`,
        [context.workspaceId, source.source_id, source.epoch]
      );
      const now = new Date();
      await client.query(
        `INSERT INTO knowledge_acl_projections(
           workspace_id,source_id,epoch,projection_hash,provider_revision,complete,authoritative,
           predecessor_epoch,observed_at,expires_at
         ) VALUES($1,$2,$3,$4,$5,true,true,$6,$7,$8)`,
        [
          context.workspaceId,
          source.source_id,
          nextEpoch,
          projectionHash,
          providerRevision,
          source.epoch,
          now.toISOString(),
          new Date(now.getTime() + 300_000).toISOString()
        ]
      );
      for (const member of members.rows)
        await client.query(
          `INSERT INTO knowledge_acl_members(
             workspace_id,source_id,epoch,subject_kind,subject_id
           ) VALUES($1,$2,$3,$4,$5)`,
          [
            context.workspaceId,
            source.source_id,
            nextEpoch,
            member.subject_kind,
            member.subject_id
          ]
        );
      refreshed = true;
    }
    if (refreshed)
      await client.query(
        `UPDATE knowledge_authorization_proofs
            SET revoked_at=clock_timestamp()
          WHERE workspace_id=$1 AND subject_id=$2 AND revoked_at IS NULL`,
        [context.workspaceId, context.principalId]
      );
  }

  async #activeGeneration(client: PoolClient, workspaceId: string) {
    const row = (
      await client.query<{ id: string }>(
        `SELECT id FROM knowledge_index_generations WHERE workspace_id=$1 AND state='active'`,
        [workspaceId]
      )
    ).rows[0];
    if (!row) throw new HumanTaskConflictError("KNOWLEDGE_INDEX_NOT_READY");
    return row.id;
  }
}
