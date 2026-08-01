import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { auditEventHash } from "@knotline/operations";
import { withTenantTransaction, type TenantContext } from "./context.js";

export interface GovernanceRepository {
  auditEvents(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  appendAudit(
    c: TenantContext,
    event: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  createExport(
    c: TenantContext,
    kind: "audit" | "workspace" | "user",
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  export(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  createDeletion(
    c: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deletion(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  retention(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  putRetention(
    c: TenantContext,
    input: readonly Readonly<Record<string, unknown>>[]
  ): Promise<readonly Record<string, unknown>[]>;
  holds(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createHold(
    c: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  releaseHold(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  dataPolicy(c: TenantContext): Promise<Record<string, unknown> | undefined>;
  putDataPolicy(
    c: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  supportAccess(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createSupportAccess(
    c: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  revokeSupportAccess(c: TenantContext, id: string): Promise<void>;
}

export class PostgresGovernanceRepository implements GovernanceRepository {
  constructor(private readonly pool: Pool) {}
  auditEvents(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,sequence,actor_id "actorId",action,resource_type "resourceType",resource_id "resourceId",result,reason,request_id "requestId",prior_hash "priorHash",event_hash "eventHash",metadata,occurred_at "occurredAt" FROM audit_events WHERE workspace_id=$1 ORDER BY sequence`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  appendAudit(c: TenantContext, event: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [c.workspaceId]);
      const last = (
        await x.query<{ sequence: string; event_hash: string }>(
          `SELECT sequence,event_hash FROM audit_events WHERE workspace_id=$1 ORDER BY sequence DESC LIMIT 1`,
          [c.workspaceId]
        )
      ).rows[0];
      const sequence = Number(last?.sequence ?? 0) + 1,
        priorHash = last?.event_hash ?? "0".repeat(64),
        requestId = event.requestId ?? randomUUID();
      const content = {
        sequence,
        actorId: c.principalId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? c.workspaceId,
        result: event.result ?? "succeeded",
        reason: event.reason ?? null,
        requestId,
        metadata: event.metadata ?? {}
      };
      const eventHash = auditEventHash(priorHash, content);
      return (
        await x.query<Record<string, unknown>>(
          `INSERT INTO audit_events(workspace_id,id,sequence,actor_id,action,resource_type,resource_id,result,reason,request_id,prior_hash,event_hash,metadata)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)RETURNING id,sequence,action,resource_type "resourceType",resource_id "resourceId",result,prior_hash "priorHash",event_hash "eventHash",occurred_at "occurredAt"`,
          [
            c.workspaceId,
            randomUUID(),
            sequence,
            c.principalId,
            event.action,
            event.resourceType,
            event.resourceId ?? c.workspaceId,
            event.result ?? "succeeded",
            event.reason ?? null,
            requestId,
            priorHash,
            eventHash,
            JSON.stringify(event.metadata ?? {})
          ]
        )
      ).rows[0]!;
    });
  }
  createExport(
    c: TenantContext,
    kind: "audit" | "workspace" | "user",
    input: Readonly<Record<string, unknown>>
  ) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO governance_exports(workspace_id,id,kind,subject_user_id,query,expires_at,created_by)VALUES($1,$2,$3,$4,$5,clock_timestamp()+interval '24 hours',$6)RETURNING id,kind,state,expires_at "expiresAt",created_at "createdAt"`,
            [
              c.workspaceId,
              randomUUID(),
              kind,
              input.subjectUserId ?? null,
              JSON.stringify(input.query ?? {}),
              c.principalId
            ]
          )
        ).rows[0]!
    );
  }
  export(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `SELECT id,kind,state,manifest,integrity_digest "integrityDigest",expires_at "expiresAt",created_at "createdAt" FROM governance_exports WHERE workspace_id=$1 AND id=$2`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("EXPORT_NOT_FOUND");
      return row;
    });
  }
  createDeletion(c: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const held =
        Number(
          (
            await x.query<{ count: string }>(
              `SELECT count(*) FROM legal_holds WHERE workspace_id=$1 AND state='active'`,
              [c.workspaceId]
            )
          ).rows[0]?.count ?? 0
        ) > 0;
      return (
        await x.query<Record<string, unknown>>(
          `INSERT INTO data_deletion_jobs(workspace_id,id,subject_user_id,scope,state,steps,requested_by)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,subject_user_id "subjectUserId",scope,state,steps,created_at "createdAt"`,
          [
            c.workspaceId,
            randomUUID(),
            input.subjectUserId ?? null,
            input.scope,
            held ? "blocked_hold" : "queued",
            JSON.stringify([{ store: "registry", state: "pending" }]),
            c.principalId
          ]
        )
      ).rows[0]!;
    });
  }
  deletion(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `SELECT id,subject_user_id "subjectUserId",scope,state,steps,proof,created_at "createdAt",updated_at "updatedAt" FROM data_deletion_jobs WHERE workspace_id=$1 AND id=$2`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("DELETION_NOT_FOUND");
      return row;
    });
  }
  retention(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT data_class "dataClass",duration_days "durationDays",action,version,effective_at "effectiveAt" FROM retention_policies WHERE workspace_id=$1 ORDER BY data_class`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  putRetention(c: TenantContext, input: readonly Readonly<Record<string, unknown>>[]) {
    return withTenantTransaction(this.pool, c, async (x) => {
      for (const policy of input)
        await x.query(
          `INSERT INTO retention_policies(workspace_id,data_class,duration_days,action,updated_by)VALUES($1,$2,$3,$4,$5)ON CONFLICT(workspace_id,data_class)DO UPDATE SET duration_days=EXCLUDED.duration_days,action=EXCLUDED.action,version=retention_policies.version+1,effective_at=clock_timestamp(),updated_by=EXCLUDED.updated_by`,
          [c.workspaceId, policy.dataClass, policy.durationDays, policy.action, c.principalId]
        );
      return (
        await x.query<Record<string, unknown>>(
          `SELECT data_class "dataClass",duration_days "durationDays",action,version,effective_at "effectiveAt" FROM retention_policies WHERE workspace_id=$1 ORDER BY data_class`,
          [c.workspaceId]
        )
      ).rows;
    });
  }
  holds(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,case_reference "caseReference",scope,reason,state,created_at "createdAt",released_at "releasedAt" FROM legal_holds WHERE workspace_id=$1 ORDER BY created_at DESC`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createHold(c: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO legal_holds(workspace_id,id,case_reference,scope,reason,created_by,approved_by)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,case_reference "caseReference",scope,reason,state,created_at "createdAt"`,
            [
              c.workspaceId,
              randomUUID(),
              input.caseReference,
              JSON.stringify(input.scope),
              input.reason,
              c.principalId,
              input.approvedBy ?? null
            ]
          )
        ).rows[0]!
    );
  }
  releaseHold(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE legal_holds SET state='released',released_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state='active' RETURNING id,case_reference "caseReference",state,released_at "releasedAt"`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("LEGAL_HOLD_NOT_FOUND");
      return row;
    });
  }
  dataPolicy(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT telemetry,model_providers "modelProviders",connector_policy "connectorPolicy",file_policy "filePolicy",memory_policy "memoryPolicy",public_sharing "publicSharing",support_access "supportAccess",allowed_region "allowedRegion",revision FROM workspace_data_policies WHERE workspace_id=$1`,
            [c.workspaceId]
          )
        ).rows[0]
    );
  }
  putDataPolicy(c: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO workspace_data_policies(workspace_id,telemetry,model_providers,connector_policy,file_policy,memory_policy,public_sharing,support_access,allowed_region,updated_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)ON CONFLICT(workspace_id)DO UPDATE SET telemetry=EXCLUDED.telemetry,model_providers=EXCLUDED.model_providers,connector_policy=EXCLUDED.connector_policy,file_policy=EXCLUDED.file_policy,memory_policy=EXCLUDED.memory_policy,public_sharing=EXCLUDED.public_sharing,support_access=EXCLUDED.support_access,allowed_region=EXCLUDED.allowed_region,revision=workspace_data_policies.revision+1,updated_by=EXCLUDED.updated_by RETURNING telemetry,model_providers "modelProviders",connector_policy "connectorPolicy",file_policy "filePolicy",memory_policy "memoryPolicy",public_sharing "publicSharing",support_access "supportAccess",allowed_region "allowedRegion",revision`,
            [
              c.workspaceId,
              input.telemetry,
              JSON.stringify(input.modelProviders ?? []),
              JSON.stringify(input.connectorPolicy ?? {}),
              JSON.stringify(input.filePolicy ?? {}),
              JSON.stringify(input.memoryPolicy ?? {}),
              input.publicSharing ?? false,
              input.supportAccess ?? false,
              input.allowedRegion,
              c.principalId
            ]
          )
        ).rows[0]!
    );
  }
  supportAccess(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,operator_reference "operatorReference",scope,reason,ticket,access_mode "accessMode",state,expires_at "expiresAt",created_at "createdAt" FROM support_access_grants WHERE workspace_id=$1 ORDER BY created_at DESC`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createSupportAccess(c: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO support_access_grants(workspace_id,id,operator_reference,scope,reason,ticket,access_mode,state,expires_at,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$9)RETURNING id,operator_reference "operatorReference",scope,reason,ticket,access_mode "accessMode",state,expires_at "expiresAt"`,
            [
              c.workspaceId,
              randomUUID(),
              input.operatorReference,
              JSON.stringify(input.scope),
              input.reason,
              input.ticket,
              input.accessMode,
              input.expiresAt,
              c.principalId
            ]
          )
        ).rows[0]!
    );
  }
  revokeSupportAccess(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(
        `UPDATE support_access_grants SET state='revoked' WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
    });
  }
}
