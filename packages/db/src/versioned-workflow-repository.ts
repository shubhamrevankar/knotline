import {
  validateWorkflowDefinition,
  workflowDefinitionSchema,
  type ValidationFinding,
  type WorkflowDefinition
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { contentHash, createId } from "./values.js";

export interface WorkflowDraftRecord {
  readonly workflowId: string;
  readonly version: number;
  readonly revision: number;
  readonly etag: string;
  readonly contentHash: string;
  readonly definition: WorkflowDefinition;
}

export interface WorkflowVersionRecord {
  readonly version: number;
  readonly state: "draft" | "published" | "superseded";
  readonly revision: number;
  readonly contentHash: string;
  readonly releaseNote: string;
  readonly publishedAt?: string;
  readonly createdAt: string;
}

export interface WorkflowPublishResult {
  readonly published: boolean;
  readonly findings: readonly ValidationFinding[];
  readonly publishedVersion?: number;
  readonly nextDraftVersion?: number;
  readonly contentHash?: string;
}

export interface WorkflowTemplateRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: string;
  readonly version: number;
  readonly definition: WorkflowDefinition;
  readonly variables: readonly {
    readonly key: string;
    readonly required: boolean;
    readonly default?: unknown;
  }[];
}

export interface VersionedWorkflowRepository {
  getDraft(context: TenantContext, workflowId: string): Promise<WorkflowDraftRecord | undefined>;
  saveDraft(
    context: TenantContext,
    workflowId: string,
    expectedRevision: number,
    definition: WorkflowDefinition
  ): Promise<WorkflowDraftRecord | "conflict" | undefined>;
  validateDraft(
    context: TenantContext,
    workflowId: string
  ): Promise<readonly ValidationFinding[] | undefined>;
  publish(
    context: TenantContext,
    workflowId: string,
    expectedRevision: number,
    releaseNote: string
  ): Promise<WorkflowPublishResult | "conflict" | undefined>;
  versions(context: TenantContext, workflowId: string): Promise<readonly WorkflowVersionRecord[]>;
  version(
    context: TenantContext,
    workflowId: string,
    version: number
  ): Promise<WorkflowDraftRecord | undefined>;
  restore(
    context: TenantContext,
    workflowId: string,
    version: number
  ): Promise<WorkflowDraftRecord | undefined>;
  diff(context: TenantContext, workflowId: string, from: number, to: number): Promise<unknown>;
  export(context: TenantContext, workflowId: string, version?: number): Promise<unknown>;
  import(context: TenantContext, input: unknown): Promise<string>;
  duplicate(context: TenantContext, workflowId: string, name?: string): Promise<string | undefined>;
  setLifecycle(
    context: TenantContext,
    workflowId: string,
    state: "active" | "archived" | "deleting"
  ): Promise<boolean>;
  favorite(context: TenantContext, workflowId: string, enabled: boolean): Promise<boolean>;
  transfer(context: TenantContext, workflowId: string, ownerUserId: string): Promise<boolean>;
  createFolder(context: TenantContext, name: string, parentId?: string): Promise<string>;
  folders(
    context: TenantContext
  ): Promise<readonly { id: string; parentId?: string; name: string }[]>;
  createTag(context: TenantContext, name: string, color: string): Promise<string>;
  tags(context: TenantContext): Promise<readonly { id: string; name: string; color: string }[]>;
  createTemplate(
    context: TenantContext,
    workflowId: string,
    input: {
      name: string;
      description: string;
      variables: readonly { key: string; required: boolean; default?: unknown }[];
    }
  ): Promise<WorkflowTemplateRecord | undefined>;
  templates(context: TenantContext): Promise<readonly WorkflowTemplateRecord[]>;
  instantiateTemplate(
    context: TenantContext,
    templateId: string,
    values: Readonly<Record<string, unknown>>
  ): Promise<string | undefined>;
}

interface DraftRow {
  workflow_id: string;
  version: number;
  draft_revision: number;
  definition: unknown;
  content_hash: string;
  state: "draft" | "published" | "superseded";
  release_note: string;
  published_at: Date | null;
  created_at: Date;
}

const etag = (version: number, revision: number, hash: string) =>
  `"wf-${version}-${revision}-${hash.slice(-12)}"`;

function draftFromRow(row: DraftRow): WorkflowDraftRecord {
  const definition = workflowDefinitionSchema.parse(row.definition);
  return {
    workflowId: row.workflow_id,
    version: row.version,
    revision: row.draft_revision,
    etag: etag(row.version, row.draft_revision, row.content_hash),
    contentHash: row.content_hash,
    definition
  };
}

async function insertAudit(
  client: PoolClient,
  context: TenantContext,
  action: string,
  workflowId: string,
  metadata: Readonly<Record<string, unknown>> = {}
) {
  await client.query(
    `INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id,result,request_id,metadata)
     VALUES ($1,$2,$3,$4,'workflow',$5,'succeeded',$6,$7)`,
    [
      context.workspaceId,
      createId(),
      context.principalId,
      action,
      workflowId,
      context.requestId,
      metadata
    ]
  );
}

async function insertOutbox(
  client: PoolClient,
  context: TenantContext,
  eventType: string,
  workflowId: string,
  payload: Readonly<Record<string, unknown>>
) {
  await client.query(
    `INSERT INTO outbox_events(workspace_id,id,aggregate_type,aggregate_id,event_type,payload)
     VALUES ($1,$2,'workflow',$3,$4,$5)`,
    [context.workspaceId, createId(), workflowId, eventType, payload]
  );
}

async function replaceGraph(
  client: PoolClient,
  context: TenantContext,
  workflowId: string,
  version: number,
  definition: WorkflowDefinition
) {
  await client.query(
    "DELETE FROM workflow_edges WHERE workspace_id=$1 AND workflow_id=$2 AND workflow_version=$3",
    [context.workspaceId, workflowId, version]
  );
  const ids = new Map<string, string>();
  for (const node of definition.nodes) {
    const id = createId();
    const upserted = await client.query<{ id: string }>(
      `INSERT INTO workflow_nodes(workspace_id,workflow_id,workflow_version,id,stable_key,kind,configuration,position_x,position_y)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (workspace_id,workflow_id,workflow_version,stable_key) DO UPDATE SET
         kind=excluded.kind,configuration=excluded.configuration,
         position_x=excluded.position_x,position_y=excluded.position_y
       RETURNING id`,
      [
        context.workspaceId,
        workflowId,
        version,
        id,
        node.key,
        node.kind,
        { name: node.name, description: node.description, ...node.configuration },
        Math.round(node.position.x),
        Math.round(node.position.y)
      ]
    );
    ids.set(node.key, upserted.rows[0]?.id ?? id);
  }
  await client.query(
    `DELETE FROM workflow_nodes WHERE workspace_id=$1 AND workflow_id=$2 AND workflow_version=$3
     AND NOT (stable_key=ANY($4::text[]))`,
    [context.workspaceId, workflowId, version, definition.nodes.map(({ key }) => key)]
  );
  for (const edge of definition.edges) {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (!source || !target) continue;
    await client.query(
      `INSERT INTO workflow_edges(workspace_id,workflow_id,workflow_version,id,source_node_id,target_node_id,configuration)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        context.workspaceId,
        workflowId,
        version,
        createId(),
        source,
        target,
        edge.condition ? { key: edge.key, condition: edge.condition } : { key: edge.key }
      ]
    );
  }
}

const applyVariables = (value: unknown, values: Readonly<Record<string, unknown>>): unknown => {
  if (Array.isArray(value)) return value.map((entry) => applyVariables(entry, values));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, applyVariables(child, values)])
    );
  if (typeof value === "string") {
    const match = /^\{\{([a-z][a-z0-9_-]*)\}\}$/u.exec(value);
    return match?.[1] && match[1] in values ? values[match[1]] : value;
  }
  return value;
};

export class PostgresVersionedWorkflowRepository implements VersionedWorkflowRepository {
  constructor(private readonly pool: Pool) {}

  async getDraft(context: TenantContext, workflowId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND state='draft'
         ORDER BY version DESC LIMIT 1`,
        [context.workspaceId, workflowId]
      );
      return result.rows[0] ? draftFromRow(result.rows[0]) : undefined;
    });
  }

  async saveDraft(
    context: TenantContext,
    workflowId: string,
    expectedRevision: number,
    definition: WorkflowDefinition
  ) {
    const canonical = workflowDefinitionSchema.parse(definition);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<DraftRow>(
        `UPDATE workflow_versions SET definition=$4,content_hash=$5,draft_revision=draft_revision+1
         WHERE workspace_id=$1 AND workflow_id=$2 AND state='draft' AND draft_revision=$3
         RETURNING workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at`,
        [context.workspaceId, workflowId, expectedRevision, canonical, contentHash(canonical)]
      );
      const row = result.rows[0];
      if (!row) {
        const exists = await client.query(
          "SELECT 1 FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND state='draft'",
          [context.workspaceId, workflowId]
        );
        return exists.rowCount ? ("conflict" as const) : undefined;
      }
      await replaceGraph(client, context, workflowId, row.version, canonical);
      await client.query(
        "UPDATE workflows SET name=$3,description=$4,optimistic_version=optimistic_version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
        [context.workspaceId, workflowId, canonical.name, canonical.description]
      );
      await insertAudit(client, context, "workflow.draft.updated", workflowId, {
        revision: row.draft_revision
      });
      return draftFromRow(row);
    });
  }

  async validateDraft(context: TenantContext, workflowId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND state='draft' ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [context.workspaceId, workflowId]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      const findings = validateWorkflowDefinition(row.definition);
      await client.query(
        "DELETE FROM workflow_validation_findings WHERE workspace_id=$1 AND workflow_id=$2 AND workflow_version=$3 AND draft_revision=$4",
        [context.workspaceId, workflowId, row.version, row.draft_revision]
      );
      for (const item of findings)
        await client.query(
          `INSERT INTO workflow_validation_findings(workspace_id,id,workflow_id,workflow_version,draft_revision,code,severity,message,location)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            context.workspaceId,
            createId(),
            workflowId,
            row.version,
            row.draft_revision,
            item.code,
            item.severity,
            item.message,
            item.location
          ]
        );
      return findings;
    });
  }

  async publish(
    context: TenantContext,
    workflowId: string,
    expectedRevision: number,
    releaseNote: string
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND state='draft' ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [context.workspaceId, workflowId]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      if (row.draft_revision !== expectedRevision) return "conflict" as const;
      const findings = validateWorkflowDefinition(row.definition);
      if (findings.some(({ severity }) => severity === "error"))
        return { published: false, findings };
      await client.query(
        `UPDATE workflow_versions SET state='published',published_at=clock_timestamp(),release_note=$4,created_by=coalesce(created_by,$3)
         WHERE workspace_id=$1 AND workflow_id=$2 AND version=$5`,
        [context.workspaceId, workflowId, context.principalId, releaseNote, row.version]
      );
      const nextVersion = row.version + 1;
      await client.query(
        `INSERT INTO workflow_versions(workspace_id,workflow_id,version,state,definition,content_hash,draft_revision,created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,1,$6)`,
        [
          context.workspaceId,
          workflowId,
          nextVersion,
          row.definition,
          row.content_hash,
          context.principalId
        ]
      );
      await client.query(
        `INSERT INTO workflow_nodes SELECT workspace_id,workflow_id,$4,id,stable_key,kind,configuration,position_x,position_y
         FROM workflow_nodes WHERE workspace_id=$1 AND workflow_id=$2 AND workflow_version=$3`,
        [context.workspaceId, workflowId, row.version, nextVersion]
      );
      await client.query(
        `INSERT INTO workflow_edges SELECT workspace_id,workflow_id,$4,id,source_node_id,target_node_id,configuration
         FROM workflow_edges WHERE workspace_id=$1 AND workflow_id=$2 AND workflow_version=$3`,
        [context.workspaceId, workflowId, row.version, nextVersion]
      );
      await client.query(
        "UPDATE workflows SET state='active',current_version=$3,optimistic_version=optimistic_version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
        [context.workspaceId, workflowId, nextVersion]
      );
      await insertAudit(client, context, "workflow.published", workflowId, {
        version: row.version,
        contentHash: row.content_hash
      });
      await insertOutbox(client, context, "workflow.published.v1", workflowId, {
        workflowId,
        version: row.version,
        contentHash: row.content_hash
      });
      return {
        published: true,
        findings,
        publishedVersion: row.version,
        nextDraftVersion: nextVersion,
        contentHash: row.content_hash
      };
    });
  }

  async versions(context: TenantContext, workflowId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 ORDER BY version DESC`,
        [context.workspaceId, workflowId]
      );
      return result.rows.map((row) => ({
        version: row.version,
        state: row.state,
        revision: row.draft_revision,
        contentHash: row.content_hash,
        releaseNote: row.release_note,
        ...(row.published_at ? { publishedAt: row.published_at.toISOString() } : {}),
        createdAt: row.created_at.toISOString()
      }));
    });
  }

  async version(context: TenantContext, workflowId: string, version: number) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3`,
        [context.workspaceId, workflowId, version]
      );
      return result.rows[0] ? draftFromRow(result.rows[0]) : undefined;
    });
  }

  async restore(context: TenantContext, workflowId: string, version: number) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const source = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3 FOR SHARE`,
        [context.workspaceId, workflowId, version]
      );
      const row = source.rows[0];
      if (!row) return undefined;
      await client.query(
        "UPDATE workflow_versions SET state='superseded' WHERE workspace_id=$1 AND workflow_id=$2 AND state='draft'",
        [context.workspaceId, workflowId]
      );
      const maximum = await client.query<{ version: number }>(
        "SELECT max(version)::integer AS version FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2",
        [context.workspaceId, workflowId]
      );
      const nextVersion = (maximum.rows[0]?.version ?? 0) + 1;
      await client.query(
        `INSERT INTO workflow_versions(workspace_id,workflow_id,version,state,definition,content_hash,draft_revision,created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,1,$6)`,
        [
          context.workspaceId,
          workflowId,
          nextVersion,
          row.definition,
          row.content_hash,
          context.principalId
        ]
      );
      await replaceGraph(
        client,
        context,
        workflowId,
        nextVersion,
        workflowDefinitionSchema.parse(row.definition)
      );
      await client.query(
        "UPDATE workflows SET current_version=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
        [context.workspaceId, workflowId, nextVersion]
      );
      await insertAudit(client, context, "workflow.version.restored", workflowId, {
        sourceVersion: version,
        draftVersion: nextVersion
      });
      const created = await client.query<DraftRow>(
        `SELECT workflow_id,version,draft_revision,definition,content_hash,state,release_note,published_at,created_at
         FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3`,
        [context.workspaceId, workflowId, nextVersion]
      );
      return created.rows[0] ? draftFromRow(created.rows[0]) : undefined;
    });
  }

  async diff(context: TenantContext, workflowId: string, from: number, to: number) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ version: number; definition: WorkflowDefinition }>(
        "SELECT version,definition FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND version=ANY($3::integer[])",
        [context.workspaceId, workflowId, [from, to]]
      );
      if (result.rowCount !== 2) return undefined;
      const byVersion = new Map(
        result.rows.map((row) => [row.version, workflowDefinitionSchema.parse(row.definition)])
      );
      const left = byVersion.get(from)!;
      const right = byVersion.get(to)!;
      const leftNodes = new Map(left.nodes.map((node) => [node.key, node]));
      const rightNodes = new Map(right.nodes.map((node) => [node.key, node]));
      return {
        from,
        to,
        nameChanged: left.name !== right.name,
        addedNodes: [...rightNodes.keys()].filter((key) => !leftNodes.has(key)),
        removedNodes: [...leftNodes.keys()].filter((key) => !rightNodes.has(key)),
        changedNodes: [...rightNodes.keys()].filter(
          (key) =>
            leftNodes.has(key) &&
            contentHash(leftNodes.get(key)) !== contentHash(rightNodes.get(key))
        ),
        edgeCount: { from: left.edges.length, to: right.edges.length }
      };
    });
  }

  async export(context: TenantContext, workflowId: string, selectedVersion?: number) {
    const versions = await this.versions(context, workflowId);
    const version =
      selectedVersion ??
      versions.find(({ state }) => state === "published")?.version ??
      versions[0]?.version;
    if (!version) return undefined;
    const record = await this.version(context, workflowId, version);
    return record
      ? {
          format: "knotline.workflow",
          formatVersion: 1,
          workflowId,
          version,
          contentHash: record.contentHash,
          definition: record.definition
        }
      : undefined;
  }

  async import(context: TenantContext, input: unknown) {
    const envelope =
      input && typeof input === "object" && "definition" in input ? input.definition : input;
    const definition = workflowDefinitionSchema.parse(envelope);
    return withTenantTransaction(this.pool, context, async (client) => {
      const workflowId = createId();
      await client.query(
        `INSERT INTO workflows(workspace_id,id,name,description,owner_user_id) VALUES ($1,$2,$3,$4,$5)`,
        [
          context.workspaceId,
          workflowId,
          definition.name,
          definition.description,
          context.principalId
        ]
      );
      await client.query(
        `INSERT INTO workflow_versions(workspace_id,workflow_id,version,state,definition,content_hash,draft_revision,created_by)
         VALUES ($1,$2,1,'draft',$3,$4,1,$5)`,
        [context.workspaceId, workflowId, definition, contentHash(definition), context.principalId]
      );
      await replaceGraph(client, context, workflowId, 1, definition);
      await insertAudit(client, context, "workflow.imported", workflowId);
      return workflowId;
    });
  }

  async duplicate(context: TenantContext, workflowId: string, name?: string) {
    const source =
      (await this.getDraft(context, workflowId)) ?? (await this.version(context, workflowId, 1));
    if (!source) return undefined;
    return this.import(context, {
      definition: { ...source.definition, name: name ?? `${source.definition.name} copy` }
    });
  }

  async setLifecycle(
    context: TenantContext,
    workflowId: string,
    state: "active" | "archived" | "deleting"
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE workflows SET state=$3,archived_at=CASE WHEN $3='archived' THEN clock_timestamp() ELSE NULL END,
         deleted_at=CASE WHEN $3='deleting' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, workflowId, state]
      );
      if (result.rowCount) await insertAudit(client, context, `workflow.${state}`, workflowId);
      return result.rowCount === 1;
    });
  }

  async favorite(context: TenantContext, workflowId: string, enabled: boolean) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = enabled
        ? await client.query(
            "INSERT INTO workflow_favorites(workspace_id,workflow_id,user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [context.workspaceId, workflowId, context.principalId]
          )
        : await client.query(
            "DELETE FROM workflow_favorites WHERE workspace_id=$1 AND workflow_id=$2 AND user_id=$3",
            [context.workspaceId, workflowId, context.principalId]
          );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async transfer(context: TenantContext, workflowId: string, ownerUserId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE workflows SET owner_user_id=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2
         AND EXISTS (SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$3 AND state='active')`,
        [context.workspaceId, workflowId, ownerUserId]
      );
      if (result.rowCount)
        await insertAudit(client, context, "workflow.ownership.transferred", workflowId, {
          ownerUserId
        });
      return result.rowCount === 1;
    });
  }

  async createFolder(context: TenantContext, name: string, parentId?: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        "INSERT INTO workflow_folders(workspace_id,id,parent_id,name,created_by) VALUES ($1,$2,$3,$4,$5)",
        [context.workspaceId, id, parentId ?? null, name, context.principalId]
      );
      return id;
    });
  }

  async folders(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ id: string; parent_id: string | null; name: string }>(
        "SELECT id,parent_id,name FROM workflow_folders WHERE workspace_id=$1 ORDER BY normalized_name,id",
        [context.workspaceId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        ...(row.parent_id ? { parentId: row.parent_id } : {})
      }));
    });
  }

  async createTag(context: TenantContext, name: string, color: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        "INSERT INTO workflow_tags(workspace_id,id,name,color,created_by) VALUES ($1,$2,$3,$4,$5)",
        [context.workspaceId, id, name, color, context.principalId]
      );
      return id;
    });
  }

  async tags(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ id: string; name: string; color: string }>(
        "SELECT id,name,color FROM workflow_tags WHERE workspace_id=$1 ORDER BY normalized_name,id",
        [context.workspaceId]
      );
      return result.rows;
    });
  }

  async createTemplate(
    context: TenantContext,
    workflowId: string,
    input: {
      name: string;
      description: string;
      variables: readonly { key: string; required: boolean; default?: unknown }[];
    }
  ) {
    const source = await this.getDraft(context, workflowId);
    if (!source) return undefined;
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        "INSERT INTO workflow_templates(workspace_id,id,name,description,created_by) VALUES ($1,$2,$3,$4,$5)",
        [context.workspaceId, id, input.name, input.description, context.principalId]
      );
      await client.query(
        `INSERT INTO workflow_template_versions(workspace_id,template_id,version,state,definition,variables,content_hash,created_by)
         VALUES ($1,$2,1,'draft',$3,$4,$5,$6)`,
        [
          context.workspaceId,
          id,
          source.definition,
          JSON.stringify(input.variables),
          source.contentHash,
          context.principalId
        ]
      );
      return {
        id,
        name: input.name,
        description: input.description,
        state: "draft",
        version: 1,
        definition: source.definition,
        variables: input.variables
      };
    });
  }

  async templates(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        name: string;
        description: string;
        state: string;
        current_version: number;
        definition: WorkflowDefinition;
        variables: WorkflowTemplateRecord["variables"];
      }>(
        `SELECT t.id,t.name,t.description,t.state,t.current_version,v.definition,v.variables
         FROM workflow_templates t JOIN workflow_template_versions v ON v.workspace_id=t.workspace_id AND v.template_id=t.id AND v.version=t.current_version
         WHERE t.workspace_id=$1 AND t.state<>'archived' ORDER BY t.updated_at DESC`,
        [context.workspaceId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        state: row.state,
        version: row.current_version,
        definition: workflowDefinitionSchema.parse(row.definition),
        variables: row.variables
      }));
    });
  }

  async instantiateTemplate(
    context: TenantContext,
    templateId: string,
    values: Readonly<Record<string, unknown>>
  ) {
    const template = (await this.templates(context)).find(({ id }) => id === templateId);
    if (!template) return undefined;
    for (const variable of template.variables)
      if (variable.required && values[variable.key] === undefined && variable.default === undefined)
        throw new Error(`TEMPLATE_VARIABLE_REQUIRED:${variable.key}`);
    const resolved = Object.fromEntries(
      template.variables.map((variable) => [variable.key, values[variable.key] ?? variable.default])
    );
    const definition = workflowDefinitionSchema.parse(
      applyVariables(template.definition, resolved)
    );
    return this.import(context, { definition });
  }
}
