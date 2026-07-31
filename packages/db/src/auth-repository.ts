import type { Pool, PoolClient } from "pg";

import { createId } from "./values.js";

export type AuthResultCode = "success" | "provider_denied" | "account_suspended";

export interface IdentityUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: "active" | "suspended" | "deleted";
  readonly locale: string;
  readonly timezone: string;
}

export interface IdentityWorkspace {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: string;
}

export interface SessionIdentity {
  readonly sessionId: string;
  readonly familyId: string;
  readonly user: IdentityUser;
  readonly activeWorkspaceId?: string;
  readonly issuedAt: string;
  readonly lastUsedAt: string;
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
  readonly lastStepUpAt?: string;
  readonly deviceSummary: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly current: boolean;
  readonly deviceSummary: string;
  readonly issuedAt: string;
  readonly lastUsedAt: string;
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
  readonly revokedAt?: string;
  readonly revocationReason?: string;
}

export interface MagicLinkRecord {
  readonly id: string;
  readonly userId: string;
  readonly intent: "login" | "step_up";
  readonly returnTargetId: string;
}

export interface AuthorizationTransaction {
  readonly id: string;
  readonly provider: string;
  readonly applicationId: string;
  readonly environment: string;
  readonly nonceHash: string;
  readonly pkceVerifierCiphertext: string;
  readonly browserBindingHash: string;
  readonly callbackUri: string;
  readonly returnTargetId: string;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  status: IdentityUser["status"];
  locale: string;
  timezone: string;
}

interface SessionRow extends UserRow {
  session_id: string;
  family_id: string;
  active_workspace_id: string | null;
  issued_at: Date;
  last_used_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  last_step_up_at: Date | null;
  device_summary: string;
}

const userFromRow = (row: UserRow): IdentityUser => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  status: row.status,
  locale: row.locale,
  timezone: row.timezone
});

const sessionFromRow = (row: SessionRow): SessionIdentity => ({
  sessionId: row.session_id,
  familyId: row.family_id,
  user: userFromRow(row),
  ...(row.active_workspace_id ? { activeWorkspaceId: row.active_workspace_id } : {}),
  issuedAt: row.issued_at.toISOString(),
  lastUsedAt: row.last_used_at.toISOString(),
  idleExpiresAt: row.idle_expires_at.toISOString(),
  absoluteExpiresAt: row.absolute_expires_at.toISOString(),
  ...(row.last_step_up_at ? { lastStepUpAt: row.last_step_up_at.toISOString() } : {}),
  deviceSummary: row.device_summary
});

async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresAuthRepository {
  constructor(private readonly pool: Pool) {}

  async findOrCreateUser(normalizedEmail: string): Promise<IdentityUser> {
    return transaction(this.pool, async (client) => {
      const existing = await client.query<UserRow>(
        `SELECT id, email, display_name, status, locale, timezone
         FROM users WHERE email = $1 FOR UPDATE`,
        [normalizedEmail]
      );
      if (existing.rows[0]) return userFromRow(existing.rows[0]);
      const displayName =
        normalizedEmail.split("@")[0]?.replace(/[._-]+/gu, " ") || "Knotline user";
      const inserted = await client.query<UserRow>(
        `INSERT INTO users(id, email, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, status, locale, timezone`,
        [createId(), normalizedEmail, displayName]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("User insert returned no row");
      return userFromRow(row);
    });
  }

  async userById(userId: string): Promise<IdentityUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT id,email,display_name,status,locale,timezone FROM users WHERE id=$1`,
      [userId]
    );
    return result.rows[0] ? userFromRow(result.rows[0]) : undefined;
  }

  async createMagicLink(input: {
    readonly userId: string;
    readonly normalizedEmailHash: string;
    readonly tokenVerifierHash: string;
    readonly requestedIpHash: string;
    readonly intent: "login" | "step_up";
    readonly returnTargetId: string;
    readonly expiresAt: Date;
  }): Promise<string> {
    const id = createId();
    await this.pool.query(
      `INSERT INTO magic_link_tokens(
         id, user_id, normalized_email_hash, token_verifier_hash, requested_ip_hash,
         intent, return_target_id, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        input.userId,
        input.normalizedEmailHash,
        input.tokenVerifierHash,
        input.requestedIpHash,
        input.intent,
        input.returnTargetId,
        input.expiresAt
      ]
    );
    return id;
  }

  async consumeMagicLink(
    tokenVerifierHash: string,
    intent: "login" | "step_up",
    now: Date
  ): Promise<{
    readonly status: "ok" | "invalid" | "expired" | "used";
    readonly record?: MagicLinkRecord;
  }> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<{
        id: string;
        user_id: string;
        intent: "login" | "step_up";
        return_target_id: string;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        `SELECT id, user_id, intent, return_target_id, expires_at, consumed_at
         FROM magic_link_tokens WHERE token_verifier_hash = $1 FOR UPDATE`,
        [tokenVerifierHash]
      );
      const row = found.rows[0];
      if (!row || row.intent !== intent) return { status: "invalid" };
      if (row.consumed_at) return { status: "used" };
      if (row.expires_at <= now) return { status: "expired" };
      const consumed = await client.query(
        `UPDATE magic_link_tokens SET consumed_at = $2
         WHERE id = $1 AND consumed_at IS NULL`,
        [row.id, now]
      );
      if (consumed.rowCount !== 1) return { status: "used" };
      return {
        status: "ok",
        record: {
          id: row.id,
          userId: row.user_id,
          intent: row.intent,
          returnTargetId: row.return_target_id
        }
      };
    });
  }

  async takeRateLimit(input: {
    readonly scope: string;
    readonly subjectHash: string;
    readonly windowStartedAt: Date;
    readonly limit: number;
  }): Promise<boolean> {
    const result = await this.pool.query<{ request_count: number }>(
      `INSERT INTO auth_rate_limits(scope, subject_hash, window_started_at, request_count)
       VALUES ($1,$2,$3,1)
       ON CONFLICT (scope, subject_hash, window_started_at)
       DO UPDATE SET request_count = auth_rate_limits.request_count + 1
       RETURNING request_count`,
      [input.scope, input.subjectHash, input.windowStartedAt]
    );
    return (result.rows[0]?.request_count ?? input.limit + 1) <= input.limit;
  }

  async workspaces(userId: string): Promise<readonly IdentityWorkspace[]> {
    const result = await this.pool.query<{
      workspace_id: string;
      workspace_name: string;
      workspace_slug: string;
      membership_role: string;
    }>("SELECT * FROM knotline_identity_workspaces($1)", [userId]);
    return result.rows.map((row) => ({
      id: row.workspace_id,
      name: row.workspace_name,
      slug: row.workspace_slug,
      role: row.membership_role
    }));
  }

  async createSession(input: {
    readonly userId: string;
    readonly verifierHash: string;
    readonly ipHash: string;
    readonly deviceSummary: string;
    readonly now: Date;
    readonly idleExpiresAt: Date;
    readonly absoluteExpiresAt: Date;
    readonly stepUp?: boolean;
  }): Promise<{ readonly sessionId: string; readonly familyId: string }> {
    const sessionId = createId();
    const familyId = createId();
    const verifierId = createId();
    const notificationId = createId();
    const workspaces = await this.workspaces(input.userId);
    await transaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO sessions(
           id,user_id,family_id,active_workspace_id,issued_at,last_used_at,idle_expires_at,
           absolute_expires_at,last_step_up_at,ip_hash,device_summary
         ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)`,
        [
          sessionId,
          input.userId,
          familyId,
          workspaces[0]?.id ?? null,
          input.now,
          input.idleExpiresAt,
          input.absoluteExpiresAt,
          input.stepUp ? input.now : null,
          input.ipHash,
          input.deviceSummary
        ]
      );
      await client.query(
        `INSERT INTO session_verifiers(id,session_id,verifier_hash,state,issued_at)
         VALUES ($1,$2,$3,'active',$4)`,
        [verifierId, sessionId, input.verifierHash, input.now]
      );
      await client.query(
        `INSERT INTO security_notifications(id,user_id,kind,safe_metadata)
         VALUES ($1,$2,'new_session',$3)`,
        [notificationId, input.userId, { device: input.deviceSummary }]
      );
    });
    return { sessionId, familyId };
  }

  private async revokeFamilyForReuse(
    client: PoolClient,
    familyId: string,
    userId: string,
    now: Date
  ): Promise<void> {
    await client.query(
      `UPDATE sessions SET revoked_at = $2, revocation_reason = 'verifier_reuse'
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId, now]
    );
    await client.query(
      `UPDATE session_verifiers SET state = 'revoked', consumed_at = COALESCE(consumed_at,$2)
       WHERE session_id IN (SELECT id FROM sessions WHERE family_id = $1) AND state = 'active'`,
      [familyId, now]
    );
    await client.query(
      `INSERT INTO security_notifications(id,user_id,kind,safe_metadata)
       VALUES ($1,$2,'session_reuse',$3)`,
      [createId(), userId, { familyId }]
    );
  }

  async authenticateSession(
    sessionId: string,
    verifierHash: string,
    now: Date
  ): Promise<{
    readonly status: "ok" | "invalid" | "expired" | "revoked" | "reused" | "suspended";
    readonly identity?: SessionIdentity;
  }> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<
        SessionRow & { verifier_state: string; revoked_at: Date | null }
      >(
        `SELECT s.id AS session_id,s.family_id,s.active_workspace_id,s.issued_at,s.last_used_at,
                s.idle_expires_at,s.absolute_expires_at,s.last_step_up_at,s.device_summary,s.revoked_at,
                u.id,u.email,u.display_name,u.status,u.locale,u.timezone,v.state AS verifier_state
         FROM session_verifiers v
         JOIN sessions s ON s.id = v.session_id
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND v.verifier_hash = $2
         FOR UPDATE OF s,v`,
        [sessionId, verifierHash]
      );
      const row = result.rows[0];
      if (!row) return { status: "invalid" };
      if (row.verifier_state !== "active") {
        await this.revokeFamilyForReuse(client, row.family_id, row.id, now);
        return { status: "reused" };
      }
      if (row.revoked_at) return { status: "revoked" };
      if (row.status !== "active") {
        await client.query(
          `UPDATE sessions SET revoked_at=$2,revocation_reason='account_suspended'
           WHERE family_id=$1 AND revoked_at IS NULL`,
          [row.family_id, now]
        );
        return { status: "suspended" };
      }
      if (row.idle_expires_at <= now || row.absolute_expires_at <= now) {
        await client.query(
          `UPDATE sessions SET revoked_at=$2,revocation_reason='expired'
           WHERE id=$1 AND revoked_at IS NULL`,
          [sessionId, now]
        );
        return { status: "expired" };
      }
      await client.query("UPDATE sessions SET last_used_at=$2 WHERE id=$1", [sessionId, now]);
      return { status: "ok", identity: sessionFromRow({ ...row, last_used_at: now }) };
    });
  }

  async rotateSession(input: {
    readonly sessionId: string;
    readonly oldVerifierHash: string;
    readonly newVerifierHash: string;
    readonly now: Date;
    readonly idleExpiresAt: Date;
  }): Promise<{
    readonly status: "ok" | "invalid" | "expired" | "revoked" | "reused";
    readonly identity?: SessionIdentity;
  }> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<
        SessionRow & { verifier_id: string; verifier_state: string; revoked_at: Date | null }
      >(
        `SELECT s.id AS session_id,s.family_id,s.active_workspace_id,s.issued_at,s.last_used_at,
                s.idle_expires_at,s.absolute_expires_at,s.last_step_up_at,s.device_summary,s.revoked_at,
                u.id,u.email,u.display_name,u.status,u.locale,u.timezone,
                v.id AS verifier_id,v.state AS verifier_state
         FROM session_verifiers v JOIN sessions s ON s.id=v.session_id JOIN users u ON u.id=s.user_id
         WHERE s.id=$1 AND v.verifier_hash=$2 FOR UPDATE OF s,v`,
        [input.sessionId, input.oldVerifierHash]
      );
      const row = result.rows[0];
      if (!row) return { status: "invalid" };
      if (row.verifier_state !== "active") {
        await this.revokeFamilyForReuse(client, row.family_id, row.id, input.now);
        return { status: "reused" };
      }
      if (row.revoked_at) return { status: "revoked" };
      if (row.idle_expires_at <= input.now || row.absolute_expires_at <= input.now) {
        await client.query(
          "UPDATE sessions SET revoked_at=$2,revocation_reason='expired' WHERE id=$1",
          [input.sessionId, input.now]
        );
        return { status: "expired" };
      }
      await client.query(
        "UPDATE session_verifiers SET state='rotated',consumed_at=$2 WHERE id=$1 AND state='active'",
        [row.verifier_id, input.now]
      );
      await client.query(
        `INSERT INTO session_verifiers(id,session_id,verifier_hash,state,issued_at)
         VALUES ($1,$2,$3,'active',$4)`,
        [createId(), input.sessionId, input.newVerifierHash, input.now]
      );
      const idleExpiresAt =
        input.idleExpiresAt < row.absolute_expires_at
          ? input.idleExpiresAt
          : row.absolute_expires_at;
      await client.query("UPDATE sessions SET last_used_at=$2,idle_expires_at=$3 WHERE id=$1", [
        input.sessionId,
        input.now,
        idleExpiresAt
      ]);
      return {
        status: "ok",
        identity: sessionFromRow({
          ...row,
          last_used_at: input.now,
          idle_expires_at: idleExpiresAt
        })
      };
    });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<readonly SessionSummary[]> {
    const result = await this.pool.query<{
      id: string;
      device_summary: string;
      issued_at: Date;
      last_used_at: Date;
      idle_expires_at: Date;
      absolute_expires_at: Date;
      revoked_at: Date | null;
      revocation_reason: string | null;
    }>(
      `SELECT id,device_summary,issued_at,last_used_at,idle_expires_at,absolute_expires_at,
              revoked_at,revocation_reason
       FROM sessions WHERE user_id=$1 ORDER BY last_used_at DESC,id`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      deviceSummary: row.device_summary,
      issuedAt: row.issued_at.toISOString(),
      lastUsedAt: row.last_used_at.toISOString(),
      idleExpiresAt: row.idle_expires_at.toISOString(),
      absoluteExpiresAt: row.absolute_expires_at.toISOString(),
      ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
      ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {})
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    reason: string,
    now: Date
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE sessions SET revoked_at=$3,revocation_reason=$4
       WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`,
      [sessionId, userId, now, reason]
    );
    if (result.rowCount === 1) {
      await this.pool.query(
        `UPDATE session_verifiers SET state='revoked',consumed_at=COALESCE(consumed_at,$2)
         WHERE session_id=$1 AND state='active'`,
        [sessionId, now]
      );
    }
    return result.rowCount === 1;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, now: Date): Promise<number> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE sessions SET revoked_at=$3,revocation_reason='user_revoked_others'
       WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL RETURNING id`,
      [userId, currentSessionId, now]
    );
    if (result.rows.length > 0) {
      await this.pool.query(
        `UPDATE session_verifiers SET state='revoked',consumed_at=COALESCE(consumed_at,$2)
         WHERE session_id=ANY($1::uuid[]) AND state='active'`,
        [result.rows.map(({ id }) => id), now]
      );
    }
    return result.rows.length;
  }

  async updateProfile(
    userId: string,
    input: { readonly displayName?: string; readonly locale?: string; readonly timezone?: string }
  ): Promise<IdentityUser> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET
         display_name=COALESCE($2,display_name),locale=COALESCE($3,locale),
         timezone=COALESCE($4,timezone),updated_at=clock_timestamp()
       WHERE id=$1 RETURNING id,email,display_name,status,locale,timezone`,
      [userId, input.displayName ?? null, input.locale ?? null, input.timezone ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new Error("User not found");
    return userFromRow(row);
  }

  async createAuthorization(input: {
    readonly provider: string;
    readonly applicationId: string;
    readonly environment: string;
    readonly authorizationLocatorHash: string;
    readonly stateHash: string;
    readonly nonceHash: string;
    readonly pkceVerifierHash: string;
    readonly pkceVerifierCiphertext: string;
    readonly browserBindingHash: string;
    readonly callbackUri: string;
    readonly returnTargetId: string;
    readonly requestedScopes: readonly string[];
    readonly expiresAt: Date;
  }): Promise<string> {
    const id = createId();
    await this.pool.query(
      `INSERT INTO identity_authorization_transactions(
         id,provider,application_id,environment,authorization_locator_hash,state_hash,nonce_hash,
         pkce_verifier_hash,pkce_verifier_ciphertext,browser_binding_hash,callback_uri,
         return_target_id,requested_scopes,expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        input.provider,
        input.applicationId,
        input.environment,
        input.authorizationLocatorHash,
        input.stateHash,
        input.nonceHash,
        input.pkceVerifierHash,
        input.pkceVerifierCiphertext,
        input.browserBindingHash,
        input.callbackUri,
        input.returnTargetId,
        input.requestedScopes,
        input.expiresAt
      ]
    );
    return id;
  }

  async consumeAuthorization(
    stateHash: string,
    now: Date
  ): Promise<{
    readonly status: "ok" | "invalid" | "expired" | "used";
    readonly transaction?: AuthorizationTransaction;
  }> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string;
        provider: string;
        application_id: string;
        environment: string;
        nonce_hash: string;
        pkce_verifier_ciphertext: string;
        browser_binding_hash: string;
        callback_uri: string;
        return_target_id: string;
        expires_at: Date;
        callback_consumed_at: Date | null;
      }>("SELECT * FROM identity_authorization_transactions WHERE state_hash=$1 FOR UPDATE", [
        stateHash
      ]);
      const row = result.rows[0];
      if (!row) return { status: "invalid" };
      if (row.callback_consumed_at) return { status: "used" };
      if (row.expires_at <= now) return { status: "expired" };
      const updated = await client.query(
        "UPDATE identity_authorization_transactions SET callback_consumed_at=$2 WHERE id=$1 AND callback_consumed_at IS NULL",
        [row.id, now]
      );
      if (updated.rowCount !== 1) return { status: "used" };
      return {
        status: "ok",
        transaction: {
          id: row.id,
          provider: row.provider,
          applicationId: row.application_id,
          environment: row.environment,
          nonceHash: row.nonce_hash,
          pkceVerifierCiphertext: row.pkce_verifier_ciphertext,
          browserBindingHash: row.browser_binding_hash,
          callbackUri: row.callback_uri,
          returnTargetId: row.return_target_id
        }
      };
    });
  }

  async linkGoogleIdentity(input: {
    readonly issuer: string;
    readonly subject: string;
    readonly email: string;
    readonly emailVerified: boolean;
  }): Promise<IdentityUser> {
    if (!input.emailVerified) throw new Error("OIDC email is not verified");
    return transaction(this.pool, async (client) => {
      const linked = await client.query<UserRow>(
        `SELECT u.id,u.email,u.display_name,u.status,u.locale,u.timezone
         FROM identity_links l JOIN users u ON u.id=l.user_id
         WHERE l.provider='google' AND l.issuer=$1 AND l.subject=$2 FOR UPDATE OF l,u`,
        [input.issuer, input.subject]
      );
      if (linked.rows[0]) return userFromRow(linked.rows[0]);
      let userResult = await client.query<UserRow>(
        "SELECT id,email,display_name,status,locale,timezone FROM users WHERE email=$1 FOR UPDATE",
        [input.email]
      );
      if (!userResult.rows[0]) {
        userResult = await client.query<UserRow>(
          `INSERT INTO users(id,email,display_name) VALUES ($1,$2,$3)
           RETURNING id,email,display_name,status,locale,timezone`,
          [createId(), input.email, input.email.split("@")[0] ?? "Knotline user"]
        );
      }
      const user = userResult.rows[0];
      if (!user) throw new Error("Could not resolve OIDC user");
      await client.query(
        `INSERT INTO identity_links(id,user_id,provider,issuer,subject,email_at_link,claims_metadata)
         VALUES ($1,$2,'google',$3,$4,$5,$6)`,
        [createId(), user.id, input.issuer, input.subject, input.email, { emailVerified: true }]
      );
      return userFromRow(user);
    });
  }

  async createAuthorizationResult(input: {
    readonly transactionId: string;
    readonly resultHandleHash: string;
    readonly browserBindingHash: string;
    readonly userId?: string;
    readonly returnTargetId: string;
    readonly resultCode: AuthResultCode;
    readonly expiresAt: Date;
  }): Promise<string> {
    const id = createId();
    await this.pool.query(
      `INSERT INTO identity_authorization_results(
         id,authorization_transaction_id,result_handle_hash,browser_binding_hash,user_id,
         return_target_id,result_code,expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        input.transactionId,
        input.resultHandleHash,
        input.browserBindingHash,
        input.userId ?? null,
        input.returnTargetId,
        input.resultCode,
        input.expiresAt
      ]
    );
    return id;
  }

  async exchangeAuthorizationResult(input: {
    readonly resultHandleHash: string;
    readonly browserBindingHash: string;
    readonly now: Date;
  }): Promise<{
    readonly status: "ok" | "invalid" | "expired" | "used" | "wrong_browser";
    readonly userId?: string;
    readonly returnTargetId?: string;
    readonly resultCode?: AuthResultCode;
  }> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string;
        browser_binding_hash: string;
        user_id: string | null;
        return_target_id: string;
        result_code: AuthResultCode;
        expires_at: Date;
        exchanged_at: Date | null;
      }>("SELECT * FROM identity_authorization_results WHERE result_handle_hash=$1 FOR UPDATE", [
        input.resultHandleHash
      ]);
      const row = result.rows[0];
      if (!row) return { status: "invalid" };
      if (row.exchanged_at) return { status: "used" };
      if (row.expires_at <= input.now) return { status: "expired" };
      if (row.browser_binding_hash !== input.browserBindingHash) return { status: "wrong_browser" };
      await client.query(
        "UPDATE identity_authorization_results SET exchanged_at=$2 WHERE id=$1 AND exchanged_at IS NULL",
        [row.id, input.now]
      );
      return {
        status: "ok",
        ...(row.user_id ? { userId: row.user_id } : {}),
        returnTargetId: row.return_target_id,
        resultCode: row.result_code
      };
    });
  }

  async recordEmailDelivery(input: {
    readonly userId: string;
    readonly normalizedEmailHash: string;
    readonly state: "captured" | "sent";
    readonly providerMessageId?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_email_deliveries(
         id,user_id,normalized_email_hash,state,provider_message_id
       ) VALUES ($1,$2,$3,$4,$5)`,
      [
        createId(),
        input.userId,
        input.normalizedEmailHash,
        input.state,
        input.providerMessageId ?? null
      ]
    );
  }

  async applyEmailDeliveryEvent(
    providerMessageId: string,
    state: "delivered" | "bounced" | "complained" | "failed"
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<{ user_id: string | null }>(
        `UPDATE auth_email_deliveries SET state=$2,updated_at=clock_timestamp()
         WHERE provider_message_id=$1 RETURNING user_id`,
        [providerMessageId, state]
      );
      const userId = result.rows[0]?.user_id;
      if (userId && (state === "bounced" || state === "complained")) {
        await client.query(
          `INSERT INTO security_notifications(id,user_id,kind,safe_metadata)
           VALUES ($1,$2,$3,$4)`,
          [
            createId(),
            userId,
            state === "bounced" ? "email_bounced" : "email_complained",
            { providerMessageId }
          ]
        );
      }
      return result.rowCount === 1;
    });
  }
}
