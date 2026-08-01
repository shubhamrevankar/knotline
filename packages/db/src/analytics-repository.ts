import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenantTransaction, type TenantContext } from "./context.js";
export interface AnalyticsRepository {
  search(context: TenantContext, query: string): Promise<readonly Record<string, unknown>[]>;
  savedViews(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createView(
    context: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updateView(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deleteView(context: TenantContext, id: string): Promise<void>;
  dashboard(context: TenantContext): Promise<Record<string, unknown>>;
  reports(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createReport(
    context: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  report(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
  exportReport(
    context: TenantContext,
    id: string,
    format: "csv" | "pdf"
  ): Promise<Record<string, unknown>>;
  scheduleReport(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updateSchedule(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deleteSchedule(context: TenantContext, id: string): Promise<void>;
}
export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly pool: Pool) {}
  async search(context: TenantContext, query: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,resource_type "resourceType",resource_id "resourceId",display_fields "fields",updated_at "updatedAt" FROM search_documents WHERE workspace_id=$1 AND deleted_at IS NULL AND search_text @@ websearch_to_tsquery('simple',$2) ORDER BY ts_rank(search_text,websearch_to_tsquery('simple',$2)) DESC,updated_at DESC LIMIT 50`,
            [context.workspaceId, query]
          )
        ).rows
    );
  }
  async savedViews(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,name,resource_type "resourceType",visibility,definition,schema_version "schemaVersion",is_default "isDefault",revision FROM saved_views WHERE workspace_id=$1 AND(owner_user_id=$2 OR visibility='workspace') ORDER BY is_default DESC,name`,
            [context.workspaceId, context.principalId]
          )
        ).rows
    );
  }
  async createView(context: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `INSERT INTO saved_views(workspace_id,id,owner_user_id,resource_type,name,visibility,definition)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,name,resource_type "resourceType",visibility,definition,schema_version "schemaVersion",is_default "isDefault",revision`,
            [
              context.workspaceId,
              randomUUID(),
              context.principalId,
              input.resourceType,
              input.name,
              input.visibility,
              input.definition
            ]
          )
        ).rows[0]!
    );
  }
  async updateView(context: TenantContext, id: string, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE saved_views SET name=COALESCE($4,name),visibility=COALESCE($5,visibility),definition=COALESCE($6,definition),is_default=COALESCE($7,is_default),revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND owner_user_id=$3 AND revision=$8 RETURNING id,name,resource_type "resourceType",visibility,definition,schema_version "schemaVersion",is_default "isDefault",revision`,
        [
          context.workspaceId,
          id,
          context.principalId,
          input.name ?? null,
          input.visibility ?? null,
          input.definition ?? null,
          input.isDefault ?? null,
          input.expectedRevision
        ]
      );
      if (!result.rows[0]) throw new Error("SAVED_VIEW_CONFLICT");
      return result.rows[0];
    });
  }
  async deleteView(context: TenantContext, id: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      const references = await client.query(
        `SELECT 1 FROM reports WHERE workspace_id=$1 AND definition->>'savedViewId'=$2 LIMIT 1`,
        [context.workspaceId, id]
      );
      if (references.rowCount) throw new Error("SAVED_VIEW_REFERENCED");
      await client.query(
        `DELETE FROM saved_views WHERE workspace_id=$1 AND id=$2 AND owner_user_id=$3`,
        [context.workspaceId, id, context.principalId]
      );
    });
  }
  async dashboard(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const rows = (
        await client.query<Record<string, unknown>>(
          `SELECT metric_key "metricKey",value::float8,contributing_count "contributingCount",source_watermark "freshThrough" FROM metric_buckets WHERE workspace_id=$1 AND bucket_end>clock_timestamp()-interval '30 days' ORDER BY bucket_start DESC LIMIT 100`,
          [context.workspaceId]
        )
      ).rows;
      return {
        metrics: rows,
        freshThrough: rows[0]?.freshThrough ?? null,
        partial: rows.length === 0,
        demoExcluded: true
      };
    });
  }
  async reports(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,name,definition,visibility,state,revision,updated_at "updatedAt" FROM reports WHERE workspace_id=$1 AND(owner_user_id=$2 OR visibility='workspace')ORDER BY updated_at DESC`,
            [context.workspaceId, context.principalId]
          )
        ).rows
    );
  }
  async createReport(context: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `INSERT INTO reports(workspace_id,id,owner_user_id,name,definition,visibility)VALUES($1,$2,$3,$4,$5,$6)RETURNING id,name,definition,visibility,state,revision`,
            [
              context.workspaceId,
              randomUUID(),
              context.principalId,
              input.name,
              input.definition,
              input.visibility
            ]
          )
        ).rows[0]!
    );
  }
  async report(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,name,definition,visibility,state,revision,updated_at "updatedAt" FROM reports WHERE workspace_id=$1 AND id=$2 AND(owner_user_id=$3 OR visibility='workspace')`,
            [context.workspaceId, id, context.principalId]
          )
        ).rows[0]
    );
  }
  async exportReport(context: TenantContext, id: string, format: "csv" | "pdf") {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `INSERT INTO report_exports(workspace_id,id,report_id,state,format,expires_at)SELECT $1,$2,id,'queued',$4,clock_timestamp()+interval '1 hour' FROM reports WHERE workspace_id=$1 AND id=$3 AND(owner_user_id=$5 OR visibility='workspace')RETURNING id,report_id "reportId",state,format,expires_at "expiresAt"`,
            [context.workspaceId, randomUUID(), id, format, context.principalId]
          )
        ).rows[0]!
    );
  }
  async scheduleReport(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `INSERT INTO report_schedules(workspace_id,id,report_id,cadence,time_zone,state)SELECT $1,$2,id,$4,$5,'active' FROM reports WHERE workspace_id=$1 AND id=$3 AND owner_user_id=$6 RETURNING id,report_id "reportId",cadence,time_zone "timeZone",state,revision`,
            [
              context.workspaceId,
              randomUUID(),
              id,
              input.cadence,
              input.timeZone,
              context.principalId
            ]
          )
        ).rows[0]!
    );
  }
  async updateSchedule(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE report_schedules schedule SET cadence=COALESCE($4,schedule.cadence),time_zone=COALESCE($5,schedule.time_zone),state=COALESCE($6,schedule.state),revision=schedule.revision+1 FROM reports report WHERE schedule.workspace_id=$1 AND schedule.id=$2 AND schedule.revision=$3 AND report.workspace_id=schedule.workspace_id AND report.id=schedule.report_id AND report.owner_user_id=$7 RETURNING schedule.id,schedule.report_id "reportId",schedule.cadence,schedule.time_zone "timeZone",schedule.state,schedule.revision`,
        [
          context.workspaceId,
          id,
          input.expectedRevision,
          input.cadence ?? null,
          input.timeZone ?? null,
          input.state ?? null,
          context.principalId
        ]
      );
      if (!result.rows[0]) throw new Error("REPORT_SCHEDULE_CONFLICT");
      return result.rows[0];
    });
  }
  async deleteSchedule(context: TenantContext, id: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `DELETE FROM report_schedules schedule USING reports report WHERE schedule.workspace_id=$1 AND schedule.id=$2 AND report.workspace_id=schedule.workspace_id AND report.id=schedule.report_id AND report.owner_user_id=$3`,
        [context.workspaceId, id, context.principalId]
      );
    });
  }
}
