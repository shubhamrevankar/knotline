import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { domainChallenge, issueApiCredential } from "@knotline/operations";
import { withTenantTransaction, type TenantContext } from "./context.js";
export interface EnterpriseRepository {
  connections(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createConnection(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  updateConnection(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  transitionConnection(
    c: TenantContext,
    id: string,
    state: "tested" | "active"
  ): Promise<Record<string, unknown>>;
  rotateConnection(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  deleteConnection(c: TenantContext, id: string): Promise<void>;
  domains(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createDomain(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  verifyDomain(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  enforceDomain(
    c: TenantContext,
    id: string,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  deleteDomain(c: TenantContext, id: string): Promise<void>;
  scimCredentials(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createScimCredential(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  rotateScimCredential(c: TenantContext, id: string): Promise<Record<string, unknown>>;
  deleteScimCredential(c: TenantContext, id: string): Promise<void>;
  policies(c: TenantContext): Promise<readonly Record<string, unknown>[]>;
  putPolicy(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  createRegionMigration(
    c: TenantContext,
    i: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  regionMigration(c: TenantContext, id: string): Promise<Record<string, unknown>>;
}
export class PostgresEnterpriseRepository implements EnterpriseRepository {
  constructor(private readonly pool: Pool) {}
  connections(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,name,protocol,issuer,metadata,state,certificate_version "certificateVersion",revision FROM enterprise_identity_connections WHERE workspace_id=$1 ORDER BY created_at DESC`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createConnection(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO enterprise_identity_connections(workspace_id,id,name,protocol,issuer,metadata,encrypted_configuration,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING id,name,protocol,issuer,metadata,state,certificate_version "certificateVersion",revision`,
            [
              c.workspaceId,
              randomUUID(),
              i.name,
              i.protocol,
              i.issuer,
              JSON.stringify(i.metadata ?? {}),
              i.encryptedConfiguration,
              c.principalId
            ]
          )
        ).rows[0]!
    );
  }
  updateConnection(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE enterprise_identity_connections SET name=COALESCE($4,name),issuer=COALESCE($5,issuer),metadata=COALESCE($6,metadata),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND revision=$3 RETURNING id,name,protocol,issuer,metadata,state,certificate_version "certificateVersion",revision`,
          [
            c.workspaceId,
            id,
            i.expectedRevision,
            i.name ?? null,
            i.issuer ?? null,
            i.metadata === undefined ? null : JSON.stringify(i.metadata)
          ]
        )
      ).rows[0];
      if (!row) throw new Error("SSO_CONNECTION_CONFLICT");
      return row;
    });
  }
  transitionConnection(c: TenantContext, id: string, state: "tested" | "active") {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE enterprise_identity_connections SET state=$3,revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND(state='draft' OR(state='tested' AND $3='active'))RETURNING id,name,protocol,issuer,state,certificate_version "certificateVersion",revision`,
          [c.workspaceId, id, state]
        )
      ).rows[0];
      if (!row) throw new Error("SSO_TRANSITION_DENIED");
      return row;
    });
  }
  rotateConnection(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE enterprise_identity_connections SET certificate_version=certificate_version+1,revision=revision+1 WHERE workspace_id=$1 AND id=$2 RETURNING id,state,certificate_version "certificateVersion",revision`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("SSO_CONNECTION_NOT_FOUND");
      return row;
    });
  }
  deleteConnection(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(
        `UPDATE enterprise_identity_connections SET state='disabled',revision=revision+1 WHERE workspace_id=$1 AND id=$2`,
        [c.workspaceId, id]
      );
    });
  }
  domains(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,domain,state,enforcement,verified_at "verifiedAt",revision FROM verified_domains WHERE workspace_id=$1 ORDER BY domain`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createDomain(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    const nonce = randomUUID(),
      challenge = domainChallenge(String(i.domain), nonce);
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `INSERT INTO verified_domains(workspace_id,id,domain,challenge_hash)VALUES($1,$2,$3,$4)RETURNING id,domain,state,enforcement,revision`,
          [c.workspaceId, randomUUID(), i.domain, challenge]
        )
      ).rows[0]!;
      return { ...row, challenge, displayedOnce: true };
    });
  }
  verifyDomain(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE verified_domains SET state='verified',verified_at=clock_timestamp(),revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND state='pending' RETURNING id,domain,state,enforcement,verified_at "verifiedAt",revision`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("DOMAIN_VERIFICATION_DENIED");
      return row;
    });
  }
  enforceDomain(c: TenantContext, id: string, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `UPDATE verified_domains SET enforcement=$3,revision=revision+1 WHERE workspace_id=$1 AND id=$2 AND state='verified' RETURNING id,domain,state,enforcement,revision`,
          [c.workspaceId, id, i.enforcement]
        )
      ).rows[0];
      if (!row) throw new Error("DOMAIN_NOT_VERIFIED");
      return row;
    });
  }
  deleteDomain(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(`DELETE FROM verified_domains WHERE workspace_id=$1 AND id=$2`, [
        c.workspaceId,
        id
      ]);
    });
  }
  scimCredentials(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,prefix,state,expires_at "expiresAt",last_used_at "lastUsedAt",created_at "createdAt" FROM scim_credentials WHERE workspace_id=$1 ORDER BY created_at DESC`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  createScimCredential(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    const issued = issueApiCredential("live");
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `INSERT INTO scim_credentials(workspace_id,id,prefix,secret_hash,expires_at,created_by)VALUES($1,$2,$3,$4,$5,$6)RETURNING id,prefix,state,expires_at "expiresAt",created_at "createdAt"`,
          [c.workspaceId, randomUUID(), issued.prefix, issued.hash, i.expiresAt, c.principalId]
        )
      ).rows[0]!;
      return { ...row, token: issued.token, displayedOnce: true };
    });
  }
  rotateScimCredential(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(`UPDATE scim_credentials SET state='revoked' WHERE workspace_id=$1 AND id=$2`, [
        c.workspaceId,
        id
      ]);
      const issued = issueApiCredential("live"),
        row = (
          await x.query<Record<string, unknown>>(
            `INSERT INTO scim_credentials(workspace_id,id,prefix,secret_hash,expires_at,created_by)VALUES($1,$2,$3,$4,clock_timestamp()+interval '365 days',$5)RETURNING id,prefix,state,expires_at "expiresAt"`,
            [c.workspaceId, randomUUID(), issued.prefix, issued.hash, c.principalId]
          )
        ).rows[0]!;
      return { ...row, token: issued.token, displayedOnce: true };
    });
  }
  deleteScimCredential(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      await x.query(`UPDATE scim_credentials SET state='revoked' WHERE workspace_id=$1 AND id=$2`, [
        c.workspaceId,
        id
      ]);
    });
  }
  policies(c: TenantContext) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `SELECT id,policy_key "policyKey",version,mode,rules,exceptions,revision FROM enterprise_policies WHERE workspace_id=$1 ORDER BY policy_key`,
            [c.workspaceId]
          )
        ).rows
    );
  }
  putPolicy(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO enterprise_policies(workspace_id,id,policy_key,mode,rules,exceptions,updated_by)VALUES($1,$2,$3,$4,$5,$6,$7)ON CONFLICT(workspace_id,policy_key)DO UPDATE SET mode=EXCLUDED.mode,rules=EXCLUDED.rules,exceptions=EXCLUDED.exceptions,version=enterprise_policies.version+1,revision=enterprise_policies.revision+1,updated_by=EXCLUDED.updated_by RETURNING id,policy_key "policyKey",version,mode,rules,exceptions,revision`,
            [
              c.workspaceId,
              randomUUID(),
              i.policyKey,
              i.mode,
              JSON.stringify(i.rules),
              JSON.stringify(i.exceptions ?? []),
              c.principalId
            ]
          )
        ).rows[0]!
    );
  }
  createRegionMigration(c: TenantContext, i: Readonly<Record<string, unknown>>) {
    return withTenantTransaction(
      this.pool,
      c,
      async (x) =>
        (
          await x.query<Record<string, unknown>>(
            `INSERT INTO region_migrations(workspace_id,id,source_region,target_region,checks,requested_by)VALUES($1,$2,$3,$4,$5,$6)RETURNING id,source_region "sourceRegion",target_region "targetRegion",state,checks,created_at "createdAt"`,
            [
              c.workspaceId,
              randomUUID(),
              i.sourceRegion,
              i.targetRegion,
              JSON.stringify(i.checks ?? []),
              c.principalId
            ]
          )
        ).rows[0]!
    );
  }
  regionMigration(c: TenantContext, id: string) {
    return withTenantTransaction(this.pool, c, async (x) => {
      const row = (
        await x.query<Record<string, unknown>>(
          `SELECT id,source_region "sourceRegion",target_region "targetRegion",state,checks,proof,created_at "createdAt",updated_at "updatedAt" FROM region_migrations WHERE workspace_id=$1 AND id=$2`,
          [c.workspaceId, id]
        )
      ).rows[0];
      if (!row) throw new Error("REGION_MIGRATION_NOT_FOUND");
      return row;
    });
  }
}
