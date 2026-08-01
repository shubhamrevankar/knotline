import { z } from "zod";

import { runIntentSchema, runStateSchema, startRunSchema, taskStateSchema } from "./runtime.js";
import {
  approvalDecisionSchema,
  approvalDelegationSchema,
  approvalRevocationSchema
} from "./approval.js";
import { agentCreateSchema, agentDraftSaveSchema, agentSimulationSchema } from "./agent.js";
import {
  restrictedUploadCompletionSchema,
  restrictedUploadRequestSchema,
  taskActionSchema,
  taskAssignmentSchema,
  taskBulkActionSchema,
  taskClaimSchema,
  taskDelegationSchema,
  taskDraftSchema,
  taskSubmissionSchema
} from "./human-task.js";

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
    method: "GET",
    path: "/v1/workflows/{workflowId}/runs",
    operationId: "listWorkflowRuns",
    summary: "List authorized durable runs for a workflow",
    tags: ["Runs"],
    exposure: "browser_internal",
    responses: {
      200: z.object({
        data: z.array(z.object({ id: z.uuid(), state: runStateSchema }).passthrough())
      }),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
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
  {
    method: "GET",
    path: "/v1/runs/{runId}/stream",
    operationId: "streamWorkflowRunEvents",
    summary: "Resume the ordered run event stream from a durable cursor",
    tags: ["Runs"],
    exposure: "browser_internal",
    responses: {
      200: z.string(),
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

export const HUMAN_TASK_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  {
    method: "GET",
    path: "/v1/task-runs",
    operationId: "listHumanTasks",
    summary: "List authorized human tasks and saved inbox views",
    tags: ["Human tasks"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.array(z.record(z.string(), z.unknown()))),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/task-runs/{taskRunId}",
    operationId: "getHumanTask",
    summary: "Read a human task form, assignment, drafts, and submission history",
    tags: ["Human tasks"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/task-runs/{taskRunId}/claims",
    operationId: "claimHumanTask",
    summary: "Atomically claim an unassigned human task",
    tags: ["Human tasks"],
    exposure: "browser_internal",
    requestBody: taskClaimSchema,
    responses: {
      201: apiEnvelope(z.object({ assignmentVersion: z.number().int().positive() })),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "PUT",
    path: "/v1/task-runs/{taskRunId}/draft",
    operationId: "saveHumanTaskDraft",
    summary: "Optimistically save a personal human task draft",
    tags: ["Human tasks"],
    exposure: "browser_internal",
    requestBody: taskDraftSchema,
    responses: {
      200: apiEnvelope(z.object({ version: z.number().int().positive() })),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/task-runs/{taskRunId}/submissions",
    operationId: "submitHumanTask",
    summary: "Validate and immutably submit a human task response",
    tags: ["Human tasks"],
    exposure: "browser_internal",
    requestBody: taskSubmissionSchema,
    responses: {
      201: apiEnvelope(z.object({ id: z.uuid() })),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  ...(
    [
      [
        "GET",
        "/v1/task-runs/{taskRunId}/attempts",
        "listHumanTaskAttempts",
        "List immutable task attempts",
        200
      ],
      [
        "GET",
        "/v1/task-runs/{taskRunId}/attempts/{attempt}",
        "getHumanTaskAttempt",
        "Read an immutable task attempt",
        200
      ],
      [
        "POST",
        "/v1/task-runs/bulk-actions",
        "bulkUpdateHumanTasks",
        "Safely update compatible human tasks",
        200
      ],
      [
        "POST",
        "/v1/task-runs/{taskRunId}/reassignments",
        "reassignHumanTask",
        "Reassign a human task",
        201
      ],
      [
        "POST",
        "/v1/task-runs/{taskRunId}/delegations",
        "delegateHumanTask",
        "Delegate a human task without widening access",
        201
      ],
      [
        "POST",
        "/v1/task-runs/{taskRunId}/clarification-requests",
        "requestHumanTaskClarification",
        "Request additional task information",
        202
      ],
      [
        "POST",
        "/v1/task-runs/{taskRunId}/reopenings",
        "reopenHumanTask",
        "Create an immutable linked task revision",
        201
      ],
      [
        "POST",
        "/v1/task-runs/{taskRunId}/unclaims",
        "unclaimHumanTask",
        "Release a claimed task",
        202
      ],
      [
        "POST",
        "/v1/task-runs/{taskRunId}/returns-to-queue",
        "returnHumanTaskToQueue",
        "Return a task to its queue",
        202
      ],
      ["POST", "/v1/task-runs/{taskRunId}/watches", "watchHumanTask", "Watch task activity", 204],
      [
        "DELETE",
        "/v1/task-runs/{taskRunId}/watches",
        "unwatchHumanTask",
        "Stop watching task activity",
        204
      ]
    ] as const
  ).map(([method, path, operationId, summary, status]) => ({
    method,
    path,
    operationId,
    summary,
    tags: ["Human tasks"],
    exposure: "browser_internal" as const,
    ...(method === "GET" || method === "DELETE"
      ? {}
      : {
          requestBody: path.includes("delegations")
            ? taskDelegationSchema
            : path.includes("reassignments")
              ? taskAssignmentSchema
              : path.includes("bulk-actions")
                ? taskBulkActionSchema
                : taskActionSchema
        }),
    responses: {
      [status]: genericDataSchema,
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  }))
];

const TASK_ADMIN_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ...(
    [
      ["GET", "/v1/workspaces/{workspaceId}/task-queues", "listTaskQueues", 200],
      ["POST", "/v1/workspaces/{workspaceId}/task-queues", "createTaskQueue", 201],
      ["GET", "/v1/task-queues/{queueId}", "getTaskQueue", 200],
      ["PATCH", "/v1/task-queues/{queueId}", "updateTaskQueue", 200],
      ["DELETE", "/v1/task-queues/{queueId}", "deleteTaskQueue", 204],
      ["PUT", "/v1/task-queues/{queueId}/members/{principalId}", "putTaskQueueMember", 204],
      ["DELETE", "/v1/task-queues/{queueId}/members/{principalId}", "deleteTaskQueueMember", 204],
      ["PUT", "/v1/task-queues/{queueId}/routing-policy", "publishTaskRoutingPolicy", 200],
      ["POST", "/v1/task-queues/{queueId}/routing-simulations", "simulateTaskRouting", 200],
      ["GET", "/v1/workspaces/{workspaceId}/task-templates", "listTaskTemplates", 200],
      ["POST", "/v1/workspaces/{workspaceId}/task-templates", "createTaskTemplate", 201],
      ["GET", "/v1/task-templates/{templateId}", "getTaskTemplate", 200],
      ["PATCH", "/v1/task-templates/{templateId}", "updateTaskTemplate", 200],
      ["POST", "/v1/task-templates/{templateId}/versions", "createTaskTemplateVersion", 201],
      ["POST", "/v1/task-templates/{templateId}/publications", "publishTaskTemplate", 201],
      ["POST", "/v1/task-templates/{templateId}/previews", "previewTaskTemplate", 200],
      ["DELETE", "/v1/task-templates/{templateId}", "archiveTaskTemplate", 204],
      ["GET", "/v1/task-runs/{taskRunId}/artifacts", "listTaskArtifacts", 200],
      ["POST", "/v1/task-runs/{taskRunId}/artifact-uploads", "createTaskArtifactUpload", 201],
      ["POST", "/v1/artifact-uploads/{uploadId}/completions", "completeArtifactUpload", 200],
      ["GET", "/v1/artifacts/{artifactId}/download", "authorizeArtifactDownload", 200],
      ["DELETE", "/v1/artifacts/{artifactId}", "deleteArtifact", 204]
    ] as const
  ).map(([method, path, operationId, status]) => ({
    method,
    path,
    operationId,
    summary: operationId.replaceAll(/([A-Z])/gu, " $1").trim(),
    tags: [
      path.includes("artifact")
        ? "Restricted artifacts"
        : path.includes("template")
          ? "Task templates"
          : "Task queues"
    ],
    exposure: "browser_internal" as const,
    ...(method === "GET" || method === "DELETE"
      ? {}
      : {
          requestBody: path.includes("artifact-uploads/{uploadId}")
            ? restrictedUploadCompletionSchema
            : path.includes("artifact-uploads")
              ? restrictedUploadRequestSchema
              : genericDataSchema
        }),
    responses: {
      [status]: genericDataSchema,
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  }))
];

export const APPROVAL_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  {
    method: "GET",
    path: "/v1/approvals",
    operationId: "listApprovals",
    summary: "List approvals visible to the requester or an eligible reviewer",
    tags: ["Approvals"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.array(genericDataSchema)),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/approvals/{approvalId}",
    operationId: "getApproval",
    summary: "Read the immutable approval packet, policy, steps, and decisions",
    tags: ["Approvals"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  ...(
    [
      [
        "decisions",
        "decideApproval",
        "Record one immutable approval decision",
        approvalDecisionSchema,
        201
      ],
      [
        "delegations",
        "delegateApproval",
        "Delegate within the recorded approval scope",
        approvalDelegationSchema,
        201
      ],
      [
        "reminders",
        "remindApproval",
        "Queue deduplicated approval reminders",
        z.object({ idempotencyKey: z.string().min(16).max(160) }).strict(),
        202
      ],
      [
        "revocations",
        "revokeApproval",
        "Revoke authorization before execution consumes it",
        approvalRevocationSchema,
        202
      ]
    ] as const
  ).map(([suffix, operationId, summary, requestBody, status]) => ({
    method: "POST" as const,
    path: `/v1/approvals/{approvalId}/${suffix}`,
    operationId,
    summary,
    tags: ["Approvals"],
    exposure: "browser_internal" as const,
    requestBody,
    responses: {
      [status]: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  }))
];

const AGENT_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ...(
    [
      [
        "GET",
        "/v1/workspaces/{workspaceId}/agents",
        "listAgents",
        "List the authorized agent catalog",
        undefined,
        200
      ],
      [
        "POST",
        "/v1/workspaces/{workspaceId}/agents",
        "createAgent",
        "Create an editable agent draft",
        agentCreateSchema,
        201
      ],
      [
        "GET",
        "/v1/agents/{agentId}",
        "getAgent",
        "Read an agent definition and draft",
        undefined,
        200
      ],
      [
        "PATCH",
        "/v1/agents/{agentId}",
        "updateAgentDraft",
        "Optimistically update an agent draft",
        agentDraftSaveSchema,
        200
      ],
      [
        "DELETE",
        "/v1/agents/{agentId}",
        "archiveAgent",
        "Archive an unreferenced agent",
        undefined,
        204
      ],
      [
        "GET",
        "/v1/agents/{agentId}/versions",
        "listAgentVersions",
        "List immutable agent versions",
        undefined,
        200
      ],
      [
        "POST",
        "/v1/agents/{agentId}/versions",
        "publishAgentVersion",
        "Publish a validated immutable agent version",
        z
          .object({
            expectedRevision: z.number().int().positive(),
            changeSummary: z.string().min(1).max(1_000)
          })
          .strict(),
        201
      ],
      [
        "GET",
        "/v1/agents/{agentId}/versions/{version}",
        "getAgentVersion",
        "Read an immutable agent version",
        undefined,
        200
      ],
      [
        "POST",
        "/v1/agents/{agentId}/versions/{version}/validations",
        "validateAgentVersion",
        "Validate one immutable agent version",
        z.object({}).strict(),
        200
      ],
      [
        "GET",
        "/v1/agents/{agentId}/diffs",
        "diffAgentVersions",
        "Read a semantic agent-version diff",
        undefined,
        200
      ],
      [
        "POST",
        "/v1/agents/{agentId}/simulations",
        "simulateAgent",
        "Run a visibly simulated deterministic agent preview",
        agentSimulationSchema,
        201
      ],
      [
        "POST",
        "/v1/agents/{agentId}/forks",
        "forkAgent",
        "Fork an immutable version into a private draft",
        z
          .object({ version: z.number().int().positive(), name: z.string().min(2).max(120) })
          .strict(),
        201
      ]
    ] as const
  ).map(([method, path, operationId, summary, requestBody, status]) => ({
    method,
    path,
    operationId,
    summary,
    tags: ["Agent foundry"],
    exposure: "browser_internal" as const,
    ...(requestBody ? { requestBody } : {}),
    responses: {
      [status]: status === 204 ? z.undefined() : apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  }))
];

const modelPolicyDefinitionHttpSchema = z
  .object({
    allowedRoles: z
      .array(z.enum(["fast", "balanced", "quality", "judge", "embedding", "moderation"]))
      .min(1),
    allowedProviders: z.array(z.string().min(1)).min(1),
    maxCostDecimal: z.string().regex(/^\d+(?:\.\d{1,12})?$/u),
    emergencyDisabled: z.boolean(),
    allowedResidencies: z.array(z.string().min(1)).min(1),
    fallback: z.array(z.enum(["fast", "balanced", "quality", "judge", "embedding", "moderation"])),
    retention: z.literal("no-store")
  })
  .strict();

const MODEL_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/model-policies",
    operationId: "listModelPolicies",
    summary: "List governed model policies",
    tags: ["Model gateway"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/model-policies",
    operationId: "createModelPolicy",
    summary: "Create a governed model policy",
    tags: ["Model gateway"],
    exposure: "browser_internal",
    requestBody: z
      .object({ name: z.string().min(2).max(120), definition: modelPolicyDefinitionHttpSchema })
      .strict(),
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/model-policies/{policyId}",
    operationId: "getModelPolicy",
    summary: "Read a governed model policy version",
    tags: ["Model gateway"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "PATCH",
    path: "/v1/model-policies/{policyId}",
    operationId: "updateModelPolicy",
    summary: "Publish a new immutable model policy version",
    tags: ["Model gateway"],
    exposure: "browser_internal",
    requestBody: z
      .object({
        expectedRevision: z.number().int().positive(),
        definition: modelPolicyDefinitionHttpSchema
      })
      .strict(),
    responses: {
      200: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/models",
    operationId: "listApprovedModels",
    summary: "List approved provider model mappings by role",
    tags: ["Model gateway"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  }
];

const TOOL_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/tools",
    operationId: "listWorkspaceTools",
    summary: "List governed workspace tools",
    tags: ["Tool broker"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/tools",
    operationId: "createWorkspaceTool",
    summary: "Create a governed tool definition",
    tags: ["Tool broker"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/tools/{toolId}",
    operationId: "getTool",
    summary: "Read a governed tool",
    tags: ["Tool broker"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/tools/{toolId}/versions",
    operationId: "createToolVersion",
    summary: "Publish an immutable tool version",
    tags: ["Tool broker"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  ...(["disables", "enables"] as const).map((action): HttpRouteContract => ({
    method: "POST",
    path: `/v1/tools/{toolId}/${action}`,
    operationId: action === "disables" ? "disableTool" : "enableTool",
    summary: action === "disables" ? "Disable a governed tool" : "Enable a governed tool",
    tags: ["Tool broker"],
    exposure: "browser_internal",
    responses: { 204: z.undefined(), 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema }
  }))
];

const AGENT_RUNTIME_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ...(["GET", "PUT"] as const).map((method): HttpRouteContract => ({
    method,
    path: "/v1/agents/{agentId}/memory-policy",
    operationId: method === "GET" ? "getAgentMemoryPolicy" : "updateAgentMemoryPolicy",
    summary: method === "GET" ? "Read agent memory policy" : "Update agent memory policy",
    tags: ["Agent memory"],
    exposure: "browser_internal",
    ...(method === "PUT" ? { requestBody: genericDataSchema } : {}),
    responses: {
      200: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema
    }
  })),
  {
    method: "GET",
    path: "/v1/me/memory-records",
    operationId: "listMyMemoryRecords",
    summary: "List user-private memory records",
    tags: ["Agent memory"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  ...(["GET", "DELETE"] as const).map((method): HttpRouteContract => ({
    method,
    path: "/v1/me/memory-records/{memoryId}",
    operationId: method === "GET" ? "getMyMemoryRecord" : "deleteMyMemoryRecord",
    summary: method === "GET" ? "Read user-private memory" : "Delete user-private memory",
    tags: ["Agent memory"],
    exposure: "browser_internal",
    responses: {
      ...(method === "GET" ? { 200: apiEnvelope(genericDataSchema) } : { 204: z.undefined() }),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  })),
  {
    method: "POST",
    path: "/v1/me/memory-records/{memoryId}/corrections",
    operationId: "correctMyMemoryRecord",
    summary: "Correct or rescope user-private memory",
    tags: ["Agent memory"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/me/memory-exports",
    operationId: "exportMyMemoryRecords",
    summary: "Export user-private memory",
    tags: ["Agent memory"],
    exposure: "browser_internal",
    responses: { 201: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/memory-records",
    operationId: "listWorkspaceMemoryRecords",
    summary: "List workspace-shared memory without private records",
    tags: ["Agent memory"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  }
];

const AGENT_EVALUATION_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ...(["GET", "POST"] as const).map((method): HttpRouteContract => ({
    method,
    path: "/v1/workspaces/{workspaceId}/eval-datasets",
    operationId: method === "GET" ? "listEvaluationDatasets" : "createEvaluationDataset",
    summary: method === "GET" ? "List evaluation datasets" : "Create evaluation dataset",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    ...(method === "POST" ? { requestBody: genericDataSchema } : {}),
    responses: {
      [method === "POST" ? 201 : 200]: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  })),
  {
    method: "GET",
    path: "/v1/eval-datasets/{datasetId}",
    operationId: "getEvaluationDataset",
    summary: "Get immutable evaluation dataset versions",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  ...(["versions", "cases"] as const).map((suffix): HttpRouteContract => ({
    method: "POST",
    path: `/v1/eval-datasets/{datasetId}/${suffix}`,
    operationId:
      suffix === "versions" ? "publishEvaluationDatasetVersion" : "authorEvaluationDatasetCases",
    summary: suffix === "versions" ? "Publish immutable dataset version" : "Author dataset cases",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  })),
  {
    method: "POST",
    path: "/v1/agents/{agentId}/versions/{version}/evaluation-runs",
    operationId: "startAgentEvaluationRun",
    summary: "Start reproducible agent evaluation",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      202: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  ...(["GET"] as const).map((method): HttpRouteContract => ({
    method,
    path: "/v1/eval-runs/{evalRunId}",
    operationId: "getEvaluationRun",
    summary: "Get evaluation run",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  })),
  {
    method: "GET",
    path: "/v1/eval-runs/{evalRunId}/results",
    operationId: "getEvaluationRunResults",
    summary: "Get case and grader results",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/eval-runs/{evalRunId}/cancellations",
    operationId: "cancelEvaluationRun",
    summary: "Cancel evaluation run",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      202: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/eval-comparisons",
    operationId: "listEvaluationComparisons",
    summary: "Compare agent evaluation runs",
    tags: ["Agent evaluation"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "POST",
    path: "/v1/agents/{agentId}/versions/{version}/releases",
    operationId: "promoteOrRollbackAgentRelease",
    summary: "Promote, canary, or roll back an agent release",
    tags: ["Agent releases"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  }
];

const FILE_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/documents",
    operationId: "listKnowledgeDocuments",
    summary: "List knowledge-source documents",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/files",
    operationId: "listFiles",
    summary: "List authorized workspace files",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.array(z.record(z.string(), z.unknown()))),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/file-uploads",
    operationId: "createFileUpload",
    summary: "Reserve quota and create a resumable multipart upload",
    tags: ["Files"],
    exposure: "browser_internal",
    requestBody: z.record(z.string(), z.unknown()),
    responses: {
      201: apiEnvelope(z.record(z.string(), z.unknown())),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/file-uploads/{uploadId}/parts",
    operationId: "recordFileUploadPart",
    summary: "Record one checksummed multipart upload part",
    tags: ["Files"],
    exposure: "browser_internal",
    requestBody: z.record(z.string(), z.unknown()),
    responses: {
      201: apiEnvelope(z.record(z.string(), z.unknown())),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/file-uploads/{uploadId}/completions",
    operationId: "completeFileUpload",
    summary: "Verify, scan, and enqueue a completed file",
    tags: ["Files"],
    exposure: "browser_internal",
    requestBody: z.record(z.string(), z.unknown()),
    responses: {
      200: apiEnvelope(z.record(z.string(), z.unknown())),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/files/{fileId}",
    operationId: "getFile",
    summary: "Read file versions and processing state",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/documents/{documentId}",
    operationId: "getKnowledgeDocument",
    summary: "Read a knowledge document and processing state",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/documents/{documentId}/versions",
    operationId: "listKnowledgeDocumentVersions",
    summary: "List immutable knowledge document versions",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/documents/{documentId}/citations",
    operationId: "listKnowledgeDocumentCitations",
    summary: "List coordinate-preserving document extraction records",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/documents/{documentId}/reprocessings",
    operationId: "reprocessKnowledgeDocument",
    summary: "Retry knowledge document processing",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      202: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "DELETE",
    path: "/v1/documents/{documentId}",
    operationId: "deleteKnowledgeDocument",
    summary: "Delete a knowledge document and its derivatives",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/files/{fileId}/preview",
    operationId: "getFilePreview",
    summary: "Read an authorized sanitized preview descriptor",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/files/{fileId}/processing-retries",
    operationId: "retryFileProcessing",
    summary: "Retry safe document processing",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      202: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/files/{fileId}/download-tokens",
    operationId: "createFileDownloadToken",
    summary: "Create a short-lived one-time authorized download token",
    tags: ["Files"],
    exposure: "browser_internal",
    requestBody: z.record(z.string(), z.unknown()),
    responses: {
      201: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/file-downloads/{token}",
    operationId: "consumeFileDownloadToken",
    summary: "Consume a one-time token after authorization recheck",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "DELETE",
    path: "/v1/files/{fileId}",
    operationId: "deleteFile",
    summary: "Tombstone a file and purge unprotected derivatives",
    tags: ["Files"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(z.record(z.string(), z.unknown())),
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema,
      500: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/documents/{documentId}/indexings",
    operationId: "indexKnowledgeDocument",
    summary: "Build chunks, embeddings, and an authorized serving source",
    tags: ["Knowledge retrieval"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      202: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/authorization-proofs",
    operationId: "mintKnowledgeAuthorizationProof",
    summary: "Mint a signed five-minute authorization proof",
    tags: ["Knowledge retrieval"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/search",
    operationId: "searchWorkspaceKnowledge",
    summary: "Search authorized knowledge with hybrid ranking",
    tags: ["Knowledge retrieval"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      200: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/retrieval-debug",
    operationId: "debugWorkspaceRetrieval",
    summary: "Inspect authorized retrieval scoring and exclusions",
    tags: ["Knowledge retrieval"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      200: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/knowledge-sources/{sourceId}/acl-projections",
    operationId: "advanceKnowledgeAclProjection",
    summary: "Atomically advance a source ACL and revoke stale proofs",
    tags: ["Knowledge retrieval"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/knowledge-reindexes",
    operationId: "createKnowledgeReindex",
    summary: "Create a fenced knowledge reindex generation",
    tags: ["Knowledge retrieval"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      202: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/entities",
    operationId: "listKnowledgeEntities",
    summary: "List authorized canonical entities",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/entities",
    operationId: "createKnowledgeEntity",
    summary: "Resolve or create a provenance-backed entity",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/entities/{entityId}",
    operationId: "getKnowledgeEntity",
    summary: "Read an authorized entity profile",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema
    }
  },
  {
    method: "PATCH",
    path: "/v1/entities/{entityId}",
    operationId: "updateKnowledgeEntity",
    summary: "Version entity facts and aliases",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      200: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/entities/{entityId}/relations",
    operationId: "traverseKnowledgeEntity",
    summary: "Traverse an ACL-safe bounded entity neighborhood",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    responses: {
      200: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/entities/{entityId}/relations",
    operationId: "createKnowledgeRelation",
    summary: "Create a provenance-backed relationship",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/entities/{entityId}/merges",
    operationId: "mergeKnowledgeEntity",
    summary: "Manually merge a reviewed entity",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/entities/{entityId}/splits",
    operationId: "splitKnowledgeEntity",
    summary: "Split selected facts and aliases into a new entity",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "POST",
    path: "/v1/entities/{entityId}/exports",
    operationId: "exportKnowledgeEntity",
    summary: "Export an authorized provenance packet",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema
    }
  },
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/knowledge-admin",
    operationId: "getKnowledgeAdministration",
    summary: "Inspect source freshness, conflicts, and index health",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "GET",
    path: "/v1/workspaces/{workspaceId}/knowledge-types",
    operationId: "listKnowledgeTypes",
    summary: "List versioned entity and relation types",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    responses: { 200: apiEnvelope(genericDataSchema), 401: apiErrorSchema, 403: apiErrorSchema }
  },
  {
    method: "POST",
    path: "/v1/workspaces/{workspaceId}/knowledge-types",
    operationId: "publishKnowledgeType",
    summary: "Publish a validated knowledge type version",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    requestBody: genericDataSchema,
    responses: {
      201: apiEnvelope(genericDataSchema),
      400: apiErrorSchema,
      401: apiErrorSchema,
      403: apiErrorSchema,
      409: apiErrorSchema
    }
  },
  {
    method: "DELETE",
    path: "/v1/knowledge-types/{typeId}",
    operationId: "retireKnowledgeType",
    summary: "Retire an unused knowledge type",
    tags: ["Knowledge graph"],
    exposure: "browser_internal",
    responses: {
      204: z.undefined(),
      401: apiErrorSchema,
      403: apiErrorSchema,
      404: apiErrorSchema,
      409: apiErrorSchema
    }
  }
];

const CONNECTOR_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  [
    "GET",
    "/v1/workspaces/{workspaceId}/connections",
    "listConnections",
    "List connector catalog and connections",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/workspaces/{workspaceId}/connection-authorizations",
    "startConnectionAuthorization",
    "Create a draft connection and start authorization",
    "browser_internal"
  ],
  [
    "GET",
    "/v1/connection-authorizations/{authorizationId}",
    "getConnectionAuthorization",
    "Read authorization status",
    "browser_internal"
  ],
  [
    "GET",
    "/callbacks/v1/connections/oauth/{provider}",
    "completeConnectionAuthorization",
    "Complete provider authorization",
    "provider_callback"
  ],
  [
    "GET",
    "/v1/connections/{connectionId}",
    "getConnection",
    "Read connection health",
    "browser_internal"
  ],
  [
    "PATCH",
    "/v1/connections/{connectionId}",
    "updateConnection",
    "Update a connection",
    "browser_internal"
  ],
  [
    "GET",
    "/v1/connections/{connectionId}/sources",
    "getConnectionSources",
    "List selectable provider sources and certification fidelity",
    "browser_internal"
  ],
  [
    "PUT",
    "/v1/connections/{connectionId}/sources",
    "updateConnectionSources",
    "Replace a connection source selection with optimistic concurrency",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/connections/{connectionId}/syncs",
    "startConnectionSync",
    "Start a durable sync",
    "browser_internal"
  ],
  [
    "GET",
    "/v1/connections/{connectionId}/syncs",
    "listConnectionSyncs",
    "List sync history",
    "browser_internal"
  ],
  [
    "GET",
    "/v1/connections/{connectionId}/syncs/{syncId}",
    "getConnectionSync",
    "Read one sync",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/connections/{connectionId}/pauses",
    "pauseConnection",
    "Pause a connection",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/connections/{connectionId}/resumptions",
    "resumeConnection",
    "Resume a connection",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/connections/{connectionId}/reauthorizations",
    "reauthorizeConnection",
    "Request reauthorization",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/connections/{connectionId}/reconciliations",
    "reconcileConnection",
    "Reconcile provider inventory",
    "browser_internal"
  ],
  [
    "DELETE",
    "/v1/connections/{connectionId}",
    "deleteConnection",
    "Stop and delete a connection",
    "browser_internal"
  ],
  [
    "POST",
    "/callbacks/v1/provider-webhooks/{provider}/{endpointLocator}",
    "receiveProviderWebhook",
    "Authenticate and enqueue a provider webhook",
    "provider_callback"
  ]
].map(([method, path, operationId, summary, exposure]) => ({
  method: method as HttpRouteContract["method"],
  path: path!,
  operationId: operationId!,
  summary: summary!,
  tags: ["Connectors"],
  exposure: exposure as HttpRouteContract["exposure"],
  responses: {
    200: apiEnvelope(genericDataSchema),
    201: apiEnvelope(genericDataSchema),
    202: apiEnvelope(genericDataSchema),
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
    500: apiErrorSchema
  }
}));

const TRIGGER_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  [
    "GET",
    "/v1/workflows/{workflowId}/triggers",
    "listWorkflowTriggers",
    "List workflow triggers",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/workflows/{workflowId}/triggers",
    "createWorkflowTrigger",
    "Create a versioned workflow trigger",
    "browser_internal"
  ],
  [
    "PATCH",
    "/v1/workflow-triggers/{triggerId}",
    "updateWorkflowTrigger",
    "Publish a new trigger configuration version",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/workflow-triggers/{triggerId}/enables",
    "enableWorkflowTrigger",
    "Enable a workflow trigger",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/workflow-triggers/{triggerId}/disables",
    "disableWorkflowTrigger",
    "Pause a workflow trigger",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/workflow-triggers/{triggerId}/secret-rotations",
    "rotateWorkflowTriggerSecret",
    "Rotate a signed webhook secret",
    "browser_internal"
  ],
  [
    "GET",
    "/v1/workflow-triggers/{triggerId}/deliveries",
    "listWorkflowTriggerDeliveries",
    "List trigger receipts and dispatch state",
    "browser_internal"
  ],
  [
    "POST",
    "/v1/workflow-triggers/{triggerId}/test-events",
    "sendWorkflowTriggerTestEvent",
    "Capture and enqueue a redacted test event",
    "browser_internal"
  ],
  [
    "DELETE",
    "/v1/workflow-triggers/{triggerId}",
    "deleteWorkflowTrigger",
    "Disable and retire a workflow trigger",
    "browser_internal"
  ],
  [
    "POST",
    "/callbacks/v1/workflow-triggers/{endpointKey}",
    "receiveWorkflowTriggerWebhook",
    "Authenticate and normalize a signed trigger event",
    "provider_callback"
  ]
].map(([method, path, operationId, summary, exposure]) => ({
  method: method as HttpRouteContract["method"],
  path: path!,
  operationId: operationId!,
  summary: summary!,
  tags: ["Workflow triggers"],
  exposure: exposure as HttpRouteContract["exposure"],
  responses: {
    200: apiEnvelope(genericDataSchema),
    201: apiEnvelope(genericDataSchema),
    202: apiEnvelope(genericDataSchema),
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
    500: apiErrorSchema,
    503: apiErrorSchema
  }
}));

const NOTIFICATION_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ["GET", "/v1/me/notifications", "listMyNotifications", "List in-app notifications"],
  [
    "POST",
    "/v1/me/notifications/{notificationId}/read",
    "markNotificationRead",
    "Mark one notification read"
  ],
  [
    "POST",
    "/v1/me/notifications/read-all",
    "markAllNotificationsRead",
    "Mark all notifications read"
  ],
  [
    "GET",
    "/v1/me/notification-preferences",
    "getMyNotificationPreferences",
    "Read personal notification preferences"
  ],
  [
    "PATCH",
    "/v1/me/notification-preferences",
    "updateMyNotificationPreferences",
    "Update personal notification preferences"
  ],
  [
    "GET",
    "/v1/workspaces/{workspaceId}/notification-preferences",
    "getWorkspaceNotificationPolicy",
    "Read workspace notification and escalation policy"
  ],
  [
    "PATCH",
    "/v1/workspaces/{workspaceId}/notification-preferences",
    "updateWorkspaceNotificationPolicy",
    "Update workspace notification and escalation policy"
  ]
].map(([method, path, operationId, summary]) => ({
  method: method as HttpRouteContract["method"],
  path: path!,
  operationId: operationId!,
  summary: summary!,
  tags: ["Notifications"],
  exposure: "browser_internal" as const,
  ...(method === "PATCH" ? { requestBody: genericDataSchema } : {}),
  responses: {
    200: apiEnvelope(genericDataSchema),
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
    500: apiErrorSchema
  }
}));
const ANALYTICS_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  [
    "GET",
    "/v1/workspaces/{workspaceId}/search",
    "searchWorkspace",
    "Search authorized workspace resources"
  ],
  [
    "GET",
    "/v1/workspaces/{workspaceId}/saved-views",
    "listSavedViews",
    "List accessible saved views"
  ],
  [
    "POST",
    "/v1/workspaces/{workspaceId}/saved-views",
    "createSavedView",
    "Create a reproducible saved view"
  ],
  ["PATCH", "/v1/saved-views/{viewId}", "updateSavedView", "Update a revision-safe saved view"],
  ["DELETE", "/v1/saved-views/{viewId}", "deleteSavedView", "Delete an unreferenced saved view"],
  [
    "GET",
    "/v1/workspaces/{workspaceId}/analytics",
    "getOperationalAnalytics",
    "Read authorized operational metrics"
  ],
  ["GET", "/v1/workspaces/{workspaceId}/reports", "listReports", "List accessible reports"],
  [
    "POST",
    "/v1/workspaces/{workspaceId}/reports",
    "createReport",
    "Create a curated operational report"
  ],
  ["GET", "/v1/reports/{reportId}", "getReport", "Read a report and freshness state"],
  ["POST", "/v1/reports/{reportId}/exports", "exportReport", "Queue a safe report export"],
  [
    "POST",
    "/v1/reports/{reportId}/schedules",
    "scheduleReport",
    "Schedule authorized report delivery"
  ],
  [
    "PATCH",
    "/v1/report-schedules/{scheduleId}",
    "updateReportSchedule",
    "Update a revision-safe report delivery schedule"
  ],
  [
    "DELETE",
    "/v1/report-schedules/{scheduleId}",
    "deleteReportSchedule",
    "Delete an owned report delivery schedule"
  ]
].map(([method, path, operationId, summary]) => ({
  method: method as HttpRouteContract["method"],
  path: path!,
  operationId: operationId!,
  summary: summary!,
  tags: ["Search and analytics"],
  exposure: "browser_internal" as const,
  ...(["POST", "PATCH"].includes(method!) ? { requestBody: genericDataSchema } : {}),
  responses: {
    200: apiEnvelope(genericDataSchema),
    201: apiEnvelope(genericDataSchema),
    202: apiEnvelope(genericDataSchema),
    204: z.undefined(),
    400: apiErrorSchema,
    401: apiErrorSchema,
    403: apiErrorSchema,
    404: apiErrorSchema,
    409: apiErrorSchema,
    500: apiErrorSchema
  }
}));

export const HTTP_ROUTE_CONTRACTS: readonly HttpRouteContract[] = [
  ...WORKSPACE_ACCESS_ROUTE_CONTRACTS,
  ...VERSIONED_WORKFLOW_ROUTE_CONTRACTS,
  ...RUNTIME_ROUTE_CONTRACTS,
  ...HUMAN_TASK_ROUTE_CONTRACTS,
  ...TASK_ADMIN_ROUTE_CONTRACTS,
  ...APPROVAL_ROUTE_CONTRACTS,
  ...AGENT_ROUTE_CONTRACTS,
  ...MODEL_ROUTE_CONTRACTS,
  ...TOOL_ROUTE_CONTRACTS,
  ...AGENT_RUNTIME_ROUTE_CONTRACTS,
  ...AGENT_EVALUATION_ROUTE_CONTRACTS,
  ...FILE_ROUTE_CONTRACTS,
  ...CONNECTOR_ROUTE_CONTRACTS,
  ...TRIGGER_ROUTE_CONTRACTS,
  ...NOTIFICATION_ROUTE_CONTRACTS,
  ...ANALYTICS_ROUTE_CONTRACTS,
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
