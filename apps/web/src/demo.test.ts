import { describe, expect, it } from "vitest";

import { demoWorkflow, demoWorkflows } from "./demo";

describe("demo workflow catalog", () => {
  it("keeps summaries consistent with the selected workflow graph", () => {
    const selected = demoWorkflows.find((workflow) => workflow.id === demoWorkflow.id);

    expect(selected).toMatchObject({
      id: demoWorkflow.id,
      teamId: demoWorkflow.teamId,
      nodeCount: demoWorkflow.nodes.length
    });
    expect(new Set(demoWorkflow.nodes.map((node) => node.id)).size).toBe(demoWorkflow.nodes.length);
    expect(
      demoWorkflow.edges.every(
        (edge) =>
          demoWorkflow.nodes.some((node) => node.id === edge.source) &&
          demoWorkflow.nodes.some((node) => node.id === edge.target)
      )
    ).toBe(true);
  });
});
