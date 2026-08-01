import { createHash, randomUUID } from "node:crypto";

import type { AgentExecutionRequest, MemoryWriteOperation } from "@knotline/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  AgentRuntimeFailure,
  GovernedAgentRuntime,
  type AgentExecutionJournal,
  type AgentModelClient
} from "./runtime.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const request = (overrides: Partial<AgentExecutionRequest> = {}): AgentExecutionRequest => {
  const executionId = overrides.executionId ?? randomUUID();
  return {
    workspaceId: "10000000-0000-4000-8000-000000000001",
    executionId,
    runId: "10000000-0000-4000-8000-000000000002",
    taskId: "10000000-0000-4000-8000-000000000003",
    attemptId: randomUUID(),
    principalId: "10000000-0000-4000-8000-000000000001",
    agentId: "10000000-0000-4000-8000-000000000004",
    agentVersion: 1,
    modelPolicyVersionId: "default-v1",
    promptVersionId: "agent-prompt-v1",
    outputSchema: {
      type: "object",
      required: ["summary"],
      additionalProperties: false,
      properties: { summary: { type: "string" } }
    },
    contextManifest: {
      manifestId: randomUUID(),
      workspaceId: "10000000-0000-4000-8000-000000000001",
      principalId: "10000000-0000-4000-8000-000000000001",
      executionId,
      references: [
        {
          kind: "workflow_input",
          referenceId: "input-1",
          contentHash: hash("fixture"),
          permissionProofId: "proof-1",
          permissionRevision: 1,
          authorizedAt: "2026-08-01T00:00:00.000Z",
          reauthorizeBefore: "2099-08-01T00:00:00.000Z",
          dataClassification: "internal",
          content: "Fixture facts"
        }
      ],
      totalBytes: 13,
      totalTokensEstimate: 4,
      assembledAt: "2026-08-01T00:00:00.000Z",
      dispatchProofExpiresAt: "2099-08-01T00:00:00.000Z"
    },
    limits: {
      maxTurns: 5,
      maxModelCalls: 5,
      maxToolCalls: 2,
      maxInputTokens: 1_000,
      maxOutputTokens: 1_000,
      maxCostDecimal: "1.000000000000",
      maxWallTimeMs: 60_000,
      maxOutputBytes: 10_000,
      maxContextBytes: 10_000
    },
    reviewMode: "none",
    deadlineAt: "2099-08-01T00:00:00.000Z",
    ...overrides
  };
};

const journal = (): AgentExecutionJournal => ({
  transition: vi.fn(() => Promise.resolve()),
  provenance: vi.fn(() => Promise.resolve(randomUUID()))
});

const runtime = (model: AgentModelClient, verify = () => Promise.resolve(true)) =>
  new GovernedAgentRuntime(
    model,
    {
      execute: (call) => Promise.resolve({ receiptId: `receipt-${call.name}`, value: "ok" })
    },
    { reauthorize: verify },
    { write: (_request, operation) => Promise.resolve(`memory-${operation.operationId}`) },
    journal()
  );

const usage = { inputTokens: 10, outputTokens: 5, costDecimal: "0.010000000000" };

describe("governed agent runtime", () => {
  it("completes a typed zero-tool result with provenance and reconciled usage", async () => {
    const result = await runtime({
      next: () =>
        Promise.resolve({ type: "final", output: { summary: "Ready" }, summary: "Ready", usage })
    }).execute(request(), new AbortController().signal);
    expect(result).toMatchObject({
      state: "succeeded",
      output: { summary: "Ready" },
      turns: 1,
      modelCalls: 1,
      toolCalls: 0,
      costDecimal: "0.010000000000"
    });
  });

  it("continues through multiple validated brokered tool calls", async () => {
    let turn = 0;
    const model: AgentModelClient = {
      next: () => {
        turn += 1;
        return Promise.resolve(
          turn < 3
            ? {
                type: "tool_call" as const,
                name: `fixture.tool.${String(turn)}`,
                version: "1.0.0",
                input: { turn },
                requiresApproval: false,
                usage
              }
            : {
                type: "final" as const,
                output: { summary: "Two tools completed" },
                summary: "Complete",
                usage
              }
        );
      }
    };
    await expect(
      runtime(model).execute(request(), new AbortController().signal)
    ).resolves.toMatchObject({
      state: "succeeded",
      turns: 3,
      toolCalls: 2,
      costDecimal: "0.030000000000"
    });
  });

  it("writes memory only from an explicit structured operation", async () => {
    let turn = 0;
    const operation: MemoryWriteOperation = {
      operationId: "memory-operation-1",
      scope: "user_private",
      subjectId: "user-1",
      purpose: "Remember a user preference",
      sensitivity: "confidential",
      value: { locale: "en" },
      sourceReferences: ["input-1"],
      permissionDependencies: ["membership-1"],
      authorizerId: "10000000-0000-4000-8000-000000000001"
    };
    const model: AgentModelClient = {
      next: () =>
        Promise.resolve(
          turn++ === 0
            ? { type: "memory_write" as const, operation, usage }
            : {
                type: "final" as const,
                output: { summary: "Stored explicitly" },
                summary: "Stored",
                usage
              }
        )
    };
    await expect(
      runtime(model).execute(request(), new AbortController().signal)
    ).resolves.toMatchObject({
      state: "succeeded",
      turns: 2
    });
  });

  it("pauses once for a selected high-risk tool approval", async () => {
    const result = await runtime({
      next: () =>
        Promise.resolve({
          type: "tool_call",
          name: "records.create",
          version: "1.0.0",
          input: {},
          requiresApproval: true,
          usage
        })
    }).execute(request({ reviewMode: "selected_tools" }), new AbortController().signal);
    expect(result).toMatchObject({ state: "approval_wait", turns: 1, toolCalls: 0 });
  });

  it("fails closed when authorization changes after context assembly", async () => {
    let checks = 0;
    await expect(
      runtime({ next: () => Promise.reject(new Error("must not dispatch")) }, () =>
        Promise.resolve(++checks === 1)
      ).execute(request(), new AbortController().signal)
    ).rejects.toMatchObject({ code: "AUTHORIZED_CONTEXT_STALE" });
  });

  it.each([
    [{ maxTurns: 1, maxModelCalls: 1 }, "TURN_LIMIT_EXCEEDED"],
    [{ maxInputTokens: 9 }, "INPUT_TOKEN_LIMIT_EXCEEDED"],
    [{ maxOutputTokens: 4 }, "OUTPUT_TOKEN_LIMIT_EXCEEDED"],
    [{ maxCostDecimal: "0.009999999999" }, "COST_LIMIT_EXCEEDED"]
  ] as const)("enforces exact execution limits", async (limitOverrides, code) => {
    const base = request();
    const model: AgentModelClient = {
      next: () =>
        Promise.resolve({
          type: "tool_call",
          name: "fixture.read",
          version: "1.0.0",
          input: {},
          requiresApproval: false,
          usage
        })
    };
    await expect(
      runtime(model).execute(
        request({ limits: { ...base.limits, ...limitOverrides } }),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code });
  });

  it("blocks invalid downstream output and caller cancellation", async () => {
    const model = {
      next: () => Promise.resolve({ type: "final" as const, output: {}, summary: "Invalid", usage })
    };
    await expect(
      runtime(model).execute(request(), new AbortController().signal)
    ).rejects.toMatchObject({
      code: "OUTPUT_SCHEMA_INVALID"
    });
    const controller = new AbortController();
    controller.abort();
    await expect(runtime(model).execute(request(), controller.signal)).rejects.toBeInstanceOf(
      AgentRuntimeFailure
    );
  });

  it.each([
    ["initial authorization", { verify: () => Promise.resolve(false) }, "AUTHORIZED_CONTEXT_STALE"],
    [
      "expired context proof",
      {
        request: {
          contextManifest: {
            ...request().contextManifest,
            dispatchProofExpiresAt: "2025-01-01T00:00:00.000Z"
          }
        }
      },
      "AUTHORIZED_CONTEXT_EXPIRED"
    ],
    ["oversized context", { limits: { maxContextBytes: 12 } }, "CONTEXT_LIMIT_EXCEEDED"],
    [
      "model call count",
      { limits: { maxTurns: 2, maxModelCalls: 1 } },
      "MODEL_CALL_LIMIT_EXCEEDED"
    ],
    ["tool call count", { limits: { maxToolCalls: 0 } }, "TOOL_CALL_LIMIT_EXCEEDED"],
    ["output byte count", { limits: { maxOutputBytes: 4 }, final: true }, "OUTPUT_LIMIT_EXCEEDED"]
  ])("fails closed for %s", async (_name, setup, code) => {
    const base = request();
    const configuration = setup as {
      verify?: () => Promise<boolean>;
      request?: Partial<AgentExecutionRequest>;
      limits?: Partial<AgentExecutionRequest["limits"]>;
      final?: boolean;
    };
    const model: AgentModelClient = {
      next: () =>
        Promise.resolve(
          configuration.final
            ? { type: "final", output: { summary: "large" }, summary: "large", usage }
            : {
                type: "tool_call",
                name: "fixture.read",
                version: "1.0.0",
                input: {},
                requiresApproval: false,
                usage
              }
        )
    };
    await expect(
      runtime(model, configuration.verify).execute(
        request({
          ...configuration.request,
          limits: { ...base.limits, ...configuration.limits }
        }),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code });
  });

  it("enforces elapsed wall time and absolute deadlines", async () => {
    const model: AgentModelClient = {
      next: () =>
        Promise.resolve({ type: "final", output: { summary: "late" }, summary: "late", usage })
    };
    let now = 1_000;
    const timed = new GovernedAgentRuntime(
      model,
      { execute: () => Promise.resolve({}) },
      { reauthorize: () => Promise.resolve(true) },
      { write: () => Promise.resolve(randomUUID()) },
      journal(),
      { now: () => (now += 60_000) }
    );
    await expect(timed.execute(request(), new AbortController().signal)).rejects.toMatchObject({
      code: "EXECUTION_TIMEOUT"
    });
    await expect(
      runtime(model).execute(
        request({ deadlineAt: "2025-01-01T00:00:00.000Z" }),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "EXECUTION_TIMEOUT" });
  });

  it("journals immutable turns when the journal implements the optional hook", async () => {
    const turn = vi.fn(() => Promise.resolve());
    const governed = new GovernedAgentRuntime(
      {
        next: () =>
          Promise.resolve({
            type: "final",
            output: { summary: "journaled" },
            summary: "journaled",
            usage
          })
      },
      { execute: () => Promise.resolve({}) },
      { reauthorize: () => Promise.resolve(true) },
      { write: () => Promise.resolve(randomUUID()) },
      { ...journal(), turn }
    );
    await governed.execute(request(), new AbortController().signal);
    expect(turn).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.objectContaining({ stepType: "final" })
    );
  });

  it.each([
    [{ type: "string" }, "value", true],
    [{ type: "string" }, 1, false],
    [{ type: "number" }, 1.5, true],
    [{ type: "number" }, Number.NaN, false],
    [{ type: "integer" }, 2, true],
    [{ type: "integer" }, 2.5, false],
    [{ type: "boolean" }, true, true],
    [{ type: "boolean" }, "true", false],
    [{ type: "array" }, [1, 2], true],
    [{ type: "array" }, "not-array", false],
    [{ type: "array", items: "free" }, [1], true],
    [{ type: "array", items: { type: "string" } }, ["one"], true],
    [{ type: "array", items: { type: "string" } }, [1], false],
    [{ type: "object" }, null, false],
    [{ type: "object" }, [], false],
    [{ type: "object", required: ["name"] }, {}, false],
    [
      { type: "object", additionalProperties: false, properties: { name: { type: "string" } } },
      { extra: true },
      false
    ],
    [
      { type: "object", properties: { optional: { type: "string" }, free: null, count: 1 } },
      { free: "anything", count: "anything" },
      true
    ],
    [{ type: "unknown" }, { anything: true }, true]
  ])("validates output schema branch %#", async (outputSchema, output, accepted) => {
    const execution = runtime({
      next: () => Promise.resolve({ type: "final", output, summary: "schema", usage })
    }).execute(request({ outputSchema }), new AbortController().signal);
    if (accepted) await expect(execution).resolves.toMatchObject({ state: "succeeded" });
    else await expect(execution).rejects.toMatchObject({ code: "OUTPUT_SCHEMA_INVALID" });
  });
});
