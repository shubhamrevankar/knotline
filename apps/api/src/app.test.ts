import { afterEach, describe, expect, it } from "vitest";
import {
  HTTP_ROUTE_CONTRACTS,
  OPERATIONAL_PROBE_CONTRACTS,
  apiEnvelope,
  apiErrorSchema,
  bootstrapSchema,
  workflowSchema
} from "@knotline/contracts";
import type { TenantContext, WorkflowRepository, WorkspaceBootstrap } from "@knotline/db";
import type { Workflow, WorkflowSummary } from "@knotline/contracts";

import { buildApp } from "./app.js";
import type { AuthService } from "./auth.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const workspaceId = "10000000-0000-4000-8000-000000000001";
const principalId = "20000000-0000-4000-8000-000000000001";

class TestRepository implements WorkflowRepository {
  readonly workflows = new Map<string, Workflow>();
  isReady = true;

  bootstrap(): Promise<WorkspaceBootstrap> {
    return Promise.resolve({
      user: { id: principalId, name: "Maya Chen", email: "maya@northstar.example" },
      activeTeam: { id: workspaceId, name: "Northstar Studio", role: "owner" }
    });
  }

  list(): Promise<readonly WorkflowSummary[]> {
    return Promise.resolve(
      [...this.workflows.values()].map((workflow) => ({
        id: workflow.id,
        teamId: workflow.teamId,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        version: workflow.version,
        updatedAt: workflow.updatedAt,
        nodeCount: workflow.nodes.length,
        activeRuns: 0
      }))
    );
  }

  get(context: TenantContext, workflowId: string): Promise<Workflow | undefined> {
    void context;
    return Promise.resolve(this.workflows.get(workflowId));
  }

  create(
    context: TenantContext,
    input: { readonly name: string; readonly description?: string }
  ): Promise<Workflow> {
    void context;
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      teamId: workspaceId,
      name: input.name,
      description: input.description ?? "",
      status: "draft",
      version: 1,
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: []
    };
    this.workflows.set(workflow.id, workflow);
    return Promise.resolve(workflow);
  }

  ready(): Promise<boolean> {
    return Promise.resolve(this.isReady);
  }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function app(isReady = true) {
  const repository = new TestRepository();
  repository.isReady = isReady;
  const selected = await buildApp({
    environment: "test",
    logLevel: false,
    webOrigin: "http://localhost:5173",
    repository,
    auth: {
      authenticate: () =>
        Promise.resolve({
          identity: {
            sessionId: "30000000-0000-4000-8000-000000000001",
            familyId: "30000000-0000-4000-8000-000000000002",
            user: {
              id: principalId,
              email: "maya@northstar.example",
              displayName: "Maya Chen",
              status: "active",
              locale: "en",
              timezone: "UTC"
            },
            activeWorkspaceId: workspaceId,
            issuedAt: new Date(0).toISOString(),
            lastUsedAt: new Date(0).toISOString(),
            idleExpiresAt: new Date(86_400_000).toISOString(),
            absoluteExpiresAt: new Date(86_400_000).toISOString(),
            deviceSummary: "Test browser"
          },
          csrfToken: "test-csrf"
        }),
      verifyMutation: () => undefined
    } as unknown as AuthService
  });
  apps.push(selected);
  return selected;
}

describe("API application", () => {
  it("serves separate liveness and readiness endpoints", async () => {
    const selected = await app();
    const [health, ready] = await Promise.all([
      selected.inject({ method: "GET", url: "/health/live" }),
      selected.inject({ method: "GET", url: "/health/ready" })
    ]);
    expect(health.statusCode).toBe(200);
    OPERATIONAL_PROBE_CONTRACTS[0].responses[200].parse(health.json());
    expect(health.json()).toMatchObject({ status: "ok", service: "knotline-api" });
    expect(ready.statusCode).toBe(200);
    OPERATIONAL_PROBE_CONTRACTS[1].responses[200].parse(ready.json());
    expect(ready.json()).toEqual({ status: "ready", service: "knotline-api" });

    const incompatible = await app(false);
    const unavailable = await incompatible.inject({ method: "GET", url: "/health/ready" });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ status: "unavailable", service: "knotline-api" });
  });

  it("labels the hard-coded bootstrap as demo and returns canonical request IDs", async () => {
    const selected = await app();
    const response = await selected.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { "knotline-request-id": "request-demo-0001" }
    });
    expect(response.statusCode).toBe(200);
    HTTP_ROUTE_CONTRACTS.find(
      (route) => route.operationId === "getDemoBootstrap"
    )?.responses[200]?.parse(response.json());
    expect(response.headers["knotline-request-id"]).toBe("request-demo-0001");
    const bootstrap = bootstrapSchema.parse(response.json());
    expect(bootstrap.capabilityStatus).toBe("DEMO");

    const legacy = await selected.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { "x-request-id": "request-legacy-0001", origin: "http://localhost:5173" }
    });
    expect(legacy.headers["knotline-request-id"]).toBe("request-legacy-0001");
    expect(legacy.headers["access-control-expose-headers"]).toContain("Knotline-Request-Id");
  });

  it("preserves typed client errors for malformed JSON and unsupported media", async () => {
    const selected = await app();
    const malformed = await selected.inject({
      method: "POST",
      url: `/v1/teams/${workspaceId}/workflows`,
      headers: { "content-type": "application/json" },
      payload: '{"name":'
    });
    expect(malformed.statusCode).toBe(400);
    const malformedBody = apiErrorSchema.parse(malformed.json());
    expect(malformedBody.error.code).toBe("BAD_REQUEST");

    const unsupported = await selected.inject({
      method: "POST",
      url: `/v1/teams/${workspaceId}/workflows`,
      headers: { "content-type": "application/xml" },
      payload: "<workflow />"
    });
    expect(unsupported.statusCode).toBe(415);
    const unsupportedBody = apiErrorSchema.parse(unsupported.json());
    expect(unsupportedBody.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects unknown create fields and keeps tenant list isolation", async () => {
    const selected = await app();
    const invalid = await selected.inject({
      method: "POST",
      url: `/v1/teams/${workspaceId}/workflows`,
      payload: { name: "Demo workflow", unknown: true }
    });
    expect(invalid.statusCode).toBe(400);
    const invalidBody = apiErrorSchema.parse(invalid.json());
    expect(invalidBody.error.code).toBe("VALIDATION_ERROR");

    const isolated = await selected.inject({
      method: "GET",
      url: "/v1/teams/10000000-0000-4000-8000-000000000099/workflows"
    });
    expect(isolated.statusCode).toBe(404);
    expect(apiErrorSchema.parse(isolated.json()).error.code).toBe("WORKSPACE_NOT_FOUND");

    const created = await selected.inject({
      method: "POST",
      url: `/v1/teams/${workspaceId}/workflows`,
      payload: { name: "Contract verified workflow" }
    });
    expect(created.statusCode).toBe(201);
    HTTP_ROUTE_CONTRACTS.find(
      (route) => route.operationId === "createWorkflow"
    )?.responses[201]?.parse(created.json());
    const createdBody = apiEnvelope(workflowSchema).parse(created.json());

    const detail = await selected.inject({
      method: "GET",
      url: `/v1/workflows/${createdBody.data.id}`
    });
    expect(detail.statusCode).toBe(200);
    HTTP_ROUTE_CONTRACTS.find(
      (route) => route.operationId === "getWorkflow"
    )?.responses[200]?.parse(detail.json());
  });
});
