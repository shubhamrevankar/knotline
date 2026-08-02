import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { contactRisk } from "@knotline/operations";
import { withTenantTransaction, type TenantContext } from "./context.js";
export interface SupportRepository {
  tickets(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createTicket(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  ticket(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  addMessage(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  createDiagnostic(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  consentDiagnostic(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  contact(i: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>;
}
export class PostgresSupportRepository implements SupportRepository {
  constructor(private readonly pool: Pool) {}
  tickets(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,category,severity,subject,status,diagnostic_consent "diagnosticConsent",assignee,created_at "createdAt",updated_at "updatedAt" FROM support_tickets WHERE workspace_id=$1 ORDER BY updated_at DESC`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createTicket(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO support_tickets(workspace_id,id,reporter_user_id,category,severity,subject,diagnostic_consent)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,category,severity,subject,status,diagnostic_consent "diagnosticConsent",created_at "createdAt"`,
            [
              c.workspaceId,
              randomUUID(),
              c.principalId,
              i.category,
              i.severity,
              i.subject,
              i.diagnosticConsent ?? false
            ]
          )
        ).rows[0]!
    );
  }
  ticket(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const ticket = (
        await x.query<Record<string, unknown>>(
          `SELECT id,category,severity,subject,status,diagnostic_consent "diagnosticConsent",assignee,created_at "createdAt",updated_at "updatedAt" FROM support_tickets WHERE workspace_id=$1 AND id=$2`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
      const messages = (
        await x.query<Record<string, unknown>>(
          `SELECT id,author_user_id "authorUserId",body,created_at "createdAt" FROM support_ticket_messages WHERE workspace_id=$1 AND ticket_id=$2 ORDER BY created_at`,
          [c.workspaceId, id]
        )
      ).rows;
      return { ...ticket, messages };
    });
  }
  addMessage(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO support_ticket_messages(workspace_id,id,ticket_id,author_user_id,body)SELECT $1,$2,id,$3,$4 FROM support_tickets WHERE workspace_id=$1 AND id=$5 RETURNING id,author_user_id "authorUserId",body,created_at "createdAt"`,
            [c.workspaceId, randomUUID(), c.principalId, i.body, id]
          )
        ).rows[0]!
    );
  }
  createDiagnostic(c: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO diagnostic_bundles(workspace_id,id,ticket_id,preview,expires_at,created_by)SELECT $1,$2,id,$3,clock_timestamp()+interval '24 hours',$4 FROM support_tickets WHERE workspace_id=$1 AND id=$5 RETURNING id,ticket_id "ticketId",preview,state,expires_at "expiresAt"`,
            [
              c.workspaceId,
              randomUUID(),
              JSON.stringify({
                includes: ["version", "request_ids", "redacted_errors"],
                excludes: ["secrets", "content"]
              }),
              c.principalId,
              id
            ]
          )
        ).rows[0]!
    );
  }
  consentDiagnostic(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE diagnostic_bundles SET state='building' WHERE workspace_id=$1 AND id=$2 AND state='awaiting_consent' RETURNING id,ticket_id "ticketId",preview,state,expires_at "expiresAt"`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("DIAGNOSTIC_CONSENT_DENIED");
      return row;
    });
  }
  async contact(i: Readonly<Record<string, unknown>>) {
    const risk = contactRisk({
      email: String(i.email),
      message: String(i.message),
      honeypot: typeof i.honeypot === "string" ? i.honeypot : ""
    });
    if (!risk.accepted)
      return { id: randomUUID(), accepted: false, state: "rejected", reason: risk.reason };
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO contact_requests(id,email,company,purpose,message,consent_version,abuse_decision,state,routing_receipt)VALUES($1,$2,$3,$4,$5,$6,'accepted','queued',$7)`,
      [id, i.email, i.company ?? null, i.purpose, i.message, i.consentVersion, `queue:${id}`]
    );
    return { id, accepted: true, state: "queued", routingReceipt: `queue:${id}` };
  }
}
