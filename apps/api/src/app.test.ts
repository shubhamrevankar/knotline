import { afterEach, describe, expect, it } from "vitest";
import {
  HTTP_ROUTE_CONTRACTS,
  OPERATIONAL_PROBE_CONTRACTS,
  apiEnvelope,
  apiErrorSchema,
  bootstrapSchema,
  workflowSchema
} from "@knotline/contracts";

import { buildApp } from "./app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function app() {
  const selected = await buildApp({
    environment: "test",
    logLevel: false,
    webOrigin: "http://localhost:5173"
  });
  apps.push(selected);
  return selected;
}

describe("API application", () => {
  it("serves separate liveness and readiness endpoints", async () => {
    const selected = await app();
    const [health, ready] = await Promise.all([
      selected.inject({ method: "GET", url: "/health" }),
      selected.inject({ method: "GET", url: "/ready" })
    ]);
    expect(health.statusCode).toBe(200);
    OPERATIONAL_PROBE_CONTRACTS[0].responses[200].parse(health.json());
    expect(health.json()).toMatchObject({ status: "ok", service: "knotline-api" });
    expect(ready.statusCode).toBe(200);
    OPERATIONAL_PROBE_CONTRACTS[1].responses[200].parse(ready.json());
    expect(ready.json()).toEqual({ status: "ready", service: "knotline-api" });
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
      url: "/v1/teams/team_demo/workflows",
      headers: { "content-type": "application/json" },
      payload: '{"name":'
    });
    expect(malformed.statusCode).toBe(400);
    const malformedBody = apiErrorSchema.parse(malformed.json());
    expect(malformedBody.error.code).toBe("BAD_REQUEST");

    const unsupported = await selected.inject({
      method: "POST",
      url: "/v1/teams/team_demo/workflows",
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
      url: "/v1/teams/team_demo/workflows",
      payload: { name: "Demo workflow", unknown: true }
    });
    expect(invalid.statusCode).toBe(400);
    const invalidBody = apiErrorSchema.parse(invalid.json());
    expect(invalidBody.error.code).toBe("VALIDATION_ERROR");

    const isolated = await selected.inject({
      method: "GET",
      url: "/v1/teams/team_unknown/workflows"
    });
    expect(isolated.statusCode).toBe(200);
    HTTP_ROUTE_CONTRACTS.find(
      (route) => route.operationId === "listWorkflows"
    )?.responses[200]?.parse(isolated.json());
    expect(isolated.json()).toEqual({ data: [] });

    const created = await selected.inject({
      method: "POST",
      url: "/v1/teams/team_demo/workflows",
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
