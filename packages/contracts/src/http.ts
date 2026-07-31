import { z } from "zod";

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

export interface HttpRouteContract {
  readonly method: "GET" | "POST";
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
