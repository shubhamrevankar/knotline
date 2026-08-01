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
