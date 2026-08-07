import { describe, expect, it } from "vitest";
import { compileRuntimePlan } from "@knotline/contracts";

import { approvedTaskOutput, durableWorkflowRun, runtimeEdgeSelected } from "./workflows.js";

describe("Temporal durable workflow", () => {
  it("exports the deterministic workflow and signal contract", () => {
    expect(typeof durableWorkflowRun).toBe("function");
    expect(durableWorkflowRun.name).toBe("durableWorkflowRun");
  });

  it("emits the same approval decision contract used by generated edge conditions", () => {
    expect(approvedTaskOutput({ receipt: "approval-receipt" })).toEqual({
      receipt: "approval-receipt",
      decision: "approved",
      outcome: "approve",
      approved: true
    });
    expect(approvedTaskOutput(undefined)).toEqual({
      value: undefined,
      decision: "approved",
      outcome: "approve",
      approved: true
    });
  });

  it("selects exactly the matching risk branch and never the failure path after success", () => {
    const plan = compileRuntimePlan({
      schemaVersion: 1,
      name: "Routing",
      description: "",
      inputSchema: {},
      outputSchema: {},
      nodes: [
        {
          key: "route",
          kind: "condition",
          name: "Route",
          description: "",
          position: { x: 0, y: 0 },
          configuration: {}
        },
        {
          key: "high",
          kind: "approval",
          name: "High",
          description: "",
          position: { x: 1, y: 0 },
          configuration: {}
        },
        {
          key: "standard",
          kind: "approval",
          name: "Standard",
          description: "",
          position: { x: 1, y: 1 },
          configuration: {}
        },
        {
          key: "fallback",
          kind: "human",
          name: "Fallback",
          description: "",
          position: { x: 1, y: 2 },
          configuration: {}
        }
      ],
      edges: [
        {
          key: "route_high",
          source: "route",
          target: "high",
          condition: "severity == 'critical'"
        },
        {
          key: "route_standard",
          source: "route",
          target: "standard",
          condition: "severity != 'critical'"
        },
        { key: "route_fallback", source: "route", target: "fallback", pathType: "failure" }
      ]
    });
    const outputs = {
      route: { output: { assessment: { severity: "SEV-1 / Critical" } } }
    };
    const outgoing = plan[0]!.outgoing;
    expect(runtimeEdgeSelected(outgoing[0]!, "succeeded", {}, outputs)).toBe(false);
    expect(runtimeEdgeSelected(outgoing[1]!, "succeeded", {}, outputs)).toBe(true);
    expect(runtimeEdgeSelected(outgoing[2]!, "succeeded", {}, outputs)).toBe(false);
    expect(runtimeEdgeSelected(outgoing[0]!, "failed", {}, outputs)).toBe(true);
  });
});
