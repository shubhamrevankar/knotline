import { z } from "zod";

import { runIntentSchema, runStateSchema, startRunSchema, taskStateSchema } from "./runtime.js";

export const workflowStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
export const nodeStatusSchema = z.enum(["queued", "running", "waiting", "complete", "failed"]);
export const nodeKindSchema = z.enum(["trigger", "human", "agent", "approval", "action"]);

export const workflowNodeSchema = z
  .object({
    id: z.string().min(1).max(160),
    title: z.string().min(1).max(160),
    description: z.string().max(1_000),
    kind: nodeKindSchema,
    owner: z.string().min(1).max(160),
    status: nodeStatusSchema,
    x: z.number().finite(),
    y: z.number().finite()
  })
  .strict();

export const workflowEdgeSchema = z
  .object({
    id: z.string().min(1).max(160),
    source: z.string().min(1).max(160),
    target: z.string().min(1).max(160)
  })
  .strict();

export const workflowSchema = z
  .object({
    id: z.string().min(1).max(160),
    teamId: z.string().min(1).max(160),
    name: z.string().min(2).max(120),
    description: z.string().max(500),
    status: workflowStatusSchema,
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
    nodes: z.array(workflowNodeSchema).max(2_000),
    edges: z.array(workflowEdgeSchema).max(4_000)
  })
  .strict();

export const workflowSummarySchema = workflowSchema
  .omit({ nodes: true, edges: true })
  .extend({
    nodeCount: z.number().int().nonnegative(),
    activeRuns: z.number().int().nonnegative()
  })
  .strict();

export const createWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional()
  })
  .strict();

export const bootstrapSchema = z
  .object({
    capabilityStatus: z.literal("DEMO"),
    user: z.object({ id: z.string(), name: z.string(), email: z.email() }).strict(),
    activeTeam: z.object({ id: z.string(), name: z.string(), role: z.literal("owner") }).strict(),
    entitlements: z
      .object({ agents: z.boolean(), integrations: z.boolean(), audit: z.boolean() })
      .strict()
  })
  .strict();

export const healthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("knotline-api"),
    time: z.iso.datetime()
  })
  .strict();

export const readinessSchema = z
  .object({ status: z.literal("ready"), service: z.literal("knotline-api") })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
        message: z.string().min(1).max(500),
        requestId: z.string().min(1).max(200),
        details: z.record(z.string(), z.array(z.string())).optional()
      })
      .strict()
  })
  .strict();

export const apiEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema }).strict();

export const identityUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.email(),
    displayName: z.string().min(1).max(160),
    status: z.enum(["active", "suspended", "deleted"]),
    locale: z.string(),
    timezone: z.string()
  })
  .strict();

export const sessionSummarySchema = z
  .object({
    id: z.string().uuid(),
    current: z.boolean(),
    deviceSummary: z.string().min(1).max(180),
    issuedAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    absoluteExpiresAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().optional(),
    revocationReason: z.string().optional()
  })
  .strict();

const returnTargetSchema = z.object({ returnTarget: z.string().startsWith("/") }).strict();
const emptySchema = z.undefined();

export interface HttpRouteContract {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly exposure:
    | "public_anonymous"
    | "browser_internal"
    | "public_customer"
    | "provider_callback"
    | "standards"
    | "platform_operator_auth"
    | "platform_operator";
  readonly requestBody?: z.ZodType;
  readonly responses: Readonly<Record<number, z.ZodType>>;
}

const genericDataSchema = z.unknown();
const workspaceAccessContract = (
  method: HttpRouteContract["method"],
  path: string,
  operationId: string,
  summary: string,
  successStatus = 200
): HttpRouteContract => ({
  method,
  path,
  operationId,
  summary,
  tags: ["Workspace access"],
  exposure: path.startsWith("/edge/") ? "public_customer" : "browser_internal",
  ...(method === "GET" || method === "DELETE" ? {} : { requestBody: genericDataSchema }),
  responses: {
    [successStatus]: genericDataSchema,
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
    500: apiErrorSchema
  }
});

const WORKSPACE_ACCESS_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  workspaceAccessContract("GET", "/v1/workspaces", "listWorkspaces", "List accessible workspaces"),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}",
    "getWorkspace",
    "Read a workspace"
  ),
  workspaceAccessContract("POST", "/v1/workspaces", "createWorkspace", "Create a workspace", 201),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/switch",
    "switchWorkspace",
    "Switch active workspace"
  ),
  workspaceAccessContract(
    "PATCH",
    "/v1/workspaces/{workspaceId}",
    "updateWorkspace",
    "Update workspace preferences"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/archive",
    "archiveWorkspace",
    "Archive a workspace",
    204
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/restorations",
    "restoreWorkspace",
    "Restore a workspace"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/workspaces/{workspaceId}",
    "requestWorkspaceDeletion",
    "Request workspace deletion",
    202
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/members",
    "listWorkspaceMembers",
    "List workspace members"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/members/{memberId}",
    "getWorkspaceMember",
    "Read a workspace member"
  ),
  workspaceAccessContract(
    "PATCH",
    "/v1/workspaces/{workspaceId}/members/{memberId}",
    "updateWorkspaceMember",
    "Update member access"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/workspaces/{workspaceId}/members/{memberId}",
    "removeWorkspaceMember",
    "Remove and reassign a member",
    204
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/ownership-transfers",
    "transferWorkspaceOwnership",
    "Transfer workspace ownership"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/invitations",
    "listWorkspaceInvitations",
    "List workspace invitations"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/invitations",
    "createWorkspaceInvitation",
    "Invite a workspace member",
    201
  ),
  workspaceAccessContract(
    "POST",
    "/v1/invitations/{invitationId}/resends",
    "resendWorkspaceInvitation",
    "Rotate and resend an invitation"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/invitations/{invitationId}",
    "cancelWorkspaceInvitation",
    "Cancel an invitation",
    204
  ),
  workspaceAccessContract(
    "POST",
    "/edge/v1/invitation-responses/preview",
    "previewWorkspaceInvitation",
    "Preview an email-bound invitation"
  ),
  workspaceAccessContract(
    "POST",
    "/edge/v1/invitation-responses",
    "respondToWorkspaceInvitation",
    "Accept or decline an invitation"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/roles",
    "listWorkspaceRoles",
    "List workspace roles"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/roles",
    "createWorkspaceRole",
    "Create a custom role",
    201
  ),
  workspaceAccessContract("GET", "/v1/roles/{roleId}", "getWorkspaceRole", "Read a custom role"),
  workspaceAccessContract(
    "PATCH",
    "/v1/roles/{roleId}",
    "updateWorkspaceRole",
    "Update a custom role"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/roles/{roleId}",
    "deleteWorkspaceRole",
    "Delete an unused custom role",
    204
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/groups",
    "listWorkspaceGroups",
    "List workspace groups"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/groups",
    "createWorkspaceGroup",
    "Create a workspace group",
    201
  ),
  workspaceAccessContract(
    "PATCH",
    "/v1/groups/{groupId}",
    "updateWorkspaceGroup",
    "Update a workspace group"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/groups/{groupId}",
    "deleteWorkspaceGroup",
    "Delete a workspace group",
    204
  ),
  workspaceAccessContract(
    "PUT",
    "/v1/groups/{groupId}/members/{userId}",
    "addWorkspaceGroupMember",
    "Add a group member",
    204
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/groups/{groupId}/members/{userId}",
    "removeWorkspaceGroupMember",
    "Remove a group member",
    204
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/organization-relationships",
    "createOrganizationRelationship",
    "Create a reporting relationship",
    201
  ),
  workspaceAccessContract(
    "GET",
    "/v1/me/onboarding",
    "getOnboardingProgress",
    "Read persisted onboarding progress"
  ),
  workspaceAccessContract(
    "PUT",
    "/v1/me/onboarding",
    "updateOnboardingProgress",
    "Update persisted onboarding progress"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/me/onboarding/sample-workspaces",
    "createOnboardingSampleWorkspace",
    "Create labeled sample data",
    201
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/me/onboarding/sample-workspaces/{sampleId}",
    "removeOnboardingSampleWorkspace",
    "Remove labeled sample data"
  )
];

const VERSIONED_WORKFLOW_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/workflows",
    "listVersionedWorkflows",
    "List persisted workspace workflows"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/workflows",
    "createVersionedWorkflow",
    "Create a versioned workflow draft",
    201
  ),
  workspaceAccessContract(
    "PATCH",
    "/v1/workflows/{workflowId}",
    "updateWorkflowMetadata",
    "Update workflow metadata"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/workflows/{workflowId}",
    "requestWorkflowDeletion",
    "Request guarded workflow deletion",
    202
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/restorations",
    "restoreArchivedWorkflow",
    "Restore an archived workflow"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/duplicates",
    "duplicateWorkflow",
    "Duplicate a workflow into a new draft",
    201
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/workflow-imports",
    "importWorkflow",
    "Import canonical workflow JSON",
    201
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/exports",
    "exportWorkflow",
    "Export canonical workflow JSON"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/ownership-transfers",
    "transferWorkflowOwnership",
    "Transfer workflow ownership"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/favorites",
    "favoriteWorkflow",
    "Favorite a workflow",
    204
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/workflows/{workflowId}/favorites",
    "unfavoriteWorkflow",
    "Remove a workflow favorite",
    204
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workflows/{workflowId}/draft",
    "getWorkflowDraft",
    "Read the current editable draft"
  ),
  workspaceAccessContract(
    "PUT",
    "/v1/workflows/{workflowId}/draft",
    "replaceWorkflowDraft",
    "Replace a draft using an ETag precondition"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/draft/operations",
    "applyWorkflowDraftOperations",
    "Apply an atomic draft operation batch"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/draft/validations",
    "validateWorkflowDraft",
    "Validate the complete typed workflow graph"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/draft/publications",
    "publishWorkflowDraft",
    "Publish an immutable workflow version"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workflows/{workflowId}/versions",
    "listWorkflowVersions",
    "List workflow version history"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workflows/{workflowId}/versions/{version}",
    "getWorkflowVersion",
    "Read an immutable workflow version"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workflows/{workflowId}/version-diffs",
    "diffWorkflowVersions",
    "Compare two workflow versions"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/drafts-from-version",
    "restoreWorkflowVersion",
    "Restore a version into a new draft",
    201
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/workflow-folders",
    "listWorkflowFolders",
    "List workflow folders"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/workflow-folders",
    "createWorkflowFolder",
    "Create a workflow folder",
    201
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workspaces/{workspaceId}/workflow-tags",
    "listWorkflowTags",
    "List workflow tags"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/workflow-tags",
    "createWorkflowTag",
    "Create a workflow tag",
    201
  ),
  workspaceAccessContract(
    "GET",
    "/v1/templates",
    "listWorkflowTemplates",
    "List visible workflow templates"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/templates",
    "createWorkflowTemplate",
    "Create a workspace template",
    201
  ),
  workspaceAccessContract(
    "POST",
    "/v1/templates/{templateId}/instantiations",
    "instantiateWorkflowTemplate",
    "Instantiate a template as a workflow draft",
    201
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workspaces/{workspaceId}/workflow-generations",
    "createWorkflowGeneration",
    "Queue deterministic guided workflow generation",
    202
  ),
  workspaceAccessContract(
    "GET",
    "/v1/workflow-generations/{generationId}",
    "getWorkflowGeneration",
    "Read workflow generation lifecycle and review output"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflow-generations/{generationId}/cancellations",
    "cancelWorkflowGeneration",
    "Cancel active workflow generation"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflow-generations/{generationId}/acceptances",
    "acceptWorkflowGeneration",
    "Accept generated output as a workflow",
    201
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflow-import-previews",
    "previewWorkflowImport",
    "Validate JSON or CSV workflow import without creating a resource"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflow-dry-runs",
    "dryRunWorkflow",
    "Execute deterministic fixtures with no external writes"
  ),
  workspaceAccessContract(
    "GET",
    "/v1/resources/{resourceType}/{resourceId}/thread",
    "getResourceThread",
    "Read authorized comments, reactions, activity, follows, and presence"
  ),
  workspaceAccessContract(
    "POST",
    "/v1/resources/{resourceType}/{resourceId}/comments",
    "createResourceComment",
    "Create a sanitized resource comment",
    201
  ),
  workspaceAccessContract(
    "PATCH",
    "/v1/comments/{commentId}",
    "editResourceComment",
    "Edit an authored comment within policy"
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/comments/{commentId}",
    "deleteResourceComment",
    "Tombstone an authored comment",
    204
  ),
  workspaceAccessContract(
    "POST",
    "/v1/comments/{commentId}/reactions",
    "addCommentReaction",
    "Add an idempotent comment reaction",
    204
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/comments/{commentId}/reactions/{reaction}",
    "removeCommentReaction",
    "Remove a personal comment reaction",
    204
  ),
  workspaceAccessContract(
    "POST",
    "/v1/workflows/{workflowId}/follows",
    "followWorkflow",
    "Follow workflow activity",
    204
  ),
  workspaceAccessContract(
    "DELETE",
    "/v1/workflows/{workflowId}/follows",
    "unfollowWorkflow",
    "Stop following workflow activity",
    204
  )
];

export const RUNTIME_ROUTE_CONTRACTS = [
  {
    method: "POST",
    path: "/v1/workflows/{workflowId}/runs",
    operationId: "startWorkflowRun",
    summary: "Atomically admit and start a durable workflow run",
    tags: ["Runs"],
    exposure: "browser_internal",
    requestBody: startRunSchema,
    responses: {
      202: z.object({ data: z.object({ id: z.uuid(), state: runStateSchema }).passthrough() }),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/runs/{runId}",
    operationId: "getWorkflowRun",
    summary: "Read a durable run and its task projection",
    tags: ["Runs"],
    exposure: "browser_internal",
    responses: {
      200: z.object({
        data: z
          .object({
            id: z.uuid(),
            state: runStateSchema,
            tasks: z.array(z.object({ state: taskStateSchema }).passthrough())
          })
          .passthrough()
      }),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/runs/{runId}/events",
    operationId: "getWorkflowRunEvents",
    summary: "Read the strictly ordered durable run event history",
    tags: ["Runs"],
    exposure: "browser_internal",
    responses: {
      200: z.object({
        data: z.array(
          z.object({ sequence: z.coerce.number(), event_type: z.string() }).passthrough()
        )
      }),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  ...(
    [
      ["pauses", "pause"],
      ["resumptions", "resume"],
      ["cancellations", "cancel"]
    ] as const
  ).map(([action, verb]) => ({
    method: "POST" as const,
    path: `/v1/runs/{runId}/${action}`,
    operationId: `${verb}WorkflowRun`,
    summary: `${verb} a durable workflow run`,
    tags: ["Runs"] as const,
    exposure: "browser_internal" as const,
    requestBody: runIntentSchema.omit({ type: true }),
    responses: {
      202: z.object({ accepted: z.literal(true) }).passthrough(),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  }))
] as const;

export const OPERATIONAL_PROBE_CONTRACTS = [
  {
    method: "GET",
    path: "/health/live",
    operationId: "getHealth",
    summary: "Read API liveness",
    tags: ["Operations"],
    responses: { 200: healthSchema, 500: apiErrorSchema }
  },
  {
    method: "GET",
    path: "/health/ready",
    operationId: "getReadiness",
    summary: "Read API readiness",
    tags: ["Operations"],
    responses: { 200: readinessSchema, 500: apiErrorSchema }
  }
] as const;

export const HTTP_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ...WORKSPACE_ACCESS_ROUTE_CONTRACTS,
  ...VERSIONED_WORKFLOW_ROUTE_CONTRACTS,
  ...RUNTIME_ROUTE_CONTRACTS,
  {
    method: "POST",
    path: "/edge/v1/auth/magic-links",
    operationId: "requestMagicLink",
    summary: "Request a non-enumerating one-time email sign-in link",
    tags: ["Authentication"],
    exposure: "public_anonymous",
    requestBody: z
      .object({
        email: z.email(),
        intent: z.enum(["login", "step_up"]).default("login"),
        returnTargetId: z.string().max(40).default("workflows")
      })
      .strict(),
    responses: {
      202: z.object({ accepted: z.literal(true) }).strict(),
      400: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/edge/v1/auth/magic-links/exchange",
    operationId: "exchangeMagicLink",
    summary: "Atomically exchange a one-time email credential",
    tags: ["Authentication"],
    exposure: "public_anonymous",
    requestBody: z
      .object({ token: z.string().min(1).max(256), intent: z.enum(["login", "step_up"]) })
      .strict(),
    responses: {
      200: returnTargetSchema,
      400: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/edge/v1/auth/google/authorizations",
    operationId: "startGoogleAuthorization",
    summary: "Start a browser-bound Google OIDC authorization",
    tags: ["Authentication"],
    exposure: "public_anonymous",
    requestBody: z.object({ returnTargetId: z.string().max(40).default("workflows") }).strict(),
    responses: {
      200: z.object({ authorizationUrl: z.url(), expiresAt: z.iso.datetime() }).strict(),
      400: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/edge/v1/auth/google/exchange",
    operationId: "exchangeGoogleAuthorizationResult",
    summary: "Exchange a browser-bound one-time authorization result",
    tags: ["Authentication"],
    exposure: "public_anonymous",
    requestBody: z.object({ resultHandle: z.string().min(1).max(256) }).strict(),
    responses: {
      200: returnTargetSchema,
      400: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/callbacks/v1/identity/oauth/{provider}",
    operationId: "completeIdentityOauthCallback",
    summary: "Validate and consume an isolated provider callback",
    tags: ["Authentication callbacks"],
    exposure: "provider_callback",
    responses: { 303: emptySchema, 400: apiErrorSchema, 500: apiErrorSchema }
  },
  {
    method: "POST",
    path: "/v1/auth/sessions/refresh",
    operationId: "refreshSession",
    summary: "Rotate the server-side session verifier",
    tags: ["Sessions"],
    exposure: "browser_internal",
    responses: {
      200: z.object({ user: identityUserSchema }).strict(),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/auth/logout",
    operationId: "logout",
    summary: "Revoke the current session and clear protected cookies",
    tags: ["Sessions"],
    exposure: "browser_internal",
    responses: { 204: emptySchema, 401: apiErrorSchema, 403: apiErrorSchema, 500: apiErrorSchema }
  },
  {
    method: "GET",
    path: "/v1/auth/sessions",
    operationId: "listSessions",
    summary: "List current and revoked personal sessions",
    tags: ["Sessions"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.array(sessionSummarySchema)),
      401: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "DELETE",
    path: "/v1/auth/sessions/{sessionId}",
    operationId: "revokeSession",
    summary: "Revoke one personal session",
    tags: ["Sessions"],
    exposure: "browser_internal",
    responses: {
      204: emptySchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/auth/sessions/revoke-others",
    operationId: "revokeOtherSessions",
    summary: "Revoke every personal session except the current session",
    tags: ["Sessions"],
    exposure: "browser_internal",
    responses: {
      200: z.object({ revoked: z.number().int().nonnegative() }).strict(),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/me/bootstrap",
    operationId: "getAuthenticatedBootstrap",
    summary: "Read the current identity and authorized workspace bootstrap",
    tags: ["Profile"],
    exposure: "browser_internal",
    responses: {
      200: z.object({ user: identityUserSchema }).passthrough(),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/me",
    operationId: "getProfile",
    summary: "Read the personal profile",
    tags: ["Profile"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(identityUserSchema), 401: apiErrorSchema, 500: apiErrorSchema }
  },
  {
    method: "PATCH",
    path: "/v1/me",
    operationId: "updateProfile",
    summary: "Update personal profile fields",
    tags: ["Profile"],
    exposure: "browser_internal",
    requestBody: z
      .object({
        displayName: z.string().min(1).max(160).optional(),
        locale: z.string().optional(),
        timezone: z.string().optional()
      })
      .strict(),
    responses: {
      200: apiEnvelope(identityUserSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/me/preferences",
    operationId: "getProfilePreferences",
    summary: "Read personal locale and timezone preferences",
    tags: ["Profile"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.object({ locale: z.string(), timezone: z.string() }).strict()),
      401: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "PATCH",
    path: "/v1/me/preferences",
    operationId: "updateProfilePreferences",
    summary: "Update personal locale and timezone preferences",
    tags: ["Profile"],
    exposure: "browser_internal",
    requestBody: z
      .object({ locale: z.string().optional(), timezone: z.string().optional() })
      .strict(),
    responses: {
      200: apiEnvelope(z.object({ locale: z.string(), timezone: z.string() }).strict()),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/bootstrap",
    operationId: "getDemoBootstrap",
    summary: "Read the explicitly labelled demo bootstrap",
    tags: ["Demo"],
    exposure: "browser_internal",
    responses: { 200: bootstrapSchema, 500: apiErrorSchema }
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/workflows",
    operationId: "listWorkflows",
    summary: "List workflows in one team",
    tags: ["Workflows"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.array(workflowSummarySchema)),
      400: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/workflows",
    operationId: "createWorkflow",
    summary: "Create a demo workflow",
    tags: ["Workflows"],
    exposure: "browser_internal",
    requestBody: createWorkflowRequestSchema,
    responses: {
      201: apiEnvelope(workflowSchema),
      400: apiErrorSchema,
      413: apiErrorSchema,
      415: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/workflows/{workflowId}",
    operationId: "getWorkflow",
    summary: "Read one workflow",
    tags: ["Workflows"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(workflowSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  }
] as const;

export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
export type NodeKind = z.infer<typeof nodeKindSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowSummary = z.infer<typeof workflowSummarySchema>;
export type ApiEnvelope<T> = { data: T };
