import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

import {
  evaluationCaseSchema,
  evaluationSnapshotSchema,
  releaseGateSchema
} from "@knotline/contracts";
import type { Pool } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

const datasetCreateSchema = z
  .object({ name: z.string().min(1).max(160), description: z.string().max(2000) })
  .strict();
const publishSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    sourceType: z.enum(["synthetic", "curated", "run_snapshot", "csv", "jsonl", "manual"]),
    consentReference: z.string().optional(),
    cases: z.array(evaluationCaseSchema).min(1).max(10_000)
  })
  .strict();

export interface EvaluationRepository {
  listDatasets(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  getDataset(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
  createDataset(context: TenantContext, input: unknown): Promise<{ id: string }>;
  publishDatasetVersion(
    context: TenantContext,
    id: string,
    input: unknown
  ): Promise<{ version: number }>;
  createRun(
    context: TenantContext,
    agentId: string,
    agentVersion: number,
    input: unknown
  ): Promise<{ id: string; state: string }>;
  getRun(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
  cancelRun(context: TenantContext, id: string): Promise<{ id: string; state: string } | undefined>;
  listComparisons(
    context: TenantContext,
    agentId?: string
  ): Promise<readonly Record<string, unknown>[]>;
  createComparison(context: TenantContext, input: unknown): Promise<{ id: string }>;
  promote(
    context: TenantContext,
    agentId: string,
    version: number,
    input: unknown
  ): Promise<{ id: string }>;
  rollback(context: TenantContext, releaseId: string): Promise<{ id: string }>;
  onlineMetrics(
    context: TenantContext,
    agentId: string
  ): Promise<readonly Record<string, unknown>[]>;
}

export class PostgresEvaluationRepository implements EvaluationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly fixtureKey: Buffer
  ) {
    if (fixtureKey.byteLength !== 32) throw new Error("EVALUATION_FIXTURE_KEY_MUST_BE_32_BYTES");
  }

  listDatasets(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT dataset.*,coalesce(version.case_count,0) case_count FROM evaluation_datasets dataset
       LEFT JOIN evaluation_dataset_versions version ON version.workspace_id=dataset.workspace_id AND version.dataset_id=dataset.id AND version.version=dataset.current_version
       WHERE dataset.workspace_id=$1 ORDER BY dataset.created_at DESC,dataset.id`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  getDataset(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT dataset.*,(SELECT jsonb_agg(version ORDER BY version.version DESC) FROM evaluation_dataset_versions version WHERE version.workspace_id=dataset.workspace_id AND version.dataset_id=dataset.id) versions,
       (SELECT jsonb_agg(jsonb_build_object('id',case_row.id,'stableKey',case_row.stable_key,'tags',case_row.tags,'difficulty',case_row.difficulty,'risk',case_row.risk,'sensitive',case_row.sensitive) ORDER BY case_row.stable_key) FROM evaluation_cases case_row WHERE case_row.workspace_id=dataset.workspace_id AND case_row.dataset_id=dataset.id AND case_row.dataset_version=dataset.current_version) cases
       FROM evaluation_datasets dataset WHERE dataset.workspace_id=$1 AND dataset.id=$2`,
            [context.workspaceId, id]
          )
        ).rows[0]
    );
  }

  async createDataset(context: TenantContext, input: unknown) {
    const value = datasetCreateSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        `INSERT INTO evaluation_datasets(workspace_id,id,name,description,owner_id,state) VALUES($1,$2,$3,$4,$5,'draft')`,
        [context.workspaceId, id, value.name, value.description, context.principalId]
      );
      return { id };
    });
  }

  async publishDatasetVersion(context: TenantContext, id: string, input: unknown) {
    const value = publishSchema.parse(input);
    if (value.sourceType === "run_snapshot" && !value.consentReference)
      throw new HumanTaskAuthorizationError("EVALUATION_CONSENT_REQUIRED");
    return withTenantTransaction(this.pool, context, async (client) => {
      const dataset = await client.query<{ current_version: number | null }>(
        `SELECT current_version FROM evaluation_datasets WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, id]
      );
      if (!dataset.rows[0]) throw new HumanTaskAuthorizationError("EVALUATION_DATASET_NOT_FOUND");
      const current = Number(dataset.rows[0].current_version ?? 0);
      if (current !== value.expectedVersion)
        throw new HumanTaskConflictError("STALE_EVALUATION_DATASET");
      const version = current + 1;
      const hash = contentHash(value.cases);
      await client.query(
        `INSERT INTO evaluation_dataset_versions(workspace_id,dataset_id,version,content_hash,case_count,source_type,consent_reference,published_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.workspaceId,
          id,
          version,
          hash,
          value.cases.length,
          value.sourceType,
          value.consentReference ?? null,
          context.principalId
        ]
      );
      for (const item of value.cases) {
        const encrypted = item.sensitive ? this.#encrypt(item.input) : undefined;
        await client.query(
          `INSERT INTO evaluation_cases(workspace_id,id,dataset_id,dataset_version,stable_key,input,expected,reference_data,tags,difficulty,risk,sensitive,encrypted_fixture,fixture_key_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            context.workspaceId,
            createId(),
            id,
            version,
            item.stableKey,
            JSON.stringify(item.sensitive ? null : item.input),
            JSON.stringify(item.expected ?? null),
            JSON.stringify(item.references),
            item.tags,
            item.difficulty,
            item.risk,
            item.sensitive,
            encrypted ?? null,
            item.sensitive ? "evaluation-fixture-v1" : null
          ]
        );
      }
      await client.query(
        `UPDATE evaluation_datasets SET current_version=$3,state='active' WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, id, version]
      );
      return { version };
    });
  }

  async createRun(context: TenantContext, agentId: string, agentVersion: number, input: unknown) {
    const value = z
      .object({
        suiteId: z.uuid(),
        suiteVersion: z.number().int().positive(),
        datasetId: z.uuid(),
        datasetVersion: z.number().int().positive(),
        snapshot: evaluationSnapshotSchema,
        idempotencyKey: z.string().min(8)
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const existing = await client.query<{ id: string; state: string }>(
        `SELECT id,state FROM evaluation_runs WHERE workspace_id=$1 AND idempotency_key=$2`,
        [context.workspaceId, value.idempotencyKey]
      );
      if (existing.rows[0]) return existing.rows[0];
      const id = createId();
      const row = await client.query<{ id: string; state: string }>(
        `INSERT INTO evaluation_runs(workspace_id,id,suite_id,suite_version,agent_id,agent_version,dataset_id,dataset_version,state,reproducibility_snapshot,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9,$10,$11) RETURNING id,state`,
        [
          context.workspaceId,
          id,
          value.suiteId,
          value.suiteVersion,
          agentId,
          agentVersion,
          value.datasetId,
          value.datasetVersion,
          JSON.stringify(value.snapshot),
          value.idempotencyKey,
          context.principalId
        ]
      );
      return row.rows[0]!;
    });
  }

  getRun(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT run.*,(SELECT jsonb_agg(jsonb_build_object('caseId',result.case_id,'outputHash',result.output_hash,'latencyMs',result.latency_ms,'cost',result.cost_decimal,'graders',(SELECT jsonb_agg(grader) FROM evaluation_grader_results grader WHERE grader.workspace_id=result.workspace_id AND grader.eval_run_id=result.eval_run_id AND grader.case_id=result.case_id)) ORDER BY result.case_id) FROM evaluation_case_results result WHERE result.workspace_id=run.workspace_id AND result.eval_run_id=run.id) results FROM evaluation_runs run WHERE run.workspace_id=$1 AND run.id=$2`,
            [context.workspaceId, id]
          )
        ).rows[0]
    );
  }

  cancelRun(context: TenantContext, id: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ id: string; state: string }>(
        `UPDATE evaluation_runs SET state='cancelled',completed_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND state IN ('queued','running') RETURNING id,state`,
        [context.workspaceId, id]
      );
      if (result.rows[0]) return result.rows[0];
      return (
        await client.query<{ id: string; state: string }>(
          `SELECT id,state FROM evaluation_runs WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, id]
        )
      ).rows[0];
    });
  }

  listComparisons(context: TenantContext, agentId?: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT comparison.*,candidate.agent_id,candidate.agent_version candidate_version,baseline.agent_version baseline_version FROM evaluation_comparisons comparison JOIN evaluation_runs candidate ON candidate.workspace_id=comparison.workspace_id AND candidate.id=comparison.candidate_run_id JOIN evaluation_runs baseline ON baseline.workspace_id=comparison.workspace_id AND baseline.id=comparison.baseline_run_id WHERE comparison.workspace_id=$1 AND ($2::uuid IS NULL OR candidate.agent_id=$2) ORDER BY comparison.created_at DESC`,
            [context.workspaceId, agentId ?? null]
          )
        ).rows
    );
  }

  async createComparison(context: TenantContext, input: unknown) {
    const value = z
      .object({
        baselineRunId: z.uuid(),
        candidateRunId: z.uuid(),
        summary: z.record(z.string(), z.unknown()),
        gateDecision: z.record(z.string(), z.unknown()).optional()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        `INSERT INTO evaluation_comparisons(workspace_id,id,baseline_run_id,candidate_run_id,summary,gate_decision,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          id,
          value.baselineRunId,
          value.candidateRunId,
          JSON.stringify(value.summary),
          value.gateDecision ? JSON.stringify(value.gateDecision) : null,
          context.principalId
        ]
      );
      return { id };
    });
  }

  async promote(context: TenantContext, agentId: string, version: number, input: unknown) {
    const value = z
      .object({
        environment: z.enum(["development", "staging", "production"]),
        channel: z.enum(["shadow", "canary", "stable"]),
        canaryPercentage: z.number().int().min(0).max(100),
        comparisonId: z.uuid(),
        gate: releaseGateSchema,
        gateDecision: z.object({ passed: z.literal(true), reasons: z.array(z.string()) })
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        `INSERT INTO agent_releases(workspace_id,id,agent_id,version,environment,channel,canary_percentage,comparison_id,gate_snapshot,state,promoted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)`,
        [
          context.workspaceId,
          id,
          agentId,
          version,
          value.environment,
          value.channel,
          value.canaryPercentage,
          value.comparisonId,
          JSON.stringify({ gate: value.gate, decision: value.gateDecision }),
          context.principalId
        ]
      );
      return { id };
    });
  }

  async rollback(context: TenantContext, releaseId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const release = await client.query<{
        agent_id: string;
        version: number;
        environment: string;
        comparison_id: string;
        gate_snapshot: unknown;
      }>(`SELECT * FROM agent_releases WHERE workspace_id=$1 AND id=$2 AND state='active'`, [
        context.workspaceId,
        releaseId
      ]);
      const prior = release.rows[0];
      if (!prior) throw new HumanTaskConflictError("RELEASE_NOT_ACTIVE");
      const id = createId();
      await client.query(
        `INSERT INTO agent_releases(workspace_id,id,agent_id,version,environment,channel,canary_percentage,comparison_id,gate_snapshot,state,promoted_by,rollback_of,rolled_back_at) VALUES($1,$2,$3,$4,$5,'rolled_back',0,$6,$7,'active',$8,$9,clock_timestamp())`,
        [
          context.workspaceId,
          id,
          prior.agent_id,
          prior.version,
          prior.environment,
          prior.comparison_id,
          prior.gate_snapshot,
          context.principalId,
          releaseId
        ]
      );
      return { id };
    });
  }

  onlineMetrics(context: TenantContext, agentId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT agent_version,bucket_start,metric,sample_count,value_sum,warning FROM agent_online_metric_buckets WHERE workspace_id=$1 AND agent_id=$2 ORDER BY bucket_start DESC,metric`,
            [context.workspaceId, agentId]
          )
        ).rows
    );
  }

  #encrypt(value: unknown) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.fixtureKey, nonce);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
  }

  decryptFixture(value: Buffer): unknown {
    const decipher = createDecipheriv("aes-256-gcm", this.fixtureKey, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8")
    ) as unknown;
  }
}
