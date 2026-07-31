import { describe, expect, it } from "vitest";

import { durableWorkflowRun } from "./workflows.js";

describe("Temporal durable workflow", () => {
  it("exports the deterministic workflow and signal contract", () => {
    expect(typeof durableWorkflowRun).toBe("function");
    expect(durableWorkflowRun.name).toBe("durableWorkflowRun");
  });
});
