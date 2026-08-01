import { describe, expect, it } from "vitest";

import { executeSandbox } from "./executor.js";

const request = (source: string, timeoutMs = 1_000) => ({
  workspaceId: "10000000-0000-4000-8000-000000000001",
  operationId: `sandbox-operation-${source.length}-${timeoutMs}`,
  runtime: "javascript-24.18.1",
  source,
  input: { values: [2, 3, 5] },
  timeoutMs,
  maxOutputBytes: 10_000,
  networkPolicy: "deny_all",
  packageInstallation: "disabled"
});

describe("isolated sandbox executor", () => {
  it("returns structured output from the pinned runtime", async () => {
    await expect(
      executeSandbox(
        request("return { total: input.values.reduce((sum, value) => sum + value, 0) };")
      )
    ).resolves.toMatchObject({ state: "succeeded", output: { total: 10 }, exitCode: 0 });
  });

  it("does not expose process, require, fetch, or string code generation", async () => {
    await expect(
      executeSandbox(
        request(
          "return { process: typeof process, require: typeof require, fetch: typeof fetch, eval: (() => { try { eval('1') } catch { return 'blocked' } })() };"
        )
      )
    ).resolves.toMatchObject({
      state: "succeeded",
      output: { process: "undefined", require: "undefined", fetch: "undefined", eval: "blocked" }
    });
  });

  it("kills runaway computation at the deadline", async () => {
    await expect(executeSandbox(request("while (true) {}", 50))).resolves.toMatchObject({
      state: "timed_out",
      errorCode: "SANDBOX_TIMEOUT"
    });
  });
});
