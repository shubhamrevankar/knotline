import type { Pool } from "pg";
import { withTenantTransaction, type TenantContext } from "./context.js";
import { contentHash, createId } from "./values.js";

export interface TriggerInput {
  readonly type: string;
  readonly environment: "test" | "production";
  readonly connectionId?: string | undefined;
  readonly schemaVersion: string;
  readonly filter?: readonly unknown[] | undefined;
  readonly mappings?: Readonly<Record<string, string>> | undefined;
  readonly deduplication: string;
  readonly concurrency: number;
  readonly ratePerMinute: number;
  readonly configuration?: Readonly<Record<string, unknown>> | undefined;
  readonly schedule?:
    | {
        cron: string;
        timeZone: string;
        dstPolicy: string;
        missedPolicy: string;
        jitterSeconds: number;
        exclusions?: readonly string[] | undefined;
        startAt?: string | undefined;
        endAt?: string | undefined;
      }
    | undefined;
}
export type TriggerPatch = { readonly [Key in keyof TriggerInput]?: TriggerInput[Key] | undefined };
export interface TriggerEventInput {
  readonly provider: string;
  readonly sourceId: string;
  readonly eventId?: string | undefined;
  readonly sequence?: number | undefined;
  readonly occurredAt: string;
  readonly schemaVersion: string;
  readonly payloadHash: string;
  readonly encryptedPayloadReference: string;
  readonly testOnly?: boolean | undefined;
}
export interface TriggerRepository {
  list(context: TenantContext, workflowId: string): Promise<readonly Record<string, unknown>[]>;
  create(
    context: TenantContext,
    workflowId: string,
    input: TriggerInput
  ): Promise<Record<string, unknown>>;
  patch(
    context: TenantContext,
    triggerId: string,
    input: TriggerPatch
  ): Promise<Record<string, unknown>>;
  transition(
    context: TenantContext,
    triggerId: string,
    state: "enabled" | "disabled"
  ): Promise<Record<string, unknown>>;
  rotateSecret(context: TenantContext, triggerId: string): Promise<Record<string, unknown>>;
  deliveries(
    context: TenantContext,
    triggerId: string
  ): Promise<readonly Record<string, unknown>[]>;
  ingest(
    context: TenantContext,
    triggerId: string,
    input: TriggerEventInput
  ): Promise<Record<string, unknown>>;
  remove(context: TenantContext, triggerId: string): Promise<void>;
}

interface TriggerVersionRow {
  readonly workflow_id: string;
  readonly workflow_version: number;
  readonly trigger_type: string;
  readonly environment: "test" | "production";
  readonly connection_id: string | null;
  readonly schema_version: string;
  readonly filter_expression: readonly unknown[];
  readonly field_mappings: Readonly<Record<string, string>>;
  readonly deduplication_strategy: string;
  readonly concurrency_limit: number;
  readonly rate_per_minute: number;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly version: number;
}
interface IngestTriggerRow {
  readonly state: string;
  readonly version_id: string;
  readonly environment: "test" | "production";
  readonly schema_version: string;
}

export class PostgresTriggerRepository implements TriggerRepository {
  constructor(private readonly pool: Pool) {}
  async list(context: TenantContext, workflowId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT t.id,t.trigger_key "triggerKey",t.kind,t.state,t.secret_version "secretVersion",t.updated_at "updatedAt",v.id "versionId",v.version,v.environment,v.connection_id "connectionId",v.schema_version "schemaVersion",v.filter_expression "filter",v.field_mappings "mappings",v.deduplication_strategy "deduplication",v.concurrency_limit "concurrency",v.rate_per_minute "ratePerMinute",v.configuration,s.cron_expression "cron",s.time_zone "timeZone",s.dst_policy "dstPolicy",s.missed_policy "missedPolicy",s.jitter_seconds "jitterSeconds",s.exclusion_dates "exclusions",s.next_fire_at "nextFireAt",h.last_received_at "lastReceivedAt",h.last_started_at "lastStartedAt",h.filtered_count "filteredCount",h.duplicate_count "duplicateCount",h.error_count "errorCount",h.lag_seconds "lagSeconds",h.disabled_reason "disabledReason",h.backlog_count "backlogCount" FROM workflow_triggers t JOIN LATERAL(SELECT * FROM trigger_definition_versions v WHERE v.workspace_id=t.workspace_id AND v.trigger_id=t.id ORDER BY version DESC LIMIT 1)v ON true LEFT JOIN trigger_schedules s ON s.workspace_id=v.workspace_id AND s.trigger_version_id=v.id LEFT JOIN trigger_health_snapshots h ON h.workspace_id=t.workspace_id AND h.trigger_id=t.id WHERE t.workspace_id=$1 AND t.workflow_id=$2 ORDER BY t.updated_at DESC`,
            [context.workspaceId, workflowId]
          )
        ).rows
    );
  }
  async create(context: TenantContext, workflowId: string, input: TriggerInput) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const workflow = await client.query<{ version: number }>(
        `SELECT version FROM workflow_versions WHERE workspace_id=$1 AND workflow_id=$2 AND state='published' ORDER BY version DESC LIMIT 1`,
        [context.workspaceId, workflowId]
      );
      if (!workflow.rows[0]) throw new Error("PUBLISHED_WORKFLOW_REQUIRED");
      if (input.connectionId) {
        const connection = await client.query<{ state: string }>(
          `SELECT state FROM connections WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, input.connectionId]
        );
        if (connection.rows[0]?.state !== "active") throw new Error("ACTIVE_CONNECTION_REQUIRED");
      }
      const triggerId = createId(),
        versionId = createId(),
        triggerKey = `${input.type.replaceAll("_", "-")}-${triggerId.slice(0, 8)}`,
        configuration = input.configuration ?? {};
      await client.query(
        `INSERT INTO workflow_triggers(workspace_id,id,workflow_id,workflow_version,trigger_key,kind,configuration,state) VALUES($1,$2,$3,$4,$5,$6,$7,'disabled')`,
        [
          context.workspaceId,
          triggerId,
          workflowId,
          workflow.rows[0].version,
          triggerKey,
          input.type,
          configuration
        ]
      );
      await client.query(
        `INSERT INTO trigger_definition_versions(workspace_id,id,trigger_id,version,workflow_id,workflow_version,trigger_type,environment,connection_id,schema_version,filter_expression,field_mappings,deduplication_strategy,concurrency_limit,rate_per_minute,configuration,content_hash,state,created_by,created_at) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'published',$17,clock_timestamp())`,
        [
          context.workspaceId,
          versionId,
          triggerId,
          workflowId,
          workflow.rows[0].version,
          input.type,
          input.environment,
          input.connectionId ?? null,
          input.schemaVersion,
          input.filter ?? [],
          input.mappings ?? {},
          input.deduplication,
          input.concurrency,
          input.ratePerMinute,
          configuration,
          contentHash(input),
          context.principalId
        ]
      );
      if (input.schedule)
        await client.query(
          `INSERT INTO trigger_schedules(workspace_id,trigger_version_id,cron_expression,time_zone,dst_policy,missed_policy,jitter_seconds,exclusion_dates,start_at,end_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())`,
          [
            context.workspaceId,
            versionId,
            input.schedule.cron,
            input.schedule.timeZone,
            input.schedule.dstPolicy,
            input.schedule.missedPolicy,
            input.schedule.jitterSeconds,
            input.schedule.exclusions ?? [],
            input.schedule.startAt ?? null,
            input.schedule.endAt ?? null
          ]
        );
      await client.query(
        `INSERT INTO trigger_health_snapshots(workspace_id,trigger_id,disabled_reason,observed_at) VALUES($1,$2,'Not enabled',clock_timestamp())`,
        [context.workspaceId, triggerId]
      );
      return { id: triggerId, versionId, version: 1, state: "disabled", triggerKey, ...input };
    });
  }
  async patch(context: TenantContext, triggerId: string, input: TriggerPatch) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const prior = await client.query<TriggerVersionRow>(
        `SELECT t.workflow_id,t.workflow_version,t.kind,t.configuration,v.* FROM workflow_triggers t JOIN LATERAL(SELECT * FROM trigger_definition_versions WHERE workspace_id=t.workspace_id AND trigger_id=t.id ORDER BY version DESC LIMIT 1)v ON true WHERE t.workspace_id=$1 AND t.id=$2 FOR UPDATE OF t`,
        [context.workspaceId, triggerId]
      );
      const row = prior.rows[0];
      if (!row) throw new Error("TRIGGER_NOT_FOUND");
      const nextVersion = Number(row.version) + 1,
        versionId = createId(),
        merged = {
          type: input.type ?? row.trigger_type,
          environment: input.environment ?? row.environment,
          connectionId: input.connectionId ?? row.connection_id ?? undefined,
          schemaVersion: input.schemaVersion ?? row.schema_version,
          filter: input.filter ?? row.filter_expression,
          mappings: input.mappings ?? row.field_mappings,
          deduplication: input.deduplication ?? row.deduplication_strategy,
          concurrency: input.concurrency ?? row.concurrency_limit,
          ratePerMinute: input.ratePerMinute ?? row.rate_per_minute,
          configuration: input.configuration ?? row.configuration
        };
      await client.query(
        `UPDATE trigger_definition_versions SET state='superseded' WHERE workspace_id=$1 AND trigger_id=$2 AND state='published'`,
        [context.workspaceId, triggerId]
      );
      await client.query(
        `INSERT INTO trigger_definition_versions(workspace_id,id,trigger_id,version,workflow_id,workflow_version,trigger_type,environment,connection_id,schema_version,filter_expression,field_mappings,deduplication_strategy,concurrency_limit,rate_per_minute,configuration,content_hash,state,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'published',$18,clock_timestamp())`,
        [
          context.workspaceId,
          versionId,
          triggerId,
          nextVersion,
          row.workflow_id,
          row.workflow_version,
          merged.type,
          merged.environment,
          merged.connectionId ?? null,
          merged.schemaVersion,
          merged.filter,
          merged.mappings,
          merged.deduplication,
          merged.concurrency,
          merged.ratePerMinute,
          merged.configuration,
          contentHash(merged),
          context.principalId
        ]
      );
      await client.query(
        `UPDATE workflow_triggers SET kind=$3,configuration=$4,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, triggerId, merged.type, merged.configuration]
      );
      return { id: triggerId, versionId, version: nextVersion, ...merged };
    });
  }
  async transition(context: TenantContext, triggerId: string, state: "enabled" | "disabled") {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE workflow_triggers SET state=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING id,state`,
        [context.workspaceId, triggerId, state]
      );
      if (!result.rows[0]) throw new Error("TRIGGER_NOT_FOUND");
      await client.query(
        `UPDATE trigger_health_snapshots SET disabled_reason=$3,observed_at=clock_timestamp() WHERE workspace_id=$1 AND trigger_id=$2`,
        [context.workspaceId, triggerId, state === "disabled" ? "Paused by operator" : null]
      );
      return result.rows[0] as Record<string, unknown>;
    });
  }
  async rotateSecret(context: TenantContext, triggerId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE workflow_triggers SET secret_version=secret_version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING id,secret_version "secretVersion"`,
        [context.workspaceId, triggerId]
      );
      if (!result.rows[0]) throw new Error("TRIGGER_NOT_FOUND");
      return result.rows[0] as Record<string, unknown>;
    });
  }
  async deliveries(context: TenantContext, triggerId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT r.id,r.provider,r.source_id "sourceId",r.provider_event_id "eventId",r.source_sequence "sequence",r.occurred_at "occurredAt",r.received_at "receivedAt",r.state,r.normalized_error "error",r.run_id "runId",q.state "queueState",q.attempt FROM inbound_event_receipts r JOIN trigger_definition_versions v ON v.workspace_id=r.workspace_id AND v.id=r.trigger_version_id LEFT JOIN trigger_dispatch_queue q ON q.workspace_id=r.workspace_id AND q.receipt_id=r.id WHERE r.workspace_id=$1 AND v.trigger_id=$2 ORDER BY r.received_at DESC LIMIT 100`,
            [context.workspaceId, triggerId]
          )
        ).rows
    );
  }
  async ingest(context: TenantContext, triggerId: string, input: TriggerEventInput) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const trigger = await client.query<IngestTriggerRow>(
        `SELECT t.state,v.id version_id,v.environment,v.schema_version FROM workflow_triggers t JOIN LATERAL(SELECT * FROM trigger_definition_versions WHERE workspace_id=t.workspace_id AND trigger_id=t.id ORDER BY version DESC LIMIT 1)v ON true WHERE t.workspace_id=$1 AND t.id=$2`,
        [context.workspaceId, triggerId]
      );
      const row = trigger.rows[0];
      if (!row) throw new Error("TRIGGER_NOT_FOUND");
      if (row.state !== "enabled") throw new Error("TRIGGER_DISABLED");
      if (input.testOnly && row.environment !== "test")
        throw new Error("TEST_EVENT_PRODUCTION_FORBIDDEN");
      if (input.schemaVersion !== row.schema_version) throw new Error("TRIGGER_SCHEMA_MISMATCH");
      const duplicate = input.eventId
        ? await client.query<{ id: string }>(
            `SELECT id FROM inbound_event_receipts WHERE workspace_id=$1 AND provider_event_id=$2 LIMIT 1`,
            [context.workspaceId, input.eventId]
          )
        : { rows: [] };
      if (duplicate.rows[0]) return { id: duplicate.rows[0].id, state: "duplicate", queued: false };
      const receiptId = createId(),
        queueId = createId();
      await client.query(
        `INSERT INTO inbound_event_receipts(workspace_id,id,trigger_version_id,provider,source_id,provider_event_id,source_sequence,occurred_at,received_at,schema_version,payload_hash,encrypted_payload_reference,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9,$10,$11,'queued')`,
        [
          context.workspaceId,
          receiptId,
          row.version_id,
          input.provider,
          input.sourceId,
          input.eventId ?? null,
          input.sequence ?? null,
          input.occurredAt,
          input.schemaVersion,
          input.payloadHash,
          input.encryptedPayloadReference
        ]
      );
      await client.query(
        `INSERT INTO trigger_dispatch_queue(workspace_id,id,trigger_version_id,receipt_id,state,available_at,created_at) VALUES($1,$2,$3,$4,'buffered',clock_timestamp(),clock_timestamp())`,
        [context.workspaceId, queueId, row.version_id, receiptId]
      );
      await client.query(
        `UPDATE trigger_health_snapshots SET last_received_at=clock_timestamp(),backlog_count=backlog_count+1,observed_at=clock_timestamp() WHERE workspace_id=$1 AND trigger_id=$2`,
        [context.workspaceId, triggerId]
      );
      return { id: receiptId, queueId, state: "queued", queued: true };
    });
  }
  async remove(context: TenantContext, triggerId: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `UPDATE workflow_triggers SET state='disabled',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, triggerId]
      );
    });
  }
}
