import { afterEach, describe, expect, it } from "vitest";

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
    await expect(
      gateway.invoke({
        kind: "generation",
        workspaceId: "10000000-0000-4000-8000-000000000001",
        operationId: "recorded-operation-1",
        modelPolicyVersionId: "default-v1",
        role: "balanced",
        deadlineAt: new Date(Date.now() + 10_000).toISOString(),
        safetyIdentifier: "user-1",
        retention: "no-store",
        residency: "local",
        promptVersionId: "prompt-v1",
        messages: [{ role: "user", content: "Return a result" }],
        tools: [],
        maxOutputTokens: 100,
        maxToolCalls: 0
      })
    ).resolves.toMatchObject({ provider: "recorded", status: "completed" });
  });

  it("fails closed before startup when live credentials or price versions are absent", () => {
    process.env.MODEL_GATEWAY_PROVIDER = "openai";
    process.env.MODEL_GATEWAY_SAFETY_SALT = "unit-test-salt";
    delete process.env.OPENAI_API_KEY;
    expect(() => buildGatewayFromEnvironment()).toThrow(/OPENAI_FAST_INPUT_PRICE/u);
  });
});
