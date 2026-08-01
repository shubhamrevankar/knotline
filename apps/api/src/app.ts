import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import {
  createWorkflowRequestSchema,
  validateAgentDefinition,
  dryRunFixtureSchema,
  dryRunWorkflow,
  importWorkflowCsv,
  createCommentRequestSchema,
  commentBodySchema,
  reactionSchema,
  renderSafeMarkdown,
  resourceTypeSchema,
  runIntentSchema,
  startRunSchema,
  validateWorkflowDefinition,
  workflowDefinitionSchema,
  workflowGenerationRequestSchema,
  type ApiEnvelope,
  type Workflow,
  type WorkflowSummary
} from "@knotline/contracts";
import {
  createLogRecord,
  createRequestId,
  createRequestTraceContext,
  createSpanId,
  formatTraceparent,
  parseRequestId,
  type RequestTraceContext
} from "@knotline/operations";
import type {
  CollaborationRepository,
  ApprovalRepository,
  AgentRepository,
  HumanTaskRepository,
  ModelRepository,
  MemoryRepository,
  EvaluationRepository,
  FileRepository,
  RetrievalRepository,
  KnowledgeGraphRepository,
  ConnectorRepository,
  TriggerRepository,
  NotificationRepository,
  AnalyticsRepository,
  BillingRepository,
  DeveloperRepository,
  GovernanceRepository,
  EnterpriseRepository,
  ToolRepository,
  TaskAdministrationRepository,
  RuntimeRepository,
  TenantContext,
  VersionedWorkflowRepository,
  WorkflowRepository
} from "@knotline/db";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "@knotline/db";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { z } from "zod";

import {
  AuthFailure,
  type AuthenticatedRequest,
  type AuthService,
  INITIATION_COOKIE,
  type CaptureAuthMailer,
  clearAuthCookies,
  parseCookies
} from "./auth.js";
import { type CaptureInvitationMailer, type WorkspaceService } from "./workspace.js";
import { WorkflowGenerationService } from "./workflow-generation.js";

export interface BuildAppOptions {
  readonly environment: string;
  readonly logLevel?: string | false;
  readonly webOrigin: string;
  readonly repository: WorkflowRepository;
  readonly auth: AuthService;
  readonly workspace?: WorkspaceService;
  readonly workflowDefinitions?: VersionedWorkflowRepository;
  readonly captureMailer?: CaptureAuthMailer;
  readonly captureInvitationMailer?: CaptureInvitationMailer;
  readonly trustedProxy?: string;
  readonly mutationsDisabled?: boolean;
  readonly workflowGeneration?: WorkflowGenerationService;
  readonly collaboration?: CollaborationRepository;
  readonly runtime?: RuntimeRepository;
  readonly humanTasks?: HumanTaskRepository;
  readonly taskAdministration?: TaskAdministrationRepository;
  readonly approvals?: ApprovalRepository;
  readonly agents?: AgentRepository;
  readonly models?: ModelRepository;
  readonly tools?: ToolRepository;
  readonly memory?: MemoryRepository;
  readonly evaluations?: EvaluationRepository;
  readonly files?: FileRepository;
  readonly retrieval?: RetrievalRepository;
  readonly knowledgeGraph?: KnowledgeGraphRepository;
  readonly connectors?: ConnectorRepository;
  readonly triggers?: TriggerRepository;
  readonly notifications?: NotificationRepository;
  readonly analytics?: AnalyticsRepository;
  readonly billing?: BillingRepository;
  readonly developer?: DeveloperRepository;
  readonly governance?: GovernanceRepository;
  readonly enterprise?: EnterpriseRepository;
  readonly runStarter?: {
    start(input: {
      readonly workspaceId: string;
      readonly principalId: string;
      readonly runId: string;
      readonly temporalWorkflowId: string;
      readonly plan: readonly unknown[];
    }): Promise<void>;
    signal(temporalWorkflowId: string, signal: "pause" | "resume" | "cancel"): Promise<void>;
    completeTask(temporalWorkflowId: string, nodeKey: string): Promise<void>;
    completeApproval(
      temporalWorkflowId: string,
      nodeKey: string,
      operationId: string
    ): Promise<void>;
  };
}

interface ApiErrorReply {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

const teamParamsSchema = z.object({ teamId: z.string().min(1).max(160) }).strict();
const workflowParamsSchema = z.object({ workflowId: z.string().min(1).max(160) }).strict();

function tenantContext(
  options: BuildAppOptions,
  request: FastifyRequest,
  authenticated: AuthenticatedRequest
): TenantContext {
  if (!authenticated.identity.activeWorkspaceId) {
    throw new AuthFailure("WORKSPACE_REQUIRED", 403, "Join or create a workspace to continue.");
  }
  return {
    workspaceId: authenticated.identity.activeWorkspaceId,
    principalId: authenticated.identity.user.id,
    requestId: request.id,
    mutationsDisabled: options.mutationsDisabled ?? false
  };
}

function requestIdentifier(header: unknown): string {
  return (typeof header === "string" ? parseRequestId(header) : undefined) ?? createRequestId();
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const workflowGeneration = options.workflowGeneration ?? new WorkflowGenerationService();
  const presence = new Map<string, Map<string, { displayName: string; lastSeenAt: string }>>();
  const requestContexts = new WeakMap<FastifyRequest, RequestTraceContext>();
  const app = Fastify({
    trustProxy: options.trustedProxy ? [options.trustedProxy] : false,
    bodyLimit: 256 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      options.logLevel === false
        ? false
        : {
            level: options.logLevel ?? "info",
            redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-csrf-token"]
          },
    genReqId: (request) =>
      requestIdentifier(request.headers["knotline-request-id"] ?? request.headers["x-request-id"])
  });

  await app.register(cors, {
    origin: options.webOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["accept", "content-type", "knotline-request-id", "x-csrf-token"],
    exposedHeaders: ["Knotline-Request-Id", "traceparent"]
  });

  app.addHook("onRequest", (request, reply, done) => {
    const context = createRequestTraceContext({
      requestId: request.id,
      traceparent:
        typeof request.headers.traceparent === "string" ? request.headers.traceparent : undefined
    });
    requestContexts.set(request, context);
    reply.header(
      "traceparent",
      formatTraceparent(context.traceId, createSpanId(), context.sampled)
    );
    reply.header("Knotline-Request-Id", request.id);
    reply.header("x-request-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (options.environment === "production") {
      reply.header("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
    }
    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    const context = requestContexts.get(request);
    request.log.info(
      {
        structured: createLogRecord({
          level: "info",
          event: "http.request.complete",
          message: "Request completed",
          context: {
            service: "knotline-api",
            environment: options.environment,
            ...(context ? { requestId: context.requestId, traceId: context.traceId } : {})
          },
          attributes: {
            method: request.method,
            route: request.routeOptions.url,
            statusCode: reply.statusCode,
            responseTimeMs: reply.elapsedTime
          }
        })
      },
      "Request completed"
    );
    done();
  });

  const liveness = () => ({
    status: "ok" as const,
    service: "knotline-api" as const,
    time: new Date().toISOString()
  });

  app.get("/health/live", liveness);

  const readiness = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!(await options.repository.ready())) {
      return reply.code(503).send({ status: "unavailable", service: "knotline-api" });
    }
    return { status: "ready" as const, service: "knotline-api" as const };
  };
  app.get("/health/ready", readiness);

  const context = (request: FastifyRequest) => {
    const userAgent = request.headers["user-agent"];
    return {
      ip: request.ip,
      ...(typeof userAgent === "string" ? { userAgent } : {})
    };
  };
  const authenticate = (request: FastifyRequest) =>
    options.auth.authenticate(request.headers.cookie);
  const protectMutation = async (request: FastifyRequest) => {
    const authenticated = await authenticate(request);
    options.auth.verifyMutation({
      authenticated,
      csrfHeader:
        typeof request.headers["x-csrf-token"] === "string"
          ? request.headers["x-csrf-token"]
          : undefined,
      origin: typeof request.headers.origin === "string" ? request.headers.origin : undefined
    });
    return authenticated;
  };
  const setSessionCookies = (
    reply: FastifyReply,
    cookies: { readonly sessionCookie: string; readonly csrfCookie: string }
  ) => reply.header("set-cookie", [cookies.sessionCookie, cookies.csrfCookie]);
  const workspaceService = () => {
    if (!options.workspace) throw new Error("Workspace service is not configured");
    return options.workspace;
  };
  const workspaceParamsSchema = z.object({ workspaceId: z.string().uuid() }).strict();
  const requireActiveWorkspace = (authenticated: AuthenticatedRequest, workspaceId: string) => {
    if (authenticated.identity.activeWorkspaceId !== workspaceId)
      throw new AuthFailure("WORKSPACE_NOT_FOUND", 404, "The workspace does not exist.");
  };
  const workflowDefinitions = () => {
    if (!options.workflowDefinitions)
      throw new Error("Versioned workflow repository is not configured");
    return options.workflowDefinitions;
  };
  const workflowAccess = async (
    request: FastifyRequest,
    permission: "workflow.read" | "workflow.create" | "workflow.manage",
    mutation = false
  ) => {
    const authenticated = mutation ? await protectMutation(request) : await authenticate(request);
    if (!options.workspace) return tenantContext(options, request, authenticated);
    return (await options.workspace.require(authenticated.identity, request.id, permission))
      .context;
  };

  app.post("/v1/workspaces/:workspaceId/workflow-generations", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const context = options.workspace
      ? (await options.workspace.require(authenticated.identity, request.id, "workflow.create"))
          .context
      : tenantContext(options, request, authenticated);
    const resource = await workflowGeneration.start(
      context,
      workflowGenerationRequestSchema.parse(request.body)
    );
    return reply.code(202).send({ data: resource });
  });

  app.get("/v1/workflow-generations/:generationId", async (request) => {
    const context = await workflowAccess(request, "workflow.read");
    const { generationId } = z
      .object({ generationId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const resource = await workflowGeneration.get(context, generationId);
    if (!resource)
      throw new AuthFailure("GENERATION_NOT_FOUND", 404, "The generation does not exist.");
    return { data: resource };
  });

  app.post("/v1/workflow-generations/:generationId/cancellations", async (request) => {
    const context = await workflowAccess(request, "workflow.create", true);
    const { generationId } = z
      .object({ generationId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const resource = await workflowGeneration.cancel(context, generationId);
    if (!resource)
      throw new AuthFailure("GENERATION_NOT_FOUND", 404, "The generation does not exist.");
    return { data: resource };
  });

  app.post("/v1/workflow-generations/:generationId/acceptances", async (request, reply) => {
    const context = await workflowAccess(request, "workflow.create", true);
    const { generationId } = z
      .object({ generationId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const resource = await workflowGeneration.get(context, generationId);
    if (!resource?.result)
      throw new AuthFailure("GENERATION_NOT_READY", 409, "The generation is not ready to accept.");
    if (!options.workflowDefinitions)
      throw new AuthFailure("WORKFLOW_IMPORT_UNAVAILABLE", 503, "Workflow import is unavailable.");
    const { publish } = z
      .object({ publish: z.boolean().default(false) })
      .strict()
      .parse(request.body ?? {});
    const alreadyAccepted = Boolean(resource.acceptedWorkflowId);
    const workflowId =
      resource.acceptedWorkflowId ??
      (await workflowDefinitions().import(context, resource.result.definition));
    if (publish && !alreadyAccepted) {
      const draft = await workflowDefinitions().getDraft(context, workflowId);
      if (!draft)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      const published = await workflowDefinitions().publish(
        context,
        workflowId,
        draft.revision,
        "Accepted from simulated guided generation"
      );
      if (!published || published === "conflict" || !published.published)
        throw new AuthFailure(
          "WORKFLOW_GENERATED_INVALID",
          422,
          "The generated workflow is not publishable."
        );
    }
    await workflowGeneration.accept(context, generationId, workflowId);
    return reply
      .code(alreadyAccepted ? 200 : 201)
      .send({ workflowId, simulated: resource.result.simulated, published: publish });
  });

  app.post("/v1/workflow-import-previews", async (request) => {
    await workflowAccess(request, "workflow.create", true);
    const body = z
      .discriminatedUnion("format", [
        z.object({ format: z.literal("json"), content: workflowDefinitionSchema }).strict(),
        z.object({ format: z.literal("csv"), content: z.string().min(1).max(256_000) }).strict()
      ])
      .parse(request.body);
    const definition = body.format === "json" ? body.content : importWorkflowCsv(body.content);
    return {
      data: { definition, findings: validateWorkflowDefinition(definition), createsResource: false }
    };
  });

  app.post("/v1/workflow-dry-runs", async (request) => {
    await workflowAccess(request, "workflow.read", true);
    const body = z
      .object({ definition: workflowDefinitionSchema, fixture: dryRunFixtureSchema })
      .strict()
      .parse(request.body);
    return { data: dryRunWorkflow(body.definition, body.fixture) };
  });

  if (options.collaboration) {
    const resourceParams = z
      .object({ resourceType: resourceTypeSchema, resourceId: z.string().uuid() })
      .strict();
    const commentParams = z.object({ commentId: z.string().uuid() }).strict();
    const reactionParams = z
      .object({ commentId: z.string().uuid(), reaction: reactionSchema })
      .strict();
    const rememberPresence = (
      workspaceId: string,
      resourceType: string,
      resourceId: string,
      userId: string,
      displayName: string
    ) => {
      const key = `${workspaceId}:${resourceType}:${resourceId}`;
      const current =
        presence.get(key) ?? new Map<string, { displayName: string; lastSeenAt: string }>();
      const expiry = Date.now() - 60_000;
      for (const [id, value] of current)
        if (Date.parse(value.lastSeenAt) < expiry) current.delete(id);
      current.set(userId, { displayName, lastSeenAt: new Date().toISOString() });
      presence.set(key, current);
      return [...current.entries()].map(([id, value]) => ({ id, ...value }));
    };
    app.get("/v1/resources/:resourceType/:resourceId/thread", async (request) => {
      const authenticated = await authenticate(request);
      const context = await workflowAccess(request, "workflow.read");
      const { resourceType, resourceId } = resourceParams.parse(request.params);
      const data = await options.collaboration!.thread(context, resourceType, resourceId);
      return {
        data: {
          ...data,
          sharePath: `/app/${resourceType === "workflow" ? "workflows" : `${resourceType}s`}/${resourceId}`,
          presence: rememberPresence(
            context.workspaceId,
            resourceType,
            resourceId,
            authenticated.identity.user.id,
            authenticated.identity.user.displayName
          )
        }
      };
    });
    app.post("/v1/resources/:resourceType/:resourceId/comments", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { resourceType, resourceId } = resourceParams.parse(request.params);
      const body = createCommentRequestSchema.parse(request.body);
      try {
        const id = await options.collaboration!.createComment(context, resourceType, resourceId, {
          body: body.body,
          renderedHtml: renderSafeMarkdown(body.body),
          mentionedUserIds: body.mentionedUserIds,
          attachmentRefs: body.attachmentRefs,
          ...(body.parentId ? { parentId: body.parentId } : {})
        });
        return reply.code(201).send({ id });
      } catch (error) {
        if (error instanceof Error && error.message === "MENTION_NOT_AUTHORIZED")
          throw new AuthFailure(
            "MENTION_NOT_AUTHORIZED",
            403,
            "Every mention must reference an active workspace member."
          );
        throw error;
      }
    });
    app.patch("/v1/comments/:commentId", async (request) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { commentId } = commentParams.parse(request.params);
      const { body } = z.object({ body: commentBodySchema }).strict().parse(request.body);
      const updated = await options.collaboration!.editComment(
        context,
        commentId,
        body,
        renderSafeMarkdown(body)
      );
      if (!updated)
        throw new AuthFailure(
          "COMMENT_EDIT_FORBIDDEN",
          403,
          "The comment can no longer be edited."
        );
      return { updated: true };
    });
    app.delete("/v1/comments/:commentId", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { commentId } = commentParams.parse(request.params);
      if (!(await options.collaboration!.deleteComment(context, commentId)))
        throw new AuthFailure("COMMENT_DELETE_FORBIDDEN", 403, "The comment cannot be deleted.");
      return reply.code(204).send();
    });
    app.post("/v1/comments/:commentId/reactions", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { commentId } = commentParams.parse(request.params);
      const { reaction } = z.object({ reaction: reactionSchema }).strict().parse(request.body);
      await options.collaboration!.setReaction(context, commentId, reaction, true);
      return reply.code(204).send();
    });
    app.delete("/v1/comments/:commentId/reactions/:reaction", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { commentId, reaction } = reactionParams.parse(request.params);
      await options.collaboration!.setReaction(context, commentId, reaction, false);
      return reply.code(204).send();
    });
    app.post("/v1/workflows/:workflowId/follows", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { workflowId } = z
        .object({ workflowId: z.string().uuid() })
        .strict()
        .parse(request.params);
      await options.collaboration!.setFollow(context, "workflow", workflowId, true);
      return reply.code(204).send();
    });
    app.delete("/v1/workflows/:workflowId/follows", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { workflowId } = z
        .object({ workflowId: z.string().uuid() })
        .strict()
        .parse(request.params);
      await options.collaboration!.setFollow(context, "workflow", workflowId, false);
      return reply.code(204).send();
    });
  }

  const magicRequestSchema = z
    .object({
      email: z.string().min(3).max(254),
      intent: z.enum(["login", "step_up"]).default("login"),
      returnTargetId: z.string().min(1).max(40).default("workflows")
    })
    .strict();
  app.post("/edge/v1/auth/magic-links", async (request, reply) => {
    const body = magicRequestSchema.parse(request.body);
    await options.auth.requestMagicLink({ ...body, context: context(request) });
    return reply.code(202).send({ accepted: true });
  });

  const magicExchangeSchema = z
    .object({ token: z.string().min(1).max(256), intent: z.enum(["login", "step_up"]) })
    .strict();
  app.post("/edge/v1/auth/magic-links/exchange", async (request, reply) => {
    const body = magicExchangeSchema.parse(request.body);
    const result = await options.auth.exchangeMagicLink({ ...body, context: context(request) });
    setSessionCookies(reply, result.cookies);
    return { returnTarget: result.returnTarget };
  });

  const googleStartSchema = z
    .object({ returnTargetId: z.string().min(1).max(40).default("workflows") })
    .strict();
  app.post("/edge/v1/auth/google/authorizations", async (request, reply) => {
    const body = googleStartSchema.parse(request.body);
    const cookies = parseCookies(request.headers.cookie);
    const result = await options.auth.startGoogle({
      returnTargetId: body.returnTargetId,
      ...(cookies[INITIATION_COOKIE] ? { browserBinding: cookies[INITIATION_COOKIE] } : {}),
      context: context(request)
    });
    reply.header("set-cookie", result.initiationCookie);
    return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt };
  });

  const callbackQuerySchema = z
    .object({
      state: z.string().min(1).max(512),
      code: z.string().max(4096).optional(),
      error: z.string().max(160).optional(),
      error_description: z.string().max(500).optional(),
      scope: z.string().max(1_000).optional(),
      authuser: z.string().max(40).optional(),
      prompt: z.string().max(80).optional(),
      hd: z.string().max(255).optional()
    })
    .strict();
  app.get("/callbacks/v1/identity/oauth/:provider", async (request, reply) => {
    const params = z.object({ provider: z.literal("google") }).parse(request.params);
    void params;
    const query = callbackQuerySchema.parse(request.query);
    const destination = await options.auth.completeGoogleCallback({
      state: query.state,
      ...(query.code ? { code: query.code } : {}),
      ...(query.error ? { providerError: query.error } : {})
    });
    return reply.redirect(destination, 303);
  });

  const googleExchangeSchema = z.object({ resultHandle: z.string().min(1).max(256) }).strict();
  app.post("/edge/v1/auth/google/exchange", async (request, reply) => {
    const body = googleExchangeSchema.parse(request.body);
    const cookies = parseCookies(request.headers.cookie);
    const result = await options.auth.exchangeGoogleResult({
      resultHandle: body.resultHandle,
      browserBinding: cookies[INITIATION_COOKIE],
      context: context(request)
    });
    setSessionCookies(reply, result.cookies);
    reply.header("set-cookie", [
      result.cookies.sessionCookie,
      result.cookies.csrfCookie,
      `${INITIATION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`
    ]);
    return { returnTarget: result.returnTarget };
  });

  app.post("/v1/auth/sessions/refresh", async (request, reply) => {
    const result = await options.auth.refresh({
      cookieHeader: request.headers.cookie,
      csrfHeader:
        typeof request.headers["x-csrf-token"] === "string"
          ? request.headers["x-csrf-token"]
          : undefined,
      origin: typeof request.headers.origin === "string" ? request.headers.origin : undefined,
      context: context(request)
    });
    setSessionCookies(reply, result.cookies);
    return { user: result.identity.user };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const authenticated = await protectMutation(request);
    await options.auth.logout(authenticated.identity);
    reply.header("set-cookie", clearAuthCookies());
    return reply.code(204).send();
  });

  app.get("/v1/auth/sessions", async (request) => {
    const authenticated = await authenticate(request);
    return { data: await options.auth.sessions(authenticated.identity) };
  });

  app.delete("/v1/auth/sessions/:sessionId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    const revoked = await options.auth.revoke(authenticated.identity, params.sessionId);
    if (!revoked) throw new AuthFailure("SESSION_NOT_FOUND", 404, "The session does not exist.");
    if (params.sessionId === authenticated.identity.sessionId) {
      reply.header("set-cookie", clearAuthCookies());
    }
    return reply.code(204).send();
  });

  app.post("/v1/auth/sessions/revoke-others", async (request) => {
    const authenticated = await protectMutation(request);
    return { revoked: await options.auth.revokeOthers(authenticated.identity) };
  });

  app.get("/v1/me/bootstrap", async (request) => {
    const authenticated = await authenticate(request);
    const workspaceBootstrap = options.workspace
      ? await options.workspace.bootstrap(authenticated.identity, request.id)
      : undefined;
    return {
      ...(await options.auth.bootstrap(authenticated.identity)),
      ...(workspaceBootstrap ?? {
        permissions: ["workflow.read", "workflow.create"],
        role: "owner",
        onboarding: { state: "not_started" }
      }),
      entitlements: { agents: true, integrations: true, audit: true },
      featureFlags: {},
      notificationCount: 0
    };
  });

  app.get("/v1/me", async (request) => {
    const authenticated = await authenticate(request);
    return { data: authenticated.identity.user };
  });

  const profileSchema = z
    .object({
      displayName: z.string().trim().min(1).max(160).optional(),
      locale: z
        .string()
        .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)
        .optional(),
      timezone: z.string().min(1).max(80).optional()
    })
    .strict();
  app.patch("/v1/me", async (request) => {
    const authenticated = await protectMutation(request);
    const body = profileSchema.parse(request.body);
    return {
      data: await options.auth.updateProfile(authenticated.identity, {
        ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
        ...(body.timezone ? { timezone: body.timezone } : {})
      })
    };
  });
  app.get("/v1/me/preferences", async (request) => {
    const authenticated = await authenticate(request);
    const { locale, timezone } = authenticated.identity.user;
    return { data: { locale, timezone } };
  });
  app.patch("/v1/me/preferences", async (request) => {
    const authenticated = await protectMutation(request);
    const body = profileSchema.pick({ locale: true, timezone: true }).parse(request.body);
    const user = await options.auth.updateProfile(authenticated.identity, {
      ...(body.locale ? { locale: body.locale } : {}),
      ...(body.timezone ? { timezone: body.timezone } : {})
    });
    return { data: { locale: user.locale, timezone: user.timezone } };
  });

  const workspaceCreateSchema = z
    .object({
      name: z.string().trim().min(1).max(160),
      timezone: z.string().min(1).max(80).default("UTC"),
      locale: z.string().min(2).max(20).default("en"),
      region: z.string().min(2).max(40).default("local"),
      sandbox: z.boolean().optional()
    })
    .strict();
  app.get("/v1/workspaces", async (request) => {
    const authenticated = await authenticate(request);
    return { data: await workspaceService().listWorkspaces(authenticated.identity) };
  });
  app.get("/v1/workspaces/:workspaceId", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const workspace = (await workspaceService().listWorkspaces(authenticated.identity)).find(
      (candidate) => candidate.id === workspaceId
    );
    if (!workspace)
      throw new AuthFailure("WORKSPACE_NOT_FOUND", 404, "The workspace does not exist.");
    return { data: workspace };
  });
  app.post("/v1/workspaces", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const body = workspaceCreateSchema.parse(request.body);
    const workspace = await workspaceService().createWorkspace(authenticated.identity, request.id, {
      name: body.name,
      timezone: body.timezone,
      locale: body.locale,
      region: body.region,
      ...(body.sandbox === undefined ? {} : { sandbox: body.sandbox })
    });
    return reply.code(201).send({ data: workspace });
  });
  app.post("/v1/workspaces/:workspaceId/switch", async (request) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    await workspaceService().switchWorkspace(authenticated.identity, workspaceId);
    return { activeWorkspaceId: workspaceId, cacheEpoch: Date.now() };
  });
  const workspaceUpdateSchema = workspaceCreateSchema
    .pick({ name: true, timezone: true, locale: true, region: true })
    .partial()
    .strict();
  app.patch("/v1/workspaces/:workspaceId", async (request) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const data = await workspaceService().updateWorkspace(
      authenticated.identity,
      request.id,
      (() => {
        const body = workspaceUpdateSchema.parse(request.body);
        return {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
          ...(body.locale === undefined ? {} : { locale: body.locale }),
          ...(body.region === undefined ? {} : { region: body.region })
        };
      })()
    );
    if (!data) throw new AuthFailure("WORKSPACE_NOT_FOUND", 404, "The workspace does not exist.");
    return { data };
  });
  app.post("/v1/workspaces/:workspaceId/archive", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    await workspaceService().setWorkspaceState(authenticated.identity, request.id, "archived");
    return reply.code(204).send();
  });
  app.post("/v1/workspaces/:workspaceId/restorations", async (request) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    await workspaceService().setWorkspaceState(authenticated.identity, request.id, "active");
    return { restored: true };
  });
  app.delete("/v1/workspaces/:workspaceId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    await workspaceService().setWorkspaceState(authenticated.identity, request.id, "deleting");
    return reply.code(202).send({ deletionRequested: true });
  });

  app.get("/v1/workspaces/:workspaceId/members", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await workspaceService().members(authenticated.identity, request.id) };
  });
  const memberParamsSchema = z
    .object({ workspaceId: z.string().uuid(), memberId: z.string().uuid() })
    .strict();
  app.get("/v1/workspaces/:workspaceId/members/:memberId", async (request) => {
    const authenticated = await authenticate(request);
    const params = memberParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, params.workspaceId);
    const member = (await workspaceService().members(authenticated.identity, request.id)).find(
      (candidate) => candidate.id === params.memberId
    );
    if (!member) throw new AuthFailure("MEMBER_NOT_FOUND", 404, "The member does not exist.");
    return { data: member };
  });
  app.patch("/v1/workspaces/:workspaceId/members/:memberId", async (request) => {
    const authenticated = await protectMutation(request);
    const params = memberParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, params.workspaceId);
    const body = z
      .object({
        role: z
          .enum(["owner", "admin", "builder", "member", "approver", "billing", "auditor", "custom"])
          .optional(),
        customRoleId: z.string().uuid().optional(),
        state: z.enum(["active", "suspended", "removed"]).optional()
      })
      .strict()
      .parse(request.body);
    const updated = await workspaceService().updateMember(
      authenticated.identity,
      request.id,
      params.memberId,
      {
        ...(body.role === undefined ? {} : { role: body.role }),
        ...(body.customRoleId === undefined ? {} : { customRoleId: body.customRoleId }),
        ...(body.state === undefined ? {} : { state: body.state })
      }
    );
    if (!updated) throw new AuthFailure("MEMBER_NOT_FOUND", 404, "The member does not exist.");
    return { updated: true };
  });
  app.post("/v1/workspaces/:workspaceId/ownership-transfers", async (request) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const body = z.object({ targetMemberId: z.string().uuid() }).strict().parse(request.body);
    const transferred = await workspaceService().transferOwnership(
      authenticated.identity,
      request.id,
      body.targetMemberId
    );
    if (!transferred)
      throw new AuthFailure(
        "OWNERSHIP_TRANSFER_INVALID",
        409,
        "Ownership could not be transferred."
      );
    return { transferred: true };
  });
  app.delete("/v1/workspaces/:workspaceId/members/:memberId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const params = memberParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, params.workspaceId);
    const query = z.object({ reassignToMemberId: z.string().uuid() }).parse(request.query);
    const removed = await workspaceService().removeMember(
      authenticated.identity,
      request.id,
      params.memberId,
      query.reassignToMemberId
    );
    if (!removed) throw new AuthFailure("MEMBER_NOT_FOUND", 404, "The member does not exist.");
    return reply.code(204).send();
  });

  const invitationRoleSchema = z.enum([
    "admin",
    "builder",
    "member",
    "approver",
    "billing",
    "auditor",
    "custom"
  ]);
  app.get("/v1/workspaces/:workspaceId/invitations", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await workspaceService().invitations(authenticated.identity, request.id) };
  });
  app.post("/v1/workspaces/:workspaceId/invitations", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const body = z
      .object({
        email: z
          .string()
          .email()
          .transform((value) => value.toLowerCase()),
        role: invitationRoleSchema,
        customRoleId: z.string().uuid().optional()
      })
      .strict()
      .parse(request.body);
    const result = await workspaceService().invite(authenticated.identity, request.id, {
      email: body.email,
      role: body.role,
      ...(body.customRoleId === undefined ? {} : { customRoleId: body.customRoleId })
    });
    if (result === "existing_member")
      throw new AuthFailure("MEMBER_ALREADY_EXISTS", 409, "This person is already a member.");
    return reply.code(201).send({ data: result });
  });
  const invitationParamsSchema = z.object({ invitationId: z.string().uuid() }).strict();
  app.post("/v1/invitations/:invitationId/resends", async (request) => {
    const authenticated = await protectMutation(request);
    const { invitationId } = invitationParamsSchema.parse(request.params);
    return {
      data: await workspaceService().resendInvitation(
        authenticated.identity,
        request.id,
        invitationId
      )
    };
  });
  app.delete("/v1/invitations/:invitationId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { invitationId } = invitationParamsSchema.parse(request.params);
    const cancelled = await workspaceService().cancelInvitation(
      authenticated.identity,
      request.id,
      invitationId
    );
    if (!cancelled)
      throw new AuthFailure("INVITATION_NOT_FOUND", 404, "The invitation does not exist.");
    return reply.code(204).send();
  });
  const invitationResponseSchema = z
    .object({ token: z.string().min(32).max(256), response: z.enum(["accept", "decline"]) })
    .strict();
  app.post("/edge/v1/invitation-responses/preview", async (request) => {
    const authenticated = await authenticate(request);
    const body = invitationResponseSchema.pick({ token: true }).parse(request.body);
    const invitation = await workspaceService().previewInvitation(
      authenticated.identity,
      body.token
    );
    if (!invitation)
      throw new AuthFailure(
        "INVITATION_INVALID",
        404,
        "The invitation is not valid for this account."
      );
    return { data: invitation };
  });
  app.post("/edge/v1/invitation-responses", async (request) => {
    const authenticated = await protectMutation(request);
    const body = invitationResponseSchema.parse(request.body);
    const result = await workspaceService().respondToInvitation(
      authenticated.identity,
      request.id,
      body.token,
      body.response
    );
    if (["invalid", "expired", "used"].includes(result))
      throw new AuthFailure(
        `INVITATION_${result.toUpperCase()}`,
        409,
        "The invitation cannot be used."
      );
    return { result };
  });

  app.get("/v1/workspaces/:workspaceId/roles", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await workspaceService().roles(authenticated.identity, request.id) };
  });
  const roleBodySchema = z
    .object({
      name: z.string().trim().min(1).max(80),
      description: z.string().max(500).default(""),
      permissions: z
        .array(z.string().regex(/^[a-z]+(?:\.[a-z]+)+$/u))
        .min(1)
        .max(40)
    })
    .strict();
  app.post("/v1/workspaces/:workspaceId/roles", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const role = await workspaceService().saveRole(
      authenticated.identity,
      request.id,
      roleBodySchema.parse(request.body)
    );
    return reply.code(201).send({ data: role });
  });
  const roleParamsSchema = z.object({ roleId: z.string().uuid() }).strict();
  app.get("/v1/roles/:roleId", async (request) => {
    const authenticated = await authenticate(request);
    const { roleId } = roleParamsSchema.parse(request.params);
    const role = (await workspaceService().roles(authenticated.identity, request.id)).find(
      (candidate) => candidate.id === roleId
    );
    if (!role) throw new AuthFailure("ROLE_NOT_FOUND", 404, "The role does not exist.");
    return { data: role };
  });
  app.patch("/v1/roles/:roleId", async (request) => {
    const authenticated = await protectMutation(request);
    const { roleId } = roleParamsSchema.parse(request.params);
    return {
      data: await workspaceService().saveRole(authenticated.identity, request.id, {
        id: roleId,
        ...roleBodySchema.parse(request.body)
      })
    };
  });
  app.delete("/v1/roles/:roleId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { roleId } = roleParamsSchema.parse(request.params);
    const deleted = await workspaceService().deleteRole(authenticated.identity, request.id, roleId);
    if (!deleted)
      throw new AuthFailure("ROLE_IN_USE", 409, "The role is built in or still assigned.");
    return reply.code(204).send();
  });

  app.get("/v1/workspaces/:workspaceId/groups", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await workspaceService().groups(authenticated.identity, request.id) };
  });
  const groupBodySchema = z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(500).default(""),
      memberIds: z.array(z.string().uuid()).max(500).default([])
    })
    .strict();
  app.post("/v1/workspaces/:workspaceId/groups", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const id = await workspaceService().saveGroup(
      authenticated.identity,
      request.id,
      groupBodySchema.parse(request.body)
    );
    return reply.code(201).send({ id });
  });
  const groupParamsSchema = z.object({ groupId: z.string().uuid() }).strict();
  app.patch("/v1/groups/:groupId", async (request) => {
    const authenticated = await protectMutation(request);
    const { groupId } = groupParamsSchema.parse(request.params);
    const id = await workspaceService().saveGroup(authenticated.identity, request.id, {
      id: groupId,
      ...groupBodySchema.parse(request.body)
    });
    return { id };
  });
  app.delete("/v1/groups/:groupId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { groupId } = groupParamsSchema.parse(request.params);
    const deleted = await workspaceService().deleteGroup(
      authenticated.identity,
      request.id,
      groupId
    );
    if (!deleted) throw new AuthFailure("GROUP_NOT_FOUND", 404, "The group does not exist.");
    return reply.code(204).send();
  });
  const groupMemberParamsSchema = z
    .object({ groupId: z.string().uuid(), userId: z.string().uuid() })
    .strict();
  app.put("/v1/groups/:groupId/members/:userId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const params = groupMemberParamsSchema.parse(request.params);
    const group = (await workspaceService().groups(authenticated.identity, request.id)).find(
      (candidate) => candidate.id === params.groupId
    );
    if (!group) throw new AuthFailure("GROUP_NOT_FOUND", 404, "The group does not exist.");
    await workspaceService().saveGroup(authenticated.identity, request.id, {
      id: group.id,
      name: group.name,
      description: group.description,
      memberIds: [...group.memberIds, params.userId]
    });
    return reply.code(204).send();
  });
  app.delete("/v1/groups/:groupId/members/:userId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const params = groupMemberParamsSchema.parse(request.params);
    const group = (await workspaceService().groups(authenticated.identity, request.id)).find(
      (candidate) => candidate.id === params.groupId
    );
    if (!group) throw new AuthFailure("GROUP_NOT_FOUND", 404, "The group does not exist.");
    await workspaceService().saveGroup(authenticated.identity, request.id, {
      id: group.id,
      name: group.name,
      description: group.description,
      memberIds: group.memberIds.filter((userId) => userId !== params.userId)
    });
    return reply.code(204).send();
  });
  app.post("/v1/workspaces/:workspaceId/organization-relationships", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const body = z
      .object({ reportUserId: z.string().uuid(), managerUserId: z.string().uuid() })
      .strict()
      .parse(request.body);
    const id = await workspaceService().saveReportingRelationship(
      authenticated.identity,
      request.id,
      body
    );
    return reply.code(201).send({ id });
  });

  app.get("/v1/me/onboarding", async (request) => {
    const authenticated = await authenticate(request);
    return { data: await workspaceService().onboarding(authenticated.identity, request.id) };
  });
  const onboardingSchema = z
    .object({
      currentStep: z.enum([
        "role_use_case",
        "optional_connection",
        "workflow_source",
        "teammate_invite",
        "readiness",
        "first_real_run"
      ]),
      completedSteps: z.array(z.string()).max(20),
      skippedSteps: z.array(z.string()).max(20),
      profile: z.record(z.string(), z.unknown()),
      revision: z.number().int().positive(),
      complete: z.boolean().optional()
    })
    .strict();
  app.put("/v1/me/onboarding", async (request) => {
    const authenticated = await protectMutation(request);
    const result = await workspaceService().updateOnboarding(
      authenticated.identity,
      request.id,
      (() => {
        const body = onboardingSchema.parse(request.body);
        return {
          currentStep: body.currentStep,
          completedSteps: body.completedSteps,
          skippedSteps: body.skippedSteps,
          profile: body.profile,
          revision: body.revision,
          ...(body.complete === undefined ? {} : { complete: body.complete })
        };
      })()
    );
    if (result === "conflict")
      throw new AuthFailure(
        "ONBOARDING_REVISION_CONFLICT",
        409,
        "Onboarding changed on another device."
      );
    return { data: result };
  });
  app.post("/v1/me/onboarding/sample-workspaces", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const id = await workspaceService().createSampleData(authenticated.identity, request.id);
    return reply.code(201).send({ id, label: "SAMPLE DATA" });
  });
  app.delete("/v1/me/onboarding/sample-workspaces/:sampleId", async (request) => {
    const authenticated = await protectMutation(request);
    const { sampleId } = z.object({ sampleId: z.string().uuid() }).parse(request.params);
    return {
      removed: await workspaceService().removeSampleData(
        authenticated.identity,
        request.id,
        sampleId
      )
    };
  });

  if ((options.environment === "local" || options.environment === "ci") && options.captureMailer) {
    app.get("/__local/auth/emails/latest", async (request, reply) => {
      const query = z.object({ email: z.string().optional() }).parse(request.query);
      const delivery = options.captureMailer?.latest(
        query.email ? query.email.toLowerCase() : undefined
      );
      return (
        delivery ??
        reply.code(404).send({
          error: {
            code: "EMAIL_NOT_FOUND",
            message: "No captured email was found.",
            requestId: request.id
          }
        })
      );
    });
    app.get("/__local/oidc/authorize", async (request, reply) => {
      const query = z
        .object({
          state: z.string(),
          nonce: z.string(),
          redirect_uri: z.string().url(),
          client_id: z.string(),
          deny: z.string().optional()
        })
        .passthrough()
        .parse(request.query);
      if (
        query.client_id !== options.auth.config.google.clientId ||
        query.redirect_uri !== `${options.auth.config.apiOrigin}/callbacks/v1/identity/oauth/google`
      ) {
        throw new AuthFailure(
          "OIDC_CLIENT_MISMATCH",
          400,
          "The local identity request is invalid."
        );
      }
      const destination = new URL(query.redirect_uri);
      destination.searchParams.set("state", query.state);
      if (query.deny === "1") destination.searchParams.set("error", "access_denied");
      else
        destination.searchParams.set(
          "code",
          Buffer.from(
            JSON.stringify({
              nonce: query.nonce,
              email: "maya@northstar.example",
              subject: "local-google-maya"
            })
          ).toString("base64url")
        );
      return reply.redirect(destination.toString(), 303);
    });
  }
  if (
    (options.environment === "local" || options.environment === "ci") &&
    options.captureInvitationMailer
  ) {
    app.get("/__local/invitations/latest", async (request, reply) => {
      const query = z.object({ email: z.string().optional() }).parse(request.query);
      return (
        options.captureInvitationMailer?.latest(query.email?.toLowerCase()) ??
        reply.code(404).send({
          error: {
            code: "INVITATION_NOT_FOUND",
            message: "No captured invitation was found.",
            requestId: request.id
          }
        })
      );
    });
  }

  if (options.workflowDefinitions) {
    const workflowIdParams = z.object({ workflowId: z.string().uuid() }).strict();
    const workflowVersionParams = z
      .object({ workflowId: z.string().uuid(), version: z.coerce.number().int().positive() })
      .strict();
    const defaultDefinition = (name: string, description = "") =>
      workflowDefinitionSchema.parse({
        schemaVersion: 1,
        name,
        description,
        inputSchema: {},
        outputSchema: {},
        nodes: [
          {
            key: "manual_start",
            kind: "trigger",
            name: "Manual start",
            description: "",
            position: { x: 80, y: 120 },
            configuration: { triggerType: "manual" }
          }
        ],
        edges: []
      });

    app.get("/v1/workspaces/:workspaceId/workflows", async (request) => {
      const authenticated = await authenticate(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = await workflowAccess(request, "workflow.read");
      return { data: await options.repository.list(context) };
    });
    app.post("/v1/workspaces/:workspaceId/workflows", async (request, reply) => {
      const authenticated = await protectMutation(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = options.workspace
        ? (await options.workspace.require(authenticated.identity, request.id, "workflow.create"))
            .context
        : tenantContext(options, request, authenticated);
      const body = createWorkflowRequestSchema.parse(request.body);
      const workflowId = await workflowDefinitions().import(
        context,
        defaultDefinition(body.name, body.description)
      );
      return reply.code(201).send({ data: await options.repository.get(context, workflowId) });
    });
    app.patch("/v1/workflows/:workflowId", async (request) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const body = z
        .object({
          name: z.string().trim().min(1).max(160).optional(),
          description: z.string().max(4_000).optional()
        })
        .strict()
        .parse(request.body);
      const draft = await workflowDefinitions().getDraft(context, workflowId);
      if (!draft) throw new AuthFailure("WORKFLOW_NOT_FOUND", 404, "The workflow does not exist.");
      const saved = await workflowDefinitions().saveDraft(context, workflowId, draft.revision, {
        ...draft.definition,
        name: body.name ?? draft.definition.name,
        description: body.description ?? draft.definition.description
      });
      return { data: saved };
    });
    app.delete("/v1/workflows/:workflowId", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      if (!(await workflowDefinitions().setLifecycle(context, workflowId, "deleting")))
        throw new AuthFailure("WORKFLOW_NOT_FOUND", 404, "The workflow does not exist.");
      return reply.code(202).send({ deletionRequested: true });
    });
    app.post("/v1/workflows/:workflowId/restorations", async (request) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      return { restored: await workflowDefinitions().setLifecycle(context, workflowId, "active") };
    });
    app.post("/v1/workflows/:workflowId/duplicates", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.create", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const body = z
        .object({ name: z.string().max(160).optional() })
        .strict()
        .parse(request.body ?? {});
      const id = await workflowDefinitions().duplicate(context, workflowId, body.name);
      if (!id) throw new AuthFailure("WORKFLOW_NOT_FOUND", 404, "The workflow does not exist.");
      return reply.code(201).send({ id });
    });
    app.post("/v1/workspaces/:workspaceId/workflow-imports", async (request, reply) => {
      const authenticated = await protectMutation(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = options.workspace
        ? (await options.workspace.require(authenticated.identity, request.id, "workflow.create"))
            .context
        : tenantContext(options, request, authenticated);
      const id = await workflowDefinitions().import(context, request.body);
      return reply.code(201).send({ id });
    });
    app.post("/v1/workflows/:workflowId/exports", async (request) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const body = z
        .object({ version: z.number().int().positive().optional() })
        .strict()
        .parse(request.body ?? {});
      const exported = await workflowDefinitions().export(context, workflowId, body.version);
      if (!exported)
        throw new AuthFailure("WORKFLOW_NOT_FOUND", 404, "The workflow does not exist.");
      return { data: exported };
    });
    app.post("/v1/workflows/:workflowId/ownership-transfers", async (request) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const { ownerUserId } = z
        .object({ ownerUserId: z.string().uuid() })
        .strict()
        .parse(request.body);
      return {
        transferred: await workflowDefinitions().transfer(context, workflowId, ownerUserId)
      };
    });
    app.post("/v1/workflows/:workflowId/favorites", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      await workflowDefinitions().favorite(context, workflowId, true);
      return reply.code(204).send();
    });
    app.delete("/v1/workflows/:workflowId/favorites", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      await workflowDefinitions().favorite(context, workflowId, false);
      return reply.code(204).send();
    });
    app.get("/v1/workflows/:workflowId/draft", async (request) => {
      const context = await workflowAccess(request, "workflow.read");
      const { workflowId } = workflowIdParams.parse(request.params);
      const draft = await workflowDefinitions().getDraft(context, workflowId);
      if (!draft)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      return { data: draft };
    });
    app.put("/v1/workflows/:workflowId/draft", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const draft = await workflowDefinitions().getDraft(context, workflowId);
      if (!draft)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      if (request.headers["if-match"] !== draft.etag)
        throw new AuthFailure(
          "WORKFLOW_EDIT_CONFLICT",
          412,
          "The workflow draft changed on another device."
        );
      const definition = workflowDefinitionSchema.parse(request.body);
      const saved = await workflowDefinitions().saveDraft(
        context,
        workflowId,
        draft.revision,
        definition
      );
      if (saved === "conflict")
        throw new AuthFailure(
          "WORKFLOW_EDIT_CONFLICT",
          409,
          "The workflow draft changed concurrently."
        );
      if (!saved)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      reply.header("etag", saved.etag);
      return { data: saved };
    });
    app.post("/v1/workflows/:workflowId/draft/operations", async (request) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const body = z
        .object({ revision: z.number().int().positive(), definition: workflowDefinitionSchema })
        .strict()
        .parse(request.body);
      const saved = await workflowDefinitions().saveDraft(
        context,
        workflowId,
        body.revision,
        body.definition
      );
      if (saved === "conflict")
        throw new AuthFailure(
          "WORKFLOW_EDIT_CONFLICT",
          409,
          "The atomic operation batch conflicted."
        );
      return { data: saved };
    });
    app.post("/v1/workflows/:workflowId/draft/validations", async (request) => {
      const context = await workflowAccess(request, "workflow.read", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const findings = await workflowDefinitions().validateDraft(context, workflowId);
      if (!findings)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      return { data: { valid: findings.every(({ severity }) => severity !== "error"), findings } };
    });
    app.post("/v1/workflows/:workflowId/draft/publications", async (request) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const body = z
        .object({
          revision: z.number().int().positive(),
          releaseNote: z.string().max(2_000).default("")
        })
        .strict()
        .parse(request.body);
      const result = await workflowDefinitions().publish(
        context,
        workflowId,
        body.revision,
        body.releaseNote
      );
      if (result === "conflict")
        throw new AuthFailure(
          "WORKFLOW_EDIT_CONFLICT",
          409,
          "The workflow draft changed concurrently."
        );
      if (!result)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      return { data: result };
    });
    app.get("/v1/workflows/:workflowId/versions", async (request) => {
      const context = await workflowAccess(request, "workflow.read");
      const { workflowId } = workflowIdParams.parse(request.params);
      return { data: await workflowDefinitions().versions(context, workflowId) };
    });
    app.get("/v1/workflows/:workflowId/versions/:version", async (request) => {
      const context = await workflowAccess(request, "workflow.read");
      const { workflowId, version } = workflowVersionParams.parse(request.params);
      const record = await workflowDefinitions().version(context, workflowId, version);
      if (!record)
        throw new AuthFailure(
          "WORKFLOW_VERSION_NOT_FOUND",
          404,
          "The workflow version does not exist."
        );
      return { data: record };
    });
    app.get("/v1/workflows/:workflowId/version-diffs", async (request) => {
      const context = await workflowAccess(request, "workflow.read");
      const { workflowId } = workflowIdParams.parse(request.params);
      const { from, to } = z
        .object({
          from: z.coerce.number().int().positive(),
          to: z.coerce.number().int().positive()
        })
        .strict()
        .parse(request.query);
      const diff = await workflowDefinitions().diff(context, workflowId, from, to);
      if (!diff)
        throw new AuthFailure(
          "WORKFLOW_VERSION_NOT_FOUND",
          404,
          "Both workflow versions are required."
        );
      return { data: diff };
    });
    app.post("/v1/workflows/:workflowId/drafts-from-version", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.manage", true);
      const { workflowId } = workflowIdParams.parse(request.params);
      const { version } = z
        .object({ version: z.number().int().positive() })
        .strict()
        .parse(request.body);
      const restored = await workflowDefinitions().restore(context, workflowId, version);
      if (!restored)
        throw new AuthFailure(
          "WORKFLOW_VERSION_NOT_FOUND",
          404,
          "The workflow version does not exist."
        );
      return reply.code(201).send({ data: restored });
    });
    app.get("/v1/workspaces/:workspaceId/workflow-folders", async (request) => {
      const authenticated = await authenticate(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = await workflowAccess(request, "workflow.read");
      return { data: await workflowDefinitions().folders(context) };
    });
    app.post("/v1/workspaces/:workspaceId/workflow-folders", async (request, reply) => {
      const authenticated = await protectMutation(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = options.workspace
        ? (await options.workspace.require(authenticated.identity, request.id, "workflow.manage"))
            .context
        : tenantContext(options, request, authenticated);
      const body = z
        .object({ name: z.string().trim().min(1).max(120), parentId: z.string().uuid().optional() })
        .strict()
        .parse(request.body);
      return reply
        .code(201)
        .send({ id: await workflowDefinitions().createFolder(context, body.name, body.parentId) });
    });
    app.get("/v1/workspaces/:workspaceId/workflow-tags", async (request) => {
      const authenticated = await authenticate(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = await workflowAccess(request, "workflow.read");
      return { data: await workflowDefinitions().tags(context) };
    });
    app.post("/v1/workspaces/:workspaceId/workflow-tags", async (request, reply) => {
      const authenticated = await protectMutation(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = options.workspace
        ? (await options.workspace.require(authenticated.identity, request.id, "workflow.manage"))
            .context
        : tenantContext(options, request, authenticated);
      const body = z
        .object({
          name: z.string().trim().min(1).max(60),
          color: z.enum(["slate", "blue", "lime", "amber", "rose", "violet"]).default("slate")
        })
        .strict()
        .parse(request.body);
      return reply
        .code(201)
        .send({ id: await workflowDefinitions().createTag(context, body.name, body.color) });
    });
    app.get("/v1/templates", async (request) => {
      const context = await workflowAccess(request, "workflow.read");
      return { data: await workflowDefinitions().templates(context) };
    });
    app.post("/v1/workspaces/:workspaceId/templates", async (request, reply) => {
      const authenticated = await protectMutation(request);
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      requireActiveWorkspace(authenticated, workspaceId);
      const context = options.workspace
        ? (await options.workspace.require(authenticated.identity, request.id, "workflow.create"))
            .context
        : tenantContext(options, request, authenticated);
      const body = z
        .object({
          workflowId: z.string().uuid(),
          name: z.string().trim().min(1).max(160),
          description: z.string().max(4_000).default(""),
          variables: z
            .array(
              z
                .object({
                  key: z.string().regex(/^[a-z][a-z0-9_-]*$/u),
                  required: z.boolean(),
                  default: z.unknown().optional()
                })
                .strict()
            )
            .max(100)
            .default([])
        })
        .strict()
        .parse(request.body);
      const template = await workflowDefinitions().createTemplate(context, body.workflowId, body);
      if (!template)
        throw new AuthFailure(
          "WORKFLOW_DRAFT_NOT_FOUND",
          404,
          "The workflow draft does not exist."
        );
      return reply.code(201).send({ data: template });
    });
    app.post("/v1/templates/:templateId/instantiations", async (request, reply) => {
      const context = await workflowAccess(request, "workflow.create", true);
      const { templateId } = z
        .object({ templateId: z.string().uuid() })
        .strict()
        .parse(request.params);
      const { values } = z
        .object({ values: z.record(z.string(), z.unknown()).default({}) })
        .strict()
        .parse(request.body ?? {});
      const id = await workflowDefinitions().instantiateTemplate(context, templateId, values);
      if (!id) throw new AuthFailure("TEMPLATE_NOT_FOUND", 404, "The template does not exist.");
      return reply.code(201).send({ id });
    });
  }

  app.get("/v1/bootstrap", async (request, reply) => {
    const authenticated = await authenticate(request);
    const bootstrap = await options.repository.bootstrap(
      tenantContext(options, request, authenticated)
    );
    if (!bootstrap) {
      return reply.code(404).send({
        error: {
          code: "BOOTSTRAP_NOT_FOUND",
          message: "The workspace bootstrap does not exist.",
          requestId: request.id
        }
      });
    }
    return {
      capabilityStatus: "DEMO" as const,
      ...bootstrap,
      entitlements: { agents: true, integrations: true, audit: true }
    };
  });

  app.get<{ Reply: ApiEnvelope<WorkflowSummary[]> | ApiErrorReply }>(
    "/v1/teams/:teamId/workflows",
    async (request, reply) => {
      const params = teamParamsSchema.parse(request.params);
      const authenticated = await authenticate(request);
      const tenant = tenantContext(options, request, authenticated);
      if (params.teamId !== tenant.workspaceId) {
        return reply.code(404).send({
          error: {
            code: "WORKSPACE_NOT_FOUND",
            message: "The workspace does not exist.",
            requestId: request.id
          }
        });
      }
      return { data: [...(await options.repository.list(tenant))] };
    }
  );

  app.post<{ Reply: ApiEnvelope<Workflow> | ApiErrorReply }>(
    "/v1/teams/:teamId/workflows",
    async (request, reply) => {
      const params = teamParamsSchema.parse(request.params);
      const body = createWorkflowRequestSchema.parse(request.body);
      const authenticated = await protectMutation(request);
      const tenant = tenantContext(options, request, authenticated);
      if (params.teamId !== tenant.workspaceId) {
        return reply.code(404).send({
          error: {
            code: "WORKSPACE_NOT_FOUND",
            message: "The workspace does not exist.",
            requestId: request.id
          }
        });
      }
      const workflow = await options.repository.create(tenant, {
        name: body.name,
        ...(body.description === undefined ? {} : { description: body.description })
      });
      return reply.code(201).send({ data: workflow });
    }
  );

  app.get<{ Reply: ApiEnvelope<Workflow> | ApiErrorReply }>(
    "/v1/workflows/:workflowId",
    async (request, reply) => {
      const params = workflowParamsSchema.parse(request.params);
      const authenticated = await authenticate(request);
      const workflow = await options.repository.get(
        tenantContext(options, request, authenticated),
        params.workflowId
      );
      if (!workflow) {
        return reply.code(404).send({
          error: {
            code: "WORKFLOW_NOT_FOUND",
            message: "The requested workflow does not exist.",
            requestId: request.id
          }
        });
      }
      return { data: workflow };
    }
  );

  app.post("/v1/workflows/:workflowId/runs", async (request, reply) => {
    if (!options.runtime || !options.runStarter) throw new Error("Runtime is not configured");
    const authenticated = await protectMutation(request);
    const context = await workflowAccess(request, "workflow.create", true);
    const { workflowId } = workflowParamsSchema.parse(request.params);
    const body = startRunSchema.parse(request.body);
    const run = await options.runtime.startRun(context, workflowId, body);
    await options.runStarter.start({
      workspaceId: context.workspaceId,
      principalId: authenticated.identity.user.id,
      runId: run.id,
      temporalWorkflowId: run.temporalWorkflowId,
      plan: run.plan ?? []
    });
    await options.runtime.markStartDispatched(context, run.id);
    return reply.code(202).send({ data: run });
  });

  app.get("/v1/workflows/:workflowId/runs", async (request) => {
    if (!options.runtime) throw new Error("Runtime is not configured");
    const context = await workflowAccess(request, "workflow.read");
    const { workflowId } = workflowParamsSchema.parse(request.params);
    const query = z
      .object({
        state: z
          .enum([
            "queued",
            "running",
            "paused",
            "cancelling",
            "cancelled",
            "succeeded",
            "failed",
            "policy_stopped"
          ])
          .optional(),
        limit: z.coerce.number().int().min(1).max(200).optional()
      })
      .parse(request.query);
    return {
      data: await options.runtime.workflowRuns(context, workflowId, {
        ...(query.state === undefined ? {} : { state: query.state }),
        ...(query.limit === undefined ? {} : { limit: query.limit })
      })
    };
  });

  app.get("/v1/runs/:runId", async (request, reply) => {
    if (!options.runtime) throw new Error("Runtime is not configured");
    const context = await workflowAccess(request, "workflow.read");
    const { runId } = z.object({ runId: z.string().uuid() }).parse(request.params);
    const run = await options.runtime.run(context, runId);
    if (!run)
      return reply.code(404).send({
        error: {
          code: "RUN_NOT_FOUND",
          message: "The run does not exist.",
          requestId: request.id
        }
      });
    return { data: run };
  });

  app.get("/v1/runs/:runId/events", async (request) => {
    if (!options.runtime) throw new Error("Runtime is not configured");
    const context = await workflowAccess(request, "workflow.read");
    const { runId } = z.object({ runId: z.string().uuid() }).parse(request.params);
    return { data: (await options.runtime.events(context, runId)) ?? [] };
  });

  app.get("/v1/runs/:runId/stream", async (request, reply) => {
    if (!options.runtime) throw new Error("Runtime is not configured");
    const context = await workflowAccess(request, "workflow.read");
    const { runId } = z.object({ runId: z.string().uuid() }).parse(request.params);
    const cursor = z.coerce
      .number()
      .int()
      .nonnegative()
      .catch(0)
      .parse(request.headers["last-event-id"] ?? 0);
    const events = ((await options.runtime.events(context, runId)) ?? []).filter(
      (event) => Number(event.sequence) > cursor
    );
    const body = [
      ...events.map(
        (event) =>
          `id: ${String(event.sequence)}\nevent: run-event\ndata: ${JSON.stringify(event)}\n`
      ),
      `event: heartbeat\ndata: ${JSON.stringify({ cursor: events.at(-1)?.sequence ?? cursor })}\n`
    ].join("\n");
    return reply
      .header("content-type", "text/event-stream; charset=utf-8")
      .header("cache-control", "no-cache, no-transform")
      .header("x-accel-buffering", "no")
      .send(`${body}\n`);
  });

  const signalRun =
    (signal: "pause" | "resume" | "cancel") =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!options.runtime || !options.runStarter) throw new Error("Runtime is not configured");
      const context = await workflowAccess(request, "workflow.manage", true);
      const { runId } = z.object({ runId: z.string().uuid() }).parse(request.params);
      const intent = runIntentSchema.parse({
        ...(request.body as object),
        type: signal === "pause" ? "pause" : signal === "resume" ? "resume" : "cancel"
      });
      const run = await options.runtime.run(context, runId);
      if (!run)
        return reply.code(404).send({
          error: {
            code: "RUN_NOT_FOUND",
            message: "The run does not exist.",
            requestId: request.id
          }
        });
      await options.runStarter.signal(String(run.temporal_workflow_id), signal);
      return reply.code(202).send({ accepted: true, intent });
    };
  app.post("/v1/runs/:runId/pauses", signalRun("pause"));
  app.post("/v1/runs/:runId/resumptions", signalRun("resume"));
  app.post("/v1/runs/:runId/cancellations", signalRun("cancel"));

  const humanTaskAccess = async (
    request: FastifyRequest,
    mutation = false,
    permission: "workflow.read" | "workflow.manage" = "workflow.read"
  ) => {
    if (!options.humanTasks) throw new Error("Human tasks are not configured");
    const authenticated = mutation ? await protectMutation(request) : await authenticate(request);
    if (!options.workspace) return tenantContext(options, request, authenticated);
    return (await options.workspace.require(authenticated.identity, request.id, permission))
      .context;
  };
  const humanTaskParams = z.object({ taskRunId: z.string().uuid() }).strict();

  app.get("/v1/task-runs", async (request) => {
    const context = await humanTaskAccess(request);
    return { data: await options.humanTasks!.list(context, request.query) };
  });

  app.get("/v1/task-runs/:taskRunId", async (request, reply) => {
    const context = await humanTaskAccess(request);
    const { taskRunId } = humanTaskParams.parse(request.params);
    const task = await options.humanTasks!.get(context, taskRunId);
    if (!task)
      return reply.code(404).send({
        error: {
          code: "TASK_NOT_FOUND",
          message: "The task does not exist.",
          requestId: request.id
        }
      });
    return { data: task };
  });

  app.post("/v1/task-runs/:taskRunId/claims", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await options.humanTasks!.claim(context, taskRunId, request.body) });
  });

  app.put("/v1/task-runs/:taskRunId/draft", async (request) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return { data: await options.humanTasks!.saveDraft(context, taskRunId, request.body) };
  });

  app.post("/v1/task-runs/:taskRunId/submissions", async (request, reply) => {
    if (!options.runStarter) throw new Error("Runtime is not configured");
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    const submission = await options.humanTasks!.submit(context, taskRunId, request.body);
    await options.runStarter.completeTask(submission.temporalWorkflowId, submission.nodeKey);
    return reply.code(201).send({ data: { id: submission.id } });
  });

  app.get("/v1/task-runs/:taskRunId/attempts", async (request) => {
    const context = await humanTaskAccess(request);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return { data: await options.humanTasks!.attempts(context, taskRunId) };
  });
  app.get("/v1/task-runs/:taskRunId/attempts/:attempt", async (request, reply) => {
    const context = await humanTaskAccess(request);
    const { taskRunId, attempt } = z
      .object({ taskRunId: z.string().uuid(), attempt: z.coerce.number().int().positive() })
      .parse(request.params);
    const record = (await options.humanTasks!.attempts(context, taskRunId)).find(
      (item) => Number(item.attempt) === attempt
    );
    if (!record)
      return reply.code(404).send({
        error: {
          code: "TASK_ATTEMPT_NOT_FOUND",
          message: "The task attempt does not exist.",
          requestId: request.id
        }
      });
    return { data: record };
  });
  app.post("/v1/task-runs/bulk-actions", async (request) => {
    const context = await humanTaskAccess(request, true, "workflow.manage");
    return { data: await options.humanTasks!.bulk(context, request.body) };
  });

  app.post("/v1/task-runs/:taskRunId/reassignments", async (request, reply) => {
    const context = await humanTaskAccess(request, true, "workflow.manage");
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await options.humanTasks!.assign(context, taskRunId, request.body) });
  });

  app.post("/v1/task-runs/:taskRunId/delegations", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await options.humanTasks!.delegate(context, taskRunId, request.body) });
  });

  app.post("/v1/task-runs/:taskRunId/clarification-requests", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply.code(202).send({
      data: await options.humanTasks!.requestClarification(context, taskRunId, request.body)
    });
  });

  app.post("/v1/task-runs/:taskRunId/reopenings", async (request, reply) => {
    const context = await humanTaskAccess(request, true, "workflow.manage");
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await options.humanTasks!.reopen(context, taskRunId, request.body) });
  });

  const unclaimTask = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply
      .code(202)
      .send({ data: await options.humanTasks!.unclaim(context, taskRunId, request.body) });
  };
  app.post("/v1/task-runs/:taskRunId/unclaims", unclaimTask);
  app.post("/v1/task-runs/:taskRunId/returns-to-queue", unclaimTask);

  app.post("/v1/task-runs/:taskRunId/watches", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    await options.humanTasks!.watch(context, taskRunId);
    return reply.code(204).send();
  });
  app.delete("/v1/task-runs/:taskRunId/watches", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    await options.humanTasks!.unwatch(context, taskRunId);
    return reply.code(204).send();
  });

  const taskAdmin = () => {
    if (!options.taskAdministration) throw new Error("Task administration is not configured");
    return options.taskAdministration;
  };
  const taskAdminAccess = (request: FastifyRequest) =>
    workflowAccess(request, "workflow.manage", true);
  const queueParams = z.object({ queueId: z.string().uuid() }).strict();
  const templateParams = z.object({ templateId: z.string().uuid() }).strict();
  const principalParams = z
    .object({ queueId: z.string().uuid(), principalId: z.string().uuid() })
    .strict();

  app.get("/v1/workspaces/:workspaceId/task-queues", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const context = await workflowAccess(request, "workflow.read");
    return { data: await taskAdmin().listQueues(context) };
  });
  app.post("/v1/workspaces/:workspaceId/task-queues", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const context = await taskAdminAccess(request);
    return reply.code(201).send({ data: await taskAdmin().createQueue(context, request.body) });
  });
  app.get("/v1/task-queues/:queueId", async (request, reply) => {
    const context = await workflowAccess(request, "workflow.read");
    const { queueId } = queueParams.parse(request.params);
    const queue = await taskAdmin().getQueue(context, queueId);
    if (!queue)
      return reply.code(404).send({
        error: {
          code: "TASK_QUEUE_NOT_FOUND",
          message: "The task queue does not exist.",
          requestId: request.id
        }
      });
    return { data: queue };
  });
  app.patch("/v1/task-queues/:queueId", async (request) => {
    const context = await taskAdminAccess(request);
    const { queueId } = queueParams.parse(request.params);
    return { data: await taskAdmin().updateQueue(context, queueId, request.body) };
  });
  app.delete("/v1/task-queues/:queueId", async (request, reply) => {
    const context = await taskAdminAccess(request);
    const { queueId } = queueParams.parse(request.params);
    await taskAdmin().deleteQueue(context, queueId);
    return reply.code(204).send();
  });
  app.put("/v1/task-queues/:queueId/members/:principalId", async (request, reply) => {
    const context = await taskAdminAccess(request);
    const { queueId, principalId } = principalParams.parse(request.params);
    await taskAdmin().putQueueMember(context, queueId, principalId, request.body);
    return reply.code(204).send();
  });
  app.delete("/v1/task-queues/:queueId/members/:principalId", async (request, reply) => {
    const context = await taskAdminAccess(request);
    const { queueId, principalId } = principalParams.parse(request.params);
    await taskAdmin().deleteQueueMember(context, queueId, principalId);
    return reply.code(204).send();
  });
  app.put("/v1/task-queues/:queueId/routing-policy", async (request) => {
    const context = await taskAdminAccess(request);
    const { queueId } = queueParams.parse(request.params);
    return { data: await taskAdmin().publishRoutingPolicy(context, queueId, request.body) };
  });
  app.post("/v1/task-queues/:queueId/routing-simulations", async (request) => {
    const context = await taskAdminAccess(request);
    const { queueId } = queueParams.parse(request.params);
    return { data: await taskAdmin().simulateRouting(context, queueId, request.body) };
  });

  app.get("/v1/workspaces/:workspaceId/task-templates", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return {
      data: await taskAdmin().listTemplates(await workflowAccess(request, "workflow.read"))
    };
  });
  app.post("/v1/workspaces/:workspaceId/task-templates", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await taskAdmin().createTemplate(await taskAdminAccess(request), request.body)
    });
  });
  app.get("/v1/task-templates/:templateId", async (request, reply) => {
    const context = await workflowAccess(request, "workflow.read");
    const { templateId } = templateParams.parse(request.params);
    const template = await taskAdmin().getTemplate(context, templateId);
    if (!template)
      return reply.code(404).send({
        error: {
          code: "TASK_TEMPLATE_NOT_FOUND",
          message: "The task template does not exist.",
          requestId: request.id
        }
      });
    return { data: template };
  });
  app.patch("/v1/task-templates/:templateId", async (request) => {
    const context = await taskAdminAccess(request);
    const { templateId } = templateParams.parse(request.params);
    return { data: await taskAdmin().updateTemplate(context, templateId, request.body) };
  });
  app.post("/v1/task-templates/:templateId/publications", async (request, reply) => {
    const context = await taskAdminAccess(request);
    const { templateId } = templateParams.parse(request.params);
    return reply.code(201).send({ data: await taskAdmin().publishTemplate(context, templateId) });
  });
  app.post("/v1/task-templates/:templateId/versions", async (request, reply) => {
    const context = await taskAdminAccess(request);
    const { templateId } = templateParams.parse(request.params);
    return reply.code(201).send({ data: await taskAdmin().publishTemplate(context, templateId) });
  });
  app.post("/v1/task-templates/:templateId/previews", async (request) => {
    const context = await workflowAccess(request, "workflow.read");
    const { templateId } = templateParams.parse(request.params);
    return { data: await taskAdmin().previewTemplate(context, templateId) };
  });
  app.delete("/v1/task-templates/:templateId", async (request, reply) => {
    const context = await taskAdminAccess(request);
    const { templateId } = templateParams.parse(request.params);
    await taskAdmin().deleteTemplate(context, templateId);
    return reply.code(204).send();
  });

  app.get("/v1/task-runs/:taskRunId/artifacts", async (request) => {
    const context = await humanTaskAccess(request);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return { data: await taskAdmin().listArtifacts(context, taskRunId) };
  });
  app.post("/v1/task-runs/:taskRunId/artifact-uploads", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { taskRunId } = humanTaskParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await taskAdmin().createUpload(context, taskRunId, request.body) });
  });
  app.post("/v1/artifact-uploads/:uploadId/completions", async (request) => {
    const context = await humanTaskAccess(request, true);
    const { uploadId } = z.object({ uploadId: z.string().uuid() }).parse(request.params);
    return { data: await taskAdmin().completeUpload(context, uploadId, request.body) };
  });
  app.get("/v1/artifacts/:artifactId/download", async (request) => {
    const context = await humanTaskAccess(request);
    const { artifactId } = z.object({ artifactId: z.string().uuid() }).parse(request.params);
    return { data: await taskAdmin().download(context, artifactId) };
  });
  app.delete("/v1/artifacts/:artifactId", async (request, reply) => {
    const context = await humanTaskAccess(request, true);
    const { artifactId } = z.object({ artifactId: z.string().uuid() }).parse(request.params);
    await taskAdmin().deleteArtifact(context, artifactId);
    return reply.code(204).send();
  });

  const approvalAccess = async (request: FastifyRequest, mutation = false) => {
    if (!options.approvals) throw new Error("Approvals are not configured");
    const authenticated = mutation ? await protectMutation(request) : await authenticate(request);
    if (!options.workspace) return tenantContext(options, request, authenticated);
    return (await options.workspace.require(authenticated.identity, request.id, "workflow.read"))
      .context;
  };
  const approvalParams = z.object({ approvalId: z.string().uuid() }).strict();

  app.get("/v1/approvals", async (request) => ({
    data: await options.approvals!.list(await approvalAccess(request))
  }));
  app.get("/v1/approvals/:approvalId", async (request, reply) => {
    const context = await approvalAccess(request);
    const { approvalId } = approvalParams.parse(request.params);
    const approval = await options.approvals!.get(context, approvalId);
    if (!approval)
      return reply.code(404).send({
        error: {
          code: "APPROVAL_NOT_FOUND",
          message: "The approval does not exist.",
          requestId: request.id
        }
      });
    return { data: approval };
  });
  app.post("/v1/approvals/:approvalId/decisions", async (request, reply) => {
    if (!options.runStarter) throw new Error("Runtime is not configured");
    const context = await approvalAccess(request, true);
    const { approvalId } = approvalParams.parse(request.params);
    const result = await options.approvals!.decide(context, approvalId, request.body, {
      requestId: request.id,
      userAgent: request.headers["user-agent"] ?? "unknown",
      ip: request.ip
    });
    if (result.state === "APPROVED_PENDING_EXECUTION") {
      const approval = await options.approvals!.get(context, approvalId);
      if (!approval) throw new Error("APPROVAL_NOT_FOUND_AFTER_DECISION");
      await options.runStarter.completeApproval(
        String(approval.temporal_workflow_id),
        String(approval.node_key),
        randomUUID()
      );
    }
    return reply.code(201).send({ data: result });
  });
  app.post("/v1/approvals/:approvalId/delegations", async (request, reply) => {
    const context = await approvalAccess(request, true);
    const { approvalId } = approvalParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await options.approvals!.delegate(context, approvalId, request.body) });
  });
  app.post("/v1/approvals/:approvalId/reminders", async (request, reply) => {
    const context = await approvalAccess(request, true);
    const { approvalId } = approvalParams.parse(request.params);
    const { idempotencyKey } = z
      .object({ idempotencyKey: z.string().min(16).max(160) })
      .strict()
      .parse(request.body);
    return reply
      .code(202)
      .send({ data: await options.approvals!.remind(context, approvalId, idempotencyKey) });
  });
  app.post("/v1/approvals/:approvalId/revocations", async (request, reply) => {
    const context = await approvalAccess(request, true);
    const { approvalId } = approvalParams.parse(request.params);
    return reply
      .code(202)
      .send({ data: await options.approvals!.revoke(context, approvalId, request.body) });
  });

  const agentRepository = () => {
    if (!options.agents) throw new Error("Agents are not configured");
    return options.agents;
  };
  const agentAccess = (request: FastifyRequest, mutation = false) =>
    workflowAccess(request, mutation ? "workflow.manage" : "workflow.read", mutation);
  const agentParams = z.object({ agentId: z.string().uuid() }).strict();
  const agentVersionParams = z
    .object({ agentId: z.string().uuid(), version: z.coerce.number().int().positive() })
    .strict();

  app.get("/v1/workspaces/:workspaceId/agents", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await agentRepository().list(await agentAccess(request), request.query) };
  });
  app.post("/v1/workspaces/:workspaceId/agents", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await agentRepository().create(await agentAccess(request, true), request.body)
    });
  });
  app.get("/v1/agents/:agentId", async (request, reply) => {
    const context = await agentAccess(request);
    const { agentId } = agentParams.parse(request.params);
    const agent = await agentRepository().get(context, agentId);
    if (!agent)
      return reply.code(404).send({
        error: {
          code: "AGENT_NOT_FOUND",
          message: "The agent does not exist.",
          requestId: request.id
        }
      });
    return { data: agent };
  });
  app.patch("/v1/agents/:agentId", async (request) => {
    const context = await agentAccess(request, true);
    const { agentId } = agentParams.parse(request.params);
    return { data: await agentRepository().saveDraft(context, agentId, request.body) };
  });
  app.get("/v1/agents/:agentId/versions", async (request) => {
    const context = await agentAccess(request);
    const { agentId } = agentParams.parse(request.params);
    return { data: await agentRepository().versions(context, agentId) };
  });
  app.post("/v1/agents/:agentId/versions", async (request, reply) => {
    const context = await agentAccess(request, true);
    const { agentId } = agentParams.parse(request.params);
    const body = z
      .object({
        expectedRevision: z.number().int().positive(),
        changeSummary: z.string().min(1).max(1_000)
      })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await agentRepository().publish(
        context,
        agentId,
        body.expectedRevision,
        body.changeSummary
      )
    });
  });
  app.get("/v1/agents/:agentId/versions/:version", async (request, reply) => {
    const context = await agentAccess(request);
    const { agentId, version } = agentVersionParams.parse(request.params);
    const record = await agentRepository().version(context, agentId, version);
    if (!record)
      return reply.code(404).send({
        error: {
          code: "AGENT_VERSION_NOT_FOUND",
          message: "The agent version does not exist.",
          requestId: request.id
        }
      });
    return { data: record };
  });
  app.post("/v1/agents/:agentId/versions/:version/validations", async (request) => {
    const context = await agentAccess(request, true);
    const { agentId, version } = agentVersionParams.parse(request.params);
    const record = await agentRepository().version(context, agentId, version);
    if (!record) throw new Error("AGENT_VERSION_NOT_FOUND");
    return { data: { findings: validateAgentDefinition(record.definition) } };
  });
  app.get("/v1/agents/:agentId/diffs", async (request) => {
    const context = await agentAccess(request);
    const { agentId } = agentParams.parse(request.params);
    const { from, to } = z
      .object({ from: z.coerce.number().int().positive(), to: z.coerce.number().int().positive() })
      .parse(request.query);
    return { data: await agentRepository().diff(context, agentId, from, to) };
  });
  app.post("/v1/agents/:agentId/simulations", async (request, reply) => {
    const context = await agentAccess(request, true);
    const { agentId } = agentParams.parse(request.params);
    return reply
      .code(201)
      .send({ data: await agentRepository().simulate(context, agentId, request.body) });
  });
  app.post("/v1/agents/:agentId/forks", async (request, reply) => {
    const context = await agentAccess(request, true);
    const { agentId } = agentParams.parse(request.params);
    const body = z
      .object({ version: z.number().int().positive(), name: z.string().min(2).max(120) })
      .strict()
      .parse(request.body);
    return reply
      .code(201)
      .send({ data: await agentRepository().fork(context, agentId, body.version, body.name) });
  });
  app.delete("/v1/agents/:agentId", async (request, reply) => {
    const context = await agentAccess(request, true);
    const { agentId } = agentParams.parse(request.params);
    await agentRepository().archive(context, agentId);
    return reply.code(204).send();
  });

  const evaluationRepository = () => {
    if (!options.evaluations) throw new Error("Evaluations are not configured");
    return options.evaluations;
  };
  const datasetParams = z.object({ datasetId: z.string().uuid() }).strict();
  const evalRunParams = z.object({ evalRunId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/eval-datasets", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await evaluationRepository().listDatasets(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/eval-datasets", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await evaluationRepository().createDataset(
        await agentAccess(request, true),
        request.body
      )
    });
  });
  app.get("/v1/eval-datasets/:datasetId", async (request, reply) => {
    const { datasetId } = datasetParams.parse(request.params);
    const result = await evaluationRepository().getDataset(await agentAccess(request), datasetId);
    return result
      ? { data: result }
      : reply.code(404).send({
          error: {
            code: "EVAL_DATASET_NOT_FOUND",
            message: "The evaluation dataset does not exist.",
            requestId: request.id
          }
        });
  });
  const publishDataset = async (request: FastifyRequest, reply: FastifyReply) => {
    const { datasetId } = datasetParams.parse(request.params);
    return reply.code(201).send({
      data: await evaluationRepository().publishDatasetVersion(
        await agentAccess(request, true),
        datasetId,
        request.body
      )
    });
  };
  app.post("/v1/eval-datasets/:datasetId/versions", publishDataset);
  app.post("/v1/eval-datasets/:datasetId/cases", publishDataset);
  app.post("/v1/agents/:agentId/versions/:version/evaluation-runs", async (request, reply) => {
    const { agentId, version } = agentVersionParams.parse(request.params);
    return reply.code(202).send({
      data: await evaluationRepository().createRun(
        await agentAccess(request, true),
        agentId,
        version,
        request.body
      )
    });
  });
  app.get("/v1/eval-runs/:evalRunId", async (request, reply) => {
    const { evalRunId } = evalRunParams.parse(request.params);
    const result = await evaluationRepository().getRun(await agentAccess(request), evalRunId);
    return result
      ? { data: result }
      : reply.code(404).send({
          error: {
            code: "EVAL_RUN_NOT_FOUND",
            message: "The evaluation run does not exist.",
            requestId: request.id
          }
        });
  });
  app.get("/v1/eval-runs/:evalRunId/results", async (request, reply) => {
    const { evalRunId } = evalRunParams.parse(request.params);
    const result = await evaluationRepository().getRun(await agentAccess(request), evalRunId);
    return result
      ? { data: result.results ?? [] }
      : reply.code(404).send({
          error: {
            code: "EVAL_RUN_NOT_FOUND",
            message: "The evaluation run does not exist.",
            requestId: request.id
          }
        });
  });
  app.post("/v1/eval-runs/:evalRunId/cancellations", async (request, reply) => {
    const { evalRunId } = evalRunParams.parse(request.params);
    const result = await evaluationRepository().cancelRun(
      await agentAccess(request, true),
      evalRunId
    );
    return result
      ? reply.code(202).send({ data: result })
      : reply.code(404).send({
          error: {
            code: "EVAL_RUN_NOT_FOUND",
            message: "The evaluation run does not exist.",
            requestId: request.id
          }
        });
  });
  app.get("/v1/eval-comparisons", async (request) => {
    const query = z.object({ agentId: z.string().uuid().optional() }).parse(request.query);
    return {
      data: await evaluationRepository().listComparisons(await agentAccess(request), query.agentId)
    };
  });
  app.post("/v1/agents/:agentId/versions/:version/releases", async (request, reply) => {
    const { agentId, version } = agentVersionParams.parse(request.params);
    const body = request.body as { rollbackReleaseId?: unknown };
    const data =
      typeof body?.rollbackReleaseId === "string"
        ? await evaluationRepository().rollback(
            await agentAccess(request, true),
            body.rollbackReleaseId
          )
        : await evaluationRepository().promote(
            await agentAccess(request, true),
            agentId,
            version,
            request.body
          );
    return reply.code(201).send({ data });
  });

  const fileRepository = () => {
    if (!options.files) throw new Error("Files are not configured");
    return options.files;
  };
  const retrievalRepository = () => {
    if (!options.retrieval) throw new Error("Retrieval is not configured");
    return options.retrieval;
  };
  const knowledgeGraphRepository = () => {
    if (!options.knowledgeGraph) throw new Error("Knowledge graph is not configured");
    return options.knowledgeGraph;
  };
  const connectorRepository = () => {
    if (!options.connectors) throw new Error("Connectors are not configured");
    return options.connectors;
  };
  const triggerRepository = () => {
    if (!options.triggers) throw new Error("Triggers are not configured");
    return options.triggers;
  };
  const notificationRepository = () => {
    if (!options.notifications) throw new Error("Notifications are not configured");
    return options.notifications;
  };
  const analyticsRepository = () => {
    if (!options.analytics) throw new Error("Analytics are not configured");
    return options.analytics;
  };
  const billingRepository = () => {
    if (!options.billing) throw new Error("Billing is not configured");
    return options.billing;
  };
  const developerRepository = () => {
    if (!options.developer) throw new Error("Developer platform is not configured");
    return options.developer;
  };
  const principalSchema = z
    .object({
      name: z.string().min(1).max(120),
      purpose: z.string().min(3).max(500),
      role: z.string().min(1).max(80),
      scopes: z.array(z.string()).min(1).max(100),
      resourceRestrictions: z.record(z.string(), z.unknown()).default({}),
      environment: z.enum(["test", "live"]),
      expiresAt: z.iso.datetime()
    })
    .strict();
  const developerPrincipalParams = z.object({ principalId: z.string().uuid() }).strict(),
    credentialParams = z.object({ credentialId: z.string().uuid() }).strict(),
    oauthClientParams = z.object({ clientId: z.string().uuid() }).strict(),
    webhookParams = z.object({ webhookId: z.string().uuid() }).strict(),
    deliveryParams = z.object({ deliveryId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/service-principals", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await developerRepository().principals(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/service-principals", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await developerRepository().createPrincipal(
        await agentAccess(request, true),
        principalSchema.parse(request.body)
      )
    });
  });
  app.patch("/v1/service-principals/:principalId", async (request) => {
    const { principalId } = developerPrincipalParams.parse(request.params);
    return {
      data: await developerRepository().updatePrincipal(
        await agentAccess(request, true),
        principalId,
        principalSchema
          .partial()
          .extend({ expectedRevision: z.number().int().positive() })
          .parse(request.body)
      )
    };
  });
  app.delete("/v1/service-principals/:principalId", async (request, reply) => {
    const { principalId } = developerPrincipalParams.parse(request.params);
    await developerRepository().deletePrincipal(await agentAccess(request, true), principalId);
    return reply.code(204).send();
  });
  app.get("/v1/service-principals/:principalId/credentials", async (request) => {
    const { principalId } = developerPrincipalParams.parse(request.params);
    return {
      data: await developerRepository().credentials(await agentAccess(request), principalId)
    };
  });
  app.post("/v1/service-principals/:principalId/credentials", async (request, reply) => {
    const { principalId } = developerPrincipalParams.parse(request.params);
    const body = z
      .object({ environment: z.enum(["test", "live"]), expiresAt: z.iso.datetime() })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await developerRepository().createCredential(
        await agentAccess(request, true),
        principalId,
        body
      )
    });
  });
  app.post("/v1/api-credentials/:credentialId/rotations", async (request, reply) => {
    const { credentialId } = credentialParams.parse(request.params);
    return reply.code(201).send({
      data: await developerRepository().rotateCredential(
        await agentAccess(request, true),
        credentialId
      )
    });
  });
  app.delete("/v1/api-credentials/:credentialId", async (request, reply) => {
    const { credentialId } = credentialParams.parse(request.params);
    await developerRepository().deleteCredential(await agentAccess(request, true), credentialId);
    return reply.code(204).send();
  });
  app.get("/v1/workspaces/:workspaceId/oauth-clients", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await developerRepository().oauthClients(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/oauth-clients", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const body = z
      .object({
        name: z.string().min(1).max(120),
        redirectUris: z.array(z.url().refine((value) => value.startsWith("https://"))).min(1),
        scopes: z.array(z.string()).min(1)
      })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await developerRepository().createOauthClient(await agentAccess(request, true), body)
    });
  });
  const oauthClientSchema = z
    .object({
      name: z.string().min(1).max(120),
      redirectUris: z.array(z.url().refine((value) => value.startsWith("https://"))).min(1),
      scopes: z.array(z.string()).min(1),
      state: z.enum(["active", "revoked"]).optional()
    })
    .strict();
  app.get("/v1/oauth-clients/:clientId", async (request) => {
    const { clientId } = oauthClientParams.parse(request.params);
    return { data: await developerRepository().oauthClient(await agentAccess(request), clientId) };
  });
  app.patch("/v1/oauth-clients/:clientId", async (request) => {
    const { clientId } = oauthClientParams.parse(request.params);
    return {
      data: await developerRepository().updateOauthClient(
        await agentAccess(request, true),
        clientId,
        oauthClientSchema
          .partial()
          .extend({ expectedRevision: z.number().int().positive() })
          .parse(request.body)
      )
    };
  });
  app.post("/v1/oauth-clients/:clientId/rotations", async (request, reply) => {
    const { clientId } = oauthClientParams.parse(request.params);
    return reply.code(201).send({
      data: await developerRepository().rotateOauthClient(
        await agentAccess(request, true),
        clientId
      )
    });
  });
  app.delete("/v1/oauth-clients/:clientId", async (request, reply) => {
    const { clientId } = oauthClientParams.parse(request.params);
    await developerRepository().deleteOauthClient(await agentAccess(request, true), clientId);
    return reply.code(204).send();
  });
  const webhookSchema = z
    .object({
      name: z.string().min(1).max(120),
      endpointUrl: z.url().refine((value) => value.startsWith("https://")),
      eventTypes: z.array(z.string()).min(1).max(100)
    })
    .strict();
  app.get("/v1/workspaces/:workspaceId/outgoing-webhooks", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await developerRepository().webhooks(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/outgoing-webhooks", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await developerRepository().createWebhook(
        await agentAccess(request, true),
        webhookSchema.parse(request.body)
      )
    });
  });
  app.patch("/v1/outgoing-webhooks/:webhookId", async (request) => {
    const { webhookId } = webhookParams.parse(request.params);
    return {
      data: await developerRepository().updateWebhook(
        await agentAccess(request, true),
        webhookId,
        webhookSchema
          .partial()
          .extend({
            state: z.enum(["active", "disabled"]).optional(),
            expectedRevision: z.number().int().positive()
          })
          .parse(request.body)
      )
    };
  });
  app.delete("/v1/outgoing-webhooks/:webhookId", async (request, reply) => {
    const { webhookId } = webhookParams.parse(request.params);
    await developerRepository().deleteWebhook(await agentAccess(request, true), webhookId);
    return reply.code(204).send();
  });
  app.get("/v1/outgoing-webhooks/:webhookId/deliveries", async (request) => {
    const { webhookId } = webhookParams.parse(request.params);
    return { data: await developerRepository().deliveries(await agentAccess(request), webhookId) };
  });
  app.post("/v1/webhook-deliveries/:deliveryId/replays", async (request, reply) => {
    const { deliveryId } = deliveryParams.parse(request.params);
    return reply.code(202).send({
      data: await developerRepository().replay(await agentAccess(request, true), deliveryId)
    });
  });
  app.get("/public/v1/health", async (_request, reply) =>
    reply
      .headers({
        "ratelimit-limit": "60",
        "ratelimit-remaining": "59",
        "ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 60)
      })
      .send({ data: { status: "ok", apiVersion: "2026-08-01" } })
  );
  const budgetSchema = z
    .object({
      name: z.string().min(1).max(120),
      currency: z.string().length(3),
      amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/u),
      mode: z.enum(["soft", "hard"]),
      period: z.enum(["monthly", "quarterly", "annual"]),
      scope: z.record(z.string(), z.unknown()).default({})
    })
    .strict();
  const thresholdSchema = z
    .object({
      percent: z.number().positive().max(100),
      action: z.enum(["notify", "stop"]),
      channels: z.array(z.enum(["in_app", "email", "slack", "teams", "webhook"])).min(1)
    })
    .strict();
  const budgetParams = z.object({ budgetId: z.string().uuid() }).strict(),
    thresholdParams = z.object({ thresholdId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/plans", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await billingRepository().plans(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/checkout-sessions", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const body = z
      .object({ planVersionId: z.string().uuid(), returnTarget: z.string().startsWith("/") })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: {
        id: randomUUID(),
        state: "fixture_only",
        planVersionId: body.planVersionId,
        returnTarget: body.returnTarget,
        externalGate: "EXT-005"
      }
    });
  });
  app.post("/v1/workspaces/:workspaceId/billing-portal-sessions", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({ data: { state: "fixture_only", externalGate: "EXT-005" } });
  });
  app.get("/v1/workspaces/:workspaceId/subscription", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await billingRepository().summary(await agentAccess(request)) };
  });
  app.get("/v1/workspaces/:workspaceId/invoices", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: (await billingRepository().summary(await agentAccess(request))).invoices };
  });
  app.get("/v1/workspaces/:workspaceId/usage", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await billingRepository().usage(await agentAccess(request)) };
  });
  app.get("/v1/workspaces/:workspaceId/usage/forecast", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await billingRepository().forecast(await agentAccess(request)) };
  });
  app.get("/v1/workspaces/:workspaceId/budgets", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await billingRepository().budgets(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/budgets", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await billingRepository().createBudget(
        await agentAccess(request, true),
        budgetSchema.parse(request.body)
      )
    });
  });
  app.get("/v1/budgets/:budgetId", async (request, reply) => {
    const { budgetId } = budgetParams.parse(request.params);
    const data = await billingRepository().budget(await agentAccess(request), budgetId);
    return data
      ? { data }
      : reply.code(404).send({
          error: {
            code: "BUDGET_NOT_FOUND",
            message: "The budget does not exist.",
            requestId: request.id
          }
        });
  });
  app.patch("/v1/budgets/:budgetId", async (request) => {
    const { budgetId } = budgetParams.parse(request.params);
    return {
      data: await billingRepository().updateBudget(
        await agentAccess(request, true),
        budgetId,
        budgetSchema
          .partial()
          .extend({ expectedRevision: z.number().int().positive() })
          .parse(request.body)
      )
    };
  });
  app.post("/v1/budgets/:budgetId/thresholds", async (request, reply) => {
    const { budgetId } = budgetParams.parse(request.params);
    return reply.code(201).send({
      data: await billingRepository().addThreshold(
        await agentAccess(request, true),
        budgetId,
        thresholdSchema.parse(request.body)
      )
    });
  });
  app.patch("/v1/budget-thresholds/:thresholdId", async (request) => {
    const { thresholdId } = thresholdParams.parse(request.params);
    return {
      data: await billingRepository().updateThreshold(
        await agentAccess(request, true),
        thresholdId,
        thresholdSchema
          .partial()
          .extend({ expectedRevision: z.number().int().positive() })
          .parse(request.body)
      )
    };
  });
  app.delete("/v1/budget-thresholds/:thresholdId", async (request, reply) => {
    const { thresholdId } = thresholdParams.parse(request.params);
    await billingRepository().deleteThreshold(await agentAccess(request, true), thresholdId);
    return reply.code(204).send();
  });
  app.post("/v1/workspaces/:workspaceId/spend-stops", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const { reason } = z
      .object({ reason: z.string().min(3).max(500) })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await billingRepository().setSpendStop(await agentAccess(request, true), true, reason)
    });
  });
  app.post("/v1/workspaces/:workspaceId/spend-resumptions", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const { reason } = z
      .object({ reason: z.string().min(3).max(500) })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await billingRepository().setSpendStop(await agentAccess(request, true), false, reason)
    });
  });
  const savedViewSchema = z
    .object({
      name: z.string().min(1).max(120),
      resourceType: z.enum(["run", "task", "approval", "agent", "connection"]),
      visibility: z.enum(["private", "workspace"]),
      definition: z
        .object({
          filters: z.record(z.string(), z.unknown()).default({}),
          sort: z.array(z.string()).default([]),
          columns: z.array(z.string()).max(50),
          grouping: z.string().optional()
        })
        .strict()
    })
    .strict();
  const reportSchema = z
    .object({
      name: z.string().min(1).max(120),
      visibility: z.enum(["private", "workspace"]),
      definition: z
        .object({
          metrics: z.array(z.string()).min(1).max(20),
          dimensions: z.array(z.string()).max(10),
          range: z.enum(["7d", "30d", "90d"]),
          visualization: z.enum(["table", "line", "bar"])
        })
        .strict()
    })
    .strict();
  const viewParams = z.object({ viewId: z.string().uuid() }).strict(),
    reportParams = z.object({ reportId: z.string().uuid() }).strict(),
    scheduleParams = z.object({ scheduleId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/search", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const query = z.object({ q: z.string().min(2).max(200) }).parse(request.query);
    return { data: await analyticsRepository().search(await agentAccess(request), query.q) };
  });
  app.get("/v1/workspaces/:workspaceId/saved-views", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await analyticsRepository().savedViews(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/saved-views", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await analyticsRepository().createView(
        await agentAccess(request, true),
        savedViewSchema.parse(request.body)
      )
    });
  });
  app.patch("/v1/saved-views/:viewId", async (request) => {
    const { viewId } = viewParams.parse(request.params);
    return {
      data: await analyticsRepository().updateView(
        await agentAccess(request, true),
        viewId,
        savedViewSchema
          .partial()
          .extend({ expectedRevision: z.number().int().positive() })
          .parse(request.body)
      )
    };
  });
  app.delete("/v1/saved-views/:viewId", async (request, reply) => {
    const { viewId } = viewParams.parse(request.params);
    await analyticsRepository().deleteView(await agentAccess(request, true), viewId);
    return reply.code(204).send();
  });
  app.get("/v1/workspaces/:workspaceId/analytics", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await analyticsRepository().dashboard(await agentAccess(request)) };
  });
  app.get("/v1/workspaces/:workspaceId/reports", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await analyticsRepository().reports(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/reports", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await analyticsRepository().createReport(
        await agentAccess(request, true),
        reportSchema.parse(request.body)
      )
    });
  });
  app.get("/v1/reports/:reportId", async (request, reply) => {
    const { reportId } = reportParams.parse(request.params);
    const data = await analyticsRepository().report(await agentAccess(request), reportId);
    return data
      ? { data }
      : reply.code(404).send({
          error: {
            code: "REPORT_NOT_FOUND",
            message: "The report does not exist.",
            requestId: request.id
          }
        });
  });
  app.post("/v1/reports/:reportId/exports", async (request, reply) => {
    const { reportId } = reportParams.parse(request.params);
    const { format } = z
      .object({ format: z.enum(["csv", "pdf"]) })
      .strict()
      .parse(request.body);
    return reply.code(202).send({
      data: await analyticsRepository().exportReport(
        await agentAccess(request, true),
        reportId,
        format
      )
    });
  });
  app.post("/v1/reports/:reportId/schedules", async (request, reply) => {
    const { reportId } = reportParams.parse(request.params);
    const body = z
      .object({
        cadence: z.enum(["daily", "weekly", "monthly"]),
        timeZone: z.string().min(1).max(120)
      })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await analyticsRepository().scheduleReport(
        await agentAccess(request, true),
        reportId,
        body
      )
    });
  });
  app.patch("/v1/report-schedules/:scheduleId", async (request) => {
    const { scheduleId } = scheduleParams.parse(request.params);
    const body = z
      .object({
        cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
        timeZone: z.string().min(1).max(120).optional(),
        state: z.enum(["active", "paused"]).optional(),
        expectedRevision: z.number().int().positive()
      })
      .strict()
      .parse(request.body);
    return {
      data: await analyticsRepository().updateSchedule(
        await agentAccess(request, true),
        scheduleId,
        body
      )
    };
  });
  app.delete("/v1/report-schedules/:scheduleId", async (request, reply) => {
    const { scheduleId } = scheduleParams.parse(request.params);
    await analyticsRepository().deleteSchedule(await agentAccess(request, true), scheduleId);
    return reply.code(204).send();
  });
  const notificationPreferenceSchema = z
    .object({
      eventType: z.string().min(1).max(160),
      channels: z.record(
        z.enum(["in_app", "email", "slack", "teams", "webhook"]),
        z.enum(["immediate", "daily_digest", "weekly_digest", "off"])
      ),
      quietStart: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
        .optional(),
      quietEnd: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
        .optional(),
      timeZone: z.string().min(1).max(120),
      language: z.string().min(2).max(20),
      expectedRevision: z.number().int().nonnegative().optional()
    })
    .strict();
  const notificationPolicySchema = z
    .object({
      mandatoryEvents: z.array(z.string().min(1).max(160)).min(1).max(100),
      escalationPolicy: z.record(z.string(), z.unknown()),
      rateLimits: z.record(z.string(), z.number().int().positive().max(1_000_000)),
      verifiedEmailDomain: z.string().min(3).max(253).nullable().optional(),
      replyPolicy: z.enum(["no_reply", "support", "workspace_owner"]),
      expectedRevision: z.number().int().nonnegative()
    })
    .strict();
  const notificationItemParams = z.object({ notificationId: z.string().uuid() }).strict();

  app.get("/v1/me/notifications", async (request) => {
    const query = z
      .object({ filter: z.enum(["all", "unread"]).default("all") })
      .parse(request.query);
    return { data: await notificationRepository().list(await agentAccess(request), query.filter) };
  });
  app.post("/v1/me/notifications/:notificationId/read", async (request) => {
    const { notificationId } = notificationItemParams.parse(request.params);
    return {
      data: await notificationRepository().markRead(
        await agentAccess(request, true),
        notificationId
      )
    };
  });
  app.post("/v1/me/notifications/read-all", async (request) => ({
    data: await notificationRepository().markAllRead(await agentAccess(request, true))
  }));
  app.get("/v1/me/notification-preferences", async (request) => ({
    data: await notificationRepository().userPreferences(await agentAccess(request))
  }));
  app.patch("/v1/me/notification-preferences", async (request) => ({
    data: await notificationRepository().updateUserPreferences(
      await agentAccess(request, true),
      z
        .object({ preferences: z.array(notificationPreferenceSchema).max(100) })
        .strict()
        .parse(request.body).preferences
    )
  }));
  app.get("/v1/workspaces/:workspaceId/notification-preferences", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const context = options.workspace
      ? (await options.workspace.require(authenticated.identity, request.id, "workflow.manage"))
          .context
      : tenantContext(options, request, authenticated);
    return { data: await notificationRepository().workspacePolicy(context) };
  });
  app.patch("/v1/workspaces/:workspaceId/notification-preferences", async (request) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const context = options.workspace
      ? (await options.workspace.require(authenticated.identity, request.id, "workflow.manage"))
          .context
      : tenantContext(options, request, authenticated);
    return {
      data: await notificationRepository().updateWorkspacePolicy(
        context,
        notificationPolicySchema.parse(request.body)
      )
    };
  });
  const triggerInputSchema = z
    .object({
      type: z.enum([
        "manual",
        "api",
        "signed_webhook",
        "schedule",
        "connector_event",
        "record_created",
        "record_updated",
        "email",
        "message",
        "calendar",
        "file",
        "parent_workflow"
      ]),
      environment: z.enum(["test", "production"]),
      connectionId: z.string().uuid().optional(),
      schemaVersion: z.string().min(1).max(80),
      filter: z.array(z.record(z.string(), z.unknown())).optional(),
      mappings: z.record(z.string(), z.string()).optional(),
      deduplication: z.enum(["event_id", "source_sequence", "content_window", "none_explicit"]),
      concurrency: z.number().int().min(1).max(100),
      ratePerMinute: z.number().int().min(1).max(100000),
      configuration: z.record(z.string(), z.unknown()).optional(),
      schedule: z
        .object({
          cron: z.string().min(5).max(120),
          timeZone: z.string().min(1).max(120),
          dstPolicy: z.enum(["skip_gap", "next_valid", "both_folds", "first_fold"]),
          missedPolicy: z.enum(["skip", "latest", "catch_up"]),
          jitterSeconds: z.number().int().min(0).max(3600),
          exclusions: z.array(z.string()).max(366).optional(),
          startAt: z.iso.datetime().optional(),
          endAt: z.iso.datetime().optional()
        })
        .optional()
    })
    .strict();
  app.get("/v1/workflows/:workflowId/triggers", async (request) => {
    const { workflowId } = workflowParamsSchema.parse(request.params);
    return { data: await triggerRepository().list(await agentAccess(request), workflowId) };
  });
  app.post("/v1/workflows/:workflowId/triggers", async (request, reply) => {
    const { workflowId } = workflowParamsSchema.parse(request.params);
    const data = await triggerRepository().create(
      await agentAccess(request, true),
      workflowId,
      triggerInputSchema.parse(request.body)
    );
    return reply.code(201).send({ data });
  });
  const triggerParams = z.object({ triggerId: z.string().uuid() }).strict();
  app.patch("/v1/workflow-triggers/:triggerId", async (request) => {
    const { triggerId } = triggerParams.parse(request.params);
    return {
      data: await triggerRepository().patch(
        await agentAccess(request, true),
        triggerId,
        triggerInputSchema.partial().parse(request.body)
      )
    };
  });
  app.post("/v1/workflow-triggers/:triggerId/enables", async (request, reply) => {
    const { triggerId } = triggerParams.parse(request.params);
    return reply.code(202).send({
      data: await triggerRepository().transition(
        await agentAccess(request, true),
        triggerId,
        "enabled"
      )
    });
  });
  app.post("/v1/workflow-triggers/:triggerId/disables", async (request, reply) => {
    const { triggerId } = triggerParams.parse(request.params);
    return reply.code(202).send({
      data: await triggerRepository().transition(
        await agentAccess(request, true),
        triggerId,
        "disabled"
      )
    });
  });
  app.post("/v1/workflow-triggers/:triggerId/secret-rotations", async (request, reply) => {
    const { triggerId } = triggerParams.parse(request.params);
    return reply.code(201).send({
      data: await triggerRepository().rotateSecret(await agentAccess(request, true), triggerId)
    });
  });
  app.get("/v1/workflow-triggers/:triggerId/deliveries", async (request) => {
    const { triggerId } = triggerParams.parse(request.params);
    return { data: await triggerRepository().deliveries(await agentAccess(request), triggerId) };
  });
  app.post("/v1/workflow-triggers/:triggerId/test-events", async (request, reply) => {
    const { triggerId } = triggerParams.parse(request.params);
    const body = z
      .object({
        provider: z.string(),
        sourceId: z.string(),
        eventId: z.string().optional(),
        sequence: z.number().int().optional(),
        occurredAt: z.iso.datetime(),
        schemaVersion: z.string(),
        payloadHash: z.string().min(16),
        encryptedPayloadReference: z.string().startsWith("encrypted://")
      })
      .strict()
      .parse(request.body);
    return reply.code(202).send({
      data: await triggerRepository().ingest(await agentAccess(request, true), triggerId, {
        ...body,
        testOnly: true
      })
    });
  });
  app.delete("/v1/workflow-triggers/:triggerId", async (request, reply) => {
    const { triggerId } = triggerParams.parse(request.params);
    await triggerRepository().remove(await agentAccess(request, true), triggerId);
    return reply.code(202).send({ data: { id: triggerId, state: "disabled" } });
  });
  app.post("/callbacks/v1/workflow-triggers/:endpointKey", async (_request, reply) =>
    reply.code(503).send({
      error: {
        code: "WEBHOOK_TRIGGER_NOT_CONFIGURED",
        message: "No signed webhook endpoint is configured for this deployment.",
        requestId: _request.id
      }
    })
  );
  const governanceRepository = () => {
    if (!options.governance) throw new Error("Governance is not configured");
    return options.governance;
  };
  const exportParams = z.object({ exportId: z.string().uuid() }).strict(),
    deletionParams = z.object({ requestId: z.string().uuid() }).strict(),
    holdParams = z.object({ holdId: z.string().uuid() }).strict(),
    supportParams = z.object({ grantId: z.string().uuid() }).strict();
  const workspaceAccess = async (request: FastifyRequest, mutation = false) => {
    const authenticated = mutation ? await protectMutation(request) : await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return agentAccess(request, mutation);
  };
  app.get("/v1/workspaces/:workspaceId/audit-events", async (request) => ({
    data: await governanceRepository().auditEvents(await workspaceAccess(request))
  }));
  app.post("/v1/workspaces/:workspaceId/audit-exports", async (request, reply) =>
    reply.code(202).send({
      data: await governanceRepository().createExport(
        await workspaceAccess(request, true),
        "audit",
        z
          .object({ query: z.record(z.string(), z.unknown()).default({}) })
          .strict()
          .parse(request.body)
      )
    })
  );
  app.get("/v1/audit-exports/:exportId", async (request) => ({
    data: await governanceRepository().export(
      await agentAccess(request),
      exportParams.parse(request.params).exportId
    )
  }));
  app.post("/v1/workspaces/:workspaceId/data-exports", async (request, reply) =>
    reply.code(202).send({
      data: await governanceRepository().createExport(
        await workspaceAccess(request, true),
        "workspace",
        z
          .object({ query: z.record(z.string(), z.unknown()).default({}) })
          .strict()
          .parse(request.body)
      )
    })
  );
  app.get("/v1/data-exports/:exportId", async (request) => ({
    data: await governanceRepository().export(
      await agentAccess(request),
      exportParams.parse(request.params).exportId
    )
  }));
  app.post("/v1/me/data-exports", async (request, reply) =>
    reply.code(202).send({
      data: await governanceRepository().createExport(await agentAccess(request, true), "user", {
        subjectUserId: (await authenticate(request)).identity.user.id,
        query: {}
      })
    })
  );
  app.post("/v1/me/deletion-requests", async (request, reply) =>
    reply.code(202).send({
      data: await governanceRepository().createDeletion(await agentAccess(request, true), {
        subjectUserId: (await authenticate(request)).identity.user.id,
        scope: "user"
      })
    })
  );
  app.post("/v1/workspaces/:workspaceId/deletion-requests", async (request, reply) =>
    reply.code(202).send({
      data: await governanceRepository().createDeletion(await workspaceAccess(request, true), {
        scope: "workspace"
      })
    })
  );
  app.get("/v1/deletion-requests/:requestId", async (request) => ({
    data: await governanceRepository().deletion(
      await agentAccess(request),
      deletionParams.parse(request.params).requestId
    )
  }));
  const retentionSchema = z
    .array(
      z
        .object({
          dataClass: z.string().min(1).max(80),
          durationDays: z.number().int().min(1).max(3650),
          action: z.enum(["delete", "anonymize", "archive"])
        })
        .strict()
    )
    .min(1);
  app.get("/v1/workspaces/:workspaceId/retention-policies", async (request) => ({
    data: await governanceRepository().retention(await workspaceAccess(request))
  }));
  app.put("/v1/workspaces/:workspaceId/retention-policies", async (request) => ({
    data: await governanceRepository().putRetention(
      await workspaceAccess(request, true),
      retentionSchema.parse(request.body)
    )
  }));
  app.get("/v1/workspaces/:workspaceId/legal-holds", async (request) => ({
    data: await governanceRepository().holds(await workspaceAccess(request))
  }));
  app.post("/v1/workspaces/:workspaceId/legal-holds", async (request, reply) =>
    reply.code(201).send({
      data: await governanceRepository().createHold(
        await workspaceAccess(request, true),
        z
          .object({
            caseReference: z.string().min(1).max(120),
            scope: z.record(z.string(), z.unknown()),
            reason: z.string().min(3).max(500),
            approvedBy: z.string().uuid().optional()
          })
          .strict()
          .parse(request.body)
      )
    })
  );
  app.post("/v1/legal-holds/:holdId/releases", async (request, reply) =>
    reply.code(202).send({
      data: await governanceRepository().releaseHold(
        await agentAccess(request, true),
        holdParams.parse(request.params).holdId
      )
    })
  );
  const dataPolicySchema = z
    .object({
      telemetry: z.enum(["none", "minimal", "standard"]),
      modelProviders: z.array(z.string()),
      connectorPolicy: z.record(z.string(), z.unknown()),
      filePolicy: z.record(z.string(), z.unknown()),
      memoryPolicy: z.record(z.string(), z.unknown()),
      publicSharing: z.boolean(),
      supportAccess: z.boolean(),
      allowedRegion: z.enum(["us", "eu"])
    })
    .strict();
  app.get("/v1/workspaces/:workspaceId/data-policies", async (request) => ({
    data: (await governanceRepository().dataPolicy(await workspaceAccess(request))) ?? null
  }));
  app.put("/v1/workspaces/:workspaceId/data-policies", async (request) => ({
    data: await governanceRepository().putDataPolicy(
      await workspaceAccess(request, true),
      dataPolicySchema.parse(request.body)
    )
  }));
  app.get("/v1/workspaces/:workspaceId/support-access", async (request) => ({
    data: await governanceRepository().supportAccess(await workspaceAccess(request))
  }));
  app.post("/v1/workspaces/:workspaceId/support-access", async (request, reply) =>
    reply.code(201).send({
      data: await governanceRepository().createSupportAccess(
        await workspaceAccess(request, true),
        z
          .object({
            operatorReference: z.string().min(1).max(200),
            scope: z.record(z.string(), z.unknown()),
            reason: z.string().min(3).max(500),
            ticket: z.string().min(1).max(120),
            accessMode: z.enum(["read", "write"]),
            expiresAt: z.iso.datetime()
          })
          .strict()
          .parse(request.body)
      )
    })
  );
  app.delete("/v1/support-access/:grantId", async (request, reply) => {
    await governanceRepository().revokeSupportAccess(
      await agentAccess(request, true),
      supportParams.parse(request.params).grantId
    );
    return reply.code(204).send();
  });
  const enterpriseRepository = () => {
    if (!options.enterprise) throw new Error("Enterprise identity is not configured");
    return options.enterprise;
  };
  const ssoParams = z.object({ connectionId: z.string().uuid() }).strict(),
    domainParams = z.object({ domainId: z.string().uuid() }).strict(),
    scimParams = z.object({ tokenId: z.string().uuid() }).strict(),
    regionParams = z.object({ migrationId: z.string().uuid() }).strict();
  const ssoSchema = z
    .object({
      name: z.string().min(1).max(120),
      protocol: z.enum(["saml", "oidc"]),
      issuer: z.url(),
      metadata: z.record(z.string(), z.unknown()).default({}),
      encryptedConfiguration: z.string().min(16)
    })
    .strict();
  app.get("/v1/workspaces/:workspaceId/sso-connections", async (request) => ({
    data: await enterpriseRepository().connections(await workspaceAccess(request))
  }));
  app.post("/v1/workspaces/:workspaceId/sso-connections", async (request, reply) =>
    reply.code(201).send({
      data: await enterpriseRepository().createConnection(
        await workspaceAccess(request, true),
        ssoSchema.parse(request.body)
      )
    })
  );
  app.patch("/v1/sso-connections/:connectionId", async (request) => {
    const { connectionId } = ssoParams.parse(request.params);
    return {
      data: await enterpriseRepository().updateConnection(
        await agentAccess(request, true),
        connectionId,
        ssoSchema
          .partial()
          .extend({ expectedRevision: z.number().int().positive() })
          .parse(request.body)
      )
    };
  });
  app.post("/v1/sso-connections/:connectionId/tests", async (request, reply) => {
    const { connectionId } = ssoParams.parse(request.params);
    return reply.code(202).send({
      data: await enterpriseRepository().transitionConnection(
        await agentAccess(request, true),
        connectionId,
        "tested"
      )
    });
  });
  app.post("/v1/sso-connections/:connectionId/activations", async (request, reply) => {
    const { connectionId } = ssoParams.parse(request.params);
    return reply.code(202).send({
      data: await enterpriseRepository().transitionConnection(
        await agentAccess(request, true),
        connectionId,
        "active"
      )
    });
  });
  app.post("/v1/sso-connections/:connectionId/rotations", async (request, reply) => {
    const { connectionId } = ssoParams.parse(request.params);
    return reply.code(202).send({
      data: await enterpriseRepository().rotateConnection(
        await agentAccess(request, true),
        connectionId
      )
    });
  });
  app.delete("/v1/sso-connections/:connectionId", async (request, reply) => {
    const { connectionId } = ssoParams.parse(request.params);
    await enterpriseRepository().deleteConnection(await agentAccess(request, true), connectionId);
    return reply.code(204).send();
  });
  app.get("/v1/workspaces/:workspaceId/domains", async (request) => ({
    data: await enterpriseRepository().domains(await workspaceAccess(request))
  }));
  app.post("/v1/workspaces/:workspaceId/domains", async (request, reply) =>
    reply.code(201).send({
      data: await enterpriseRepository().createDomain(
        await workspaceAccess(request, true),
        z
          .object({
            domain: z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/u)
          })
          .strict()
          .parse(request.body)
      )
    })
  );
  app.post("/v1/domains/:domainId/verifications", async (request, reply) => {
    const { domainId } = domainParams.parse(request.params);
    return reply.code(202).send({
      data: await enterpriseRepository().verifyDomain(await agentAccess(request, true), domainId)
    });
  });
  app.patch("/v1/domains/:domainId/enforcement", async (request) => {
    const { domainId } = domainParams.parse(request.params);
    return {
      data: await enterpriseRepository().enforceDomain(
        await agentAccess(request, true),
        domainId,
        z
          .object({ enforcement: z.enum(["none", "discover", "required"]) })
          .strict()
          .parse(request.body)
      )
    };
  });
  app.delete("/v1/domains/:domainId", async (request, reply) => {
    const { domainId } = domainParams.parse(request.params);
    await enterpriseRepository().deleteDomain(await agentAccess(request, true), domainId);
    return reply.code(204).send();
  });
  app.get("/v1/workspaces/:workspaceId/scim-tokens", async (request) => ({
    data: await enterpriseRepository().scimCredentials(await workspaceAccess(request))
  }));
  app.post("/v1/workspaces/:workspaceId/scim-tokens", async (request, reply) =>
    reply.code(201).send({
      data: await enterpriseRepository().createScimCredential(
        await workspaceAccess(request, true),
        z.object({ expiresAt: z.iso.datetime() }).strict().parse(request.body)
      )
    })
  );
  app.post("/v1/scim-tokens/:tokenId/rotations", async (request, reply) => {
    const { tokenId } = scimParams.parse(request.params);
    return reply.code(201).send({
      data: await enterpriseRepository().rotateScimCredential(
        await agentAccess(request, true),
        tokenId
      )
    });
  });
  app.delete("/v1/scim-tokens/:tokenId", async (request, reply) => {
    const { tokenId } = scimParams.parse(request.params);
    await enterpriseRepository().deleteScimCredential(await agentAccess(request, true), tokenId);
    return reply.code(204).send();
  });
  app.get("/v1/workspaces/:workspaceId/enterprise-policies", async (request) => ({
    data: await enterpriseRepository().policies(await workspaceAccess(request))
  }));
  app.put("/v1/workspaces/:workspaceId/enterprise-policies", async (request) => ({
    data: await enterpriseRepository().putPolicy(
      await workspaceAccess(request, true),
      z
        .object({
          policyKey: z.string().min(1).max(100),
          mode: z.enum(["dry_run", "staged", "enforced"]),
          rules: z.record(z.string(), z.unknown()),
          exceptions: z.array(z.unknown()).default([])
        })
        .strict()
        .parse(request.body)
    )
  }));
  app.post("/v1/workspaces/:workspaceId/region-migrations", async (request, reply) =>
    reply.code(202).send({
      data: await enterpriseRepository().createRegionMigration(
        await workspaceAccess(request, true),
        z
          .object({
            sourceRegion: z.enum(["us", "eu"]),
            targetRegion: z.enum(["us", "eu"]),
            checks: z.array(z.unknown()).default([])
          })
          .refine((v) => v.sourceRegion !== v.targetRegion, "Target region must differ")
          .parse(request.body)
      )
    })
  );
  app.get("/v1/region-migrations/:migrationId", async (request) => ({
    data: await enterpriseRepository().regionMigration(
      await agentAccess(request),
      regionParams.parse(request.params).migrationId
    )
  }));
  const connectionParams = z.object({ connectionId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/connections", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const context = await agentAccess(request);
    return {
      data: {
        items: await connectorRepository().connections(context),
        catalog: await connectorRepository().catalog(context)
      }
    };
  });
  app.get("/v1/connections/:connectionId", async (request, reply) => {
    const { connectionId } = connectionParams.parse(request.params);
    const data = await connectorRepository().get(await agentAccess(request), connectionId);
    return data
      ? { data }
      : reply.code(404).send({
          error: {
            code: "CONNECTION_NOT_FOUND",
            message: "The connection does not exist.",
            requestId: request.id
          }
        });
  });
  app.patch("/v1/connections/:connectionId", async (request) => {
    const { connectionId } = connectionParams.parse(request.params);
    return {
      data: await connectorRepository().patch(
        await agentAccess(request, true),
        connectionId,
        request.body
      )
    };
  });
  app.get("/v1/connections/:connectionId/sources", async (request) => {
    const { connectionId } = connectionParams.parse(request.params);
    return {
      data: await connectorRepository().sourceSurface(await agentAccess(request), connectionId)
    };
  });
  app.put("/v1/connections/:connectionId/sources", async (request) => {
    const { connectionId } = connectionParams.parse(request.params);
    return {
      data: await connectorRepository().updateSourceSelection(
        await agentAccess(request, true),
        connectionId,
        request.body
      )
    };
  });
  app.post("/v1/workspaces/:workspaceId/connection-authorizations", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const body = z
      .object({
        connectorKey: z.string(),
        manifestVersion: z.string(),
        displayName: z.string(),
        region: z.string(),
        authMethod: z.string(),
        sessionId: z.string().uuid(),
        browserNonce: z.string(),
        returnTarget: z.string(),
        requestedScopes: z.array(z.string())
      })
      .strict()
      .parse(request.body);
    const context = await agentAccess(request, true);
    const connection = await connectorRepository().create(context, {
      connectorKey: body.connectorKey,
      manifestVersion: body.manifestVersion,
      displayName: body.displayName,
      requestedScopes: body.requestedScopes,
      region: body.region,
      authMethod: body.authMethod
    });
    return reply.code(201).send({
      data: await connectorRepository().startAuthorization(context, String(connection.id), {
        sessionId: body.sessionId,
        browserNonce: body.browserNonce,
        returnTarget: `/app/connections/${String(connection.id)}`,
        requestedScopes: body.requestedScopes
      })
    });
  });
  app.get("/v1/connection-authorizations/:authorizationId", async (request, reply) => {
    const { authorizationId } = z
      .object({ authorizationId: z.string().uuid() })
      .parse(request.params);
    const data = await connectorRepository().authorization(
      await agentAccess(request),
      authorizationId
    );
    return data
      ? { data }
      : reply.code(404).send({
          error: {
            code: "AUTHORIZATION_NOT_FOUND",
            message: "The authorization does not exist.",
            requestId: request.id
          }
        });
  });
  app.get("/callbacks/v1/connections/oauth/:provider", async (request) => {
    const query = z
      .object({
        connection_id: z.string().uuid(),
        state: z.string().min(20),
        granted_scope: z.string().default("objects.read"),
        account_id: z.string().default("fixture-account"),
        account_label: z.string().default("Fixture account")
      })
      .parse(request.query);
    return {
      data: await connectorRepository().activate(
        await agentAccess(request, true),
        query.connection_id,
        {
          state: query.state,
          grantedScopes: query.granted_scope.split(" ").filter(Boolean),
          accountId: query.account_id,
          accountLabel: query.account_label,
          credentialReference: `credential://connections/${query.connection_id}`
        }
      )
    };
  });
  if (options.environment === "local" || options.environment === "ci")
    app.get(`/__local/connectors/fixture/authorize`, async (request, reply) => {
      const query = z
        .object({ state: z.string().min(20), connection_id: z.string().uuid() })
        .parse(request.query);
      return reply.redirect(
        `/callbacks/v1/connections/oauth/fixture?connection_id=${query.connection_id}&state=${encodeURIComponent(query.state)}&granted_scope=objects.read&account_id=fixture-account&account_label=Fixture%20account`
      );
    });
  app.post("/v1/connections/:connectionId/syncs", async (request, reply) => {
    const { connectionId } = connectionParams.parse(request.params);
    return reply.code(202).send({
      data: await connectorRepository().sync(
        await agentAccess(request, true),
        connectionId,
        request.body
      )
    });
  });
  app.get("/v1/connections/:connectionId/syncs", async (request) => {
    const { connectionId } = connectionParams.parse(request.params);
    return { data: await connectorRepository().syncs(await agentAccess(request), connectionId) };
  });
  app.get("/v1/connections/:connectionId/syncs/:syncId", async (request, reply) => {
    const { connectionId, syncId } = z
      .object({ connectionId: z.string().uuid(), syncId: z.string().uuid() })
      .parse(request.params);
    const items = await connectorRepository().syncs(
      await agentAccess(request),
      connectionId,
      syncId
    );
    return items[0]
      ? { data: items[0] }
      : reply.code(404).send({
          error: {
            code: "SYNC_NOT_FOUND",
            message: "The sync does not exist.",
            requestId: request.id
          }
        });
  });
  const transitionConnection =
    (action: string) => async (request: FastifyRequest, reply: FastifyReply) => {
      const { connectionId } = connectionParams.parse(request.params);
      return reply.code(202).send({
        data: await connectorRepository().transition(
          await agentAccess(request, true),
          connectionId,
          action
        )
      });
    };
  app.post("/v1/connections/:connectionId/pauses", transitionConnection("pause"));
  app.post("/v1/connections/:connectionId/resumptions", transitionConnection("resume"));
  app.post("/v1/connections/:connectionId/reauthorizations", transitionConnection("reauthorize"));
  app.post("/v1/connections/:connectionId/reconciliations", transitionConnection("reconcile"));
  app.delete("/v1/connections/:connectionId", async (request, reply) => {
    const { connectionId } = connectionParams.parse(request.params);
    return reply.code(202).send({
      data: await connectorRepository().remove(await agentAccess(request, true), connectionId)
    });
  });
  app.post("/callbacks/v1/provider-webhooks/:provider/:endpointLocator", async (request, reply) =>
    reply.code(503).send({
      error: {
        code: "WEBHOOK_INTAKE_UNAVAILABLE",
        message: "This provider webhook endpoint is not configured.",
        requestId: request.id
      }
    })
  );
  const fileParams = z.object({ fileId: z.string().uuid() }).strict();
  const fileUploadParams = z.object({ uploadId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/files", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const query = z
      .object({ state: z.string().optional(), purpose: z.string().optional() })
      .parse(request.query);
    return { data: await fileRepository().list(await agentAccess(request), query) };
  });
  app.get("/v1/workspaces/:workspaceId/documents", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return {
      data: await fileRepository().list(await agentAccess(request), {
        purpose: "knowledge_source"
      })
    };
  });
  app.post("/v1/workspaces/:workspaceId/file-uploads", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await fileRepository().createUpload(await agentAccess(request, true), request.body)
    });
  });
  app.post("/v1/file-uploads/:uploadId/parts", async (request, reply) => {
    const { uploadId } = fileUploadParams.parse(request.params);
    return reply.code(201).send({
      data: await fileRepository().recordPart(
        await agentAccess(request, true),
        uploadId,
        request.body
      )
    });
  });
  app.post("/v1/file-uploads/:uploadId/completions", async (request) => {
    const { uploadId } = fileUploadParams.parse(request.params);
    return {
      data: await fileRepository().completeUpload(
        await agentAccess(request, true),
        uploadId,
        request.body
      )
    };
  });
  app.get("/v1/files/:fileId", async (request, reply) => {
    const { fileId } = fileParams.parse(request.params);
    const result = await fileRepository().get(await agentAccess(request), fileId);
    return result
      ? { data: result }
      : reply.code(404).send({
          error: {
            code: "FILE_NOT_FOUND",
            message: "The file does not exist.",
            requestId: request.id
          }
        });
  });
  app.get("/v1/documents/:documentId", async (request, reply) => {
    const { documentId } = z
      .object({ documentId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const result = await fileRepository().get(await agentAccess(request), documentId);
    return result
      ? { data: result }
      : reply.code(404).send({
          error: {
            code: "DOCUMENT_NOT_FOUND",
            message: "The document does not exist.",
            requestId: request.id
          }
        });
  });
  app.get("/v1/documents/:documentId/versions", async (request, reply) => {
    const { documentId } = z
      .object({ documentId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const result = await fileRepository().get(await agentAccess(request), documentId);
    return result
      ? { data: result.versions ?? [] }
      : reply.code(404).send({
          error: {
            code: "DOCUMENT_NOT_FOUND",
            message: "The document does not exist.",
            requestId: request.id
          }
        });
  });
  app.get("/v1/documents/:documentId/citations", async (request, reply) => {
    const { documentId } = z
      .object({ documentId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const query = z
      .object({ manifestId: z.string().uuid().optional(), chunkId: z.string().uuid().optional() })
      .strict()
      .parse(request.query);
    const proof = request.headers["x-knotline-authorization-proof"];
    if (query.manifestId && query.chunkId && typeof proof === "string" && options.retrieval)
      return {
        data: await retrievalRepository().openCitation(
          await agentAccess(request),
          query.manifestId,
          query.chunkId,
          proof
        )
      };
    const result = await fileRepository().get(await agentAccess(request), documentId);
    return result
      ? { data: result.processing_jobs ?? [] }
      : reply.code(404).send({
          error: {
            code: "DOCUMENT_NOT_FOUND",
            message: "The document does not exist.",
            requestId: request.id
          }
        });
  });
  app.post("/v1/documents/:documentId/reprocessings", async (request, reply) => {
    const { documentId } = z
      .object({ documentId: z.string().uuid() })
      .strict()
      .parse(request.params);
    return reply.code(202).send({
      data: await fileRepository().retryProcessing(await agentAccess(request, true), documentId)
    });
  });
  app.post("/v1/documents/:documentId/indexings", async (request, reply) => {
    const { documentId } = z
      .object({ documentId: z.string().uuid() })
      .strict()
      .parse(request.params);
    return reply.code(202).send({
      data: await retrievalRepository().indexDocument(
        await agentAccess(request, true),
        documentId,
        request.body
      )
    });
  });
  app.post("/v1/workspaces/:workspaceId/authorization-proofs", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await retrievalRepository().mintAuthorizationProof(
        await agentAccess(request, true),
        request.body
      )
    });
  });
  app.post("/v1/workspaces/:workspaceId/search", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await retrievalRepository().search(await agentAccess(request), request.body) };
  });
  app.post("/v1/workspaces/:workspaceId/retrieval-debug", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return {
      data: await retrievalRepository().search(await agentAccess(request), request.body, true)
    };
  });
  app.post("/v1/knowledge-sources/:sourceId/acl-projections", async (request, reply) => {
    const { sourceId } = z.object({ sourceId: z.string().uuid() }).strict().parse(request.params);
    return reply.code(201).send({
      data: await retrievalRepository().advanceAcl(
        await agentAccess(request, true),
        sourceId,
        request.body
      )
    });
  });
  app.post("/v1/workspaces/:workspaceId/knowledge-reindexes", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(202).send({
      data: await retrievalRepository().reindex(await agentAccess(request, true), request.body)
    });
  });
  const entityParams = z.object({ entityId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/entities", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return {
      data: await knowledgeGraphRepository().list(await agentAccess(request), request.query)
    };
  });
  app.post("/v1/workspaces/:workspaceId/entities", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await knowledgeGraphRepository().create(await agentAccess(request, true), request.body)
    });
  });
  app.get("/v1/entities/:entityId", async (request, reply) => {
    const { entityId } = entityParams.parse(request.params);
    const data = await knowledgeGraphRepository().get(await agentAccess(request), entityId);
    return data
      ? { data }
      : reply.code(404).send({
          error: {
            code: "ENTITY_NOT_FOUND",
            message: "The entity does not exist.",
            requestId: request.id
          }
        });
  });
  app.patch("/v1/entities/:entityId", async (request) => {
    const { entityId } = entityParams.parse(request.params);
    return {
      data: await knowledgeGraphRepository().patch(
        await agentAccess(request, true),
        entityId,
        request.body
      )
    };
  });
  app.get("/v1/entities/:entityId/relations", async (request) => {
    const { entityId } = entityParams.parse(request.params);
    return {
      data: await knowledgeGraphRepository().relations(
        await agentAccess(request),
        entityId,
        request.query
      )
    };
  });
  app.post("/v1/entities/:entityId/relations", async (request, reply) => {
    const { entityId } = entityParams.parse(request.params);
    return reply.code(201).send({
      data: await knowledgeGraphRepository().addRelation(
        await agentAccess(request, true),
        entityId,
        request.body
      )
    });
  });
  app.post("/v1/entities/:entityId/merges", async (request, reply) => {
    const { entityId } = entityParams.parse(request.params);
    return reply.code(201).send({
      data: await knowledgeGraphRepository().merge(
        await agentAccess(request, true),
        entityId,
        request.body
      )
    });
  });
  app.post("/v1/entities/:entityId/splits", async (request, reply) => {
    const { entityId } = entityParams.parse(request.params);
    return reply.code(201).send({
      data: await knowledgeGraphRepository().split(
        await agentAccess(request, true),
        entityId,
        request.body
      )
    });
  });
  app.post("/v1/entities/:entityId/exports", async (request, reply) => {
    const { entityId } = entityParams.parse(request.params);
    const body = z
      .object({ authorizationProof: z.string().min(16) })
      .strict()
      .parse(request.body);
    return reply.code(201).send({
      data: await knowledgeGraphRepository().export(
        await agentAccess(request, true),
        entityId,
        body.authorizationProof
      )
    });
  });
  app.get("/v1/workspaces/:workspaceId/knowledge-admin", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await knowledgeGraphRepository().admin(await agentAccess(request, true)) };
  });
  app.delete("/v1/documents/:documentId", async (request) => {
    const { documentId } = z
      .object({ documentId: z.string().uuid() })
      .strict()
      .parse(request.params);
    const retrieval = options.retrieval
      ? await retrievalRepository().deleteDocument(await agentAccess(request, true), documentId)
      : undefined;
    return {
      data: {
        ...(await fileRepository().delete(
          await agentAccess(request, true),
          documentId,
          "document_deleted"
        )),
        retrieval
      }
    };
  });
  app.get("/v1/workspaces/:workspaceId/knowledge-types", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await knowledgeGraphRepository().listTypes(await agentAccess(request, true)) };
  });
  app.post("/v1/workspaces/:workspaceId/knowledge-types", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await knowledgeGraphRepository().publishType(
        await agentAccess(request, true),
        request.body
      )
    });
  });
  app.delete("/v1/knowledge-types/:typeId", async (request, reply) => {
    const { typeId } = z.object({ typeId: z.string().uuid() }).strict().parse(request.params);
    await knowledgeGraphRepository().deleteType(await agentAccess(request, true), typeId);
    return reply.code(204).send();
  });
  app.get("/v1/files/:fileId/preview", async (request) => {
    const { fileId } = fileParams.parse(request.params);
    return { data: await fileRepository().preview(await agentAccess(request), fileId) };
  });
  app.post("/v1/files/:fileId/processing-retries", async (request, reply) => {
    const { fileId } = fileParams.parse(request.params);
    return reply.code(202).send({
      data: await fileRepository().retryProcessing(await agentAccess(request, true), fileId)
    });
  });
  app.post("/v1/files/:fileId/download-tokens", async (request, reply) => {
    const { fileId } = fileParams.parse(request.params);
    return reply.code(201).send({
      data: await fileRepository().createDownloadToken(
        await agentAccess(request, true),
        fileId,
        request.body
      )
    });
  });
  app.get("/v1/file-downloads/:token", async (request) => {
    const { token } = z
      .object({ token: z.string().min(20).max(200) })
      .strict()
      .parse(request.params);
    return { data: await fileRepository().consumeDownloadToken(await agentAccess(request), token) };
  });
  app.delete("/v1/files/:fileId", async (request) => {
    const { fileId } = fileParams.parse(request.params);
    const body = z
      .object({ reason: z.string().min(3).max(500) })
      .strict()
      .parse(request.body ?? { reason: "user_deleted" });
    return {
      data: await fileRepository().delete(await agentAccess(request, true), fileId, body.reason)
    };
  });

  const modelRepository = () => {
    if (!options.models) throw new Error("Models are not configured");
    return options.models;
  };
  const modelPolicyParams = z.object({ policyId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/model-policies", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await modelRepository().listPolicies(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/model-policies", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await modelRepository().createPolicy(await agentAccess(request, true), request.body)
    });
  });
  app.get("/v1/model-policies/:policyId", async (request, reply) => {
    const { policyId } = modelPolicyParams.parse(request.params);
    const result = await modelRepository().getPolicy(await agentAccess(request), policyId);
    if (!result)
      return reply.code(404).send({
        error: {
          code: "MODEL_POLICY_NOT_FOUND",
          message: "The model policy does not exist.",
          requestId: request.id
        }
      });
    return { data: result };
  });
  app.patch("/v1/model-policies/:policyId", async (request) => {
    const { policyId } = modelPolicyParams.parse(request.params);
    return {
      data: await modelRepository().updatePolicy(
        await agentAccess(request, true),
        policyId,
        request.body
      )
    };
  });
  app.get("/v1/workspaces/:workspaceId/models", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await modelRepository().listModels(await agentAccess(request)) };
  });

  const toolRepository = () => {
    if (!options.tools) throw new Error("Tools are not configured");
    return options.tools;
  };
  const toolParams = z.object({ toolId: z.string().uuid() }).strict();
  app.get("/v1/workspaces/:workspaceId/tools", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return { data: await toolRepository().listTools(await agentAccess(request)) };
  });
  app.post("/v1/workspaces/:workspaceId/tools", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    return reply.code(201).send({
      data: await toolRepository().createTool(await agentAccess(request, true), request.body)
    });
  });
  app.get("/v1/tools/:toolId", async (request, reply) => {
    const { toolId } = toolParams.parse(request.params);
    const result = await toolRepository().getTool(await agentAccess(request), toolId);
    if (!result)
      return reply.code(404).send({
        error: {
          code: "TOOL_NOT_FOUND",
          message: "The tool does not exist.",
          requestId: request.id
        }
      });
    return { data: result };
  });
  app.post("/v1/tools/:toolId/versions", async (request, reply) => {
    const { toolId } = toolParams.parse(request.params);
    return reply.code(201).send({
      data: await toolRepository().addVersion(
        await agentAccess(request, true),
        toolId,
        request.body
      )
    });
  });
  app.post("/v1/tools/:toolId/disables", async (request, reply) => {
    const { toolId } = toolParams.parse(request.params);
    await toolRepository().setToolState(await agentAccess(request, true), toolId, false);
    return reply.code(204).send();
  });
  app.post("/v1/tools/:toolId/enables", async (request, reply) => {
    const { toolId } = toolParams.parse(request.params);
    await toolRepository().setToolState(await agentAccess(request, true), toolId, true);
    return reply.code(204).send();
  });

  const memoryRepository = () => {
    if (!options.memory) throw new Error("Memory is not configured");
    return options.memory;
  };
  const memoryParams = z.object({ memoryId: z.string().uuid() }).strict();
  app.get("/v1/agents/:agentId/memory-policy", async (request, reply) => {
    const { agentId } = agentParams.parse(request.params);
    const result = await memoryRepository().getPolicy(await agentAccess(request), agentId);
    if (!result)
      return reply.code(404).send({
        error: {
          code: "MEMORY_POLICY_NOT_FOUND",
          message: "The memory policy does not exist.",
          requestId: request.id
        }
      });
    return { data: result };
  });
  app.put("/v1/agents/:agentId/memory-policy", async (request) => {
    const { agentId } = agentParams.parse(request.params);
    return {
      data: await memoryRepository().setPolicy(
        await agentAccess(request, true),
        agentId,
        request.body
      )
    };
  });
  app.get("/v1/me/memory-records", async (request) => {
    const authenticated = await authenticate(request);
    const query = z.object({ q: z.string().max(200).optional() }).parse(request.query);
    return {
      data: await memoryRepository().listMine(
        tenantContext(options, request, authenticated),
        query.q
      )
    };
  });
  app.get("/v1/me/memory-records/:memoryId", async (request, reply) => {
    const authenticated = await authenticate(request);
    const { memoryId } = memoryParams.parse(request.params);
    const result = await memoryRepository().getMine(
      tenantContext(options, request, authenticated),
      memoryId
    );
    if (!result)
      return reply.code(404).send({
        error: {
          code: "MEMORY_NOT_FOUND",
          message: "The memory record does not exist.",
          requestId: request.id
        }
      });
    return { data: result };
  });
  app.post("/v1/me/memory-records/:memoryId/corrections", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { memoryId } = memoryParams.parse(request.params);
    return reply.code(201).send({
      data: await memoryRepository().correctMine(
        tenantContext(options, request, authenticated),
        memoryId,
        request.body
      )
    });
  });
  app.delete("/v1/me/memory-records/:memoryId", async (request, reply) => {
    const authenticated = await protectMutation(request);
    const { memoryId } = memoryParams.parse(request.params);
    await memoryRepository().deleteMine(tenantContext(options, request, authenticated), memoryId);
    return reply.code(204).send();
  });
  app.post("/v1/me/memory-exports", async (request, reply) => {
    const authenticated = await protectMutation(request);
    return reply.code(201).send({
      data: await memoryRepository().exportMine(tenantContext(options, request, authenticated))
    });
  });
  app.get("/v1/workspaces/:workspaceId/memory-records", async (request) => {
    const authenticated = await authenticate(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    requireActiveWorkspace(authenticated, workspaceId);
    const query = z.object({ agentId: z.string().uuid().optional() }).parse(request.query);
    return {
      data: await memoryRepository().listWorkspace(await agentAccess(request), query.agentId)
    };
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HumanTaskConflictError)
      return reply
        .code(409)
        .send({ error: { code: "TASK_CONFLICT", message: error.message, requestId: request.id } });
    if (error instanceof HumanTaskAuthorizationError)
      return reply.code(403).send({
        error: {
          code: "TASK_FORBIDDEN",
          message: "The task cannot be changed by this identity.",
          requestId: request.id
        }
      });
    if (error instanceof AuthFailure) {
      if (error.statusCode === 401) reply.header("set-cookie", clearAuthCookies());
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId: request.id }
      });
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request was not valid.",
          requestId: request.id,
          details: z.flattenError(error).fieldErrors
        }
      });
    }
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: {
          code:
            statusCode === 415
              ? "UNSUPPORTED_MEDIA_TYPE"
              : statusCode === 413
                ? "PAYLOAD_TOO_LARGE"
                : "BAD_REQUEST",
          message:
            statusCode === 415
              ? "The request media type is not supported."
              : statusCode === 413
                ? "The request payload is too large."
                : "The request was not valid.",
          requestId: request.id
        }
      });
    }
    const context = requestContexts.get(request);
    request.log.error(
      {
        structured: createLogRecord({
          level: "error",
          event: "http.request.failed",
          message: "Request failed",
          context: {
            service: "knotline-api",
            environment: options.environment,
            ...(context ? { requestId: context.requestId, traceId: context.traceId } : {})
          },
          attributes: { error }
        })
      },
      "Request failed"
    );
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The service could not complete the request.",
        requestId: request.id
      }
    });
  });

  return app;
}
