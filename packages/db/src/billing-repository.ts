import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenantTransaction, type TenantContext } from "./context.js";
export interface BillingRepository {
  plans(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  summary(context: TenantContext): Promise<Record<string, unknown>>;
  usage(context: TenantContext): Promise<Record<string, unknown>>;
  forecast(context: TenantContext): Promise<Record<string, unknown>>;
  budgets(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createBudget(
    context: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  budget(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
  updateBudget(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  addThreshold(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updateThreshold(
    context: TenantContext,
    id: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deleteThreshold(context: TenantContext, id: string): Promise<void>;
  setSpendStop(
    context: TenantContext,
    enabled: boolean,
    reason: string
  ): Promise<Record<string, unknown>>;
}
export class PostgresBillingRepository implements BillingRepository {
  constructor(private readonly pool: Pool) {}
  plans(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            `SELECT id,plan_key "planKey",version,name,currency,monthly_amount::text "monthlyAmount",features,quotas,effective_at "effectiveAt" FROM billing_plan_versions WHERE workspace_id=$1 AND effective_at<=clock_timestamp() ORDER BY monthly_amount`,
            [context.workspaceId]
          )
        ).rows
    );
  }
  summary(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (c) => {
      const subscription =
        (
          await c.query<Record<string, unknown>>(
            `SELECT subscription.id,plan.name "planName",subscription.state,subscription.period_start "periodStart",subscription.period_end "periodEnd",subscription.cancel_at_period_end "cancelAtPeriodEnd",subscription.revision FROM billing_subscriptions subscription JOIN billing_plan_versions plan ON plan.workspace_id=subscription.workspace_id AND plan.id=subscription.plan_version_id WHERE subscription.workspace_id=$1 ORDER BY subscription.period_end DESC LIMIT 1`,
            [context.workspaceId]
          )
        ).rows[0] ?? null;
      const invoices = (
        await c.query<Record<string, unknown>>(
          `SELECT id,total::text,currency,state,due_at "dueAt",hosted_url "hostedUrl" FROM billing_invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 12`,
          [context.workspaceId]
        )
      ).rows;
      return {
        subscription,
        invoices,
        paymentDataStored: false,
        providerState: subscription ? "projected" : "not_configured"
      };
    });
  }
  usage(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (c) => {
      const rows = (
        await c.query<Record<string, unknown>>(
          `SELECT meter,sum(quantity)::text quantity,unit,sum(original_amount)::text amount,currency,max(occurred_at) "freshThrough" FROM usage_ledger WHERE workspace_id=$1 GROUP BY meter,unit,currency ORDER BY meter`,
          [context.workspaceId]
        )
      ).rows;
      return {
        dimensions: rows,
        freshThrough: rows[0]?.freshThrough ?? null,
        partial: rows.length === 0,
        adjustmentsIncluded: true
      };
    });
  }
  async forecast(context: TenantContext) {
    const usage = await this.usage(context);
    return {
      method: "linear_period_to_date",
      assumptions: ["Current period rate remains constant"],
      ...usage
    };
  }
  budgets(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            `SELECT id,name,currency,amount::text,mode,period,scope,state,revision FROM budget_policies WHERE workspace_id=$1 ORDER BY name`,
            [context.workspaceId]
          )
        ).rows
    );
  }
  createBudget(context: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      context,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            `INSERT INTO budget_policies(workspace_id,id,name,currency,amount,mode,period,scope)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING id,name,currency,amount::text,mode,period,scope,state,revision`,
            [
              context.workspaceId,
              randomUUID(),
              input.name,
              input.currency,
              input.amount,
              input.mode,
              input.period,
              input.scope ?? {}
            ]
          )
        ).rows[0]!
    );
  }
  budget(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            `SELECT id,name,currency,amount::text,mode,period,scope,state,revision FROM budget_policies WHERE workspace_id=$1 AND id=$2`,
            [context.workspaceId, id]
          )
        ).rows[0]
    );
  }
  updateBudget(context: TenantContext, id: string, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, context, async (c) => {
      const row = (
        await c.query<Record<string, unknown>>(
          `UPDATE budget_policies SET name=COALESCE($4,name),amount=COALESCE($5,amount),mode=COALESCE($6,mode),scope=COALESCE($7,scope),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND revision=$3 RETURNING id,name,currency,amount::text,mode,period,scope,state,revision`,
          [
            context.workspaceId,
            id,
            input.expectedRevision,
            input.name ?? null,
            input.amount ?? null,
            input.mode ?? null,
            input.scope ?? null
          ]
        )
      ).rows[0];
      if (!row) throw new Error("BUDGET_CONFLICT");
      return row;
    });
  }
  addThreshold(context: TenantContext, id: string, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      context,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            `INSERT INTO budget_thresholds(workspace_id,id,budget_id,percent,action,channels)SELECT $1,$2,id,$4,$5,$6 FROM budget_policies WHERE workspace_id=$1 AND id=$3 RETURNING id,budget_id "budgetId",percent::text,action,channels,state,revision`,
            [
              context.workspaceId,
              randomUUID(),
              id,
              input.percent,
              input.action,
              JSON.stringify(input.channels)
            ]
          )
        ).rows[0]!
    );
  }
  updateThreshold(context: TenantContext, id: string, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, context, async (c) => {
      const row = (
        await c.query<Record<string, unknown>>(
          `UPDATE budget_thresholds SET percent=COALESCE($4,percent),action=COALESCE($5,action),channels=COALESCE($6,channels),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND revision=$3 RETURNING id,budget_id "budgetId",percent::text,action,channels,state,revision`,
          [
            context.workspaceId,
            id,
            input.expectedRevision,
            input.percent ?? null,
            input.action ?? null,
            input.channels === undefined ? null : JSON.stringify(input.channels)
          ]
        )
      ).rows[0];
      if (!row) throw new Error("THRESHOLD_CONFLICT");
      return row;
    });
  }
  deleteThreshold(context: TenantContext, id: string) {
    return withTenantTransaction(this.pool, context, async (c) => {
      await c.query(`DELETE FROM budget_thresholds WHERE workspace_id=$1 AND id=$2`, [
        context.workspaceId,
        id
      ]);
    });
  }
  setSpendStop(context: TenantContext, enabled: boolean, reason: string) {
    return withTenantTransaction(this.pool, context, async (c) => {
      await c.query(
        `UPDATE budget_periods SET spend_stop=$2,version=version+1 WHERE workspace_id=$1`,
        [context.workspaceId, enabled]
      );
      return { enabled, reason, effectiveAt: new Date().toISOString() };
    });
  }
}
