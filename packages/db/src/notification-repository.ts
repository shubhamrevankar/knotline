import type { Pool } from "pg";
import { withTenantTransaction, type TenantContext } from "./context.js";
export interface NotificationPreferenceInput {
  readonly eventType: string;
  readonly channels: Readonly<Record<string, string>>;
  readonly quietStart?: string | undefined;
  readonly quietEnd?: string | undefined;
  readonly timeZone: string;
  readonly language: string;
  readonly expectedRevision?: number | undefined;
}
export interface NotificationRepository {
  list(
    context: TenantContext,
    filter?: "all" | "unread"
  ): Promise<readonly Record<string, unknown>[]>;
  markRead(context: TenantContext, id: string): Promise<Record<string, unknown>>;
  markAllRead(context: TenantContext): Promise<{ updated: number }>;
  userPreferences(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  updateUserPreferences(
    context: TenantContext,
    input: readonly NotificationPreferenceInput[]
  ): Promise<readonly Record<string, unknown>[]>;
  workspacePolicy(context: TenantContext): Promise<Record<string, unknown>>;
  updateWorkspacePolicy(
    context: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
}
export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: Pool) {}
  async list(context: TenantContext, filter: "all" | "unread" = "all") {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT n.id,n.group_key "groupKey",n.title,n.body_summary "body",n.deep_link "deepLink",n.read_at "readAt",n.unavailable_reason "unavailableReason",n.created_at "createdAt",i.event_type "eventType",i.priority FROM notification_items n JOIN notification_intents i ON i.workspace_id=n.workspace_id AND i.id=n.intent_id WHERE n.workspace_id=$1 AND n.recipient_user_id=$2 AND($3='all' OR n.read_at IS NULL) ORDER BY n.created_at DESC LIMIT 200`,
            [context.workspaceId, context.principalId, filter]
          )
        ).rows
    );
  }
  async markRead(context: TenantContext, id: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE notification_items SET read_at=COALESCE(read_at,clock_timestamp()) WHERE workspace_id=$1 AND recipient_user_id=$2 AND id=$3 RETURNING id,read_at "readAt"`,
        [context.workspaceId, context.principalId, id]
      );
      if (!result.rows[0]) throw new Error("NOTIFICATION_NOT_FOUND");
      return result.rows[0];
    });
  }
  async markAllRead(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE notification_items SET read_at=clock_timestamp() WHERE workspace_id=$1 AND recipient_user_id=$2 AND read_at IS NULL`,
        [context.workspaceId, context.principalId]
      );
      return { updated: result.rowCount ?? 0 };
    });
  }
  async userPreferences(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT event_type "eventType",channel_cadences channels,quiet_start "quietStart",quiet_end "quietEnd",time_zone "timeZone",language,revision FROM notification_preferences WHERE workspace_id=$1 AND user_id=$2 ORDER BY event_type`,
            [context.workspaceId, context.principalId]
          )
        ).rows
    );
  }
  async updateUserPreferences(
    context: TenantContext,
    input: readonly NotificationPreferenceInput[]
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      for (const value of input) {
        if (
          value.eventType.startsWith("security.") &&
          Object.values(value.channels).every((cadence) => cadence === "off")
        )
          throw new Error("MANDATORY_SECURITY_NOTIFICATION");
        const result = await client.query(
          `INSERT INTO notification_preferences(workspace_id,user_id,event_type,channel_cadences,quiet_start,quiet_end,time_zone,language,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,clock_timestamp()) ON CONFLICT(workspace_id,user_id,event_type) DO UPDATE SET channel_cadences=EXCLUDED.channel_cadences,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,time_zone=EXCLUDED.time_zone,language=EXCLUDED.language,revision=notification_preferences.revision+1,updated_at=clock_timestamp() WHERE notification_preferences.revision=$9`,
          [
            context.workspaceId,
            context.principalId,
            value.eventType,
            value.channels,
            value.quietStart ?? null,
            value.quietEnd ?? null,
            value.timeZone,
            value.language,
            value.expectedRevision ?? 1
          ]
        );
        if ((result.rowCount ?? 0) === 0) throw new Error("NOTIFICATION_PREFERENCE_CONFLICT");
      }
      return (
        await client.query<Record<string, unknown>>(
          `SELECT event_type "eventType",channel_cadences channels,quiet_start "quietStart",quiet_end "quietEnd",time_zone "timeZone",language,revision FROM notification_preferences WHERE workspace_id=$1 AND user_id=$2 ORDER BY event_type`,
          [context.workspaceId, context.principalId]
        )
      ).rows;
    });
  }
  async workspacePolicy(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT mandatory_events "mandatoryEvents",escalation_policy "escalationPolicy",rate_limits "rateLimits",verified_email_domain "verifiedEmailDomain",reply_policy "replyPolicy",revision FROM notification_workspace_policies WHERE workspace_id=$1`,
        [context.workspaceId]
      );
      return (
        result.rows[0] ?? {
          mandatoryEvents: ["security.account_compromised", "security.credential_revoked"],
          escalationPolicy: {},
          rateLimits: {},
          replyPolicy: "no_reply",
          revision: 0
        }
      );
    });
  }
  async updateWorkspacePolicy(context: TenantContext, input: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const mandatoryEvents = Array.isArray(input.mandatoryEvents)
        ? input.mandatoryEvents
        : ["security.account_compromised", "security.credential_revoked"];
      if (!mandatoryEvents.includes("security.account_compromised"))
        throw new Error("MANDATORY_SECURITY_POLICY");
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO notification_workspace_policies(workspace_id,mandatory_events,escalation_policy,rate_limits,verified_email_domain,reply_policy,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,1,clock_timestamp()) ON CONFLICT(workspace_id) DO UPDATE SET mandatory_events=EXCLUDED.mandatory_events,escalation_policy=EXCLUDED.escalation_policy,rate_limits=EXCLUDED.rate_limits,verified_email_domain=EXCLUDED.verified_email_domain,reply_policy=EXCLUDED.reply_policy,revision=notification_workspace_policies.revision+1,updated_at=clock_timestamp() WHERE notification_workspace_policies.revision=$7 RETURNING mandatory_events "mandatoryEvents",escalation_policy "escalationPolicy",rate_limits "rateLimits",verified_email_domain "verifiedEmailDomain",reply_policy "replyPolicy",revision`,
        [
          context.workspaceId,
          mandatoryEvents,
          input.escalationPolicy ?? {},
          input.rateLimits ?? {},
          input.verifiedEmailDomain ?? null,
          input.replyPolicy ?? "no_reply",
          input.expectedRevision ?? 0
        ]
      );
      if (!result.rows[0]) throw new Error("NOTIFICATION_POLICY_CONFLICT");
      return result.rows[0];
    });
  }
}
