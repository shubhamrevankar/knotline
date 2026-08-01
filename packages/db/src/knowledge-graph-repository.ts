import { createHash } from "node:crypto";
import {
  graphTraversalSchema,
  entityFactInputSchema,
  mergeEntitiesSchema,
  relationInputSchema,
  splitEntitySchema,
  upsertEntitySchema
} from "@knotline/contracts";
import { normalizeIdentity } from "@knotline/knowledge-graph";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { createId } from "./values.js";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const providerHash = (provider: string, providerId: string) =>
  hash(`${normalizeIdentity(provider)}\0${providerId}`);

interface EntitySummaryRow {
  readonly id: string;
  readonly type: string;
  readonly canonicalName: string;
  readonly revision: string;
  readonly updatedAt: Date;
}
interface EntityCore {
  readonly id: string;
  readonly type: string;
  readonly typeVersion: number;
  readonly canonicalName: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly state: string;
  readonly revision: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
type EntityProfile = EntityCore &
  Record<string, unknown> & {
    readonly aliases: readonly Record<string, unknown>[];
    readonly facts: readonly (Record<string, unknown> & { id: string })[];
    readonly conflicts: readonly Record<string, unknown>[];
    readonly history: readonly Record<string, unknown>[];
  };

export interface KnowledgeGraphRepository {
  list(context: TenantContext, query: unknown): Promise<Record<string, unknown>>;
  create(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  get(context: TenantContext, entityId: string): Promise<Record<string, unknown> | undefined>;
  patch(context: TenantContext, entityId: string, input: unknown): Promise<Record<string, unknown>>;
  relations(
    context: TenantContext,
    entityId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  addRelation(
    context: TenantContext,
    entityId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  merge(context: TenantContext, entityId: string, input: unknown): Promise<Record<string, unknown>>;
  split(context: TenantContext, entityId: string, input: unknown): Promise<Record<string, unknown>>;
  export(context: TenantContext, entityId: string, proof: string): Promise<Record<string, unknown>>;
  admin(context: TenantContext): Promise<Record<string, unknown>>;
  listTypes(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  publishType(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  deleteType(context: TenantContext, typeId: string): Promise<void>;
}

export class PostgresKnowledgeGraphRepository implements KnowledgeGraphRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: TenantContext, input: unknown) {
    const query = z
      .object({
        type: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        cursor: z.string().uuid().optional()
      })
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const rows = await client.query<EntitySummaryRow>(
        `SELECT entity.id,entity.type_key "type",entity.canonical_name "canonicalName",entity.revision,entity.updated_at "updatedAt"
         FROM knowledge_entities entity WHERE entity.workspace_id=$1 AND entity.state='active'
           AND ($2::text IS NULL OR entity.type_key=$2)
           AND ($3::text IS NULL OR entity.canonical_name ILIKE '%'||$3||'%')
           AND ($4::uuid IS NULL OR entity.id>$4)
         ORDER BY entity.id LIMIT $5`,
        [
          context.workspaceId,
          query.type ?? null,
          query.q ?? null,
          query.cursor ?? null,
          query.limit + 1
        ]
      );
      const items = rows.rows.slice(0, query.limit);
      return { items, nextCursor: rows.rows.length > query.limit ? items.at(-1)?.id : undefined };
    });
  }

  async create(context: TenantContext, input: unknown) {
    const value = upsertEntitySchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      if (value.provider && value.providerId) {
        const existing = await client.query<{ entity_id: string }>(
          `SELECT entity_id FROM knowledge_entity_aliases WHERE workspace_id=$1 AND provider=$2 AND provider_id=$3 AND state='active'`,
          [context.workspaceId, normalizeIdentity(value.provider), value.providerId]
        );
        if (existing.rows[0])
          return (await this.#profile(client, context, existing.rows[0].entity_id))!;
      }
      await this.#ensureType(client, context, value.type, "entity");
      const entityId = createId();
      await client.query(
        `INSERT INTO knowledge_entities(workspace_id,id,type_key,type_version,canonical_name,state,created_by) VALUES($1,$2,$3,1,$4,'active',$5)`,
        [context.workspaceId, entityId, value.type, value.canonicalName, context.principalId]
      );
      const aliases = [...new Set([value.canonicalName, ...value.aliases])];
      for (const [index, alias] of aliases.entries())
        await client.query(
          `INSERT INTO knowledge_entity_aliases(workspace_id,id,entity_id,alias,normalized_alias,provider,provider_id,provider_identity_hash,confidence,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
          [
            context.workspaceId,
            createId(),
            entityId,
            alias,
            normalizeIdentity(alias),
            index === 0 && value.provider ? normalizeIdentity(value.provider) : null,
            index === 0 ? (value.providerId ?? null) : null,
            index === 0 && value.provider && value.providerId
              ? providerHash(value.provider, value.providerId)
              : null,
            index === 0 ? 1 : 0.9
          ]
        );
      for (const fact of value.facts) await this.#insertFact(client, context, entityId, fact);
      await this.#change(client, context, entityId, 1, "created", undefined, {
        canonicalName: value.canonicalName
      });
      return (await this.#profile(client, context, entityId))!;
    });
  }

  async get(context: TenantContext, entityId: string) {
    return withTenantTransaction(this.pool, context, (client) =>
      this.#profile(client, context, entityId)
    );
  }

  async patch(context: TenantContext, entityId: string, input: unknown) {
    const value = z
      .object({
        canonicalName: z.string().trim().min(1).max(240).optional(),
        alias: z.string().trim().min(1).max(240).optional(),
        fact: entityFactInputSchema.optional(),
        revision: z.number().int().positive()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{ canonical_name: string; revision: string }>(
        `SELECT canonical_name,revision FROM knowledge_entities WHERE workspace_id=$1 AND id=$2 AND state='active' FOR UPDATE`,
        [context.workspaceId, entityId]
      );
      if (!current.rows[0]) throw new HumanTaskAuthorizationError("ENTITY_NOT_FOUND");
      if (Number(current.rows[0].revision) !== value.revision)
        throw new HumanTaskConflictError("ENTITY_REVISION_CONFLICT");
      if (value.canonicalName)
        await client.query(
          `UPDATE knowledge_entities SET canonical_name=$3,revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, entityId, value.canonicalName]
        );
      else
        await client.query(
          `UPDATE knowledge_entities SET revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, entityId]
        );
      if (value.alias)
        await client.query(
          `INSERT INTO knowledge_entity_aliases(workspace_id,id,entity_id,alias,normalized_alias,confidence,state) VALUES($1,$2,$3,$4,$5,1,'active')`,
          [context.workspaceId, createId(), entityId, value.alias, normalizeIdentity(value.alias)]
        );
      if (value.fact) await this.#insertFact(client, context, entityId, value.fact);
      await this.#refreshConflicts(client, context, entityId);
      await this.#change(
        client,
        context,
        entityId,
        value.revision + 1,
        "updated",
        current.rows[0],
        value
      );
      return (await this.#profile(client, context, entityId))!;
    });
  }

  async addRelation(context: TenantContext, entityId: string, input: unknown) {
    const value = relationInputSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.#ensureType(client, context, value.type, "relation");
      const targets = await client.query(
        `SELECT id FROM knowledge_entities WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND state='active'`,
        [context.workspaceId, [entityId, value.targetId]]
      );
      if (targets.rowCount !== 2) throw new HumanTaskAuthorizationError("ENTITY_NOT_FOUND");
      const id = createId();
      await client.query(
        `INSERT INTO knowledge_relations(workspace_id,id,source_entity_id,target_entity_id,type_key,type_version,direction,fact_kind,confidence,valid_from,valid_to,state,created_by) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,'active',$11)`,
        [
          context.workspaceId,
          id,
          entityId,
          value.targetId,
          value.type,
          value.direction,
          value.kind,
          value.confidence,
          value.validFrom,
          value.validTo ?? null,
          context.principalId
        ]
      );
      for (const evidence of value.evidence)
        await client.query(
          `INSERT INTO knowledge_relation_evidence(workspace_id,id,relation_id,source_id,document_id,chunk_id,action_id,coordinate,content_hash,acl_epoch,principal_ids,group_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            context.workspaceId,
            createId(),
            id,
            evidence.sourceId ?? null,
            evidence.documentId ?? null,
            evidence.chunkId ?? null,
            evidence.actionId ?? null,
            evidence.coordinate ?? null,
            evidence.contentHash,
            evidence.aclEpoch,
            evidence.principalIds,
            evidence.groupIds
          ]
        );
      return { id, ...value };
    });
  }

  async relations(context: TenantContext, entityId: string, input: unknown) {
    const value = graphTraversalSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.#verifyProof(client, context, value.authorizationProof);
      const started = performance.now();
      const rows = await client.query<Record<string, unknown>>(
        `WITH RECURSIVE walk(entity_id,depth,path) AS (
           SELECT $2::uuid,0,ARRAY[$2::uuid]
           UNION ALL
           SELECT CASE WHEN relation.source_entity_id=walk.entity_id THEN relation.target_entity_id ELSE relation.source_entity_id END,walk.depth+1,path||CASE WHEN relation.source_entity_id=walk.entity_id THEN relation.target_entity_id ELSE relation.source_entity_id END
           FROM walk JOIN knowledge_relations relation ON relation.workspace_id=$1 AND relation.state='active' AND (relation.source_entity_id=walk.entity_id OR relation.target_entity_id=walk.entity_id)
           WHERE walk.depth<$3 AND NOT (CASE WHEN relation.source_entity_id=walk.entity_id THEN relation.target_entity_id ELSE relation.source_entity_id END=ANY(path))
             AND ($4::text[] IS NULL OR relation.type_key=ANY($4))
             AND NOT EXISTS (SELECT 1 FROM knowledge_relation_evidence evidence WHERE evidence.workspace_id=relation.workspace_id AND evidence.relation_id=relation.id AND NOT ($5::uuid=ANY(evidence.principal_ids)))
         ) SELECT DISTINCT entity.id,entity.canonical_name "canonicalName",entity.type_key "type",walk.depth FROM walk JOIN knowledge_entities entity ON entity.workspace_id=$1 AND entity.id=walk.entity_id AND entity.state='active' ORDER BY walk.depth,entity.id LIMIT $6`,
        [
          context.workspaceId,
          entityId,
          value.depth,
          value.relationTypes ?? null,
          context.principalId,
          value.limit + 1
        ]
      );
      const items = rows.rows.slice(0, value.limit);
      const elapsedMs = Math.ceil(performance.now() - started);
      await client.query(
        `INSERT INTO knowledge_graph_query_receipts(workspace_id,id,root_entity_id,principal_id,depth,result_count,visited_count,elapsed_ms,truncated,query_hash) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)`,
        [
          context.workspaceId,
          createId(),
          entityId,
          context.principalId,
          value.depth,
          items.length,
          elapsedMs,
          rows.rows.length > value.limit,
          hash(JSON.stringify({ entityId, ...value, authorizationProof: undefined }))
        ]
      );
      return {
        items,
        truncated: rows.rows.length > value.limit,
        elapsedMs,
        limits: { maximumDepth: 4, maximumResults: 200 }
      };
    });
  }

  async merge(context: TenantContext, entityId: string, input: unknown) {
    const value = mergeEntitiesSchema.parse(input);
    if (entityId === value.targetEntityId) throw new HumanTaskConflictError("ENTITY_SELF_MERGE");
    return withTenantTransaction(this.pool, context, async (client) => {
      const locked = await client.query(
        `SELECT id FROM knowledge_entities WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND state='active' ORDER BY id FOR UPDATE`,
        [context.workspaceId, [entityId, value.targetEntityId]]
      );
      if (locked.rowCount !== 2) throw new HumanTaskAuthorizationError("ENTITY_NOT_FOUND");
      await client.query(
        `UPDATE knowledge_entity_aliases SET entity_id=$3,state='moved' WHERE workspace_id=$1 AND entity_id=$2`,
        [context.workspaceId, entityId, value.targetEntityId]
      );
      await client.query(
        `UPDATE knowledge_entity_facts SET entity_id=$3 WHERE workspace_id=$1 AND entity_id=$2`,
        [context.workspaceId, entityId, value.targetEntityId]
      );
      await client.query(
        `UPDATE knowledge_relations SET source_entity_id=CASE WHEN source_entity_id=$2 THEN $3 ELSE source_entity_id END,target_entity_id=CASE WHEN target_entity_id=$2 THEN $3 ELSE target_entity_id END WHERE workspace_id=$1 AND (source_entity_id=$2 OR target_entity_id=$2)`,
        [context.workspaceId, entityId, value.targetEntityId]
      );
      await client.query(
        `UPDATE knowledge_entities SET state='merged',merged_into_id=$3,revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, entityId, value.targetEntityId]
      );
      await this.#change(client, context, entityId, 2, "merged", undefined, value);
      return {
        sourceEntityId: entityId,
        targetEntityId: value.targetEntityId,
        state: "merged",
        reversible: true
      };
    });
  }

  async split(context: TenantContext, entityId: string, input: unknown) {
    const value = splitEntitySchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const source = await client.query<{ type_key: string; type_version: number }>(
        `SELECT type_key,type_version FROM knowledge_entities WHERE workspace_id=$1 AND id=$2 AND state='active' FOR UPDATE`,
        [context.workspaceId, entityId]
      );
      if (!source.rows[0]) throw new HumanTaskAuthorizationError("ENTITY_NOT_FOUND");
      const newId = createId();
      await client.query(
        `INSERT INTO knowledge_entities(workspace_id,id,type_key,type_version,canonical_name,state,created_by) VALUES($1,$2,$3,$4,$5,'active',$6)`,
        [
          context.workspaceId,
          newId,
          source.rows[0].type_key,
          source.rows[0].type_version,
          value.canonicalName,
          context.principalId
        ]
      );
      await client.query(
        `UPDATE knowledge_entity_facts SET entity_id=$3 WHERE workspace_id=$1 AND entity_id=$2 AND id=ANY($4::uuid[])`,
        [context.workspaceId, entityId, newId, value.factIds]
      );
      if (value.aliasIds.length)
        await client.query<Record<string, unknown>>(
          `UPDATE knowledge_entity_aliases SET entity_id=$3,state='moved' WHERE workspace_id=$1 AND entity_id=$2 AND id=ANY($4::uuid[])`,
          [context.workspaceId, entityId, newId, value.aliasIds]
        );
      await client.query(
        `UPDATE knowledge_entities SET revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, entityId]
      );
      await this.#change(client, context, newId, 1, "split_created", undefined, {
        sourceEntityId: entityId,
        ...value
      });
      return { sourceEntityId: entityId, entityId: newId, state: "active" };
    });
  }

  async export(context: TenantContext, entityId: string, proof: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.#verifyProof(client, context, proof);
      const profile = await this.#profile(client, context, entityId);
      if (!profile) throw new HumanTaskAuthorizationError("ENTITY_NOT_FOUND");
      const packet = { version: 1, exportedAt: new Date().toISOString(), entity: profile };
      const id = createId();
      await client.query(
        `INSERT INTO knowledge_provenance_packets(workspace_id,id,subject_type,subject_id,authorization_proof_hash,packet,content_hash,created_by) VALUES($1,$2,'entity',$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          id,
          entityId,
          hash(proof),
          packet,
          hash(JSON.stringify(packet)),
          context.principalId
        ]
      );
      return { id, ...packet };
    });
  }

  async admin(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => ({
      sources: (
        await client.query<Record<string, unknown>>(
          `SELECT source.id,source.title,source.state,source.indexed_at "indexedAt",projection.epoch "aclEpoch",projection.expires_at "aclExpiresAt" FROM knowledge_sources source LEFT JOIN LATERAL (SELECT epoch,expires_at FROM knowledge_acl_projections WHERE workspace_id=source.workspace_id AND source_id=source.id ORDER BY epoch DESC LIMIT 1) projection ON true WHERE source.workspace_id=$1 ORDER BY source.indexed_at DESC LIMIT 100`,
          [context.workspaceId]
        )
      ).rows,
      conflicts: (
        await client.query(
          `SELECT conflict.id,entity.canonical_name "entityName",conflict.attribute_key "attributeKey",conflict.fact_ids "factIds",conflict.state FROM knowledge_entity_fact_conflicts conflict JOIN knowledge_entities entity ON entity.workspace_id=conflict.workspace_id AND entity.id=conflict.entity_id WHERE conflict.workspace_id=$1 AND conflict.state='open' ORDER BY conflict.created_at DESC LIMIT 100`,
          [context.workspaceId]
        )
      ).rows
    }));
  }

  async listTypes(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,type_key "key",kind,version,display_name "displayName",schema,migration,state,created_at "createdAt" FROM knowledge_type_versions WHERE workspace_id=$1 ORDER BY kind,type_key,version DESC`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  async publishType(context: TenantContext, input: unknown) {
    const value = z
      .object({
        key: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/u),
        kind: z.enum(["entity", "relation"]),
        version: z.number().int().positive(),
        displayName: z.string().trim().min(1).max(100),
        schema: z.record(z.string(), z.unknown()),
        migration: z.record(z.string(), z.unknown()).optional()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const prior = await client.query<{ version: number }>(
        `SELECT version FROM knowledge_type_versions WHERE workspace_id=$1 AND type_key=$2 AND kind=$3 AND state='active' FOR UPDATE`,
        [context.workspaceId, value.key, value.kind]
      );
      if (prior.rows[0] && value.version !== prior.rows[0].version + 1)
        throw new HumanTaskConflictError("TYPE_VERSION_NOT_CONTIGUOUS");
      if (prior.rows[0] && !value.migration)
        throw new HumanTaskConflictError("TYPE_MIGRATION_REQUIRED");
      await client.query(
        `UPDATE knowledge_type_versions SET state='superseded' WHERE workspace_id=$1 AND type_key=$2 AND kind=$3 AND state='active'`,
        [context.workspaceId, value.key, value.kind]
      );
      const id = createId();
      await client.query(
        `INSERT INTO knowledge_type_versions(workspace_id,id,type_key,kind,version,display_name,schema,migration,state,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)`,
        [
          context.workspaceId,
          id,
          value.key,
          value.kind,
          value.version,
          value.displayName,
          value.schema,
          value.migration ?? null,
          context.principalId
        ]
      );
      return { id, ...value, state: "active" };
    });
  }

  async deleteType(context: TenantContext, typeId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const row = await client.query<{
        type_key: string;
        kind: "entity" | "relation";
        state: string;
      }>(
        `SELECT type_key,kind,state FROM knowledge_type_versions WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, typeId]
      );
      if (!row.rows[0]) throw new HumanTaskAuthorizationError("KNOWLEDGE_TYPE_NOT_FOUND");
      const references = await client.query<{ count: string }>(
        row.rows[0].kind === "entity"
          ? `SELECT count(*) count FROM knowledge_entities WHERE workspace_id=$1 AND type_key=$2 AND state<>'deleted'`
          : `SELECT count(*) count FROM knowledge_relations WHERE workspace_id=$1 AND type_key=$2 AND state='active'`,
        [context.workspaceId, row.rows[0].type_key]
      );
      if (Number(references.rows[0]?.count ?? 0) > 0)
        throw new HumanTaskConflictError("KNOWLEDGE_TYPE_IN_USE");
      await client.query(
        `UPDATE knowledge_type_versions SET state='retired' WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, typeId]
      );
    });
  }

  async #profile(
    client: PoolClient,
    context: TenantContext,
    entityId: string
  ): Promise<EntityProfile | undefined> {
    const entity = (
      await client.query<EntityCore>(
        `SELECT id,type_key "type",type_version "typeVersion",canonical_name "canonicalName",canonical_metadata "metadata",state,revision,created_at "createdAt",updated_at "updatedAt" FROM knowledge_entities WHERE workspace_id=$1 AND id=$2 AND state='active'`,
        [context.workspaceId, entityId]
      )
    ).rows[0];
    if (!entity) return undefined;
    const aliases = (
      await client.query<Record<string, unknown>>(
        `SELECT id,alias,provider,provider_id "providerId",confidence FROM knowledge_entity_aliases WHERE workspace_id=$1 AND entity_id=$2 AND state IN ('active','moved') ORDER BY alias`,
        [context.workspaceId, entityId]
      )
    ).rows;
    const facts = (
      await client.query<Record<string, unknown> & { id: string }>(
        `SELECT fact.id,fact.attribute_key "key",fact.typed_value "value",fact.fact_kind "kind",fact.confidence,fact.valid_from "validFrom",fact.valid_to "validTo",fact.state,jsonb_agg(jsonb_build_object('sourceId',evidence.source_id,'documentId',evidence.document_id,'chunkId',evidence.chunk_id,'actionId',evidence.action_id,'coordinate',evidence.coordinate,'contentHash',evidence.content_hash,'aclEpoch',evidence.acl_epoch)) evidence FROM knowledge_entity_facts fact JOIN knowledge_fact_evidence evidence ON evidence.workspace_id=fact.workspace_id AND evidence.fact_id=fact.id WHERE fact.workspace_id=$1 AND fact.entity_id=$2 AND NOT EXISTS (SELECT 1 FROM knowledge_fact_evidence restricted WHERE restricted.workspace_id=fact.workspace_id AND restricted.fact_id=fact.id AND NOT ($3::uuid=ANY(restricted.principal_ids))) GROUP BY fact.workspace_id,fact.id,fact.attribute_key,fact.typed_value,fact.fact_kind,fact.confidence,fact.valid_from,fact.valid_to,fact.state ORDER BY fact.attribute_key,fact.valid_from DESC`,
        [context.workspaceId, entityId, context.principalId]
      )
    ).rows;
    const conflicts = (
      await client.query<Record<string, unknown>>(
        `SELECT id,attribute_key "attributeKey",fact_ids "factIds",state,resolution FROM knowledge_entity_fact_conflicts WHERE workspace_id=$1 AND entity_id=$2 ORDER BY created_at DESC`,
        [context.workspaceId, entityId]
      )
    ).rows;
    const history = (
      await client.query<Record<string, unknown>>(
        `SELECT revision,action,actor_id "actorId",reason,occurred_at "occurredAt" FROM knowledge_entity_changes WHERE workspace_id=$1 AND entity_id=$2 ORDER BY revision DESC LIMIT 50`,
        [context.workspaceId, entityId]
      )
    ).rows;
    return { ...entity, aliases, facts, conflicts, history };
  }
  async #ensureType(
    client: PoolClient,
    context: TenantContext,
    key: string,
    kind: "entity" | "relation"
  ) {
    await client.query(
      `INSERT INTO knowledge_type_versions(workspace_id,id,type_key,kind,version,display_name,schema,state,created_by) VALUES($1,$2,$3,$4,1,$5,'{}','active',$6) ON CONFLICT (workspace_id,type_key,kind,version) DO NOTHING`,
      [context.workspaceId, createId(), key, kind, key.replaceAll("_", " "), context.principalId]
    );
  }
  async #insertFact(
    client: PoolClient,
    context: TenantContext,
    entityId: string,
    fact: z.infer<typeof upsertEntitySchema>["facts"][number]
  ) {
    const id = createId();
    await client.query(
      `INSERT INTO knowledge_entity_facts(workspace_id,id,entity_id,attribute_key,typed_value,fact_kind,confidence,valid_from,valid_to,state,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)`,
      [
        context.workspaceId,
        id,
        entityId,
        fact.key,
        JSON.stringify(fact.value),
        fact.kind,
        fact.confidence,
        fact.validFrom,
        fact.validTo ?? null,
        context.principalId
      ]
    );
    for (const evidence of fact.evidence)
      await client.query(
        `INSERT INTO knowledge_fact_evidence(workspace_id,id,fact_id,source_id,document_id,chunk_id,action_id,coordinate,content_hash,acl_epoch,principal_ids,group_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.workspaceId,
          createId(),
          id,
          evidence.sourceId ?? null,
          evidence.documentId ?? null,
          evidence.chunkId ?? null,
          evidence.actionId ?? null,
          evidence.coordinate ?? null,
          evidence.contentHash,
          evidence.aclEpoch,
          evidence.principalIds,
          evidence.groupIds
        ]
      );
  }
  async #refreshConflicts(client: PoolClient, context: TenantContext, entityId: string) {
    const rows = await client.query<{ attribute_key: string; fact_ids: string[] }>(
      `SELECT attribute_key,array_agg(id) fact_ids FROM knowledge_entity_facts WHERE workspace_id=$1 AND entity_id=$2 AND state='active' AND (valid_to IS NULL OR valid_to>clock_timestamp()) GROUP BY attribute_key HAVING count(DISTINCT typed_value)>1`,
      [context.workspaceId, entityId]
    );
    for (const row of rows.rows)
      await client.query(
        `INSERT INTO knowledge_entity_fact_conflicts(workspace_id,id,entity_id,attribute_key,fact_ids,state) SELECT $1,$2,$3,$4,$5,'open' WHERE NOT EXISTS (SELECT 1 FROM knowledge_entity_fact_conflicts WHERE workspace_id=$1 AND entity_id=$3 AND attribute_key=$4 AND state='open')`,
        [context.workspaceId, createId(), entityId, row.attribute_key, row.fact_ids]
      );
  }
  async #change(
    client: PoolClient,
    context: TenantContext,
    entityId: string,
    revision: number,
    action: string,
    before: unknown,
    after: unknown
  ) {
    await client.query(
      `INSERT INTO knowledge_entity_changes(workspace_id,id,entity_id,revision,action,actor_id,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        context.workspaceId,
        createId(),
        entityId,
        revision,
        action,
        context.principalId,
        before ?? null,
        after ?? null
      ]
    );
  }
  async #verifyProof(client: PoolClient, context: TenantContext, proof: string) {
    const result = await client.query(
      `SELECT 1 FROM knowledge_authorization_proofs WHERE workspace_id=$1 AND subject_id=$2 AND proof_hash=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp()`,
      [context.workspaceId, context.principalId, createHash("sha256").update(proof).digest("hex")]
    );
    if (!result.rowCount) throw new HumanTaskAuthorizationError("AUTHORIZATION_PROOF_DENIED");
  }
}
