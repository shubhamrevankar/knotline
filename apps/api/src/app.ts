import cors from "@fastify/cors";
import {
  createWorkflowRequestSchema,
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
import type { TenantContext, WorkflowRepository } from "@knotline/db";
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

export interface BuildAppOptions {
  readonly environment: string;
  readonly logLevel?: string | false;
  readonly webOrigin: string;
  readonly repository: WorkflowRepository;
  readonly auth: AuthService;
  readonly workspace?: WorkspaceService;
  readonly captureMailer?: CaptureAuthMailer;
  readonly captureInvitationMailer?: CaptureInvitationMailer;
  readonly trustedProxy?: string;
  readonly mutationsDisabled?: boolean;
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

  app.setErrorHandler((error, request, reply) => {
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
