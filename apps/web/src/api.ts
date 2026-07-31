import type { ApiEnvelope, Workflow, WorkflowSummary } from "@knotline/contracts";

import { classifyStatus, RequestFailure } from "./query/errors.js";

const configuredApiUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredApiUrl === "string" ? configuredApiUrl : "http://localhost:4100";
const configuredWorkspaceId: unknown = import.meta.env.VITE_WORKSPACE_ID;
const workspaceId =
  typeof configuredWorkspaceId === "string"
    ? configuredWorkspaceId
    : "10000000-0000-4000-8000-000000000001";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new RequestFailure(
      `Request failed with ${response.status}`,
      classifyStatus(response.status),
      response.headers.get("knotline-request-id") ??
        response.headers.get("x-request-id") ??
        undefined
    );
  }
  return (await response.json()) as T;
}

async function mutate<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const csrf = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-knotline-csrf="))
    ?.slice("__Host-knotline-csrf=".length);
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => undefined)) as
      { error?: { code?: string; message?: string } } | undefined;
    throw new RequestFailure(
      error?.error?.message ?? `Request failed with ${response.status}`,
      classifyStatus(response.status),
      response.headers.get("knotline-request-id") ??
        response.headers.get("x-request-id") ??
        undefined,
      undefined,
      error?.error?.code
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface MeBootstrap {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly status: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly workspaces: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly role: string;
  }[];
  readonly activeWorkspaceId?: string;
  readonly permissions?: readonly string[];
  readonly role?: string;
  readonly onboarding?: OnboardingProgress;
  readonly serverTime: string;
}

export interface WorkspaceSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly state: "active" | "archived" | "deleting";
  readonly timezone: string;
  readonly locale: string;
  readonly region: string;
  readonly role: string;
  readonly isSandbox: boolean;
  readonly sandboxLabel?: string;
}

export interface WorkspaceMember {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly customRoleId?: string;
  readonly state: "active" | "suspended" | "removed";
  readonly createdAt: string;
}

export interface WorkspaceRole {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  readonly system: boolean;
}

export interface WorkspaceInvitation {
  readonly id: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly email: string;
  readonly role: string;
  readonly state: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface WorkspaceGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "manual" | "scim";
  readonly memberIds: readonly string[];
}

export interface OnboardingProgress {
  readonly workspaceId: string;
  readonly userId: string;
  readonly currentStep: string;
  readonly completedSteps: readonly string[];
  readonly skippedSteps: readonly string[];
  readonly profile: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly completedAt?: string;
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

export const fetchMeBootstrap = () => request<MeBootstrap>("/v1/me/bootstrap");

export const fetchProfile = async () =>
  (await request<{ readonly data: MeBootstrap["user"] }>("/v1/me")).data;

export const updateProfile = async (input: {
  readonly displayName: string;
  readonly locale: string;
  readonly timezone: string;
}) => (await mutate<{ readonly data: MeBootstrap["user"] }>("/v1/me", "PATCH", input)).data;

export const requestMagicLink = (email: string) =>
  mutate<{ readonly accepted: true }>("/edge/v1/auth/magic-links", "POST", {
    email,
    intent: "login",
    returnTargetId: "workflows"
  });

export const exchangeMagicLink = (token: string, intent = "login") =>
  mutate<{ readonly returnTarget: string }>("/edge/v1/auth/magic-links/exchange", "POST", {
    token,
    intent
  });

export const startGoogle = () =>
  mutate<{ readonly authorizationUrl: string; readonly expiresAt: string }>(
    "/edge/v1/auth/google/authorizations",
    "POST",
    { returnTargetId: "workflows" }
  );

export const exchangeGoogle = (resultHandle: string) =>
  mutate<{ readonly returnTarget: string }>("/edge/v1/auth/google/exchange", "POST", {
    resultHandle
  });

export const fetchSessions = async () =>
  (await request<{ readonly data: readonly SessionSummary[] }>("/v1/auth/sessions")).data;

export const revokeSession = (sessionId: string) =>
  mutate<void>(`/v1/auth/sessions/${encodeURIComponent(sessionId)}`, "DELETE");

export const revokeOtherSessions = () =>
  mutate<{ readonly revoked: number }>("/v1/auth/sessions/revoke-others", "POST");

export const logout = () => mutate<void>("/v1/auth/logout", "POST");

export const fetchWorkspaces = async () =>
  (await request<{ readonly data: readonly WorkspaceSummary[] }>("/v1/workspaces")).data;

export const createWorkspace = async (input: {
  readonly name: string;
  readonly timezone: string;
  readonly locale: string;
  readonly region: string;
  readonly sandbox?: boolean;
}) => (await mutate<{ readonly data: WorkspaceSummary }>("/v1/workspaces", "POST", input)).data;

export const updateWorkspace = async (workspace: string, input: Partial<WorkspaceSummary>) =>
  (
    await mutate<{ readonly data: WorkspaceSummary }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}`,
      "PATCH",
      input
    )
  ).data;

export const switchWorkspace = (workspace: string) =>
  mutate<{ readonly activeWorkspaceId: string; readonly cacheEpoch: number }>(
    `/v1/workspaces/${encodeURIComponent(workspace)}/switch`,
    "POST"
  );

export const archiveWorkspace = (workspace: string) =>
  mutate<void>(`/v1/workspaces/${encodeURIComponent(workspace)}/archive`, "POST");

export const restoreWorkspace = (workspace: string) =>
  mutate<{ readonly restored: true }>(
    `/v1/workspaces/${encodeURIComponent(workspace)}/restorations`,
    "POST"
  );

export const fetchMembers = async (workspace: string) =>
  (
    await request<{ readonly data: readonly WorkspaceMember[] }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}/members`
    )
  ).data;

export const updateMember = (workspace: string, member: string, input: unknown) =>
  mutate<{ readonly updated: true }>(
    `/v1/workspaces/${encodeURIComponent(workspace)}/members/${encodeURIComponent(member)}`,
    "PATCH",
    input
  );

export const transferOwnership = (workspace: string, targetMemberId: string) =>
  mutate<{ readonly transferred: true }>(
    `/v1/workspaces/${encodeURIComponent(workspace)}/ownership-transfers`,
    "POST",
    { targetMemberId }
  );

export const fetchInvitations = async (workspace: string) =>
  (
    await request<{ readonly data: readonly WorkspaceInvitation[] }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}/invitations`
    )
  ).data;

export const inviteMember = async (workspace: string, email: string, role: string) =>
  (
    await mutate<{ readonly data: WorkspaceInvitation }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}/invitations`,
      "POST",
      { email, role }
    )
  ).data;

export const cancelInvitation = (invitationId: string) =>
  mutate<void>(`/v1/invitations/${encodeURIComponent(invitationId)}`, "DELETE");

export const previewInvitation = async (token: string) =>
  (
    await mutate<{ readonly data: WorkspaceInvitation }>(
      "/edge/v1/invitation-responses/preview",
      "POST",
      { token }
    )
  ).data;

export const respondToInvitation = (token: string, response: "accept" | "decline") =>
  mutate<{ readonly result: string }>("/edge/v1/invitation-responses", "POST", {
    token,
    response
  });

export const fetchRoles = async (workspace: string) =>
  (
    await request<{ readonly data: readonly WorkspaceRole[] }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}/roles`
    )
  ).data;

export const createRole = async (
  workspace: string,
  input: {
    readonly name: string;
    readonly description: string;
    readonly permissions: readonly string[];
  }
) =>
  (
    await mutate<{ readonly data: WorkspaceRole }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}/roles`,
      "POST",
      input
    )
  ).data;

export const fetchGroups = async (workspace: string) =>
  (
    await request<{ readonly data: readonly WorkspaceGroup[] }>(
      `/v1/workspaces/${encodeURIComponent(workspace)}/groups`
    )
  ).data;

export const createGroup = (workspace: string, name: string, memberIds: readonly string[]) =>
  mutate<{ readonly id: string }>(
    `/v1/workspaces/${encodeURIComponent(workspace)}/groups`,
    "POST",
    { name, description: "", memberIds }
  );

export const fetchOnboarding = async () =>
  (await request<{ readonly data: OnboardingProgress }>("/v1/me/onboarding")).data;

export const saveOnboarding = async (progress: OnboardingProgress, complete = false) =>
  (
    await mutate<{ readonly data: OnboardingProgress }>("/v1/me/onboarding", "PUT", {
      currentStep: progress.currentStep,
      completedSteps: progress.completedSteps,
      skippedSteps: progress.skippedSteps,
      profile: progress.profile,
      revision: progress.revision,
      complete
    })
  ).data;

export const createSampleWorkspace = () =>
  mutate<{ readonly id: string; readonly label: string }>(
    "/v1/me/onboarding/sample-workspaces",
    "POST"
  );

export const removeSampleWorkspace = (sampleId: string) =>
  mutate<{ readonly removed: number }>(
    `/v1/me/onboarding/sample-workspaces/${encodeURIComponent(sampleId)}`,
    "DELETE"
  );

export async function fetchWorkflows(): Promise<WorkflowSummary[]> {
  const response = await request<ApiEnvelope<WorkflowSummary[]>>(
    `/v1/teams/${workspaceId}/workflows`
  );
  return response.data;
}

export async function fetchWorkflow(id: string): Promise<Workflow> {
  const response = await request<ApiEnvelope<Workflow>>(`/v1/workflows/${id}`);
  return response.data;
}
