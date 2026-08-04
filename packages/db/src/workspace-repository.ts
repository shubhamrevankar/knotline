import type { Pool, PoolClient } from "pg";
import {
  COLLABORATION_EXTERNAL_GATES,
  COLLABORATION_PROVIDER_MANIFESTS,
  DATA_PROVIDER_EXTERNAL_GATES,
  DATA_PROVIDER_MANIFESTS,
  KNOWLEDGE_PROVIDER_MANIFESTS,
  PROVIDER_CAPABILITY_STATUS,
  certifyCollaborationProvider,
  certifyDataProvider,
  certifyKnowledgeProvider
} from "@knotline/connector-sdk";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { contentHash, createId } from "./values.js";

export type SystemRole =
  "owner" | "admin" | "builder" | "member" | "approver" | "billing" | "auditor";
export type MembershipRole = SystemRole | "custom";

export interface WorkspaceRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly state: "active" | "archived" | "deleting";
  readonly timezone: string;
  readonly locale: string;
  readonly region: string;
  readonly role: MembershipRole;
  readonly isSandbox: boolean;
  readonly sandboxLabel?: string;
}

export interface MemberRecord {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: MembershipRole;
  readonly customRoleId?: string;
  readonly state: "active" | "suspended" | "removed";
  readonly createdAt: string;
}

export interface RoleRecord {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  readonly system: boolean;
}

export interface InvitationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly email: string;
  readonly role: Exclude<MembershipRole, "owner">;
  readonly customRoleId?: string;
  readonly state: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface GroupRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "manual" | "scim";
  readonly memberIds: readonly string[];
}

export interface OnboardingRecord {
  readonly workspaceId: string;
  readonly userId: string;
  readonly currentStep: string;
  readonly completedSteps: readonly string[];
  readonly skippedSteps: readonly string[];
  readonly profile: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly completedAt?: string;
}

export const SYSTEM_ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly string[]>> = {
  owner: ["*"],
  admin: [
    "workspace.read",
    "workspace.update",
    "member.read",
    "member.invite",
    "member.update",
    "member.remove",
    "role.read",
    "role.manage",
    "group.read",
    "group.manage",
    "workflow.read",
    "workflow.create",
    "workflow.manage",
    "audit.read"
  ],
  builder: [
    "workspace.read",
    "member.read",
    "role.read",
    "group.read",
    "workflow.read",
    "workflow.create",
    "workflow.manage"
  ],
  member: [
    "workspace.read",
    "member.read",
    "role.read",
    "group.read",
    "workflow.read",
    "workflow.create"
  ],
  approver: ["workspace.read", "member.read", "role.read", "group.read", "workflow.read"],
  billing: ["workspace.read", "member.read", "billing.read", "billing.manage"],
  auditor: [
    "workspace.read",
    "member.read",
    "role.read",
    "group.read",
    "workflow.read",
    "audit.read"
  ]
};
export const PERMISSION_CATALOG = [
  "workspace.read",
  "workspace.update",
  "workspace.archive",
  "workspace.delete",
  "member.read",
  "member.invite",
  "member.update",
  "member.remove",
  "ownership.transfer",
  "role.read",
  "role.manage",
  "group.read",
  "group.manage",
  "workflow.read",
  "workflow.create",
  "workflow.manage",
  "billing.read",
  "billing.manage",
  "audit.read"
] as const;

const SYSTEM_ROLE_IDS: Readonly<Record<SystemRole, string>> = {
  owner: "00000000-0000-4000-8000-000000000001",
  admin: "00000000-0000-4000-8000-000000000002",
  builder: "00000000-0000-4000-8000-000000000003",
  member: "00000000-0000-4000-8000-000000000004",
  approver: "00000000-0000-4000-8000-000000000005",
  billing: "00000000-0000-4000-8000-000000000006",
  auditor: "00000000-0000-4000-8000-000000000007"
};

const workspaceFromRow = (row: {
  id: string;
  slug: string;
  name: string;
  state: WorkspaceRecord["state"];
  timezone: string;
  locale: string;
  region: string;
  role: MembershipRole;
  is_sandbox: boolean;
  sandbox_label: string | null;
}): WorkspaceRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  state: row.state,
  timezone: row.timezone,
  locale: row.locale,
  region: row.region,
  role: row.role,
  isSandbox: row.is_sandbox,
  ...(row.sandbox_label ? { sandboxLabel: row.sandbox_label } : {})
});

async function audit(
  client: PoolClient,
  context: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Readonly<Record<string, unknown>> = {}
) {
  await client.query(
    `INSERT INTO audit_events(
       workspace_id,id,actor_id,action,resource_type,resource_id,result,request_id,metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,'succeeded',$7,$8)`,
    [
      context.workspaceId,
      createId(),
      context.principalId,
      action,
      resourceType,
      resourceId,
      context.requestId,
      metadata
    ]
  );
  await client.query(
    `INSERT INTO outbox_events(
       workspace_id,id,aggregate_type,aggregate_id,event_type,payload
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      context.workspaceId,
      createId(),
      resourceType,
      resourceId,
      `${action}.v1`,
      { resourceId, ...metadata }
    ]
  );
}

function slugBase(name: string) {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 48) || "workspace"
  );
}

async function provisionConnectorCatalog(client: PoolClient, workspaceId: string, userId: string) {
  const entries = [
    ...Object.entries(KNOWLEDGE_PROVIDER_MANIFESTS).map(([provider, manifest]) => ({
      manifest,
      certification: certifyKnowledgeProvider(
        provider as keyof typeof KNOWLEDGE_PROVIDER_MANIFESTS
      ),
      externalGate:
        PROVIDER_CAPABILITY_STATUS[provider as keyof typeof PROVIDER_CAPABILITY_STATUS]
          .externalGate,
      limitations:
        PROVIDER_CAPABILITY_STATUS[provider as keyof typeof PROVIDER_CAPABILITY_STATUS].limitations
    })),
    ...Object.entries(COLLABORATION_PROVIDER_MANIFESTS).map(([provider, manifest]) => ({
      manifest,
      certification: certifyCollaborationProvider(
        provider as keyof typeof COLLABORATION_PROVIDER_MANIFESTS
      ),
      externalGate:
        COLLABORATION_EXTERNAL_GATES[provider as keyof typeof COLLABORATION_EXTERNAL_GATES],
      limitations: ["Provider OAuth certification is required before live activation."]
    })),
    ...Object.entries(DATA_PROVIDER_MANIFESTS).map(([provider, manifest]) => {
      const liveHttp = provider === "generic-rest" || provider === "signed-webhook";
      return {
        manifest,
        certification: liveHttp
          ? {
              engineeringStatus: "LIVE" as const,
              liveStatus: "LIVE" as const,
              capabilities: manifest.capabilities
            }
          : certifyDataProvider(provider as keyof typeof DATA_PROVIDER_MANIFESTS),
        externalGate: liveHttp
          ? "SELF_SERVICE_HTTPS"
          : DATA_PROVIDER_EXTERNAL_GATES[provider as keyof typeof DATA_PROVIDER_EXTERNAL_GATES],
        limitations: liveHttp
          ? ["Public HTTPS endpoints only; private networks and redirects are blocked."]
          : ["Provider certification is required before live activation."]
      };
    })
  ];
  for (const entry of entries) {
    await client.query(
      `INSERT INTO connector_manifest_versions(workspace_id,id,connector_key,semantic_version,manifest,content_hash,state,rollout_percent,created_by)
       VALUES($1,$2,$3,$4,$5,$6,'active',100,$7)
       ON CONFLICT(workspace_id,connector_key,semantic_version) DO NOTHING`,
      [
        workspaceId,
        createId(),
        entry.manifest.key,
        entry.manifest.version,
        entry.manifest,
        contentHash(entry.manifest),
        userId
      ]
    );
    await client.query(
      `INSERT INTO provider_connector_certifications(workspace_id,id,connector_key,manifest_version,engineering_status,live_status,external_gate,fixture_digest,capabilities,limitations,certified_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())
       ON CONFLICT(workspace_id,connector_key,manifest_version) DO NOTHING`,
      [
        workspaceId,
        createId(),
        entry.manifest.key,
        entry.manifest.version,
        entry.certification.engineeringStatus,
        entry.certification.liveStatus,
        entry.externalGate,
        contentHash(entry.certification),
        entry.certification,
        JSON.stringify(entry.limitations)
      ]
    );
  }
}

export class PostgresWorkspaceRepository {
  constructor(private readonly pool: Pool) {}

  async createWorkspace(input: {
    readonly userId: string;
    readonly name: string;
    readonly timezone: string;
    readonly locale: string;
    readonly region: string;
    readonly requestId: string;
    readonly sandbox?: boolean;
  }): Promise<WorkspaceRecord> {
    const workspaceId = createId();
    const context: TenantContext = {
      workspaceId,
      principalId: input.userId,
      requestId: input.requestId
    };
    return withTenantTransaction(this.pool, context, async (client) => {
      const slug = `${slugBase(input.name)}-${workspaceId.slice(0, 8)}`;
      const inserted = await client.query<{
        id: string;
        slug: string;
        name: string;
        state: WorkspaceRecord["state"];
        timezone: string;
        locale: string;
        region: string;
        is_sandbox: boolean;
        sandbox_label: string | null;
      }>(
        `INSERT INTO workspaces(
           id,slug,name,timezone,locale,region,is_sandbox,sandbox_label
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,slug,name,state,timezone,locale,region,is_sandbox,sandbox_label`,
        [
          workspaceId,
          slug,
          input.name,
          input.timezone,
          input.locale,
          input.region,
          input.sandbox ?? false,
          input.sandbox ? "Sandbox — sample data" : null
        ]
      );
      await client.query(
        `INSERT INTO memberships(workspace_id,id,user_id,role,state)
         VALUES ($1,$2,$3,'owner','active')`,
        [workspaceId, createId(), input.userId]
      );
      for (const [key, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
        await client.query(
          `INSERT INTO workspace_roles(
             workspace_id,id,role_key,name,description,permissions,is_system,created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,true,$7)`,
          [
            workspaceId,
            createId(),
            key,
            key[0]?.toUpperCase() + key.slice(1),
            `Built-in ${key} role`,
            permissions,
            input.userId
          ]
        );
      }
      await client.query(
        `INSERT INTO onboarding_progress(workspace_id,user_id,current_step)
         VALUES ($1,$2,'role_use_case')`,
        [workspaceId, input.userId]
      );
      await provisionConnectorCatalog(client, workspaceId, input.userId);
      await client.query(
        `UPDATE sessions SET active_workspace_id=$1
         WHERE user_id=$2 AND revoked_at IS NULL AND active_workspace_id IS NULL`,
        [workspaceId, input.userId]
      );
      await audit(client, context, "workspace.created", "workspace", workspaceId, {
        sandbox: input.sandbox ?? false
      });
      const row = inserted.rows[0];
      if (!row) throw new Error("Workspace insert returned no row");
      return workspaceFromRow({ ...row, role: "owner" });
    });
  }

  async listForUser(userId: string): Promise<readonly WorkspaceRecord[]> {
    const result = await this.pool.query<{
      workspace_id: string;
      workspace_name: string;
      workspace_slug: string;
      workspace_state: WorkspaceRecord["state"];
      membership_role: MembershipRole;
    }>("SELECT * FROM knotline_user_workspaces($1)", [userId]);
    const records: WorkspaceRecord[] = [];
    for (const summary of result.rows) {
      const context = {
        workspaceId: summary.workspace_id,
        principalId: userId,
        requestId: `workspace-list-${summary.workspace_id}`
      };
      const record = await withTenantTransaction(this.pool, context, async (client) => {
        const detail = await client.query<{
          id: string;
          slug: string;
          name: string;
          state: WorkspaceRecord["state"];
          timezone: string;
          locale: string;
          region: string;
          is_sandbox: boolean;
          sandbox_label: string | null;
        }>(
          `SELECT id,slug,name,state,timezone,locale,region,is_sandbox,sandbox_label
           FROM workspaces WHERE id=$1`,
          [summary.workspace_id]
        );
        return detail.rows[0];
      });
      if (record) records.push(workspaceFromRow({ ...record, role: summary.membership_role }));
    }
    return records;
  }

  async membership(
    context: TenantContext
  ): Promise<
    { readonly role: MembershipRole; readonly permissions: readonly string[] } | undefined
  > {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        role: MembershipRole;
        permissions: string[] | null;
      }>(
        `SELECT membership.role, custom_role.permissions
         FROM memberships membership
         LEFT JOIN workspace_roles custom_role
           ON custom_role.workspace_id=membership.workspace_id
          AND custom_role.id=membership.custom_role_id
         WHERE membership.workspace_id=$1 AND membership.user_id=$2 AND membership.state='active'`,
        [context.workspaceId, context.principalId]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        role: row.role,
        permissions:
          row.role === "custom" ? (row.permissions ?? []) : SYSTEM_ROLE_PERMISSIONS[row.role]
      };
    });
  }

  async switchWorkspace(input: {
    readonly sessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<boolean> {
    const context = {
      workspaceId: input.workspaceId,
      principalId: input.userId,
      requestId: `workspace-switch-${input.sessionId}`
    };
    const allowed = await this.membership(context);
    if (!allowed) return false;
    const result = await this.pool.query(
      `UPDATE sessions SET active_workspace_id=$1
       WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL`,
      [input.workspaceId, input.sessionId, input.userId]
    );
    return result.rowCount === 1;
  }

  async updateWorkspace(
    context: TenantContext,
    input: Partial<Pick<WorkspaceRecord, "name" | "timezone" | "locale" | "region">>
  ): Promise<WorkspaceRecord | undefined> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        slug: string;
        name: string;
        state: WorkspaceRecord["state"];
        timezone: string;
        locale: string;
        region: string;
        is_sandbox: boolean;
        sandbox_label: string | null;
        role: MembershipRole;
      }>(
        `UPDATE workspaces workspace SET
           name=COALESCE($2,name), timezone=COALESCE($3,timezone),
           locale=COALESCE($4,locale), region=COALESCE($5,region),
           version=version+1, updated_at=clock_timestamp()
         FROM memberships membership
         WHERE workspace.id=$1 AND membership.workspace_id=workspace.id
           AND membership.user_id=$6 AND membership.state='active'
         RETURNING workspace.id,workspace.slug,workspace.name,workspace.state,workspace.timezone,
           workspace.locale,workspace.region,workspace.is_sandbox,workspace.sandbox_label,membership.role`,
        [
          context.workspaceId,
          input.name ?? null,
          input.timezone ?? null,
          input.locale ?? null,
          input.region ?? null,
          context.principalId
        ]
      );
      if (result.rows[0])
        await audit(client, context, "workspace.updated", "workspace", context.workspaceId);
      return result.rows[0] ? workspaceFromRow(result.rows[0]) : undefined;
    });
  }

  async setWorkspaceState(
    context: TenantContext,
    state: "active" | "archived" | "deleting"
  ): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE workspaces SET state=$2,
           archived_at=CASE WHEN $2='archived' THEN clock_timestamp() ELSE NULL END,
           deletion_requested_at=CASE WHEN $2='deleting' THEN clock_timestamp() ELSE deletion_requested_at END,
           deletion_requested_by=CASE WHEN $2='deleting' THEN $3 ELSE deletion_requested_by END,
           version=version+1,updated_at=clock_timestamp()
         WHERE id=$1`,
        [context.workspaceId, state, context.principalId]
      );
      if (result.rowCount === 1)
        await audit(client, context, `workspace.${state}`, "workspace", context.workspaceId);
      return result.rowCount === 1;
    });
  }

  async listMembers(context: TenantContext): Promise<readonly MemberRecord[]> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string;
        email: string;
        display_name: string;
        role: MembershipRole;
        custom_role_id: string | null;
        state: MemberRecord["state"];
        created_at: Date;
      }>(
        `SELECT membership.id,membership.user_id,user_account.email,user_account.display_name,
          membership.role,membership.custom_role_id,membership.state,membership.created_at
         FROM memberships membership JOIN users user_account ON user_account.id=membership.user_id
         WHERE membership.workspace_id=$1 ORDER BY membership.created_at,membership.id`,
        [context.workspaceId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        ...(row.custom_role_id ? { customRoleId: row.custom_role_id } : {}),
        state: row.state,
        createdAt: row.created_at.toISOString()
      }));
    });
  }

  async updateMember(
    context: TenantContext,
    memberId: string,
    input: {
      readonly role?: MembershipRole;
      readonly customRoleId?: string;
      readonly state?: MemberRecord["state"];
    }
  ): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const before = await client.query<{ user_id: string }>(
        "SELECT user_id FROM memberships WHERE workspace_id=$1 AND id=$2",
        [context.workspaceId, memberId]
      );
      const result = await client.query(
        `UPDATE memberships SET role=COALESCE($3,role),
           custom_role_id=CASE WHEN $3='custom' THEN $4 WHEN $3 IS NOT NULL THEN NULL ELSE custom_role_id END,
           state=COALESCE($5,state),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [
          context.workspaceId,
          memberId,
          input.role ?? null,
          input.customRoleId ?? null,
          input.state ?? null
        ]
      );
      if (result.rowCount === 1) {
        if (input.state && input.state !== "active" && before.rows[0])
          await client.query(
            `UPDATE sessions SET revoked_at=clock_timestamp(),revocation_reason='membership_${input.state}'
             WHERE user_id=$1 AND active_workspace_id=$2 AND revoked_at IS NULL`,
            [before.rows[0].user_id, context.workspaceId]
          );
        await audit(client, context, "member.updated", "membership", memberId, input);
      }
      return result.rowCount === 1;
    });
  }

  async transferOwnership(context: TenantContext, targetMemberId: string): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{ id: string }>(
        `SELECT id FROM memberships WHERE workspace_id=$1 AND user_id=$2
         AND role='owner' AND state='active' FOR UPDATE`,
        [context.workspaceId, context.principalId]
      );
      const target = await client.query<{ id: string }>(
        `SELECT id FROM memberships WHERE workspace_id=$1 AND id=$2 AND state='active' FOR UPDATE`,
        [context.workspaceId, targetMemberId]
      );
      if (!current.rows[0] || !target.rows[0] || current.rows[0].id === targetMemberId)
        return false;
      await client.query(
        "UPDATE memberships SET role='owner',custom_role_id=NULL WHERE workspace_id=$1 AND id=$2",
        [context.workspaceId, targetMemberId]
      );
      await client.query(
        "UPDATE memberships SET role='admin',custom_role_id=NULL WHERE workspace_id=$1 AND id=$2",
        [context.workspaceId, current.rows[0].id]
      );
      await audit(client, context, "ownership.transferred", "membership", targetMemberId, {
        previousOwnerMembershipId: current.rows[0].id
      });
      return true;
    });
  }

  async reassignAndRemoveMember(
    context: TenantContext,
    memberId: string,
    reassignToMemberId: string
  ): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const members = await client.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM memberships WHERE workspace_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE`,
        [context.workspaceId, [memberId, reassignToMemberId]]
      );
      const removed = members.rows.find(({ id }) => id === memberId);
      const assignee = members.rows.find(({ id }) => id === reassignToMemberId);
      if (!removed || !assignee || removed.id === assignee.id) return false;
      await client.query(
        `UPDATE workflows SET updated_at=clock_timestamp()
         WHERE workspace_id=$1`,
        [context.workspaceId]
      );
      const result = await client.query(
        `UPDATE memberships SET state='removed',updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, memberId]
      );
      await client.query(
        `UPDATE sessions SET revoked_at=clock_timestamp(),revocation_reason='membership_removed'
         WHERE user_id=$1 AND active_workspace_id=$2 AND revoked_at IS NULL`,
        [removed.user_id, context.workspaceId]
      );
      if (result.rowCount === 1)
        await audit(client, context, "member.removed", "membership", memberId, {
          reassignedToMemberId: reassignToMemberId
        });
      return result.rowCount === 1;
    });
  }

  async roles(context: TenantContext): Promise<readonly RoleRecord[]> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        role_key: string;
        name: string;
        description: string;
        permissions: string[];
        is_system: boolean;
      }>(
        `SELECT id,role_key,name,description,permissions,is_system FROM workspace_roles
         WHERE workspace_id=$1 ORDER BY is_system DESC,name`,
        [context.workspaceId]
      );
      const stored = result.rows.map((row) => ({
        id: row.id,
        key: row.role_key,
        name: row.name,
        description: row.description,
        permissions: row.permissions,
        system: row.is_system
      }));
      const storedKeys = new Set(stored.map(({ key }) => key));
      const missingSystemRoles = Object.entries(SYSTEM_ROLE_PERMISSIONS)
        .filter(([key]) => !storedKeys.has(key))
        .map(([key, permissions]) => {
          const systemRole = key as SystemRole;
          return {
            id: SYSTEM_ROLE_IDS[systemRole],
            key: systemRole,
            name: `${systemRole[0]?.toUpperCase() ?? ""}${systemRole.slice(1)}`,
            description: `Built-in ${systemRole} role`,
            permissions,
            system: true
          } satisfies RoleRecord;
        });
      return [...missingSystemRoles, ...stored];
    });
  }

  async saveCustomRole(
    context: TenantContext,
    input: {
      readonly id?: string;
      readonly name: string;
      readonly description: string;
      readonly permissions: readonly string[];
    }
  ): Promise<RoleRecord> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = input.id ?? createId();
      const key = `custom-${id.slice(0, 8)}`;
      const result = await client.query<{
        id: string;
        role_key: string;
        name: string;
        description: string;
        permissions: string[];
        is_system: boolean;
      }>(
        `INSERT INTO workspace_roles(
           workspace_id,id,role_key,name,description,permissions,is_system,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,false,$7)
         ON CONFLICT (workspace_id,id) DO UPDATE SET
           name=EXCLUDED.name,description=EXCLUDED.description,permissions=EXCLUDED.permissions,
           updated_at=clock_timestamp()
         WHERE workspace_roles.is_system=false
         RETURNING id,role_key,name,description,permissions,is_system`,
        [
          context.workspaceId,
          id,
          key,
          input.name,
          input.description,
          input.permissions,
          context.principalId
        ]
      );
      const row = result.rows[0];
      if (!row) throw new Error("System roles cannot be edited");
      await audit(client, context, input.id ? "role.updated" : "role.created", "role", id);
      return {
        id: row.id,
        key: row.role_key,
        name: row.name,
        description: row.description,
        permissions: row.permissions,
        system: row.is_system
      };
    });
  }

  async deleteCustomRole(context: TenantContext, roleId: string): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `DELETE FROM workspace_roles role_definition
         WHERE workspace_id=$1 AND id=$2 AND is_system=false
           AND NOT EXISTS (
             SELECT 1 FROM memberships WHERE workspace_id=$1 AND custom_role_id=$2
           )`,
        [context.workspaceId, roleId]
      );
      if (result.rowCount === 1) await audit(client, context, "role.deleted", "role", roleId);
      return result.rowCount === 1;
    });
  }

  async createInvitation(
    context: TenantContext,
    input: {
      readonly email: string;
      readonly tokenHash: string;
      readonly role: Exclude<MembershipRole, "owner">;
      readonly customRoleId?: string;
      readonly expiresAt: Date;
    }
  ): Promise<InvitationRecord | "existing_member"> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM memberships membership JOIN users user_account ON user_account.id=membership.user_id
         WHERE membership.workspace_id=$1 AND user_account.email=$2 AND membership.state<>'removed'`,
        [context.workspaceId, input.email]
      );
      if (existing.rowCount) return "existing_member";
      const id = createId();
      const result = await client.query<{
        id: string;
        workspace_id: string;
        workspace_name: string;
        email: string;
        role: InvitationRecord["role"];
        custom_role_id: string | null;
        state: InvitationRecord["state"];
        expires_at: Date;
        created_at: Date;
      }>(
        `INSERT INTO workspace_invitations(
           workspace_id,id,email,token_hash,role,custom_role_id,invited_by,expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (workspace_id,email) WHERE state='pending' DO UPDATE SET
           token_hash=EXCLUDED.token_hash,role=EXCLUDED.role,custom_role_id=EXCLUDED.custom_role_id,
           invited_by=EXCLUDED.invited_by,expires_at=EXCLUDED.expires_at,updated_at=clock_timestamp()
         RETURNING id,workspace_id,(SELECT name FROM workspaces WHERE id=$1) AS workspace_name,
           email,role,custom_role_id,state,expires_at,created_at`,
        [
          context.workspaceId,
          id,
          input.email,
          input.tokenHash,
          input.role,
          input.customRoleId ?? null,
          context.principalId,
          input.expiresAt
        ]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Invitation insert returned no row");
      await audit(client, context, "invitation.created", "invitation", row.id, {
        role: row.role
      });
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
        email: row.email,
        role: row.role,
        ...(row.custom_role_id ? { customRoleId: row.custom_role_id } : {}),
        state: row.state,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString()
      };
    });
  }

  async invitations(context: TenantContext): Promise<readonly InvitationRecord[]> {
    return withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `UPDATE workspace_invitations SET state='expired',responded_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND state='pending' AND expires_at<=clock_timestamp()`,
        [context.workspaceId]
      );
      const result = await client.query<{
        id: string;
        workspace_id: string;
        workspace_name: string;
        email: string;
        role: InvitationRecord["role"];
        custom_role_id: string | null;
        state: InvitationRecord["state"];
        expires_at: Date;
        created_at: Date;
      }>(
        `SELECT invitation.id,invitation.workspace_id,workspace.name AS workspace_name,
          invitation.email,invitation.role,invitation.custom_role_id,invitation.state,
          invitation.expires_at,invitation.created_at
         FROM workspace_invitations invitation JOIN workspaces workspace ON workspace.id=invitation.workspace_id
         WHERE invitation.workspace_id=$1 ORDER BY invitation.created_at DESC`,
        [context.workspaceId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
        email: row.email,
        role: row.role,
        ...(row.custom_role_id ? { customRoleId: row.custom_role_id } : {}),
        state: row.state,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString()
      }));
    });
  }

  async cancelInvitation(context: TenantContext, invitationId: string): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE workspace_invitations SET state='cancelled',responded_at=clock_timestamp(),
           updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state='pending'`,
        [context.workspaceId, invitationId]
      );
      if (result.rowCount === 1)
        await audit(client, context, "invitation.cancelled", "invitation", invitationId);
      return result.rowCount === 1;
    });
  }

  async invitationWorkspace(tokenHash: string, email: string): Promise<string | undefined> {
    const result = await this.pool.query<{ knotline_invitation_workspace: string | null }>(
      "SELECT knotline_invitation_workspace($1,$2)",
      [tokenHash, email]
    );
    return result.rows[0]?.knotline_invitation_workspace ?? undefined;
  }

  async invitationPreview(tokenHash: string, email: string): Promise<InvitationRecord | undefined> {
    const workspaceId = await this.invitationWorkspace(tokenHash, email);
    if (!workspaceId) return undefined;
    const context = {
      workspaceId,
      principalId: "00000000-0000-4000-8000-000000000000",
      requestId: "invitation-preview"
    };
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        workspace_id: string;
        workspace_name: string;
        email: string;
        role: InvitationRecord["role"];
        custom_role_id: string | null;
        state: InvitationRecord["state"];
        expires_at: Date;
        created_at: Date;
      }>(
        `SELECT invitation.id,invitation.workspace_id,workspace.name AS workspace_name,
          invitation.email,invitation.role,invitation.custom_role_id,invitation.state,
          invitation.expires_at,invitation.created_at
         FROM workspace_invitations invitation JOIN workspaces workspace ON workspace.id=invitation.workspace_id
         WHERE invitation.token_hash=$1`,
        [tokenHash]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
        email: row.email,
        role: row.role,
        ...(row.custom_role_id ? { customRoleId: row.custom_role_id } : {}),
        state: row.expires_at <= new Date() && row.state === "pending" ? "expired" : row.state,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString()
      };
    });
  }

  async respondToInvitation(input: {
    readonly tokenHash: string;
    readonly userId: string;
    readonly email: string;
    readonly response: "accept" | "decline";
    readonly requestId: string;
    readonly now: Date;
  }): Promise<"accepted" | "declined" | "invalid" | "expired" | "used" | "existing_member"> {
    const workspaceId = await this.invitationWorkspace(input.tokenHash, input.email);
    if (!workspaceId) return "invalid";
    const context = { workspaceId, principalId: input.userId, requestId: input.requestId };
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        role: InvitationRecord["role"];
        custom_role_id: string | null;
        state: InvitationRecord["state"];
        expires_at: Date;
      }>(
        `SELECT id,role,custom_role_id,state,expires_at FROM workspace_invitations
         WHERE workspace_id=$1 AND token_hash=$2 FOR UPDATE`,
        [workspaceId, input.tokenHash]
      );
      const row = result.rows[0];
      if (!row) return "invalid";
      if (row.state !== "pending") return "used";
      if (row.expires_at <= input.now) {
        await client.query(
          `UPDATE workspace_invitations SET state='expired',responded_at=$3,updated_at=$3
           WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, row.id, input.now]
        );
        return "expired";
      }
      if (input.response === "decline") {
        await client.query(
          `UPDATE workspace_invitations SET state='declined',accepted_by=$3,
             responded_at=$4,updated_at=$4 WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, row.id, input.userId, input.now]
        );
        await audit(client, context, "invitation.declined", "invitation", row.id);
        return "declined";
      }
      const existing = await client.query<{ id: string; state: MemberRecord["state"] }>(
        `SELECT id,state FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE`,
        [workspaceId, input.userId]
      );
      if (existing.rows[0]?.state === "active") return "existing_member";
      if (existing.rows[0]) {
        await client.query(
          `UPDATE memberships SET role=$3,custom_role_id=$4,state='active',updated_at=$5
           WHERE workspace_id=$1 AND id=$2`,
          [workspaceId, existing.rows[0].id, row.role, row.custom_role_id, input.now]
        );
      } else {
        await client.query(
          `INSERT INTO memberships(workspace_id,id,user_id,role,custom_role_id,state)
           VALUES ($1,$2,$3,$4,$5,'active')`,
          [workspaceId, createId(), input.userId, row.role, row.custom_role_id]
        );
      }
      await client.query(
        `UPDATE workspace_invitations SET state='accepted',accepted_by=$3,
           responded_at=$4,updated_at=$4 WHERE workspace_id=$1 AND id=$2`,
        [workspaceId, row.id, input.userId, input.now]
      );
      await client.query(
        `INSERT INTO onboarding_progress(workspace_id,user_id,current_step)
         VALUES ($1,$2,'role_use_case') ON CONFLICT DO NOTHING`,
        [workspaceId, input.userId]
      );
      await client.query(
        `UPDATE sessions SET active_workspace_id=$1 WHERE user_id=$2 AND revoked_at IS NULL`,
        [workspaceId, input.userId]
      );
      await audit(client, context, "invitation.accepted", "invitation", row.id);
      return "accepted";
    });
  }

  async groups(context: TenantContext): Promise<readonly GroupRecord[]> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        id: string;
        name: string;
        description: string;
        source: GroupRecord["source"];
        member_ids: string[];
      }>(
        `SELECT workspace_group.id,workspace_group.name,workspace_group.description,
          workspace_group.source,coalesce(array_agg(group_member.user_id)
          FILTER (WHERE group_member.user_id IS NOT NULL),'{}') AS member_ids
         FROM workspace_groups workspace_group
         LEFT JOIN workspace_group_memberships group_member
           ON group_member.workspace_id=workspace_group.workspace_id
          AND group_member.group_id=workspace_group.id
         WHERE workspace_group.workspace_id=$1 GROUP BY workspace_group.workspace_id,workspace_group.id
         ORDER BY workspace_group.name`,
        [context.workspaceId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        source: row.source,
        memberIds: row.member_ids
      }));
    });
  }

  async saveGroup(
    context: TenantContext,
    input: {
      readonly id?: string;
      readonly name: string;
      readonly description: string;
      readonly memberIds: readonly string[];
    }
  ): Promise<string> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = input.id ?? createId();
      await client.query(
        `INSERT INTO workspace_groups(workspace_id,id,name,description,source,created_by)
         VALUES ($1,$2,$3,$4,'manual',$5)
         ON CONFLICT (workspace_id,id) DO UPDATE SET name=EXCLUDED.name,
           description=EXCLUDED.description,updated_at=clock_timestamp()
         WHERE workspace_groups.source='manual'`,
        [context.workspaceId, id, input.name, input.description, context.principalId]
      );
      await client.query(
        `DELETE FROM workspace_group_memberships WHERE workspace_id=$1 AND group_id=$2 AND source='manual'`,
        [context.workspaceId, id]
      );
      for (const userId of [...new Set(input.memberIds)])
        await client.query(
          `INSERT INTO workspace_group_memberships(workspace_id,group_id,user_id,source)
           SELECT $1,$2,$3,'manual' WHERE EXISTS (
             SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$3 AND state='active'
           )`,
          [context.workspaceId, id, userId]
        );
      await audit(client, context, input.id ? "group.updated" : "group.created", "group", id);
      return id;
    });
  }

  async deleteGroup(context: TenantContext, groupId: string): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `DELETE FROM workspace_groups WHERE workspace_id=$1 AND id=$2 AND source='manual'`,
        [context.workspaceId, groupId]
      );
      if (result.rowCount === 1) await audit(client, context, "group.deleted", "group", groupId);
      return result.rowCount === 1;
    });
  }

  async saveReportingRelationship(
    context: TenantContext,
    input: {
      readonly reportUserId: string;
      readonly managerUserId: string;
      readonly effectiveFrom: Date;
    }
  ): Promise<string> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      const inserted = await client.query(
        `INSERT INTO organization_relationships(
           workspace_id,id,report_user_id,manager_user_id,source,precedence,effective_from,created_by
         ) SELECT $1,$2,$3,$4,'manual',100,$5,$6
         WHERE EXISTS (SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$3 AND state='active')
           AND EXISTS (SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$4 AND state='active')`,
        [
          context.workspaceId,
          id,
          input.reportUserId,
          input.managerUserId,
          input.effectiveFrom,
          context.principalId
        ]
      );
      if (inserted.rowCount !== 1)
        throw new Error("Both reporting relationship members must be active.");
      await audit(
        client,
        context,
        "organization.relationship.created",
        "organization_relationship",
        id
      );
      return id;
    });
  }

  async onboarding(context: TenantContext): Promise<OnboardingRecord> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        workspace_id: string;
        user_id: string;
        current_step: string;
        completed_steps: string[];
        skipped_steps: string[];
        profile: Record<string, unknown>;
        revision: number;
        completed_at: Date | null;
      }>(
        `INSERT INTO onboarding_progress(workspace_id,user_id,current_step)
         VALUES ($1,$2,'role_use_case') ON CONFLICT (workspace_id,user_id) DO UPDATE
         SET updated_at=onboarding_progress.updated_at
         RETURNING workspace_id,user_id,current_step,completed_steps,skipped_steps,
           profile,revision,completed_at`,
        [context.workspaceId, context.principalId]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Onboarding progress unavailable");
      return {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        currentStep: row.current_step,
        completedSteps: row.completed_steps,
        skippedSteps: row.skipped_steps,
        profile: row.profile,
        revision: row.revision,
        ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {})
      };
    });
  }

  async updateOnboarding(
    context: TenantContext,
    input: {
      readonly currentStep: string;
      readonly completedSteps: readonly string[];
      readonly skippedSteps: readonly string[];
      readonly profile: Readonly<Record<string, unknown>>;
      readonly revision: number;
      readonly complete?: boolean;
    }
  ): Promise<OnboardingRecord | "conflict"> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        workspace_id: string;
        user_id: string;
        current_step: string;
        completed_steps: string[];
        skipped_steps: string[];
        profile: Record<string, unknown>;
        revision: number;
        completed_at: Date | null;
      }>(
        `UPDATE onboarding_progress SET current_step=$3,completed_steps=$4,skipped_steps=$5,
           profile=$6,revision=revision+1,completed_at=CASE WHEN $7 THEN clock_timestamp() ELSE completed_at END,
           updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND user_id=$2 AND revision=$8
         RETURNING workspace_id,user_id,current_step,completed_steps,skipped_steps,
           profile,revision,completed_at`,
        [
          context.workspaceId,
          context.principalId,
          input.currentStep,
          input.completedSteps,
          input.skippedSteps,
          input.profile,
          input.complete ?? false,
          input.revision
        ]
      );
      const row = result.rows[0];
      if (!row) return "conflict";
      await audit(client, context, "onboarding.updated", "onboarding", context.principalId, {
        currentStep: input.currentStep,
        completed: input.complete ?? false
      });
      return {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        currentStep: row.current_step,
        completedSteps: row.completed_steps,
        skippedSteps: row.skipped_steps,
        profile: row.profile,
        revision: row.revision,
        ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {})
      };
    });
  }

  async createSampleData(context: TenantContext): Promise<string> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const workflowId = createId();
      await client.query(
        `INSERT INTO workflows(workspace_id,id,name,description,state)
         VALUES ($1,$2,'Sample customer onboarding','SAMPLE DATA — removable onboarding example','draft')`,
        [context.workspaceId, workflowId]
      );
      await client.query(
        `INSERT INTO workflow_versions(workspace_id,workflow_id,version,state,definition,content_hash)
         VALUES ($1,$2,1,'draft',$3,$4)`,
        [
          context.workspaceId,
          workflowId,
          { sample: true, nodes: [], edges: [] },
          contentHash({ sample: true, nodes: [], edges: [] })
        ]
      );
      await client.query(
        `INSERT INTO sandbox_resources(workspace_id,id,resource_type,resource_id,created_by)
         VALUES ($1,$2,'workflow',$3,$4)`,
        [context.workspaceId, createId(), workflowId, context.principalId]
      );
      await audit(client, context, "sandbox.sample.created", "workflow", workflowId);
      return workflowId;
    });
  }

  async removeSampleData(context: TenantContext, sampleId?: string): Promise<number> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const resources = await client.query<{ id: string; resource_id: string }>(
        `SELECT id,resource_id FROM sandbox_resources
         WHERE workspace_id=$1 AND resource_type='workflow' AND removed_at IS NULL
           AND ($2::uuid IS NULL OR resource_id=$2) FOR UPDATE`,
        [context.workspaceId, sampleId ?? null]
      );
      for (const resource of resources.rows) {
        await client.query("DELETE FROM workflows WHERE workspace_id=$1 AND id=$2", [
          context.workspaceId,
          resource.resource_id
        ]);
        await client.query(
          "UPDATE sandbox_resources SET removed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
          [context.workspaceId, resource.id]
        );
      }
      await audit(client, context, "sandbox.sample.removed", "workspace", context.workspaceId, {
        count: resources.rowCount
      });
      return resources.rowCount ?? 0;
    });
  }
}
