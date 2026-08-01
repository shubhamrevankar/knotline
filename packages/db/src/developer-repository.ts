import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { issueApiCredential } from "@knotline/operations";
import { withTenantTransaction, type TenantContext } from "./context.js";
export interface DeveloperRepository {
  principals(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createPrincipal(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updatePrincipal(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deletePrincipal(c: TenantContext, id: string): Promise<void>;
  credentials(c: TenantContext, id: string): Promise<readonly Record<string, unknown>[]>;
  createCredential(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  rotateCredential(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  deleteCredential(c: TenantContext, id: string): Promise<void>;
  oauthClients(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  oauthClient(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  createOauthClient(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updateOauthClient(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  rotateOauthClient(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  deleteOauthClient(c: TenantContext, id: string): Promise<void>;
  webhooks(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createWebhook(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updateWebhook(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deleteWebhook(c: TenantContext, id: string): Promise<void>;
  deliveries(c: TenantContext, id: string): Promise<readonly Record<string, unknown>[]>;
  replay(c: TenantContext, id: string): Promise<Record<string, unknown>>;
}
export class PostgresDeveloperRepository implements DeveloperRepository {
  constructor(private readonly pool: Pool) {}
  principals(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,name,purpose,role,scopes,resource_restrictions "resourceRestrictions",environment,state,expires_at "expiresAt",last_used_at "lastUsedAt",revision FROM service_principals WHERE workspace_id=$1 ORDER BY name`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createPrincipal(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO service_principals(workspace_id,id,owner_user_id,name,purpose,role,scopes,resource_restrictions,environment,expires_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)RETURNING id,name,purpose,role,scopes,resource_restrictions "resourceRestrictions",environment,state,expires_at "expiresAt",revision`,
            [
              c.workspaceId,
              randomUUID(),
              c.principalId,
              i.name,
              i.purpose,
              i.role,
              JSON.stringify(i.scopes),
              JSON.stringify(i.resourceRestrictions ?? {}),
              i.environment,
              i.expiresAt
            ]
          )
        ).rows[0]!
    );
  }
  updatePrincipal(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const r = (
        await x.query<Record<string, unknown>>(
          `UPDATE service_principals SET name=COALESCE($4,name),purpose=COALESCE($5,purpose),scopes=COALESCE($6,scopes),state=COALESCE($7,state),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND revision=$3 RETURNING id,name,purpose,role,scopes,environment,state,revision`,
          [
            c.workspaceId,
            id,
            i.expectedRevision,
            i.name ?? null,
            i.purpose ?? null,
            i.scopes === undefined ? null : JSON.stringify(i.scopes),
            i.state ?? null
          ]
        )
      ).rows[0];
      if (!r) throw new Error("SERVICE_PRINCIPAL_CONFLICT");
      return r;
    });
  }
  deletePrincipal(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(
        `UPDATE service_principals SET state='revoked',revision=revision+1 WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
      await x.query(
        `UPDATE api_credentials SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND principal_id=$2`,
        [c.workspaceId, id]
      );
    });
  }
  credentials(c: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,prefix,expires_at "expiresAt",overlap_expires_at "overlapExpiresAt",revoked_at "revokedAt",last_used_at "lastUsedAt",created_at "createdAt" FROM api_credentials WHERE workspace_id=$1 AND principal_id=$2 ORDER BY created_at DESC`,
            [c.workspaceId, id]
          )
        ).rows
    );
  }
  createCredential(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    const issued = issueApiCredential((i.environment as "test" | "live") ?? "test");
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `INSERT INTO api_credentials(workspace_id,id,principal_id,prefix,secret_hash,expires_at)SELECT $1,$2,id,$4,$5,$6 FROM service_principals WHERE workspace_id=$1 AND id=$3 AND state='active' RETURNING id,prefix,expires_at "expiresAt",created_at "createdAt"`,
          [c.workspaceId, randomUUID(), id, issued.prefix, issued.hash, i.expiresAt]
        )
      ).rows[0]!;
      return { ...row, token: issued.token, displayedOnce: true };
    });
  }
  rotateCredential(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const old = (
        await x.query<{ principal_id: string; environment: "test" | "live" }>(
          `SELECT credential.principal_id,principal.environment FROM api_credentials credential JOIN service_principals principal ON principal.workspace_id=credential.workspace_id AND principal.id=credential.principal_id WHERE credential.workspace_id=$1 AND credential.id=$2 AND credential.revoked_at IS NULL`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!old) throw new Error("CREDENTIAL_NOT_FOUND");
      await x.query(
        `UPDATE api_credentials SET overlap_expires_at=clock_timestamp()+interval '10 minutes',revoked_at=clock_timestamp()+interval '10 minutes' WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
      const issued = issueApiCredential(old.environment);
      const row = (
        await x.query<Record<string, unknown>>(
          `INSERT INTO api_credentials(workspace_id,id,principal_id,prefix,secret_hash,expires_at)VALUES($1,$2,$3,$4,$5,$6)RETURNING id,prefix,expires_at "expiresAt",created_at "createdAt"`,
          [
            c.workspaceId,
            randomUUID(),
            old.principal_id,
            issued.prefix,
            issued.hash,
            new Date(Date.now() + 365 * 86400000).toISOString()
          ]
        )
      ).rows[0]!;
      return { ...row, token: issued.token, displayedOnce: true };
    });
  }
  deleteCredential(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(
        `UPDATE api_credentials SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
    });
  }
  oauthClients(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,name,client_identifier "clientId",redirect_uris "redirectUris",scopes,state,revision FROM oauth_clients WHERE workspace_id=$1`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createOauthClient(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    const issued = issueApiCredential("live");
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `INSERT INTO oauth_clients(workspace_id,id,owner_user_id,name,client_identifier,redirect_uris,scopes,secret_hash)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING id,name,client_identifier "clientId",redirect_uris "redirectUris",scopes,state,secret_version "secretVersion",revision`,
          [
            c.workspaceId,
            randomUUID(),
            c.principalId,
            i.name,
            `kl_client_${randomUUID().replaceAll("-", "")}`,
            JSON.stringify(i.redirectUris),
            JSON.stringify(i.scopes),
            issued.hash
          ]
        )
      ).rows[0]!;
      return { ...row, clientSecret: issued.token, displayedOnce: true };
    });
  }
  oauthClient(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `SELECT id,name,client_identifier "clientId",redirect_uris "redirectUris",scopes,state,secret_version "secretVersion",revision FROM oauth_clients WHERE workspace_id=$1 AND id=$2`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("OAUTH_CLIENT_NOT_FOUND");
      return row;
    });
  }
  updateOauthClient(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE oauth_clients SET name=COALESCE($4,name),redirect_uris=COALESCE($5,redirect_uris),scopes=COALESCE($6,scopes),state=COALESCE($7,state),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND revision=$3 RETURNING id,name,client_identifier "clientId",redirect_uris "redirectUris",scopes,state,secret_version "secretVersion",revision`,
          [
            c.workspaceId,
            id,
            i.expectedRevision,
            i.name ?? null,
            i.redirectUris === undefined ? null : JSON.stringify(i.redirectUris),
            i.scopes === undefined ? null : JSON.stringify(i.scopes),
            i.state ?? null
          ]
        )
      ).rows[0];
      if (!row) throw new Error("OAUTH_CLIENT_CONFLICT");
      return row;
    });
  }
  rotateOauthClient(c: TenantContext, id: string) {
    const issued = issueApiCredential("live");
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE oauth_clients SET secret_hash=$3,secret_version=secret_version+1,revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND state='active' RETURNING id,name,client_identifier "clientId",secret_version "secretVersion",revision`,
          [c.workspaceId, id, issued.hash]
        )
      ).rows[0];
      if (!row) throw new Error("OAUTH_CLIENT_NOT_FOUND");
      return { ...row, clientSecret: issued.token, displayedOnce: true };
    });
  }
  deleteOauthClient(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(
        `UPDATE oauth_clients SET state='revoked',revision=revision+1 WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
    });
  }
  webhooks(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,name,endpoint_url "endpointUrl",event_types "eventTypes",secret_version "secretVersion",state,revision,created_at "createdAt" FROM outgoing_webhooks WHERE workspace_id=$1 ORDER BY created_at DESC`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createWebhook(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    const issued = issueApiCredential("test");
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `INSERT INTO outgoing_webhooks(workspace_id,id,owner_user_id,name,endpoint_url,event_types,secret_hash)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id,name,endpoint_url "endpointUrl",event_types "eventTypes",secret_version "secretVersion",state,revision`,
          [
            c.workspaceId,
            randomUUID(),
            c.principalId,
            i.name,
            i.endpointUrl,
            JSON.stringify(i.eventTypes),
            issued.hash
          ]
        )
      ).rows[0]!;
      return { ...row, signingSecret: issued.token, displayedOnce: true };
    });
  }
  updateWebhook(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const r = (
        await x.query<Record<string, unknown>>(
          `UPDATE outgoing_webhooks SET name=COALESCE($4,name),endpoint_url=COALESCE($5,endpoint_url),event_types=COALESCE($6,event_types),state=COALESCE($7,state),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND revision=$3 RETURNING id,name,endpoint_url "endpointUrl",event_types "eventTypes",state,revision`,
          [
            c.workspaceId,
            id,
            i.expectedRevision,
            i.name ?? null,
            i.endpointUrl ?? null,
            i.eventTypes === undefined ? null : JSON.stringify(i.eventTypes),
            i.state ?? null
          ]
        )
      ).rows[0];
      if (!r) throw new Error("WEBHOOK_CONFLICT");
      return r;
    });
  }
  deleteWebhook(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(
        `UPDATE outgoing_webhooks SET state='disabled',revision=revision+1 WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
    });
  }
  deliveries(c: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,event_id "eventId",event_type "eventType",attempt,status,response_code "responseCode",next_attempt_at "nextAttemptAt",created_at "createdAt" FROM outgoing_webhook_deliveries WHERE workspace_id=$1 AND webhook_id=$2 ORDER BY created_at DESC LIMIT 100`,
            [c.workspaceId, id]
          )
        ).rows
    );
  }
  replay(c: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO outgoing_webhook_deliveries(workspace_id,id,webhook_id,event_id,event_type,attempt,status,idempotency_key)SELECT workspace_id,$3,webhook_id,event_id,event_type,attempt+1,'queued',$4 FROM outgoing_webhook_deliveries WHERE workspace_id=$1 AND id=$2 RETURNING id,event_id "eventId",event_type "eventType",attempt,status`,
            [c.workspaceId, id, randomUUID(), `replay:${id}:${randomUUID()}`]
          )
        ).rows[0]!
    );
  }
}
