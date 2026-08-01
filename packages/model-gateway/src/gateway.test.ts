import { describe, expect, it, vi } from "vitest";

import type { GenerationRequest } from "@knotline/contracts";

import {
  GatewayFailure,
  GovernedModelGateway,
  failure,
  type ModelAdapter,
  type ModelMapping,
  type ModelPolicy
} from "./gateway.js";
import {
  aggregateResponseEvents,
  normalizeOpenAIResponse,
  OpenAIResponsesAdapter,
  toOpenAIRequest
} from "./openai-responses.js";
import { RecordedContractAdapter } from "./recorded-adapter.js";

const mapping: ModelMapping = {
  role: "balanced",
  provider: "recorded",
  modelId: "recorded-balanced-v1",
  capabilities: ["text", "structured_output"],
  residency: ["local"],
  inputPricePerMillion: "0.100000000000",
  outputPricePerMillion: "0.400000000000",
  priceVersionId: "recorded-2026-07",
  currency: "USD",
  enabled: true
};

const policy: ModelPolicy = {
  versionId: "policy-v1",
  allowedRoles: ["balanced"],
  allowedProviders: ["recorded"],
  maxCostDecimal: "1.000000000000",
  emergencyDisabled: false,
  allowedResidencies: ["local"]
};

const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  kind: "generation",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  operationId: "operation-00000001",
  modelPolicyVersionId: "policy-v1",
  role: "balanced",
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  safetyIdentifier: "principal-1",
  retention: "no-store",
  residency: "local",
  promptVersionId: "prompt-v1",
  messages: [{ role: "user", content: "Return a summary." }],
  outputSchema: { type: "object", properties: { summary: { type: "string" } } },
  tools: [],
  maxOutputTokens: 1_000,
  maxToolCalls: 0,
  ...overrides
});

const gateway = (adapter: ModelAdapter = new RecordedContractAdapter({ summary: "Fixture" })) =>
  new GovernedModelGateway(
    [mapping],
    new Map([[policy.versionId, policy]]),
    new Map([[mapping.provider, adapter]]),
    { safetySalt: "test-only-salt", wait: () => Promise.resolve() }
  );

describe("governed model gateway", () => {
  it("returns normalized structured output and deduplicates an operation", async () => {
    const adapter = new RecordedContractAdapter({ summary: "Fixture" });
    const spy = vi.spyOn(adapter, "invoke");
    const service = gateway(adapter);
    const first = await service.invoke(request());
    const second = await service.invoke(request());
    expect(first).toEqual(second);
    expect(first).toMatchObject({ provider: "recorded", status: "completed" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ ...policy, emergencyDisabled: true }, "EMERGENCY_DISABLED"],
    [{ ...policy, allowedRoles: [] }, "POLICY_BLOCKED"],
    [{ ...policy, allowedResidencies: [] }, "REGION_MISMATCH"]
  ] as const)("fails closed for policy controls", async (configured, code) => {
    const service = new GovernedModelGateway(
      [mapping],
      new Map([[configured.versionId, configured]]),
      new Map([[mapping.provider, new RecordedContractAdapter({})]]),
      { safetySalt: "test" }
    );
    await expect(service.invoke(request())).rejects.toMatchObject({ detail: { code } });
  });

  it("retries only safe pre-acceptance failures", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      invoke: async (value, context) => {
        calls += 1;
        if (calls === 1) throw failure("RATE_LIMITED", true, false, "retry", 1);
        return new RecordedContractAdapter({ summary: "Recovered" }).invoke(value, context);
      }
    };
    await expect(gateway(adapter).invoke(request())).resolves.toMatchObject({
      status: "completed"
    });
    expect(calls).toBe(2);
  });

  it("never replays an unknown accepted outcome", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValue(failure("PROVIDER_OUTCOME_UNKNOWN", false, true, "unknown"));
    const adapter: ModelAdapter = {
      invoke
    };
    await expect(gateway(adapter).invoke(request())).rejects.toMatchObject({
      detail: { code: "PROVIDER_OUTCOME_UNKNOWN", providerAccepted: true }
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("permits one bounded repair after an explicit invalid structured result", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      invoke: async (value, context) => {
        calls += 1;
        if (calls === 1) throw failure("INVALID_OUTPUT", false, true, "shape mismatch");
        return new RecordedContractAdapter({ summary: "Repaired" }).invoke(value, context);
      }
    };
    const result = await gateway(adapter).invoke(request());
    expect(result).toMatchObject({ parsedOutput: { summary: "Repaired" } });
    expect(calls).toBe(2);
  });

  it("applies content hooks and emits observations without prompt content", async () => {
    const observations: unknown[] = [];
    const service = new GovernedModelGateway(
      [mapping],
      new Map([[policy.versionId, policy]]),
      new Map([[mapping.provider, new RecordedContractAdapter({ summary: "Safe" })]]),
      {
        safetySalt: "test",
        inputPolicy: () => undefined,
        outputPolicy: () => undefined,
        observe: (observation) => observations.push(observation)
      }
    );
    await service.invoke(request());
    expect(observations).toHaveLength(2);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: "started", role: "balanced" }),
        expect.objectContaining({ phase: "completed", provider: "recorded" })
      ])
    );
    expect(JSON.stringify(observations)).not.toContain("Return a summary");

    const denied = new GovernedModelGateway(
      [mapping],
      new Map([[policy.versionId, policy]]),
      new Map([[mapping.provider, new RecordedContractAdapter({})]]),
      {
        safetySalt: "test",
        inputPolicy: () => ({
          code: "POLICY_BLOCKED",
          retryable: false,
          providerAccepted: false,
          message: "Input policy denied this request.",
          reasonCode: "CONTENT_INPUT_DENIED"
        })
      }
    );
    await expect(
      denied.invoke(request({ operationId: "operation-policy-deny" }))
    ).rejects.toMatchObject({ detail: { reasonCode: "CONTENT_INPUT_DENIED" } });
  });

  it("propagates caller cancellation as a typed failure", async () => {
    const controller = new AbortController();
    const adapter: ModelAdapter = {
      invoke: (_value, context) =>
        new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true
          });
        })
    };
    const pending = gateway(adapter).invoke(request({ operationId: "operation-cancelled" }), {
      signal: controller.signal
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ detail: { code: "CANCELLED" } });
  });

  it("uses an open circuit after the configured failure threshold", async () => {
    const adapter: ModelAdapter = {
      invoke: () => Promise.reject(failure("PROVIDER_UNAVAILABLE", false, false, "down"))
    };
    const service = new GovernedModelGateway(
      [mapping],
      new Map([[policy.versionId, policy]]),
      new Map([[mapping.provider, adapter]]),
      { safetySalt: "test", circuitFailureThreshold: 1, now: () => 1_000 }
    );
    await expect(
      service.invoke(request({ operationId: "operation-down-1" }))
    ).rejects.toBeInstanceOf(GatewayFailure);
    await expect(
      service.invoke(request({ operationId: "operation-down-2" }))
    ).rejects.toMatchObject({
      detail: { code: "CIRCUIT_OPEN" }
    });
  });
});

describe("OpenAI Responses adapter contract", () => {
  const openAIMapping = { ...mapping, provider: "openai" as const, modelId: "gpt-5.6-terra" };
  const context = {
    mapping: openAIMapping,
    safetyIdentifierHash: "d".repeat(64),
    signal: new AbortController().signal
  };

  it("uses no-store, hashed safety identity, strict schema, and strict tools", () => {
    const body = toOpenAIRequest(
      request({
        tools: [
          {
            name: "lookup",
            description: "Read a record",
            parameters: { type: "object", additionalProperties: false },
            strict: true
          }
        ]
      }),
      context
    );
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      store: false,
      safety_identifier: "d".repeat(64),
      text: { format: { type: "json_schema", strict: true } },
      tools: [{ type: "function", strict: true }]
    });
    expect(JSON.stringify(body)).not.toContain("principal-1");
  });

  it("normalizes text, tool calls, usage, and exact provider model", () => {
    const result = normalizeOpenAIResponse(
      request(),
      openAIMapping,
      {
        id: "resp_1",
        model: "gpt-5.6-terra-2026-07-30",
        status: "completed",
        output: [
          { type: "function_call", call_id: "call_1", name: "lookup", arguments: "{}" },
          { type: "message", content: [{ type: "output_text", text: '{"summary":"Ready"}' }] }
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          input_tokens_details: { cached_tokens: 40 }
        }
      },
      42
    );
    expect(result).toMatchObject({
      responseId: "resp_1",
      modelId: "gpt-5.6-terra-2026-07-30",
      parsedOutput: { summary: "Ready" },
      usage: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 }
    });
    expect(result.outputItems).toContainEqual({
      type: "tool_call",
      callId: "call_1",
      name: "lookup",
      arguments: "{}"
    });
  });

  it("rejects parsed JSON that violates the declared schema", () => {
    try {
      normalizeOpenAIResponse(
        request({
          outputSchema: {
            type: "object",
            required: ["summary"],
            additionalProperties: false,
            properties: { summary: { type: "string" } }
          }
        }),
        openAIMapping,
        {
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }]
        },
        1
      );
      throw new Error("Expected schema validation to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(GatewayFailure);
      if (!(cause instanceof GatewayFailure)) throw cause;
      expect(cause.detail.code).toBe("INVALID_OUTPUT");
    }
  });

  it("makes refusals and incomplete outcomes explicit", () => {
    expect(
      normalizeOpenAIResponse(
        request({ outputSchema: undefined }),
        openAIMapping,
        {
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal", refusal: "Not allowed" }] }]
        },
        1
      )
    ).toMatchObject({ status: "refused", refusal: { message: "Not allowed" } });
    expect(
      normalizeOpenAIResponse(
        request({ outputSchema: undefined }),
        openAIMapping,
        { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
        1
      )
    ).toMatchObject({ status: "incomplete", incompleteReason: "max_output_tokens" });
  });

  it("aggregates typed stream events to the same canonical result", () => {
    const streamed = aggregateResponseEvents(
      request(),
      openAIMapping,
      [
        { type: "response.output_text.delta", delta: '{"summary":' },
        { type: "response.output_text.delta", delta: '"Ready"}' },
        {
          type: "response.completed",
          response: {
            id: "resp_stream",
            model: "gpt-5.6-terra",
            status: "completed",
            usage: { input_tokens: 10, output_tokens: 5 }
          }
        }
      ],
      10
    );
    expect(streamed.parsedOutput).toEqual({ summary: "Ready" });
  });

  it("classifies rate limit and malformed structured response without leaking the key", async () => {
    const responses = [
      new Response("{}", {
        status: 429,
        headers: { "retry-after": "2", "x-request-id": "req_safe" }
      }),
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ];
    const fetcher = vi.fn(
      (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        void input;
        void init;
        return Promise.resolve(responses.shift()!);
      }
    );
    const adapter = new OpenAIResponsesAdapter({ apiKey: String(42), fetch: fetcher });
    await expect(adapter.invoke(request(), context)).rejects.toMatchObject({
      detail: { code: "RATE_LIMITED", retryAfterMs: 2_000, providerAccepted: false }
    });
    await expect(adapter.invoke(request(), context)).rejects.toMatchObject({
      detail: { code: "INVALID_OUTPUT", providerAccepted: true }
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails startup when the credential is absent", () => {
    try {
      new OpenAIResponsesAdapter({ apiKey: "" });
      throw new Error("Expected missing credentials to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(GatewayFailure);
      if (!(cause instanceof GatewayFailure)) throw cause;
      expect(cause.detail.code).toBe("CREDENTIAL_UNAVAILABLE");
    }
  });
});
