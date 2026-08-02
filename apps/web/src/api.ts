import type {
  ApiEnvelope,
  CollaborationThread,
  ValidationFinding,
  Workflow,
  WorkflowDefinition,
  WorkflowDryRunReport,
  WorkflowGenerationResult,
  WorkflowSummary
} from "@knotline/contracts";

import { classifyStatus, RequestFailure } from "./query/errors.js";

const configuredApiUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredApiUrl === "string" ? configuredApiUrl.replace(/\/$/u, "") : "";
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

export interface WorkflowTriggerSummary {
  readonly id: string;
  readonly triggerKey: string;
  readonly kind: string;
  readonly state: "enabled" | "disabled";
  readonly version: number;
  readonly environment: "test" | "production";
  readonly schemaVersion: string;
  readonly cron?: string;
  readonly timeZone?: string;
  readonly nextFireAt?: string;
  readonly lastReceivedAt?: string;
  readonly lastStartedAt?: string;
  readonly filteredCount?: number;
  readonly duplicateCount?: number;
  readonly errorCount?: number;
  readonly lagSeconds?: number;
  readonly backlogCount?: number;
  readonly disabledReason?: string;
}

export interface TriggerDelivery {
  readonly id: string;
  readonly provider: string;
  readonly sourceId: string;
  readonly eventId?: string;
  readonly receivedAt: string;
  readonly state: string;
  readonly queueState?: string;
  readonly runId?: string;
}

export interface NotificationItem {
  readonly id: string;
  readonly groupKey: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
  readonly readAt?: string;
  readonly unavailableReason?: string;
  readonly createdAt: string;
  readonly eventType: string;
  readonly priority: "normal" | "critical";
}

export interface NotificationPreference {
  readonly eventType: string;
  readonly channels: Readonly<
    Record<string, "immediate" | "daily_digest" | "weekly_digest" | "off">
  >;
  readonly quietStart?: string;
  readonly quietEnd?: string;
  readonly timeZone: string;
  readonly language: string;
  readonly revision: number;
}

export const fetchNotifications = async (filter: "all" | "unread" = "all") =>
  (
    await request<{ readonly data: readonly NotificationItem[] }>(
      `/v1/me/notifications?filter=${filter}`
    )
  ).data;
export const markNotificationRead = async (notificationId: string) =>
  (
    await mutate<{ readonly data: { readonly id: string; readonly readAt: string } }>(
      `/v1/me/notifications/${encodeURIComponent(notificationId)}/read`,
      "POST"
    )
  ).data;
export const markAllNotificationsRead = async () =>
  (
    await mutate<{ readonly data: { readonly updated: number } }>(
      "/v1/me/notifications/read-all",
      "POST"
    )
  ).data;
export const fetchNotificationPreferences = async () =>
  (
    await request<{ readonly data: readonly NotificationPreference[] }>(
      "/v1/me/notification-preferences"
    )
  ).data;
export const updateNotificationPreferences = async (
  preferences: readonly Omit<NotificationPreference, "revision">[]
) =>
  (
    await mutate<{ readonly data: readonly NotificationPreference[] }>(
      "/v1/me/notification-preferences",
      "PATCH",
      { preferences }
    )
  ).data;
export const fetchWorkspaceNotificationPolicy = async () =>
  (
    await request<{ readonly data: Readonly<Record<string, unknown>> }>(
      `/v1/workspaces/${workspaceId}/notification-preferences`
    )
  ).data;
export const updateWorkspaceNotificationPolicy = async (
  policy: Readonly<Record<string, unknown>>
) =>
  (
    await mutate<{ readonly data: Readonly<Record<string, unknown>> }>(
      `/v1/workspaces/${workspaceId}/notification-preferences`,
      "PATCH",
      policy
    )
  ).data;

export interface SearchResult {
  readonly id: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}
export interface SavedView {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
  readonly visibility: "private" | "workspace";
  readonly definition: Readonly<Record<string, unknown>>;
  readonly schemaVersion: number;
  readonly isDefault: boolean;
  readonly revision: number;
}
export interface ReportSummary {
  readonly id: string;
  readonly name: string;
  readonly definition: Readonly<Record<string, unknown>>;
  readonly visibility: string;
  readonly state: string;
  readonly revision: number;
  readonly updatedAt?: string;
}
export const searchWorkspace = async (query: string) =>
  (
    await request<{ data: readonly SearchResult[] }>(
      `/v1/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`
    )
  ).data;
export const fetchSavedViews = async () =>
  (await request<{ data: readonly SavedView[] }>(`/v1/workspaces/${workspaceId}/saved-views`)).data;
export const createSavedView = async (body: unknown) =>
  (await mutate<{ data: SavedView }>(`/v1/workspaces/${workspaceId}/saved-views`, "POST", body))
    .data;
export const fetchAnalytics = async () =>
  (
    await request<{
      data: {
        metrics: readonly Readonly<Record<string, unknown>>[];
        freshThrough: string | null;
        partial: boolean;
        demoExcluded: boolean;
      };
    }>(`/v1/workspaces/${workspaceId}/analytics`)
  ).data;
export const fetchReports = async () =>
  (await request<{ data: readonly ReportSummary[] }>(`/v1/workspaces/${workspaceId}/reports`)).data;
export const fetchReport = async (id: string) =>
  (await request<{ data: ReportSummary }>(`/v1/reports/${encodeURIComponent(id)}`)).data;
export const createReport = async (body: unknown) =>
  (await mutate<{ data: ReportSummary }>(`/v1/workspaces/${workspaceId}/reports`, "POST", body))
    .data;
export const exportReport = async (id: string, format: "csv" | "pdf" = "csv") =>
  (
    await mutate<{ data: Readonly<Record<string, unknown>> }>(
      `/v1/reports/${encodeURIComponent(id)}/exports`,
      "POST",
      { format }
    )
  ).data;

export const fetchWorkflowTriggers = async (workflowId: string) =>
  (
    await request<{ readonly data: readonly WorkflowTriggerSummary[] }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/triggers`
    )
  ).data;
export const createWorkflowTrigger = async (workflowId: string, body: unknown) =>
  (
    await mutate<{ readonly data: WorkflowTriggerSummary }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/triggers`,
      "POST",
      body
    )
  ).data;
export const transitionWorkflowTrigger = async (triggerId: string, enabled: boolean) =>
  (
    await mutate<{ readonly data: WorkflowTriggerSummary }>(
      `/v1/workflow-triggers/${encodeURIComponent(triggerId)}/${enabled ? "enables" : "disables"}`,
      "POST"
    )
  ).data;
export const fetchTriggerDeliveries = async (triggerId: string) =>
  (
    await request<{ readonly data: readonly TriggerDelivery[] }>(
      `/v1/workflow-triggers/${encodeURIComponent(triggerId)}/deliveries`
    )
  ).data;
export const sendTriggerTestEvent = async (triggerId: string) =>
  (
    await mutate<{ readonly data: { readonly id: string; readonly state: string } }>(
      `/v1/workflow-triggers/${encodeURIComponent(triggerId)}/test-events`,
      "POST",
      {
        provider: "fixture",
        sourceId: "operator-simulator",
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        schemaVersion: "1.0",
        payloadHash: crypto.randomUUID().replaceAll("-", ""),
        encryptedPayloadReference: `encrypted://test/${crypto.randomUUID()}`
      }
    )
  ).data;

export interface ApprovalSummary {
  readonly id: string;
  readonly state: string;
  readonly state_version: string | number;
  readonly expires_at: string;
  readonly title: string;
  readonly risk: "low" | "medium" | "high" | "critical";
  readonly eligible: boolean;
}

export interface ApprovalDetail extends ApprovalSummary {
  readonly requester_id: string;
  readonly packet: {
    readonly title: string;
    readonly proposedAction: string;
    readonly affectedResources: readonly { type: string; id: string; label: string }[];
    readonly diff: Readonly<Record<string, unknown>>;
    readonly risk: { level: string; findings: readonly string[] };
    readonly evidence: readonly { label: string; uri: string; digest?: string }[];
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly expiresAt: string;
  };
  readonly steps: readonly {
    step_key: string;
    state: string;
    mode: string;
    eligible_user_ids: readonly string[];
  }[];
  readonly decisions: readonly {
    id: string;
    actor_id: string;
    outcome: string;
    reason: string;
    decided_at: string;
  }[];
}

export const fetchApprovals = async () =>
  (await request<{ readonly data: readonly ApprovalSummary[] }>("/v1/approvals")).data;

export const fetchApproval = async (approvalId: string) =>
  (
    await request<{ readonly data: ApprovalDetail }>(
      `/v1/approvals/${encodeURIComponent(approvalId)}`
    )
  ).data;

export const decideApproval = async (
  approvalId: string,
  input: {
    readonly stepKey: string;
    readonly outcome: "approve" | "reject" | "request_changes" | "abstain" | "cancel";
    readonly reason: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
  }
) =>
  (
    await mutate<{ readonly data: Readonly<Record<string, unknown>> }>(
      `/v1/approvals/${encodeURIComponent(approvalId)}/decisions`,
      "POST",
      input
    )
  ).data;

export const remindApproval = (approvalId: string, idempotencyKey: string) =>
  mutate<{ readonly data: { readonly queued: number } }>(
    `/v1/approvals/${encodeURIComponent(approvalId)}/reminders`,
    "POST",
    { idempotencyKey }
  );

export interface AgentDefinition {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly description: string;
  readonly purpose: string;
  readonly visibility: "private" | "workspace";
  readonly tags: readonly string[];
  readonly prompts: {
    readonly system: string;
    readonly developer: string;
    readonly user: string;
    readonly variables: readonly {
      key: string;
      type: "string" | "number" | "boolean" | "object" | "array";
      required: boolean;
      description: string;
      sensitive: boolean;
    }[];
  };
  readonly modelPolicy: Readonly<Record<string, unknown>> & { readonly role: string };
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly tools: readonly Readonly<Record<string, unknown>>[];
  readonly knowledge: readonly Readonly<Record<string, unknown>>[];
  readonly memory: Readonly<Record<string, unknown>>;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly fallback: Readonly<Record<string, unknown>>;
  readonly humanApproval: Readonly<Record<string, unknown>>;
}

export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly visibility: string;
  readonly state: string;
  readonly current_version?: number;
  readonly stable_version?: number;
  readonly tags: readonly string[];
  readonly usage_references: number;
}

export interface AgentDetail extends AgentSummary {
  readonly revision: number;
  readonly definition: AgentDefinition;
  readonly validation_findings: readonly {
    code: string;
    severity: string;
    path: string;
    message: string;
  }[];
  readonly release_channels: readonly Readonly<Record<string, unknown>>[];
  readonly activity: readonly Readonly<Record<string, unknown>>[];
}

export const fetchAgents = async (search = "") =>
  (
    await request<{ readonly data: readonly AgentSummary[] }>(
      `/v1/workspaces/${workspaceId}/agents?search=${encodeURIComponent(search)}`
    )
  ).data;

export const createAgent = async (definition: AgentDefinition) =>
  (
    await mutate<{ readonly data: { readonly id: string; readonly revision: number } }>(
      `/v1/workspaces/${workspaceId}/agents`,
      "POST",
      { definition }
    )
  ).data;

export const fetchAgent = async (agentId: string) =>
  (await request<{ readonly data: AgentDetail }>(`/v1/agents/${encodeURIComponent(agentId)}`)).data;

export const saveAgentDraft = async (
  agentId: string,
  expectedRevision: number,
  definition: AgentDefinition
) =>
  (
    await mutate<{ readonly data: { readonly revision: number } }>(
      `/v1/agents/${encodeURIComponent(agentId)}`,
      "PATCH",
      { expectedRevision, definition }
    )
  ).data;

export const publishAgent = async (
  agentId: string,
  expectedRevision: number,
  changeSummary: string
) =>
  (
    await mutate<{ readonly data: { readonly version: number; readonly contentHash: string } }>(
      `/v1/agents/${encodeURIComponent(agentId)}/versions`,
      "POST",
      { expectedRevision, changeSummary }
    )
  ).data;

export const simulateAgent = async (agentId: string, fixture: Readonly<Record<string, unknown>>) =>
  (
    await mutate<{
      readonly data: {
        readonly executionClass: "SIMULATED";
        readonly promptPreview: Readonly<Record<string, string>>;
        readonly output: Readonly<Record<string, unknown>>;
        readonly tokenEstimate: number;
      };
    }>(`/v1/agents/${encodeURIComponent(agentId)}/simulations`, "POST", { fixture })
  ).data;

export const forkAgent = async (agentId: string, version: number, name: string) =>
  (
    await mutate<{ readonly data: { readonly id: string } }>(
      `/v1/agents/${encodeURIComponent(agentId)}/forks`,
      "POST",
      { version, name }
    )
  ).data;

export const fetchAgentVersions = async (agentId: string) =>
  (
    await request<{ readonly data: readonly Readonly<Record<string, unknown>>[] }>(
      `/v1/agents/${encodeURIComponent(agentId)}/versions`
    )
  ).data;

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

export interface WorkflowDraft {
  readonly workflowId: string;
  readonly version: number;
  readonly revision: number;
  readonly etag: string;
  readonly contentHash: string;
  readonly definition: WorkflowDefinition;
}

export interface WorkflowVersionSummary {
  readonly version: number;
  readonly state: "draft" | "published" | "superseded";
  readonly revision: number;
  readonly contentHash: string;
  readonly releaseNote: string;
  readonly publishedAt?: string;
  readonly createdAt: string;
}

export interface WorkflowTemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: string;
  readonly version: number;
  readonly definition: WorkflowDefinition;
  readonly variables: readonly { readonly key: string; readonly required: boolean }[];
}

export interface WorkflowGenerationResource {
  readonly id: string;
  readonly sourcePrompt: string;
  readonly lifecycle: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLING" | "CANCELLED";
  readonly phase?: "GENERATING" | "VALIDATING" | "REPAIRING" | "READY_TO_ACCEPT";
  readonly result?: WorkflowGenerationResult;
  readonly failureCode?: string;
  readonly retryOf?: string;
  readonly acceptedWorkflowId?: string;
}

export const startWorkflowGeneration = async (prompt: string, retryOf?: string) =>
  (
    await mutate<{ readonly data: WorkflowGenerationResource }>(
      `/v1/workspaces/${workspaceId}/workflow-generations`,
      "POST",
      { prompt, fixture: "standard", ...(retryOf ? { retryOf } : {}) }
    )
  ).data;

export const fetchWorkflowGeneration = async (generationId: string) =>
  (
    await request<{ readonly data: WorkflowGenerationResource }>(
      `/v1/workflow-generations/${encodeURIComponent(generationId)}`
    )
  ).data;

export const cancelWorkflowGeneration = async (generationId: string) =>
  (
    await mutate<{ readonly data: WorkflowGenerationResource }>(
      `/v1/workflow-generations/${encodeURIComponent(generationId)}/cancellations`,
      "POST"
    )
  ).data;

export const acceptWorkflowGeneration = (generationId: string, publish = true) =>
  mutate<{ readonly workflowId: string; readonly simulated: boolean; readonly published: boolean }>(
    `/v1/workflow-generations/${encodeURIComponent(generationId)}/acceptances`,
    "POST",
    { publish }
  );

export const previewWorkflowImport = async (
  format: "json" | "csv",
  content: WorkflowDefinition | string
) =>
  (
    await mutate<{
      readonly data: {
        readonly definition: WorkflowDefinition;
        readonly findings: readonly ValidationFinding[];
        readonly createsResource: false;
      };
    }>("/v1/workflow-import-previews", "POST", { format, content })
  ).data;

export const importWorkflowDefinition = (definition: WorkflowDefinition) =>
  mutate<{ readonly id: string }>(
    `/v1/workspaces/${workspaceId}/workflow-imports`,
    "POST",
    definition
  );

export const dryRunWorkflowDefinition = async (
  definition: WorkflowDefinition,
  fixture: Readonly<Record<string, unknown>>
) =>
  (
    await mutate<{ readonly data: WorkflowDryRunReport }>("/v1/workflow-dry-runs", "POST", {
      definition,
      fixture
    })
  ).data;

export interface CollaborationThreadView extends CollaborationThread {
  readonly sharePath: string;
  readonly presence: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly lastSeenAt: string;
  }[];
}

export const fetchResourceThread = async (resourceType: "workflow", resourceId: string) =>
  (
    await request<{ readonly data: CollaborationThreadView }>(
      `/v1/resources/${resourceType}/${encodeURIComponent(resourceId)}/thread`
    )
  ).data;

export const createResourceComment = (
  resourceId: string,
  input: {
    readonly body: string;
    readonly parentId?: string;
    readonly mentionedUserIds: readonly string[];
    readonly attachmentRefs: readonly string[];
  }
) =>
  mutate<{ readonly id: string }>(
    `/v1/resources/workflow/${encodeURIComponent(resourceId)}/comments`,
    "POST",
    input
  );

export const editResourceComment = (commentId: string, body: string) =>
  mutate<{ readonly updated: true }>(`/v1/comments/${encodeURIComponent(commentId)}`, "PATCH", {
    body
  });

export const deleteResourceComment = (commentId: string) =>
  mutate<void>(`/v1/comments/${encodeURIComponent(commentId)}`, "DELETE");

export const setCommentReaction = (
  commentId: string,
  reaction: "thumbs_up" | "heart" | "celebrate" | "eyes",
  enabled: boolean
) =>
  mutate<void>(
    `/v1/comments/${encodeURIComponent(commentId)}/reactions${enabled ? "" : `/${reaction}`}`,
    enabled ? "POST" : "DELETE",
    enabled ? { reaction } : undefined
  );

export const setWorkflowFollow = (workflowId: string, enabled: boolean) =>
  mutate<void>(
    `/v1/workflows/${encodeURIComponent(workflowId)}/follows`,
    enabled ? "POST" : "DELETE"
  );

export const createVersionedWorkflow = async (name: string, description: string) =>
  (
    await mutate<{ readonly data: Workflow }>(`/v1/workspaces/${workspaceId}/workflows`, "POST", {
      name,
      description
    })
  ).data;

export const fetchWorkflowDraft = async (workflowId: string) =>
  (
    await request<{ readonly data: WorkflowDraft }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/draft`
    )
  ).data;

export const saveWorkflowDraft = async (draft: WorkflowDraft, definition: WorkflowDefinition) => {
  const csrf = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-knotline-csrf="))
    ?.slice("__Host-knotline-csrf=".length);
  const response = await fetch(
    `${apiUrl}/v1/workflows/${encodeURIComponent(draft.workflowId)}/draft`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "if-match": draft.etag,
        ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {})
      },
      body: JSON.stringify(definition)
    }
  );
  if (!response.ok)
    throw new RequestFailure(
      `Request failed with ${response.status}`,
      classifyStatus(response.status)
    );
  return ((await response.json()) as { data: WorkflowDraft }).data;
};

export const validateWorkflowDraft = async (workflowId: string) =>
  (
    await mutate<{
      readonly data: { readonly valid: boolean; readonly findings: readonly ValidationFinding[] };
    }>(`/v1/workflows/${encodeURIComponent(workflowId)}/draft/validations`, "POST")
  ).data;

export const publishWorkflowDraft = async (
  workflowId: string,
  revision: number,
  releaseNote: string
) =>
  (
    await mutate<{
      readonly data: {
        readonly published: boolean;
        readonly findings: readonly ValidationFinding[];
        readonly publishedVersion?: number;
        readonly nextDraftVersion?: number;
        readonly contentHash?: string;
      };
    }>(`/v1/workflows/${encodeURIComponent(workflowId)}/draft/publications`, "POST", {
      revision,
      releaseNote
    })
  ).data;

export const fetchWorkflowVersions = async (workflowId: string) =>
  (
    await request<{ readonly data: readonly WorkflowVersionSummary[] }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/versions`
    )
  ).data;

export const fetchWorkflowVersion = async (workflowId: string, version: number) =>
  (
    await request<{ readonly data: WorkflowDraft }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}`
    )
  ).data;

export const fetchWorkflowDiff = async (workflowId: string, from: number, to: number) =>
  (
    await request<{ readonly data: Readonly<Record<string, unknown>> }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/version-diffs?from=${from}&to=${to}`
    )
  ).data;

export const restoreWorkflowVersion = async (workflowId: string, version: number) =>
  (
    await mutate<{ readonly data: WorkflowDraft }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/drafts-from-version`,
      "POST",
      { version }
    )
  ).data;

export const fetchTemplates = async () =>
  (await request<{ readonly data: readonly WorkflowTemplateSummary[] }>("/v1/templates")).data;

export const createWorkflowTemplate = async (
  workflowId: string,
  name: string,
  description: string
) =>
  (
    await mutate<{ readonly data: WorkflowTemplateSummary }>(
      `/v1/workspaces/${workspaceId}/templates`,
      "POST",
      { workflowId, name, description, variables: [] }
    )
  ).data;

export const instantiateWorkflowTemplate = (templateId: string) =>
  mutate<{ readonly id: string }>(
    `/v1/templates/${encodeURIComponent(templateId)}/instantiations`,
    "POST",
    { values: {} }
  );

export async function fetchWorkflows(): Promise<WorkflowSummary[]> {
  const response = await request<ApiEnvelope<WorkflowSummary[]>>(
    `/v1/workspaces/${workspaceId}/workflows`
  );
  return response.data;
}

export async function fetchWorkflow(id: string): Promise<Workflow> {
  const response = await request<ApiEnvelope<Workflow>>(`/v1/workflows/${id}`);
  return response.data;
}

export interface RuntimeTaskView {
  readonly id: string;
  readonly node_key: string;
  readonly node_kind: string;
  readonly instance_key: string;
  readonly queue_class: string;
  readonly state: string;
  readonly state_version: string | number;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly started_at?: string;
  readonly finished_at?: string;
}

export interface RuntimeEventView {
  readonly sequence: string | number;
  readonly event_type: string;
  readonly actor_type: string;
  readonly actor_id: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurred_at: string;
}

export interface RuntimeRunView {
  readonly id: string;
  readonly workflow_id: string;
  readonly workflow_version: number;
  readonly state: string;
  readonly created_by: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly policy_snapshot?: Readonly<Record<string, unknown>>;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly duration_ms?: string | number;
  readonly reserved_quantity?: string;
  readonly tasks?: readonly RuntimeTaskView[];
  readonly events?: readonly RuntimeEventView[];
  readonly workflowName?: string;
}

export const startWorkflowRun = async (
  workflowId: string,
  input: Readonly<Record<string, unknown>> = {}
) =>
  (
    await mutate<{ readonly data: RuntimeRunView }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/runs`,
      "POST",
      {
        input,
        idempotencyKey: crypto.randomUUID(),
        maximumQuantity: "1000",
        policyVersion: "demo-v1"
      }
    )
  ).data;

export const fetchWorkflowRuns = async (workflowId: string) =>
  (
    await request<{ readonly data: readonly RuntimeRunView[] }>(
      `/v1/workflows/${encodeURIComponent(workflowId)}/runs`
    )
  ).data;

export const fetchAllWorkflowRuns = async () => {
  const workflows = await fetchWorkflows();
  const groups = await Promise.all(
    workflows.map(async (workflow) =>
      (await fetchWorkflowRuns(workflow.id)).map((run) => ({
        ...run,
        workflowName: workflow.name
      }))
    )
  );
  return groups
    .flat()
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
};

export const fetchRuntimeRun = async (runId: string) =>
  (await request<{ readonly data: RuntimeRunView }>(`/v1/runs/${encodeURIComponent(runId)}`)).data;

export const signalRuntimeRun = (runId: string, action: "pause" | "resume" | "cancel") =>
  mutate<{ readonly accepted: true }>(
    `/v1/runs/${encodeURIComponent(runId)}/${
      action === "pause" ? "pauses" : action === "resume" ? "resumptions" : "cancellations"
    }`,
    "POST",
    {
      reason: `Operator requested ${action} from the run room.`,
      idempotencyKey: crypto.randomUUID()
    }
  );

export const fetchHumanTasks = async (view = "all") =>
  (
    await request<{ readonly data: readonly Readonly<Record<string, unknown>>[] }>(
      `/v1/task-runs?view=${encodeURIComponent(view)}`
    )
  ).data;

export const fetchHumanTask = async (taskRunId: string) =>
  (
    await request<{ readonly data: Readonly<Record<string, unknown>> }>(
      `/v1/task-runs/${encodeURIComponent(taskRunId)}`
    )
  ).data;

export const submitHumanTask = async (
  taskRunId: string,
  expectedVersion: number,
  values: Readonly<Record<string, unknown>>
) =>
  (
    await mutate<{ readonly data: { readonly id: string } }>(
      `/v1/task-runs/${encodeURIComponent(taskRunId)}/submissions`,
      "POST",
      {
        values,
        schemaVersion: 1,
        expectedVersion,
        idempotencyKey: crypto.randomUUID()
      }
    )
  ).data;

export type MemoryRecordView = Readonly<{
  id: string;
  agent_id: string;
  subject_id: string;
  purpose: string;
  sensitivity: string;
  state: string;
  current_version: number;
  value?: unknown;
  value_hash?: string;
  source_references?: readonly string[];
  provenance?: Readonly<Record<string, unknown>>;
  history?: readonly Readonly<Record<string, unknown>>[];
  retention_expires_at?: string;
  legal_hold?: boolean;
}>;

export const fetchMyMemory = async (query = "") =>
  (
    await request<ApiEnvelope<MemoryRecordView[]>>(
      `/v1/me/memory-records${query ? `?q=${encodeURIComponent(query)}` : ""}`
    )
  ).data;

export const fetchMyMemoryRecord = async (memoryId: string) =>
  (await request<ApiEnvelope<MemoryRecordView>>(`/v1/me/memory-records/${memoryId}`)).data;

export const correctMyMemoryRecord = async (
  memoryId: string,
  input: {
    readonly expectedVersion: number;
    readonly value: unknown;
    readonly reason: string;
    readonly scope?: "execution" | "user_private" | "workspace_shared";
  }
) =>
  (
    await mutate<ApiEnvelope<{ version: number }>>(
      `/v1/me/memory-records/${memoryId}/corrections`,
      "POST",
      input
    )
  ).data;

export const deleteMyMemoryRecord = (memoryId: string) =>
  mutate<void>(`/v1/me/memory-records/${memoryId}`, "DELETE");

export const exportMyMemory = async () =>
  (await mutate<ApiEnvelope<MemoryRecordView[]>>("/v1/me/memory-exports", "POST")).data;

export const fetchAgentMemoryPolicy = async (agentId: string) =>
  (
    await request<
      ApiEnvelope<{
        agent_id: string;
        revision: string;
        definition: Readonly<Record<string, unknown>>;
      }>
    >(`/v1/agents/${agentId}/memory-policy`)
  ).data;

export type EvaluationDatasetView = Readonly<{
  id: string;
  name: string;
  description: string;
  state: string;
  current_version?: number;
  case_count?: number;
}>;

export type EvaluationComparisonView = Readonly<{
  id: string;
  agent_id: string;
  baseline_version: number;
  candidate_version: number;
  summary: Readonly<{
    baselineScore: number;
    candidateScore: number;
    delta: number;
    sampleSize: number;
    confidence95: readonly [number, number];
    lowSample: boolean;
    regressions: readonly string[];
  }>;
  gate_decision?: Readonly<{ passed: boolean; reasons: readonly string[] }>;
}>;

export const fetchEvaluationDatasets = async () =>
  (
    await request<ApiEnvelope<EvaluationDatasetView[]>>(
      `/v1/workspaces/${workspaceId}/eval-datasets`
    )
  ).data;

export const createEvaluationDataset = async (input: {
  readonly name: string;
  readonly description: string;
}) =>
  (
    await mutate<ApiEnvelope<{ id: string }>>(
      `/v1/workspaces/${workspaceId}/eval-datasets`,
      "POST",
      input
    )
  ).data;

export const fetchEvaluationComparisons = async (agentId: string) =>
  (
    await request<ApiEnvelope<EvaluationComparisonView[]>>(
      `/v1/eval-comparisons?agentId=${encodeURIComponent(agentId)}`
    )
  ).data;

export const createAgentRelease = async (
  agentId: string,
  version: number,
  input: Readonly<Record<string, unknown>>
) =>
  (
    await mutate<ApiEnvelope<{ id: string }>>(
      `/v1/agents/${agentId}/versions/${version}/releases`,
      "POST",
      input
    )
  ).data;

export const updateAgentMemoryPolicy = async (
  agentId: string,
  input: {
    readonly expectedRevision: number;
    readonly definition: Readonly<Record<string, unknown>>;
  }
) =>
  (
    await mutate<ApiEnvelope<{ revision: number }>>(
      `/v1/agents/${agentId}/memory-policy`,
      "PUT",
      input
    )
  ).data;

export const fetchWorkspaceMemory = async (agentId?: string) =>
  (
    await request<ApiEnvelope<MemoryRecordView[]>>(
      `/v1/workspaces/${workspaceId}/memory-records${agentId ? `?agentId=${agentId}` : ""}`
    )
  ).data;

export type FileView = Readonly<{
  id: string;
  filename: string;
  purpose: string;
  state: string;
  classification: string;
  current_version: number;
  media_type?: string;
  size_bytes?: number;
  checksum?: string;
  processing_state?: string;
  created_at: string;
}>;

export const fetchFiles = async () =>
  (await request<ApiEnvelope<FileView[]>>(`/v1/workspaces/${workspaceId}/files`)).data;

export const fetchFile = async (fileId: string) =>
  (await request<ApiEnvelope<Record<string, unknown>>>(`/v1/files/${fileId}`)).data;

export const createFileUpload = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/workspaces/${workspaceId}/file-uploads`,
      "POST",
      input
    )
  ).data;

export const recordFilePart = async (uploadId: string, input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/file-uploads/${uploadId}/parts`,
      "POST",
      input
    )
  ).data;

export const completeFileUpload = async (
  uploadId: string,
  input: Readonly<Record<string, unknown>>
) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/file-uploads/${uploadId}/completions`,
      "POST",
      input
    )
  ).data;

export const fetchFilePreview = async (fileId: string) =>
  (await request<ApiEnvelope<Record<string, unknown>>>(`/v1/files/${fileId}/preview`)).data;

export const createFileDownload = async (fileId: string) =>
  (
    await mutate<ApiEnvelope<{ token: string; expiresAt: string }>>(
      `/v1/files/${fileId}/download-tokens`,
      "POST",
      { grantRevision: 1 }
    )
  ).data;

export const deleteFile = async (fileId: string) =>
  (
    await mutate<ApiEnvelope<{ downstreamEventId: string }>>(`/v1/files/${fileId}`, "DELETE", {
      reason: "user_deleted"
    })
  ).data;

export type KnowledgeSearchResult = Readonly<{
  sourceObjectId: string;
  documentId: string;
  documentVersion: number;
  chunkId: string;
  title: string;
  snippet: string;
  coordinate: Readonly<Record<string, unknown>>;
  score: number;
  scoreBreakdown: Readonly<Record<string, number>>;
  contentHash: string;
  permissionEvidenceHash: string;
  classification: string;
  freshness: string;
  previewUrl: string;
}>;

export type KnowledgeSearchResponse = Readonly<{
  manifestId: string;
  corpusGeneration: string;
  normalizedQueryHash: string;
  results: readonly KnowledgeSearchResult[];
  exclusions: Readonly<Record<string, number>>;
  latencyMs: number;
  debug?: Readonly<Record<string, unknown>>;
}>;

export const mintKnowledgeProof = async () =>
  (
    await mutate<ApiEnvelope<{ proof: string; expiresAt: string }>>(
      `/v1/workspaces/${workspaceId}/authorization-proofs`,
      "POST",
      { resourceId: workspaceId, groupIds: [] }
    )
  ).data;

export const searchKnowledge = async (input: Readonly<Record<string, unknown>>, debug = false) =>
  (
    await mutate<ApiEnvelope<KnowledgeSearchResponse>>(
      `/v1/workspaces/${workspaceId}/${debug ? "retrieval-debug" : "search"}`,
      "POST",
      input
    )
  ).data;

export const openKnowledgeCitation = async (
  documentId: string,
  manifestId: string,
  chunkId: string,
  proof: string
) => {
  const response = await fetch(
    `${apiUrl}/v1/documents/${documentId}/citations?manifestId=${encodeURIComponent(manifestId)}&chunkId=${encodeURIComponent(chunkId)}`,
    {
      credentials: "include",
      headers: { accept: "application/json", "x-knotline-authorization-proof": proof }
    }
  );
  if (!response.ok)
    throw new RequestFailure("Citation is no longer authorized", classifyStatus(response.status));
  return (await response.json()) as ApiEnvelope<Record<string, unknown>>;
};

export interface KnowledgeEntitySummary {
  readonly id: string;
  readonly type: string;
  readonly canonicalName: string;
  readonly revision: number;
  readonly updatedAt: string;
}
export interface KnowledgeEntityProfile extends KnowledgeEntitySummary {
  readonly aliases: readonly Readonly<Record<string, unknown>>[];
  readonly facts: readonly Readonly<Record<string, unknown>>[];
  readonly conflicts: readonly Readonly<Record<string, unknown>>[];
  readonly history: readonly Readonly<Record<string, unknown>>[];
}
export const fetchKnowledgeEntities = async () =>
  (
    await request<ApiEnvelope<{ items: KnowledgeEntitySummary[]; nextCursor?: string }>>(
      `/v1/workspaces/${workspaceId}/entities`
    )
  ).data;
export const fetchKnowledgeEntity = async (entityId: string) =>
  (await request<ApiEnvelope<KnowledgeEntityProfile>>(`/v1/entities/${entityId}`)).data;
export const createKnowledgeEntity = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<KnowledgeEntityProfile>>(
      `/v1/workspaces/${workspaceId}/entities`,
      "POST",
      input
    )
  ).data;
export const traverseKnowledgeEntity = async (entityId: string, proof: string) =>
  (
    await request<
      ApiEnvelope<{ items: KnowledgeEntitySummary[]; truncated: boolean; elapsedMs: number }>
    >(
      `/v1/entities/${entityId}/relations?depth=2&limit=50&authorizationProof=${encodeURIComponent(proof)}`
    )
  ).data;
export const exportKnowledgeEntity = async (entityId: string, proof: string) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(`/v1/entities/${entityId}/exports`, "POST", {
      authorizationProof: proof
    })
  ).data;
export const fetchKnowledgeAdministration = async () =>
  (
    await request<
      ApiEnvelope<{
        sources: readonly Readonly<Record<string, unknown>>[];
        conflicts: readonly Readonly<Record<string, unknown>>[];
      }>
    >(`/v1/workspaces/${workspaceId}/knowledge-admin`)
  ).data;
export const requestKnowledgeReindex = async () =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/workspaces/${workspaceId}/knowledge-reindexes`,
      "POST",
      {
        mode: "full",
        parserVersion: "safe-document-v1",
        chunkerVersion: "deterministic-v1",
        embedderVersion: "fixture-embedding-v1"
      }
    )
  ).data;

export interface ConnectionSummary {
  readonly id: string;
  readonly connectorKey: string;
  readonly displayName: string;
  readonly state: string;
  readonly accountLabel?: string;
  readonly grantedScopes: readonly string[];
  readonly requestedScopes: readonly string[];
  readonly permissionFidelity: "exact" | "conservative" | "unsupported";
  readonly lastSuccessAt?: string;
  readonly freshnessLagSeconds?: number;
  readonly nextRetryAt?: string;
  readonly currentOperation?: string;
  readonly objectCount: number;
  readonly errorCount: number;
  readonly errorSummary?: Readonly<Record<string, unknown>>;
}
export interface ConnectorCatalogItem {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly state: string;
  readonly certification?: ProviderCertification;
}
export interface ProviderCertification {
  readonly engineeringStatus: "RECORDED" | "LIVE";
  readonly liveStatus: "LIVE" | "BLOCKED_EXTERNAL";
  readonly externalGate: string;
  readonly limitations: readonly string[];
  readonly certifiedAt: string;
}
export interface ProviderSource {
  readonly id: string;
  readonly kind: "drive" | "folder" | "space" | "page" | "database";
  readonly name: string;
  readonly parentId?: string;
  readonly estimatedObjects: number;
  readonly selectable: boolean;
  readonly limitation?: string;
  readonly providerVersion: string;
}
export interface ConnectionSourceSurface {
  readonly connectorKey: string;
  readonly sources: readonly ProviderSource[];
  readonly selection: {
    readonly mode: "all" | "selected";
    readonly sourceIds: readonly string[];
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly estimatedObjects: number;
    readonly revision: number;
    readonly updatedAt?: string;
  };
  readonly certification?: ProviderCertification;
}
const fetchConnectionSurface = async () =>
  (
    await request<ApiEnvelope<{ items: ConnectionSummary[]; catalog: ConnectorCatalogItem[] }>>(
      `/v1/workspaces/${workspaceId}/connections`
    )
  ).data;
export const fetchConnectorCatalog = async () => (await fetchConnectionSurface()).catalog;
export const fetchConnections = async () => (await fetchConnectionSurface()).items;
export const fetchConnection = async (id: string) =>
  (
    await request<
      ApiEnvelope<ConnectionSummary & { runs: readonly Readonly<Record<string, unknown>>[] }>
    >(`/v1/connections/${id}`)
  ).data;
export const fetchConnectionSources = async (id: string) =>
  (
    await request<ApiEnvelope<ConnectionSourceSurface>>(
      `/v1/connections/${encodeURIComponent(id)}/sources`
    )
  ).data;
export const updateConnectionSources = async (
  id: string,
  input: {
    readonly mode: "all" | "selected";
    readonly sourceIds: readonly string[];
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly expectedRevision: number;
  }
) =>
  (
    await mutate<ApiEnvelope<ConnectionSourceSurface["selection"]>>(
      `/v1/connections/${encodeURIComponent(id)}/sources`,
      "PUT",
      input
    )
  ).data;
export const startConnectionAuthorization = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<{ authorizationUrl: string; expiresAt: string }>>(
      `/v1/workspaces/${workspaceId}/connection-authorizations`,
      "POST",
      input
    )
  ).data;
export const requestConnectionSync = async (id: string, mode = "incremental") =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(`/v1/connections/${id}/syncs`, "POST", {
      mode
    })
  ).data;
export const transitionConnection = async (
  id: string,
  action: "pauses" | "resumptions" | "reauthorizations" | "reconciliations"
) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/connections/${id}/${action}`,
      "POST",
      {}
    )
  ).data;
export const deleteConnection = async (id: string) =>
  (await mutate<ApiEnvelope<Record<string, unknown>>>(`/v1/connections/${id}`, "DELETE", {})).data;

export interface BillingSummary {
  readonly subscription: null | {
    readonly planName: string;
    readonly state: string;
    readonly periodEnd: string;
    readonly cancelAtPeriodEnd: boolean;
  };
  readonly invoices: readonly {
    readonly id: string;
    readonly total: string;
    readonly currency: string;
    readonly state: string;
    readonly hostedUrl?: string;
  }[];
  readonly paymentDataStored: boolean;
  readonly providerState: string;
}
export interface UsageSummary {
  readonly dimensions: readonly {
    readonly meter: string;
    readonly quantity: string;
    readonly unit: string;
    readonly amount: string;
    readonly currency: string;
  }[];
  readonly freshThrough: string | null;
  readonly partial: boolean;
  readonly adjustmentsIncluded: boolean;
}
export interface BudgetSummary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly amount: string;
  readonly mode: "soft" | "hard";
  readonly period: string;
  readonly scope: Readonly<Record<string, unknown>>;
  readonly state: string;
  readonly revision: number;
}
export const fetchBillingSummary = async () =>
  (await request<ApiEnvelope<BillingSummary>>(`/v1/workspaces/${workspaceId}/subscription`)).data;
export const fetchUsageSummary = async () =>
  (await request<ApiEnvelope<UsageSummary>>(`/v1/workspaces/${workspaceId}/usage`)).data;
export const fetchBudgets = async () =>
  (await request<ApiEnvelope<BudgetSummary[]>>(`/v1/workspaces/${workspaceId}/budgets`)).data;
export const createBudget = async (input: Readonly<Record<string, unknown>>) =>
  (await mutate<ApiEnvelope<BudgetSummary>>(`/v1/workspaces/${workspaceId}/budgets`, "POST", input))
    .data;
export const setSpendStop = async (enabled: boolean, reason: string) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/workspaces/${workspaceId}/${enabled ? "spend-stops" : "spend-resumptions"}`,
      "POST",
      { reason }
    )
  ).data;
export interface ServicePrincipal {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly role: string;
  readonly scopes: readonly string[];
  readonly environment: "test" | "live";
  readonly state: string;
  readonly revision: number;
}
export interface DeveloperWebhook {
  readonly id: string;
  readonly name: string;
  readonly endpointUrl: string;
  readonly eventTypes: readonly string[];
  readonly state: string;
  readonly revision: number;
  readonly signingSecret?: string;
  readonly displayedOnce?: boolean;
}
export const fetchServicePrincipals = async () =>
  (
    await request<ApiEnvelope<ServicePrincipal[]>>(
      `/v1/workspaces/${workspaceId}/service-principals`
    )
  ).data;
export const createServicePrincipal = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<ServicePrincipal>>(
      `/v1/workspaces/${workspaceId}/service-principals`,
      "POST",
      input
    )
  ).data;
export const createApiCredential = async (
  principalId: string,
  input: Readonly<Record<string, unknown>>
) =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/service-principals/${principalId}/credentials`,
      "POST",
      input
    )
  ).data;
export const fetchDeveloperWebhooks = async () =>
  (
    await request<ApiEnvelope<DeveloperWebhook[]>>(
      `/v1/workspaces/${workspaceId}/outgoing-webhooks`
    )
  ).data;
export const createDeveloperWebhook = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<DeveloperWebhook>>(
      `/v1/workspaces/${workspaceId}/outgoing-webhooks`,
      "POST",
      input
    )
  ).data;
export interface AuditEvent {
  readonly id: string;
  readonly sequence: number;
  readonly action: string;
  readonly resourceType: string;
  readonly result: string;
  readonly eventHash: string;
  readonly occurredAt: string;
}
export interface RetentionPolicy {
  readonly dataClass: string;
  readonly durationDays: number;
  readonly action: string;
  readonly version: number;
}
export interface LegalHold {
  readonly id: string;
  readonly caseReference: string;
  readonly reason: string;
  readonly state: string;
}
export interface SupportAccessGrant {
  readonly id: string;
  readonly operatorReference: string;
  readonly reason: string;
  readonly ticket: string;
  readonly accessMode: string;
  readonly state: string;
  readonly expiresAt: string;
}
export const fetchAuditEvents = async () =>
  (await request<ApiEnvelope<AuditEvent[]>>(`/v1/workspaces/${workspaceId}/audit-events`)).data;
export const createAuditExport = async () =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/workspaces/${workspaceId}/audit-exports`,
      "POST",
      { query: {} }
    )
  ).data;
export const fetchRetentionPolicies = async () =>
  (
    await request<ApiEnvelope<RetentionPolicy[]>>(
      `/v1/workspaces/${workspaceId}/retention-policies`
    )
  ).data;
export const putRetentionPolicies = async (input: readonly Readonly<Record<string, unknown>>[]) =>
  (
    await mutate<ApiEnvelope<RetentionPolicy[]>>(
      `/v1/workspaces/${workspaceId}/retention-policies`,
      "PUT",
      input
    )
  ).data;
export const fetchLegalHolds = async () =>
  (await request<ApiEnvelope<LegalHold[]>>(`/v1/workspaces/${workspaceId}/legal-holds`)).data;
export const createLegalHold = async (input: Readonly<Record<string, unknown>>) =>
  (await mutate<ApiEnvelope<LegalHold>>(`/v1/workspaces/${workspaceId}/legal-holds`, "POST", input))
    .data;
export const requestWorkspaceExport = async () =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/workspaces/${workspaceId}/data-exports`,
      "POST",
      { query: {} }
    )
  ).data;
export const requestWorkspaceDeletion = async () =>
  (
    await mutate<ApiEnvelope<Record<string, unknown>>>(
      `/v1/workspaces/${workspaceId}/deletion-requests`,
      "POST",
      {}
    )
  ).data;
export const fetchSupportAccess = async () =>
  (await request<ApiEnvelope<SupportAccessGrant[]>>(`/v1/workspaces/${workspaceId}/support-access`))
    .data;
export const createSupportAccess = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<SupportAccessGrant>>(
      `/v1/workspaces/${workspaceId}/support-access`,
      "POST",
      input
    )
  ).data;
export interface SsoConnection {
  readonly id: string;
  readonly name: string;
  readonly protocol: "saml" | "oidc";
  readonly issuer: string;
  readonly state: string;
  readonly revision: number;
}
export interface VerifiedDomain {
  readonly id: string;
  readonly domain: string;
  readonly state: string;
  readonly enforcement: string;
  readonly challenge?: string;
}
export interface EnterprisePolicy {
  readonly id: string;
  readonly policyKey: string;
  readonly version: number;
  readonly mode: string;
  readonly rules: Readonly<Record<string, unknown>>;
}
export const fetchSsoConnections = async () =>
  (await request<ApiEnvelope<SsoConnection[]>>(`/v1/workspaces/${workspaceId}/sso-connections`))
    .data;
export const createSsoConnection = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<SsoConnection>>(
      `/v1/workspaces/${workspaceId}/sso-connections`,
      "POST",
      input
    )
  ).data;
export const testSsoConnection = async (id: string) =>
  (await mutate<ApiEnvelope<SsoConnection>>(`/v1/sso-connections/${id}/tests`, "POST", {})).data;
export const fetchVerifiedDomains = async () =>
  (await request<ApiEnvelope<VerifiedDomain[]>>(`/v1/workspaces/${workspaceId}/domains`)).data;
export const createVerifiedDomain = async (domain: string) =>
  (
    await mutate<ApiEnvelope<VerifiedDomain>>(`/v1/workspaces/${workspaceId}/domains`, "POST", {
      domain
    })
  ).data;
export const fetchEnterprisePolicies = async () =>
  (
    await request<ApiEnvelope<EnterprisePolicy[]>>(
      `/v1/workspaces/${workspaceId}/enterprise-policies`
    )
  ).data;
export const putEnterprisePolicy = async (input: Readonly<Record<string, unknown>>) =>
  (
    await mutate<ApiEnvelope<EnterprisePolicy>>(
      `/v1/workspaces/${workspaceId}/enterprise-policies`,
      "PUT",
      input
    )
  ).data;
export interface SupportTicket {
  readonly id: string;
  readonly category: string;
  readonly severity: string;
  readonly subject: string;
  readonly status: string;
  readonly createdAt: string;
}
export const fetchSupportTickets = async () =>
  (await request<ApiEnvelope<SupportTicket[]>>("/v1/support-tickets")).data;
export const createSupportTicket = async (input: Readonly<Record<string, unknown>>) =>
  (await mutate<ApiEnvelope<SupportTicket>>("/v1/support-tickets", "POST", input)).data;
export const submitContactRequest = async (input: Readonly<Record<string, unknown>>) =>
  (await mutate<ApiEnvelope<Record<string, unknown>>>("/edge/v1/contact-requests", "POST", input))
    .data;
