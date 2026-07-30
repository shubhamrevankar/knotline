import { describe, expect, it } from "vitest";
import { createWorkflow, getWorkflow, listWorkflows } from "./catalog.js";

describe("workflow catalog", () => {
  it("never returns workflows from another team", () => {
    expect(listWorkflows("team_unknown")).toEqual([]);
    expect(listWorkflows("team_northstar")).toHaveLength(1);
  });

  it("creates a tenant-owned draft workflow", () => {
    const workflow = createWorkflow({
      teamId: "team_test",
      name: "Quarterly planning",
      description: "Coordinate planning inputs and approval."
    });

    expect(workflow).toMatchObject({
      teamId: "team_test",
      name: "Quarterly planning",
      status: "draft",
      version: 1,
      nodes: [],
      edges: []
    });
    expect(getWorkflow(workflow.id)).toEqual(workflow);
    expect(listWorkflows("team_test")).toEqual([
      expect.objectContaining({
        id: workflow.id,
        nodeCount: 0,
        activeRuns: 0
      })
    ]);
  });
});
