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
            `WITH search_query AS (
               SELECT websearch_to_tsquery('simple',$2) value
             ), candidates AS (
               SELECT 'index:'||id::text id,resource_type "resourceType",resource_id "resourceId",
                      display_fields fields,updated_at "updatedAt",ts_rank(search_text,search_query.value) rank
                 FROM search_documents,search_query
                WHERE workspace_id=$1 AND deleted_at IS NULL AND search_text @@ search_query.value
               UNION ALL
               SELECT 'workflow:'||id::text,'workflow',id,
                      jsonb_build_object('title',name,'summary',description,'state',state),updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',name,description,state,id::text)),search_query.value)
                 FROM workflows,search_query
                WHERE workspace_id=$1 AND state<>'archived'
                  AND to_tsvector('simple',concat_ws(' ',name,description,state,id::text)) @@ search_query.value
               UNION ALL
               SELECT 'run:'||run.id::text,'run',run.id,
                      jsonb_build_object('title',workflow.name||' run','summary',initcap(replace(run.state,'_',' '))||' · Workflow v'||run.workflow_version::text,'state',run.state),run.updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',workflow.name,workflow.description,run.state,run.id::text,run.temporal_workflow_id)),search_query.value)
                 FROM workflow_runs run
                 JOIN workflows workflow ON workflow.workspace_id=run.workspace_id AND workflow.id=run.workflow_id
                 CROSS JOIN search_query
                WHERE run.workspace_id=$1
                  AND to_tsvector('simple',concat_ws(' ',workflow.name,workflow.description,run.state,run.id::text,run.temporal_workflow_id)) @@ search_query.value
               UNION ALL
               SELECT 'task:'||task.id::text,'task',task.id,
                      jsonb_build_object('title',initcap(replace(task.node_key,'_',' ')),'summary',initcap(task.queue_class)||' task · '||initcap(replace(task.state,'_',' ')),'state',task.state),task.updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',task.node_key,task.node_kind,task.queue_class,task.state,task.id::text)),search_query.value)
                 FROM task_runs task,search_query
                WHERE task.workspace_id=$1
                  AND to_tsvector('simple',concat_ws(' ',task.node_key,task.node_kind,task.queue_class,task.state,task.id::text)) @@ search_query.value
               UNION ALL
               SELECT 'approval:'||approval.id::text,'approval',approval.id,
                      jsonb_build_object('title',coalesce(approval.packet->>'title','Approval for '||initcap(replace(task.node_key,'_',' '))),'summary',initcap(replace(approval.state,'_',' '))||' · Expires '||approval.expires_at::date::text,'state',approval.state),approval.updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',approval.packet->>'title',approval.packet->>'summary',task.node_key,approval.state,approval.id::text)),search_query.value)
                 FROM approvals approval
                 JOIN task_runs task ON task.workspace_id=approval.workspace_id AND task.id=approval.task_id
                 CROSS JOIN search_query
                WHERE approval.workspace_id=$1
                  AND to_tsvector('simple',concat_ws(' ',approval.packet->>'title',approval.packet->>'summary',task.node_key,approval.state,approval.id::text)) @@ search_query.value
               UNION ALL
               SELECT 'agent:'||id::text,'agent',id,
                      jsonb_build_object('title',name,'summary',description,'state',state),updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',name,description,stable_key,state,id::text)),search_query.value)
                 FROM agent_definitions,search_query
                WHERE workspace_id=$1 AND state<>'archived'
                  AND to_tsvector('simple',concat_ws(' ',name,description,stable_key,state,id::text)) @@ search_query.value
               UNION ALL
               SELECT 'connection:'||id::text,'connection',id,
                      jsonb_build_object('title',display_name,'summary',initcap(replace(connector_key,'_',' '))||' · '||initcap(replace(state,'_',' ')),'state',state),updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',display_name,connector_key,external_account_label,state,id::text)),search_query.value)
                 FROM connections,search_query
                WHERE workspace_id=$1 AND deleted_at IS NULL
                  AND to_tsvector('simple',concat_ws(' ',display_name,connector_key,external_account_label,state,id::text)) @@ search_query.value
               UNION ALL
               SELECT 'member:'||membership.id::text,'member',membership.id,
                      jsonb_build_object('title',users.display_name,'summary',users.email||' · '||initcap(membership.role),'state',membership.state),membership.updated_at,
                      ts_rank(to_tsvector('simple',concat_ws(' ',users.display_name,users.email,membership.role,membership.state,membership.id::text)),search_query.value)
                 FROM memberships membership
                 JOIN users ON users.id=membership.user_id
                 CROSS JOIN search_query
                WHERE membership.workspace_id=$1 AND membership.state='active'
                  AND to_tsvector('simple',concat_ws(' ',users.display_name,users.email,membership.role,membership.state,membership.id::text)) @@ search_query.value
             ), ranked AS (
               SELECT *,row_number() OVER(PARTITION BY "resourceType","resourceId" ORDER BY rank DESC,"updatedAt" DESC) ordinal
                 FROM candidates
             )
             SELECT id,"resourceType","resourceId",fields,"updatedAt"
               FROM ranked WHERE ordinal=1
              ORDER BY rank DESC,"updatedAt" DESC LIMIT 50`,
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
      const bucketRows = (
        await client.query<Record<string, unknown>>(
          `SELECT DISTINCT ON(metric_key) metric_key "metricKey",value::float8,
                  contributing_count::int "contributingCount",source_watermark "freshThrough",
                  dimensions||jsonb_build_object('source','metric_bucket') dimensions
             FROM metric_buckets
            WHERE workspace_id=$1 AND bucket_end>clock_timestamp()-interval '30 days'
            ORDER BY metric_key,bucket_start DESC`,
          [context.workspaceId]
        )
      ).rows;
      const liveRows = (
        await client.query<Record<string, unknown>>(
          `WITH recent_runs AS (
             SELECT state,started_at,finished_at,updated_at
               FROM workflow_runs
              WHERE workspace_id=$1 AND created_at>clock_timestamp()-interval '30 days'
           ),run_stats AS (
             SELECT count(*)::int total,
                    count(*) FILTER(WHERE state IN('queued','running','paused','cancelling'))::int in_progress,
                    count(*) FILTER(WHERE state IN('cancelled','succeeded','failed','policy_stopped'))::int terminal,
                    count(*) FILTER(WHERE state='succeeded')::int succeeded,
                    percentile_cont(0.5) WITHIN GROUP(
                      ORDER BY extract(epoch FROM(finished_at-started_at))/60
                    ) FILTER(WHERE started_at IS NOT NULL AND finished_at IS NOT NULL) median_minutes,
                    max(updated_at) watermark
               FROM recent_runs
           ),recent_tasks AS (
             SELECT task.queue_class,task.state,task.started_at,task.finished_at,task.updated_at
               FROM task_runs task
               JOIN workflow_runs run
                 ON run.workspace_id=task.workspace_id AND run.id=task.run_id
              WHERE task.workspace_id=$1 AND run.created_at>clock_timestamp()-interval '30 days'
           ),agent_stats AS (
             SELECT count(*) FILTER(WHERE queue_class='agent' AND state IN('succeeded','failed','cancelled'))::int terminal,
                    count(*) FILTER(WHERE queue_class='agent' AND state='succeeded')::int succeeded,
                    max(updated_at) FILTER(WHERE queue_class='agent') watermark
               FROM recent_tasks
           ),task_sla AS (
             SELECT count(*) FILTER(WHERE detail.due_at IS NOT NULL)::int eligible,
                    count(*) FILTER(
                      WHERE detail.due_at IS NOT NULL
                        AND CASE
                          WHEN task.finished_at IS NOT NULL THEN task.finished_at<=detail.due_at
                          ELSE clock_timestamp()<=detail.due_at
                        END
                    )::int on_track,
                    max(task.updated_at) FILTER(WHERE detail.due_at IS NOT NULL) watermark
               FROM human_task_details detail
               JOIN task_runs task
                 ON task.workspace_id=detail.workspace_id AND task.id=detail.task_id
               JOIN workflow_runs run
                 ON run.workspace_id=task.workspace_id AND run.id=task.run_id
              WHERE detail.workspace_id=$1 AND run.created_at>clock_timestamp()-interval '30 days'
           ),approval_stats AS (
             SELECT count(*)::int waiting,max(approval.updated_at) watermark
               FROM approvals approval
               JOIN task_runs task
                 ON task.workspace_id=approval.workspace_id AND task.id=approval.task_id
               JOIN workflow_runs run
                 ON run.workspace_id=task.workspace_id AND run.id=task.run_id
              WHERE approval.workspace_id=$1
                AND approval.state IN('PENDING','IN_REVIEW')
                AND run.state IN('queued','running','paused')
           ),workflow_stats AS (
             SELECT count(*) FILTER(WHERE state='active')::int active,max(updated_at) watermark
               FROM workflows WHERE workspace_id=$1
           ),metrics AS (
             SELECT 'workflow.success_rate'::text "metricKey",
                    CASE WHEN terminal>0 THEN succeeded*100.0/terminal END::float8 value,
                    terminal "contributingCount",watermark "freshThrough",
                    jsonb_build_object('source','live_operational','window','30d','calculation','successful terminal runs / all terminal runs') dimensions
               FROM run_stats
             UNION ALL
             SELECT 'runs.in_progress',in_progress::float8,total,watermark,
                    jsonb_build_object('source','live_operational','window','current','calculation','queued, running, paused, or cancelling runs')
               FROM run_stats
             UNION ALL
             SELECT 'run.median_duration_minutes',median_minutes::float8,terminal,watermark,
                    jsonb_build_object('source','live_operational','window','30d','calculation','median elapsed time of completed runs')
               FROM run_stats
             UNION ALL
             SELECT 'task.sla_on_track',
                    CASE WHEN eligible>0 THEN on_track*100.0/eligible END::float8,
                    eligible,watermark,
                    jsonb_build_object('source','live_operational','window','30d','calculation','human tasks completed or currently progressing before due time')
               FROM task_sla
             UNION ALL
             SELECT 'approvals.waiting',waiting::float8,waiting,watermark,
                    jsonb_build_object('source','live_operational','window','current','calculation','pending approvals belonging to active runs')
               FROM approval_stats
             UNION ALL
             SELECT 'agent.success_rate',
                    CASE WHEN terminal>0 THEN succeeded*100.0/terminal END::float8,
                    terminal,watermark,
                    jsonb_build_object('source','live_operational','window','30d','calculation','successful terminal agent tasks / all terminal agent tasks')
               FROM agent_stats
             UNION ALL
             SELECT 'workflow.active',active::float8,active,watermark,
                    jsonb_build_object('source','live_operational','window','current','calculation','active published workflows')
               FROM workflow_stats
           )
           SELECT "metricKey",value,"contributingCount",
                  coalesce("freshThrough",clock_timestamp()) "freshThrough",dimensions
             FROM metrics WHERE value IS NOT NULL`,
          [context.workspaceId]
        )
      ).rows;
      const liveKeys = new Set(liveRows.map((row) => row.metricKey));
      const rows = [...liveRows, ...bucketRows.filter((row) => !liveKeys.has(row.metricKey))];
      const freshThrough = rows.reduce<string | null>((latest, row) => {
        if (!row.freshThrough) return latest;
        const candidate = new Date(row.freshThrough as string | Date).toISOString();
        return !latest || candidate > latest ? candidate : latest;
      }, null);
      return {
        metrics: rows,
        freshThrough,
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
