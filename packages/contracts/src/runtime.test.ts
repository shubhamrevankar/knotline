import { describe, expect, it } from "vitest";

import {
  addDecimalUnits,
  assertRunTransition,
  assertTaskTransition,
  canReserveUnits,
  compileRuntimePlan
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
      queue: "connector",
      maxAttempts: 10,
      timeoutMs: 1000
    });
  });

  it("uses exact integer base units at the last available unit", () => {
    expect(addDecimalUnits("999999999999999999", "1")).toBe("1000000000000000000");
    expect(canReserveUnits("100", "60", "39", "1")).toBe(true);
    expect(canReserveUnits("100", "60", "39", "2")).toBe(false);
  });
});
