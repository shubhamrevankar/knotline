import { describe, expect, it } from "vitest";

import {
  addDecimalUnits,
  assertRunTransition,
  assertTaskTransition,
  canReserveUnits,
  compileRuntimePlan,
  evaluateRuntimeExpression
} from "./runtime.js";

describe("durable runtime contracts", () => {
  it("enforces terminal and fencing-safe state machines", () => {
    expect(() => assertRunTransition("queued", "running")).not.toThrow();
    expect(() => assertRunTransition("succeeded", "running")).toThrow("INVALID_RUN_TRANSITION");
    expect(() => assertTaskTransition("running", "uncertain")).not.toThrow();
    expect(() => assertTaskTransition("uncertain", "ready")).toThrow("INVALID_TASK_TRANSITION");
  });

  it("compiles deterministic dependencies, queues, retry and timeout bounds", () => {
    const plan = compileRuntimePlan({
      schemaVersion: 1,
      name: "Runtime",
      description: "",
      inputSchema: {},
      outputSchema: {},
      nodes: [
        {
          key: "start",
          kind: "trigger",
          name: "Start",
          description: "",
          position: { x: 0, y: 0 },
          configuration: {}
        },
        {
          key: "notify",
          kind: "integration_action",
          name: "Notify",
          description: "",
          position: { x: 1, y: 0 },
          configuration: { maxAttempts: 99, timeoutMs: 1 }
        }
      ],
      edges: [{ key: "start_notify", source: "start", target: "notify" }]
    });
    expect(plan[1]).toMatchObject({
      dependencies: ["start"],
      incoming: [{ key: "start_notify", source: "start", target: "notify" }],
      queue: "connector",
      maxAttempts: 10,
      timeoutMs: 1000
    });
  });

  it("deduplicates task dependencies while preserving governed path edges", () => {
    const plan = compileRuntimePlan({
      schemaVersion: 1,
      name: "Conditional paths",
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
          key: "escalate",
          kind: "human",
          name: "Escalate",
          description: "",
          position: { x: 1, y: 0 },
          configuration: { assignment: "workflow_initiator" }
        }
      ],
      edges: [
        {
          key: "route_failed",
          source: "route",
          target: "escalate",
          condition: "status == 'failed'"
        },
        {
          key: "route_incomplete",
          source: "route",
          target: "escalate",
          condition: "status == 'incomplete'"
        }
      ]
    });

    expect(plan[0]?.successors).toEqual(["escalate"]);
    expect(plan[1]?.dependencies).toEqual(["route"]);
    expect(plan[1]?.incoming).toHaveLength(2);
  });

  it("evaluates branch expressions against typed workflow context without dynamic code", () => {
    const scope = {
      input: { iteration: 1 },
      nodes: {
        assess: { output: { assessment: { severity: "SEV-1 / Critical" } } }
      },
      sourceOutput: {}
    };
    expect(
      evaluateRuntimeExpression(
        "highRiskAction == true || severity == 'high' || severity == 'critical'",
        scope
      )
    ).toBe(true);
    expect(evaluateRuntimeExpression("iteration < 2", { ...scope, iteration: 1 })).toBe(true);
    expect(evaluateRuntimeExpression("constructor.constructor('x')", scope)).toBe(false);
  });

  it("routes legacy recovery conditions against canonical human-form output", () => {
    const scope = {
      input: {},
      nodes: {
        execute_recovery: {
          output: { recovery_status: "validated", completion_confirmed: true }
        }
      },
      sourceOutput: {}
    };

    expect(
      evaluateRuntimeExpression(
        "${nodes.execute_recovery.output.recoveryStatus} == 'recovered'",
        scope
      )
    ).toBe(true);
    expect(
      evaluateRuntimeExpression("${nodes.execute_recovery.output.completionConfirmed} == true", scope)
    ).toBe(true);
  });

  it("uses exact integer base units at the last available unit", () => {
    expect(addDecimalUnits("999999999999999999", "1")).toBe("1000000000000000000");
    expect(canReserveUnits("100", "60", "39", "1")).toBe(true);
    expect(canReserveUnits("100", "60", "39", "2")).toBe(false);
  });

  it("honors human-readable approval deadlines", () => {
    const plan = compileRuntimePlan({
      schemaVersion: 1,
      name: "Approval deadline",
      description: "",
      inputSchema: {},
      outputSchema: {},
      nodes: [
        {
          key: "start",
          kind: "trigger",
          name: "Start",
          description: "",
          position: { x: 0, y: 0 },
          configuration: {}
        },
        {
          key: "authorize",
          kind: "approval",
          name: "Authorize",
          description: "",
          position: { x: 1, y: 0 },
          configuration: { policy: "owner", allowSelfApproval: true, dueInMinutes: 30 }
        }
      ],
      edges: [{ key: "start_authorize", source: "start", target: "authorize" }]
    });

    expect(plan[1]?.timeoutMs).toBe(1_800_000);

    const defaulted = compileRuntimePlan({
      ...{
        schemaVersion: 1 as const,
        name: "Default approval deadline",
        description: "",
        inputSchema: {},
        outputSchema: {},
        nodes: plan.map((node, index) => ({
          key: node.key,
          kind: node.kind,
          name: node.key,
          description: "",
          position: { x: index, y: 0 },
          configuration:
            node.kind === "approval" ? { policy: "owner", allowSelfApproval: true } : {}
        })),
        edges: [{ key: "start_authorize", source: "start", target: "authorize" }]
      }
    });
    expect(defaulted[1]?.timeoutMs).toBe(1_800_000);
  });
});
