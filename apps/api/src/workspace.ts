import { randomBytes } from "node:crypto";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  type GroupRecord,
  type InvitationRecord,
  type MemberRecord,
  type MembershipRole,
  type OnboardingRecord,
  PERMISSION_CATALOG,
  type PostgresWorkspaceRepository,
  type RoleRecord,
  type SessionIdentity,
  type TenantContext,
  type WorkspaceRecord
} from "@knotline/db";

import { AuthFailure, secretHash } from "./auth.js";

type WorkspaceRepository = Pick<PostgresWorkspaceRepository, keyof PostgresWorkspaceRepository>;

const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000;
const randomSecret = () => randomBytes(32).toString("base64url");
const allowedPermissions = new Set<string>(PERMISSION_CATALOG);

export interface InvitationDelivery {
  readonly email: string;
  readonly workspaceName: string;
  readonly acceptanceUrl: string;
  readonly expiresAt: string;
}

export interface InvitationMailer {
  deliverInvitation(delivery: InvitationDelivery): Promise<void>;
}

export class CaptureInvitationMailer implements InvitationMailer {
  private readonly deliveries: InvitationDelivery[] = [];

  deliverInvitation(delivery: InvitationDelivery): Promise<void> {
    this.deliveries.push(delivery);
    return Promise.resolve();
  }

  latest(email?: string): InvitationDelivery | undefined {
    return [...this.deliveries]
      .reverse()
      .find((delivery) => !email || delivery.email === email.toLowerCase());
  }
}

export class SesInvitationMailer implements InvitationMailer {
  private readonly client: SESv2Client;

  constructor(
    region: string,
    private readonly from: string
  ) {
    this.client = new SESv2Client({ region });
  }

  async deliverInvitation(delivery: InvitationDelivery): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [delivery.email] },
        Content: {
          Simple: {
            Subject: { Data: `Join ${delivery.workspaceName} on Knotline`, Charset: "UTF-8" },
            Body: {
              Text: {
                Data: `You were invited to ${delivery.workspaceName}. Open this private link before ${delivery.expiresAt}: ${delivery.acceptanceUrl}`,
                Charset: "UTF-8"
              }
            }
          }
        }
      })
    );
  }
}

export class WorkspaceService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly mailer: InvitationMailer,
    private readonly webOrigin: string
  ) {}

  private context(identity: SessionIdentity, requestId: string): TenantContext {
    if (!identity.activeWorkspaceId)
      throw new AuthFailure("WORKSPACE_REQUIRED", 403, "Create or join a workspace to continue.");
    return {
      workspaceId: identity.activeWorkspaceId,
      principalId: identity.user.id,
      requestId
    };
  }

  async access(identity: SessionIdentity, requestId: string) {
    const context = this.context(identity, requestId);
    const membership = await this.repository.membership(context);
    if (!membership)
      throw new AuthFailure("WORKSPACE_ACCESS_DENIED", 403, "You no longer have workspace access.");
    return { context, ...membership };
  }

  async require(identity: SessionIdentity, requestId: string, permission: string) {
    const access = await this.access(identity, requestId);
    if (!access.permissions.includes("*") && !access.permissions.includes(permission))
      throw new AuthFailure(
        "PERMISSION_DENIED",
        403,
        `This action requires the ${permission} permission.`
      );
    return access;
  }

  async bootstrap(identity: SessionIdentity, requestId: string) {
    const workspaces = await this.repository.listForUser(identity.user.id);
    if (!identity.activeWorkspaceId)
      return { workspaces, permissions: [], role: undefined, onboarding: undefined };
    const access = await this.access(identity, requestId);
    return {
      workspaces,
      permissions: access.permissions,
      role: access.role,
      onboarding: await this.repository.onboarding(access.context)
    };
  }

  createWorkspace(
    identity: SessionIdentity,
    requestId: string,
    input: {
      readonly name: string;
      readonly timezone: string;
      readonly locale: string;
      readonly region: string;
      readonly sandbox?: boolean;
    }
  ): Promise<WorkspaceRecord> {
    return this.repository.createWorkspace({
      userId: identity.user.id,
      requestId,
      ...input
    });
  }

  listWorkspaces(identity: SessionIdentity) {
    return this.repository.listForUser(identity.user.id);
  }

  async switchWorkspace(identity: SessionIdentity, workspaceId: string) {
    const switched = await this.repository.switchWorkspace({
      sessionId: identity.sessionId,
      userId: identity.user.id,
      workspaceId
    });
    if (!switched)
      throw new AuthFailure("WORKSPACE_NOT_FOUND", 404, "The workspace does not exist.");
  }

  async updateWorkspace(
    identity: SessionIdentity,
    requestId: string,
    input: Partial<Pick<WorkspaceRecord, "name" | "timezone" | "locale" | "region">>
  ) {
    const { context } = await this.require(identity, requestId, "workspace.update");
    return this.repository.updateWorkspace(context, input);
  }

  async setWorkspaceState(
    identity: SessionIdentity,
    requestId: string,
    state: "active" | "archived" | "deleting"
  ) {
    const permission = state === "deleting" ? "workspace.delete" : "workspace.archive";
    const { context } = await this.require(identity, requestId, permission);
    return this.repository.setWorkspaceState(context, state);
  }

  async members(identity: SessionIdentity, requestId: string): Promise<readonly MemberRecord[]> {
    const { context } = await this.require(identity, requestId, "member.read");
    return this.repository.listMembers(context);
  }

  async updateMember(
    identity: SessionIdentity,
    requestId: string,
    memberId: string,
    input: {
      readonly role?: MembershipRole;
      readonly customRoleId?: string;
      readonly state?: MemberRecord["state"];
    }
  ) {
    const { context } = await this.require(identity, requestId, "member.update");
    if (input.role === "owner")
      throw new AuthFailure(
        "OWNERSHIP_TRANSFER_REQUIRED",
        409,
        "Use the ownership transfer action to assign an owner."
      );
    return this.repository.updateMember(context, memberId, input);
  }

  async removeMember(
    identity: SessionIdentity,
    requestId: string,
    memberId: string,
    reassignToMemberId: string
  ) {
    const { context } = await this.require(identity, requestId, "member.remove");
    return this.repository.reassignAndRemoveMember(context, memberId, reassignToMemberId);
  }

  async transferOwnership(identity: SessionIdentity, requestId: string, targetMemberId: string) {
    const { context } = await this.require(identity, requestId, "ownership.transfer");
    return this.repository.transferOwnership(context, targetMemberId);
  }

  async roles(identity: SessionIdentity, requestId: string): Promise<readonly RoleRecord[]> {
    const { context } = await this.require(identity, requestId, "role.read");
    return this.repository.roles(context);
  }

  async saveRole(
    identity: SessionIdentity,
    requestId: string,
    input: {
      readonly id?: string;
      readonly name: string;
      readonly description: string;
      readonly permissions: readonly string[];
    }
  ) {
    const { context, permissions: creatorPermissions } = await this.require(
      identity,
      requestId,
      "role.manage"
    );
    if (input.permissions.some((permission) => !allowedPermissions.has(permission)))
      throw new AuthFailure(
        "PERMISSION_UNKNOWN",
        400,
        "The custom role contains an unknown permission."
      );
    if (
      !creatorPermissions.includes("*") &&
      input.permissions.some((permission) => !creatorPermissions.includes(permission))
    )
      throw new AuthFailure(
        "ROLE_PERMISSION_ESCALATION",
        403,
        "A custom role cannot grant a permission you do not have."
      );
    return this.repository.saveCustomRole(context, input);
  }

  async deleteRole(identity: SessionIdentity, requestId: string, roleId: string) {
    const { context } = await this.require(identity, requestId, "role.manage");
    return this.repository.deleteCustomRole(context, roleId);
  }

  async invite(
    identity: SessionIdentity,
    requestId: string,
    input: {
      readonly email: string;
      readonly role: Exclude<MembershipRole, "owner">;
      readonly customRoleId?: string;
    },
    now = new Date()
  ) {
    const { context } = await this.require(identity, requestId, "member.invite");
    const token = randomSecret();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const invitation = await this.repository.createInvitation(context, {
      email: input.email,
      tokenHash: secretHash(token),
      role: input.role,
      ...(input.customRoleId ? { customRoleId: input.customRoleId } : {}),
      expiresAt
    });
    if (invitation === "existing_member") return invitation;
    await this.mailer.deliverInvitation({
      email: input.email,
      workspaceName: invitation.workspaceName,
      acceptanceUrl: `${this.webOrigin}/invitations/accept#token=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString()
    });
    return invitation;
  }

  async resendInvitation(identity: SessionIdentity, requestId: string, invitationId: string) {
    const { context } = await this.require(identity, requestId, "member.invite");
    const invitation = (await this.repository.invitations(context)).find(
      (candidate) => candidate.id === invitationId && candidate.state === "pending"
    );
    if (!invitation)
      throw new AuthFailure("INVITATION_NOT_FOUND", 404, "The invitation does not exist.");
    await this.repository.cancelInvitation(context, invitationId);
    return this.invite(
      identity,
      requestId,
      {
        email: invitation.email,
        role: invitation.role,
        ...(invitation.customRoleId ? { customRoleId: invitation.customRoleId } : {})
      },
      new Date()
    );
  }

  async invitations(identity: SessionIdentity, requestId: string) {
    const { context } = await this.require(identity, requestId, "member.read");
    return this.repository.invitations(context);
  }

  async cancelInvitation(identity: SessionIdentity, requestId: string, invitationId: string) {
    const { context } = await this.require(identity, requestId, "member.invite");
    return this.repository.cancelInvitation(context, invitationId);
  }

  previewInvitation(
    identity: SessionIdentity,
    token: string
  ): Promise<InvitationRecord | undefined> {
    return this.repository.invitationPreview(secretHash(token), identity.user.email);
  }

  respondToInvitation(
    identity: SessionIdentity,
    requestId: string,
    token: string,
    response: "accept" | "decline"
  ) {
    return this.repository.respondToInvitation({
      tokenHash: secretHash(token),
      userId: identity.user.id,
      email: identity.user.email,
      response,
      requestId,
      now: new Date()
    });
  }

  async groups(identity: SessionIdentity, requestId: string): Promise<readonly GroupRecord[]> {
    const { context } = await this.require(identity, requestId, "group.read");
    return this.repository.groups(context);
  }

  async saveGroup(
    identity: SessionIdentity,
    requestId: string,
    input: {
      readonly id?: string;
      readonly name: string;
      readonly description: string;
      readonly memberIds: readonly string[];
    }
  ) {
    const { context } = await this.require(identity, requestId, "group.manage");
    return this.repository.saveGroup(context, input);
  }

  async deleteGroup(identity: SessionIdentity, requestId: string, groupId: string) {
    const { context } = await this.require(identity, requestId, "group.manage");
    return this.repository.deleteGroup(context, groupId);
  }

  async saveReportingRelationship(
    identity: SessionIdentity,
    requestId: string,
    input: { readonly reportUserId: string; readonly managerUserId: string }
  ) {
    const { context } = await this.require(identity, requestId, "group.manage");
    return this.repository.saveReportingRelationship(context, {
      ...input,
      effectiveFrom: new Date()
    });
  }

  async onboarding(identity: SessionIdentity, requestId: string): Promise<OnboardingRecord> {
    const { context } = await this.access(identity, requestId);
    return this.repository.onboarding(context);
  }

  async updateOnboarding(
    identity: SessionIdentity,
    requestId: string,
    input: {
      readonly currentStep: string;
      readonly completedSteps: readonly string[];
      readonly skippedSteps: readonly string[];
      readonly profile: Readonly<Record<string, unknown>>;
      readonly revision: number;
      readonly complete?: boolean;
    }
  ) {
    const { context } = await this.access(identity, requestId);
    return this.repository.updateOnboarding(context, input);
  }

  async createSampleData(identity: SessionIdentity, requestId: string) {
    const { context } = await this.require(identity, requestId, "workflow.create");
    return this.repository.createSampleData(context);
  }

  async removeSampleData(identity: SessionIdentity, requestId: string, sampleId?: string) {
    const { context } = await this.require(identity, requestId, "workflow.manage");
    return this.repository.removeSampleData(context, sampleId);
  }
}
