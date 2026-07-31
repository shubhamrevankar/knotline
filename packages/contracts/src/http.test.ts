import { describe, expect, it } from "vitest";

import {
  HTTP_ROUTE_CONTRACTS,
  OPERATIONAL_PROBE_CONTRACTS,
  bootstrapSchema,
  createWorkflowRequestSchema,
  workflowSchema
} from "./http.js";

describe("HTTP contracts", () => {
  it("uses unique operation IDs and method/path pairs", () => {
    expect(new Set(HTTP_ROUTE_CONTRACTS.map((route) => route.operationId)).size).toBe(
      HTTP_ROUTE_CONTRACTS.length
    );
    expect(new Set(HTTP_ROUTE_CONTRACTS.map((route) => `${route.method} ${route.path}`)).size).toBe(
      HTTP_ROUTE_CONTRACTS.length
    );
    expect(OPERATIONAL_PROBE_CONTRACTS.map((route) => route.path)).toEqual(["/health", "/ready"]);
  });

  it("keeps the current bootstrap explicitly demo-labelled", () => {
    expect(
      bootstrapSchema.parse({
        capabilityStatus: "DEMO",
        user: { id: "user_demo", name: "Demo User", email: "demo@example.test" },
        activeTeam: { id: "team_demo", name: "Demo Workspace", role: "owner" },
        entitlements: { agents: true, integrations: true, audit: true }
      }).capabilityStatus
    ).toBe("DEMO");
  });

  it("rejects unknown request fields and malformed workflow timestamps", () => {
    expect(() => createWorkflowRequestSchema.parse({ name: "Valid", unknown: true })).toThrow();
    expect(() =>
      workflowSchema.parse({
        id: "wf_demo",
        teamId: "team_demo",
        name: "Demo workflow",
        description: "",
        status: "draft",
        version: 1,
        updatedAt: "not-an-instant",
        nodes: [],
        edges: []
      })
    ).toThrow();
  });
});
