import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { createWorkflow, getWorkflow, listWorkflows } from "./catalog.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    redact: ["req.headers.authorization", "req.headers.cookie"]
  },
  genReqId: (request) =>
    request.headers["x-request-id"]?.toString() ?? `req_${crypto.randomUUID()}`
});

await app.register(cors, {
  origin: process.env.KNOTLINE_WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true
});

app.addHook("onSend", async (request, reply) => {
  reply.header("x-request-id", request.id);
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "strict-origin-when-cross-origin");
});

app.get("/health", async () => ({
  status: "ok",
  service: "knotline-api",
  time: new Date().toISOString()
}));

app.get("/v1/bootstrap", async () => ({
  user: {
    id: "user_maya",
    name: "Maya Chen",
    email: "maya@northstar.example"
  },
  activeTeam: {
    id: "team_northstar",
    name: "Northstar Studio",
    role: "owner"
  },
  entitlements: {
    agents: true,
    integrations: true,
    audit: true
  }
}));

app.get("/v1/teams/:teamId/workflows", async (request) => {
  const params = z.object({ teamId: z.string().min(1) }).parse(request.params);
  return { data: listWorkflows(params.teamId) };
});

app.post("/v1/teams/:teamId/workflows", async (request, reply) => {
  const params = z.object({ teamId: z.string().min(1) }).parse(request.params);
  const body = z
    .object({
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).optional()
    })
    .parse(request.body);

  const workflow = createWorkflow({
    teamId: params.teamId,
    name: body.name,
    ...(body.description === undefined ? {} : { description: body.description })
  });
  return reply.code(201).send({ data: workflow });
});

app.get("/v1/workflows/:workflowId", async (request, reply) => {
  const params = z.object({ workflowId: z.string().min(1) }).parse(request.params);
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
});

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
  request.log.error({ err: error }, "request failed");
  return reply.code(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "The service could not complete the request.",
      requestId: request.id
    }
  });
});

const port = Number(process.env.KNOTLINE_API_PORT ?? 4100);
await app.listen({ host: "0.0.0.0", port });
