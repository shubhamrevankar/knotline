import { afterEach, describe, expect, it } from "vitest";
import { workflowDefinitionSchema } from "@knotline/contracts";

import { buildGatewayFromEnvironment } from "./config.js";

const prior = { ...process.env };
afterEach(() => {
  process.env = { ...prior };
});

describe("gateway process configuration", () => {
  it("starts in recorded-contract mode without an OpenAI credential", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.MODEL_GATEWAY_PROVIDER = "recorded";
    process.env.MODEL_GATEWAY_SAFETY_SALT = "unit-test-salt";
    const gateway = buildGatewayFromEnvironment();
    const result = await gateway.invoke({
      kind: "generation",
      workspaceId: "10000000-0000-4000-8000-000000000001",
      operationId: "recorded-operation-1",
      modelPolicyVersionId: "default-v1",
      role: "balanced",
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      safetyIdentifier: "user-1",
      retention: "no-store",
      residency: "local",
      promptVersionId: "workflow-generation.v2",
      messages: [{ role: "user", content: "Return a result" }],
      tools: [],
      maxOutputTokens: 100,
      maxToolCalls: 0
    });
    expect(result).toMatchObject({ provider: "recorded", status: "completed" });
    expect(result.kind).toBe("generation");
    if (result.kind !== "generation" || result.status !== "completed") return;
    const output = result.parsedOutput as { readonly definition?: unknown };
    const definition = workflowDefinitionSchema.parse(output.definition);
    expect(definition.nodes.length).toBeGreaterThanOrEqual(25);
    expect(new Set(definition.nodes.map(({ kind }) => kind))).toEqual(
      new Set([
        "trigger",
        "human",
        "agent",
        "approval",
        "condition",
        "delay",
        "loop",
        "subworkflow",
        "transform",
        "integration_action"
      ])
    );
  });

  it("returns a compact execution result for an agent prompt", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.MODEL_GATEWAY_PROVIDER = "recorded";
    process.env.MODEL_GATEWAY_SAFETY_SALT = "unit-test-salt";
    const gateway = buildGatewayFromEnvironment();
    const result = await gateway.invoke({
      kind: "generation",
      workspaceId: "10000000-0000-4000-8000-000000000001",
      operationId: "recorded-agent-operation-1",
      modelPolicyVersionId: "default-v1",
      role: "balanced",
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      safetyIdentifier: "user-1",
      retention: "no-store",
      residency: "local",
      promptVersionId: "impact_analyst-v1",
      messages: [{ role: "user", content: "Classify this customer incident" }],
      tools: [],
      maxOutputTokens: 2_000,
      maxToolCalls: 0
    });
    expect(result).toMatchObject({ provider: "recorded", status: "completed" });
    expect(result.kind).toBe("generation");
    if (result.kind !== "generation" || result.status !== "completed") return;
    expect(result.usage.outputTokens).toBeLessThan(2_000);
    expect(result.parsedOutput).toMatchObject({
      severity: "critical",
      contractExposure: "high",
      requiresHumanReview: true
    });
    expect(result.parsedOutput).not.toHaveProperty("definition");
  });

  it("fails closed before startup when live credentials or price versions are absent", () => {
    process.env.MODEL_GATEWAY_PROVIDER = "openai";
    process.env.MODEL_GATEWAY_SAFETY_SALT = "unit-test-salt";
    delete process.env.OPENAI_API_KEY;
    expect(() => buildGatewayFromEnvironment()).toThrow(/OPENAI_FAST_INPUT_PRICE/u);
  });
});
