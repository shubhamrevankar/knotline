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
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";

import { createWorkflow, getWorkflow, listWorkflows } from "./catalog.js";

export interface BuildAppOptions {
  readonly environment: string;
  readonly logLevel?: string | false;
  readonly webOrigin: string;
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

function requestIdentifier(header: unknown): string {
  return (typeof header === "string" ? parseRequestId(header) : undefined) ?? createRequestId();
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const requestContexts = new WeakMap<FastifyRequest, RequestTraceContext>();
  const app = Fastify({
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
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
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

  app.get("/health", () => ({
    status: "ok" as const,
    service: "knotline-api" as const,
    time: new Date().toISOString()
  }));

  app.get("/ready", () => ({ status: "ready" as const, service: "knotline-api" as const }));

  app.get("/v1/bootstrap", () => ({
    capabilityStatus: "DEMO" as const,
    user: { id: "user_maya", name: "Maya Chen", email: "maya@northstar.example" },
    activeTeam: { id: "team_northstar", name: "Northstar Studio", role: "owner" as const },
    entitlements: { agents: true, integrations: true, audit: true }
  }));

  app.get<{ Reply: ApiEnvelope<WorkflowSummary[]> }>("/v1/teams/:teamId/workflows", (request) => {
    const params = teamParamsSchema.parse(request.params);
    return { data: listWorkflows(params.teamId) };
  });

  app.post<{ Reply: ApiEnvelope<Workflow> }>(
    "/v1/teams/:teamId/workflows",
    async (request, reply) => {
      const params = teamParamsSchema.parse(request.params);
      const body = createWorkflowRequestSchema.parse(request.body);
      const workflow = createWorkflow({
        teamId: params.teamId,
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
      const workflow = getWorkflow(params.workflowId);
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
