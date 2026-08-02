import {
  agentCreateSchema,
  agentDefinitionSchema,
  agentDraftSaveSchema,
  agentSimulationSchema,
  diffAgentDefinitions,
  renderAgentPrompts,
  validateAgentDefinition,
  type AgentDefinition
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

export interface AgentRepository {
  list(context: TenantContext, query?: unknown): Promise<readonly Record<string, unknown>[]>;
  get(context: TenantContext, agentId: string): Promise<Record<string, unknown> | undefined>;
  create(context: TenantContext, input: unknown): Promise<{ id: string; revision: number }>;
  saveDraft(context: TenantContext, agentId: string, input: unknown): Promise<{ revision: number }>;
  validate(
    context: TenantContext,
    agentId: string
  ): Promise<{ findings: ReturnType<typeof validateAgentDefinition> }>;
  publish(
    context: TenantContext,
    agentId: string,
    expectedRevision: number,
    changeSummary: string
  ): Promise<{ version: number; contentHash: string }>;
  versions(context: TenantContext, agentId: string): Promise<readonly Record<string, unknown>[]>;
  version(
    context: TenantContext,
    agentId: string,
    version: number
  ): Promise<Record<string, unknown> | undefined>;
  diff(
    context: TenantContext,
    agentId: string,
    from: number,
    to: number
  ): Promise<ReturnType<typeof diffAgentDefinitions>>;
  simulate(
    context: TenantContext,
    agentId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  fork(
    context: TenantContext,
    agentId: string,
    version: number,
    name: string
  ): Promise<{ id: string }>;
  setEnabled(context: TenantContext, agentId: string, enabled: boolean): Promise<{ state: string }>;
  archive(context: TenantContext, agentId: string): Promise<void>;
}

export class PostgresAgentRepository implements AgentRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: TenantContext, query: unknown = {}) {
    const filters = (query ?? {}) as {
      search?: unknown;
      state?: unknown;
      visibility?: unknown;
      tag?: unknown;
    };
    const search = typeof filters.search === "string" ? filters.search.trim() : "";
    const state = typeof filters.state === "string" ? filters.state : undefined;
    const visibility = typeof filters.visibility === "string" ? filters.visibility : undefined;
    const tag = typeof filters.tag === "string" ? filters.tag.trim().toLowerCase() : "";
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT agent.id,agent.stable_key,agent.name,agent.description,agent.owner_id,agent.visibility,
            agent.state,agent.current_version,agent.updated_at,(agent.owner_id=$2) can_manage,
            coalesce(array_agg(DISTINCT tag.display_name) FILTER (WHERE tag.id IS NOT NULL),'{}') tags,
            coalesce((SELECT count(*) FROM agent_version_references reference WHERE reference.workspace_id=agent.workspace_id AND reference.agent_id=agent.id),0)::integer usage_references,
            channel.version stable_version
           FROM agent_definitions agent
           LEFT JOIN agent_tag_assignments assignment ON assignment.workspace_id=agent.workspace_id AND assignment.agent_id=agent.id
           LEFT JOIN agent_tags tag ON tag.workspace_id=assignment.workspace_id AND tag.id=assignment.tag_id
           LEFT JOIN agent_release_channels channel ON channel.workspace_id=agent.workspace_id AND channel.agent_id=agent.id AND channel.channel='stable'
           WHERE agent.workspace_id=$1 AND (agent.visibility='workspace' OR agent.owner_id=$2)
             AND ($3='' OR agent.name ILIKE '%'||$3||'%' OR agent.description ILIKE '%'||$3||'%')
             AND (($4::text IS NULL AND agent.state<>'archived') OR agent.state=$4)
             AND ($5::text IS NULL OR agent.visibility=$5)
             AND ($6='' OR EXISTS(SELECT 1 FROM agent_tag_assignments a JOIN agent_tags t ON t.workspace_id=a.workspace_id AND t.id=a.tag_id WHERE a.workspace_id=agent.workspace_id AND a.agent_id=agent.id AND t.normalized_name=$6))
           GROUP BY agent.workspace_id,agent.id,channel.version ORDER BY agent.updated_at DESC,agent.id LIMIT 100`,
            [context.workspaceId, context.principalId, search, state, visibility, tag]
          )
        ).rows
    );
  }

  async get(context: TenantContext, agentId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT agent.*,(agent.owner_id=$3) can_manage,draft.revision::integer revision,draft.definition,draft.content_hash,draft.validation_findings,
            coalesce((SELECT jsonb_agg(channel ORDER BY channel.channel) FROM agent_release_channels channel WHERE channel.workspace_id=agent.workspace_id AND channel.agent_id=agent.id),'[]'::jsonb) release_channels,
            coalesce((SELECT jsonb_agg(activity ORDER BY activity.sequence DESC) FROM (SELECT * FROM agent_activity_events event WHERE event.workspace_id=agent.workspace_id AND event.agent_id=agent.id ORDER BY sequence DESC LIMIT 50) activity),'[]'::jsonb) activity
           FROM agent_definitions agent LEFT JOIN agent_drafts draft ON draft.workspace_id=agent.workspace_id AND draft.agent_id=agent.id
           WHERE agent.workspace_id=$1 AND agent.id=$2 AND (agent.visibility='workspace' OR agent.owner_id=$3)`,
            [context.workspaceId, agentId, context.principalId]
          )
        ).rows[0]
    );
  }

  async create(context: TenantContext, input: unknown) {
    const { definition } = agentCreateSchema.parse(input);
    const findings = validateAgentDefinition(definition);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      const stableKey = `${definition.name
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, "-")
        .replaceAll(/^-|-$/gu, "")}-${id.slice(0, 8)}`;
      await client.query(
        `INSERT INTO agent_definitions(workspace_id,id,stable_key,name,description,owner_id,visibility,state)
         VALUES($1,$2,$3,$4,$5,$6,$7,'draft')`,
        [
          context.workspaceId,
          id,
          stableKey,
          definition.name,
          definition.description,
          context.principalId,
          definition.visibility
        ]
      );
      await client.query(
        `INSERT INTO agent_drafts(workspace_id,agent_id,definition,content_hash,validation_findings,updated_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          context.workspaceId,
          id,
          definition,
          contentHash(definition),
          JSON.stringify(findings),
          context.principalId
        ]
      );
      await this.syncTags(client, context, id, definition.tags);
      await this.event(client, context, id, "agent.created", { stableKey });
      return { id, revision: 1 };
    });
  }

  async saveDraft(context: TenantContext, agentId: string, input: unknown) {
    const value = agentDraftSaveSchema.parse(input);
    const findings = validateAgentDefinition(value.definition);
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.requireOwner(client, context, agentId);
      const result = await client.query<{ revision: string }>(
        `UPDATE agent_drafts SET definition=$4,content_hash=$5,validation_findings=$6,revision=revision+1,updated_by=$3,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND agent_id=$2 AND revision=$7 RETURNING revision`,
        [
          context.workspaceId,
          agentId,
          context.principalId,
          value.definition,
          contentHash(value.definition),
          JSON.stringify(findings),
          value.expectedRevision
        ]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("STALE_AGENT_DRAFT");
      await client.query(
        `UPDATE agent_definitions SET name=$3,description=$4,visibility=$5,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [
          context.workspaceId,
          agentId,
          value.definition.name,
          value.definition.description,
          value.definition.visibility
        ]
      );
      await this.syncTags(client, context, agentId, value.definition.tags);
      await this.event(client, context, agentId, "agent.draft_updated", {
        revision: Number(result.rows[0].revision)
      });
      return { revision: Number(result.rows[0].revision) };
    });
  }

  async validate(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const draft = await client.query<{ definition: AgentDefinition }>(
        `SELECT draft.definition FROM agent_drafts draft JOIN agent_definitions agent ON agent.workspace_id=draft.workspace_id AND agent.id=draft.agent_id
         WHERE draft.workspace_id=$1 AND draft.agent_id=$2 AND (agent.visibility='workspace' OR agent.owner_id=$3)`,
        [context.workspaceId, agentId, context.principalId]
      );
      if (!draft.rows[0]) throw new Error("AGENT_NOT_FOUND");
      const findings = validateAgentDefinition(draft.rows[0].definition);
      await client.query(
        `UPDATE agent_drafts SET validation_findings=$3 WHERE workspace_id=$1 AND agent_id=$2`,
        [context.workspaceId, agentId, JSON.stringify(findings)]
      );
      return { findings };
    });
  }

  async publish(
    context: TenantContext,
    agentId: string,
    expectedRevision: number,
    changeSummary: string
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.requireOwner(client, context, agentId);
      const draft = await client.query<{
        revision: string;
        definition: AgentDefinition;
        content_hash: string;
      }>(
        `SELECT revision,definition,content_hash FROM agent_drafts WHERE workspace_id=$1 AND agent_id=$2 FOR UPDATE`,
        [context.workspaceId, agentId]
      );
      const row = draft.rows[0];
      if (!row || Number(row.revision) !== expectedRevision)
        throw new HumanTaskConflictError("STALE_AGENT_DRAFT");
      const findings = validateAgentDefinition(row.definition);
      if (findings.some(({ severity }) => severity === "error"))
        throw new HumanTaskConflictError(
          `AGENT_VALIDATION_FAILED:${findings.map(({ code }) => code).join(",")}`
        );
      const version = Number(
        (
          await client.query<{ version: number }>(
            `SELECT coalesce(max(version),0)+1 version FROM agent_versions WHERE workspace_id=$1 AND agent_id=$2`,
            [context.workspaceId, agentId]
          )
        ).rows[0]!.version
      );
      await client.query(
        `INSERT INTO agent_versions(workspace_id,agent_id,version,definition,content_hash,change_summary,published_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          agentId,
          version,
          row.definition,
          row.content_hash,
          changeSummary,
          context.principalId
        ]
      );
      await client.query(
        `UPDATE agent_definitions SET state='active',current_version=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, agentId, version]
      );
      await client.query(
        `INSERT INTO agent_release_channels(workspace_id,agent_id,channel,version,updated_by)
         VALUES($1,$2,'development',$3,$4) ON CONFLICT(workspace_id,agent_id,channel) DO UPDATE SET version=excluded.version,revision=agent_release_channels.revision+1,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,
        [context.workspaceId, agentId, version, context.principalId]
      );
      await this.event(client, context, agentId, "agent.version_published", {
        version,
        contentHash: row.content_hash
      });
      await this.audit(client, context, agentId, "agent.version.published", {
        version,
        contentHash: row.content_hash
      });
      return { version, contentHash: row.content_hash };
    });
  }

  async versions(context: TenantContext, agentId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT version,content_hash,change_summary,published_by,published_at FROM agent_versions version
         WHERE workspace_id=$1 AND agent_id=$2 AND EXISTS(SELECT 1 FROM agent_definitions agent WHERE agent.workspace_id=version.workspace_id AND agent.id=version.agent_id AND (agent.visibility='workspace' OR agent.owner_id=$3)) ORDER BY version DESC`,
            [context.workspaceId, agentId, context.principalId]
          )
        ).rows
    );
  }

  async version(context: TenantContext, agentId: string, version: number) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT version.* FROM agent_versions version JOIN agent_definitions agent ON agent.workspace_id=version.workspace_id AND agent.id=version.agent_id
         WHERE version.workspace_id=$1 AND version.agent_id=$2 AND version.version=$3 AND (agent.visibility='workspace' OR agent.owner_id=$4)`,
            [context.workspaceId, agentId, version, context.principalId]
          )
        ).rows[0]
    );
  }

  async diff(context: TenantContext, agentId: string, from: number, to: number) {
    const [before, after] = await Promise.all([
      this.version(context, agentId, from),
      this.version(context, agentId, to)
    ]);
    if (!before || !after) throw new Error("AGENT_VERSION_NOT_FOUND");
    return diffAgentDefinitions(
      agentDefinitionSchema.parse(before.definition),
      agentDefinitionSchema.parse(after.definition)
    );
  }

  async simulate(context: TenantContext, agentId: string, input: unknown) {
    const value = agentSimulationSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const definition = value.version
        ? (
            await client.query<{ definition: AgentDefinition }>(
              `SELECT version.definition FROM agent_versions version JOIN agent_definitions agent ON agent.workspace_id=version.workspace_id AND agent.id=version.agent_id WHERE version.workspace_id=$1 AND version.agent_id=$2 AND version.version=$3 AND (agent.visibility='workspace' OR agent.owner_id=$4)`,
              [context.workspaceId, agentId, value.version, context.principalId]
            )
          ).rows[0]?.definition
        : (
            await client.query<{ definition: AgentDefinition }>(
              `SELECT draft.definition FROM agent_drafts draft JOIN agent_definitions agent ON agent.workspace_id=draft.workspace_id AND agent.id=draft.agent_id WHERE draft.workspace_id=$1 AND draft.agent_id=$2 AND (agent.visibility='workspace' OR agent.owner_id=$3)`,
              [context.workspaceId, agentId, context.principalId]
            )
          ).rows[0]?.definition;
      if (!definition) throw new Error("AGENT_NOT_FOUND");
      const preview = renderAgentPrompts(definition, value.fixture);
      const draft = value.version
        ? undefined
        : await client.query<{ revision: string }>(
            `SELECT revision FROM agent_drafts WHERE workspace_id=$1 AND agent_id=$2`,
            [context.workspaceId, agentId]
          );
      const id = createId();
      const output = value.expectedOutput ?? {
        summary: "Deterministic fixture output",
        fixtureDigest: contentHash(value.fixture)
      };
      await client.query(
        `INSERT INTO agent_simulations(workspace_id,id,agent_id,agent_version,draft_revision,fixture,prompt_preview,output,findings,token_estimate,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          context.workspaceId,
          id,
          agentId,
          value.version ?? null,
          value.version ? null : Number(draft?.rows[0]?.revision),
          value.fixture,
          preview.prompts,
          output,
          JSON.stringify(preview.findings),
          preview.estimatedTokens,
          context.principalId
        ]
      );
      await this.event(client, context, agentId, "agent.simulated", {
        simulationId: id,
        executionClass: "SIMULATED"
      });
      return {
        id,
        executionClass: "SIMULATED",
        promptPreview: preview.prompts,
        tokenEstimate: preview.estimatedTokens,
        findings: preview.findings,
        output
      };
    });
  }

  async fork(context: TenantContext, agentId: string, version: number, name: string) {
    const source = await this.version(context, agentId, version);
    if (!source) throw new Error("AGENT_VERSION_NOT_FOUND");
    const definition = agentDefinitionSchema.parse(source.definition);
    const created = await this.create(context, {
      definition: { ...definition, name, visibility: "private" }
    });
    return { id: created.id };
  }

  async setEnabled(context: TenantContext, agentId: string, enabled: boolean) {
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.requireOwner(client, context, agentId);
      const result = await client.query<{ state: string }>(
        `UPDATE agent_definitions
         SET state=CASE WHEN $3 THEN 'active' ELSE 'disabled' END,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND ($3=false OR current_version IS NOT NULL)
         RETURNING state`,
        [context.workspaceId, agentId, enabled]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("AGENT_VERSION_REQUIRED");
      const eventType = enabled ? "agent.enabled" : "agent.disabled";
      await this.event(client, context, agentId, eventType, {});
      await this.audit(client, context, agentId, eventType, {});
      return { state: result.rows[0].state };
    });
  }

  async archive(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.requireOwner(client, context, agentId);
      const references = await client.query(
        `SELECT 1 FROM agent_version_references WHERE workspace_id=$1 AND agent_id=$2 LIMIT 1`,
        [context.workspaceId, agentId]
      );
      if (references.rows[0]) throw new HumanTaskConflictError("AGENT_HAS_ACTIVE_REFERENCES");
      await client.query(
        `UPDATE agent_definitions SET state='archived',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, agentId]
      );
      await this.event(client, context, agentId, "agent.archived", {});
      await this.audit(client, context, agentId, "agent.archived", {});
    });
  }

  private async requireOwner(client: PoolClient, context: TenantContext, agentId: string) {
    const owner = await client.query(
      `SELECT 1 FROM agent_definitions WHERE workspace_id=$1 AND id=$2 AND owner_id=$3 AND state<>'archived'`,
      [context.workspaceId, agentId, context.principalId]
    );
    if (!owner.rows[0]) throw new HumanTaskAuthorizationError("AGENT_OWNER_REQUIRED");
  }

  private async syncTags(
    client: PoolClient,
    context: TenantContext,
    agentId: string,
    tags: readonly string[]
  ) {
    await client.query(`DELETE FROM agent_tag_assignments WHERE workspace_id=$1 AND agent_id=$2`, [
      context.workspaceId,
      agentId
    ]);
    for (const displayName of [...new Set(tags)]) {
      const normalized = displayName.toLowerCase();
      const tag = await client.query<{ id: string }>(
        `INSERT INTO agent_tags(workspace_id,id,normalized_name,display_name) VALUES($1,$2,$3,$4)
         ON CONFLICT(workspace_id,normalized_name) DO UPDATE SET display_name=excluded.display_name RETURNING id`,
        [context.workspaceId, createId(), normalized, displayName]
      );
      await client.query(
        `INSERT INTO agent_tag_assignments(workspace_id,agent_id,tag_id) VALUES($1,$2,$3)`,
        [context.workspaceId, agentId, tag.rows[0]!.id]
      );
    }
  }

  private async event(
    client: PoolClient,
    context: TenantContext,
    agentId: string,
    eventType: string,
    payload: object
  ) {
    await client.query(
      `INSERT INTO agent_activity_events(workspace_id,agent_id,sequence,event_type,actor_id,payload)
       VALUES($1,$2,coalesce((SELECT max(sequence) FROM agent_activity_events WHERE workspace_id=$1 AND agent_id=$2),0)+1,$3,$4,$5)`,
      [context.workspaceId, agentId, eventType, context.principalId, payload]
    );
  }

  private async audit(
    client: PoolClient,
    context: TenantContext,
    agentId: string,
    action: string,
    metadata: object
  ) {
    await client.query(
      `INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id,result,request_id,metadata)
       VALUES($1,$2,$3,$4,'agent',$5,'succeeded',$6,$7)`,
      [
        context.workspaceId,
        createId(),
        context.principalId,
        action,
        agentId,
        context.requestId,
        metadata
      ]
    );
  }
}
