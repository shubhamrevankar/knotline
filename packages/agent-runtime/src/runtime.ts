import { createHash } from "node:crypto";

import {
  agentExecutionRequestSchema,
  agentExecutionResultSchema,
  memoryWriteOperationSchema,
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type MemoryWriteOperation
} from "@knotline/contracts";

export type AgentModelStep =
  | {
      readonly type: "final";
      readonly output: unknown;
      readonly summary: string;
      readonly usage: { inputTokens: number; outputTokens: number; costDecimal: string };
    }
  | {
      readonly type: "tool_call";
      readonly name: string;
      readonly version: string;
      readonly input: unknown;
      readonly requiresApproval: boolean;
      readonly usage: { inputTokens: number; outputTokens: number; costDecimal: string };
    }
  | {
      readonly type: "memory_write";
      readonly operation: MemoryWriteOperation;
      readonly usage: { inputTokens: number; outputTokens: number; costDecimal: string };
    };

export interface AgentModelClient {
  next(
    request: AgentExecutionRequest,
    transcript: readonly Readonly<Record<string, unknown>>[],
    signal: AbortSignal
  ): Promise<AgentModelStep>;
}

export interface AgentToolClient {
  execute(
    call: Extract<AgentModelStep, { type: "tool_call" }>,
    request: AgentExecutionRequest,
    signal: AbortSignal
  ): Promise<unknown>;
}

export interface AgentExecutionJournal {
  transition(
    executionId: string,
    state: string,
    detail: Readonly<Record<string, unknown>>
  ): Promise<void>;
  provenance(
    executionId: string,
    kind: string,
    reference: string,
    contentHash: string
  ): Promise<string>;
  turn?(
    executionId: string,
    turn: number,
    detail: Readonly<Record<string, unknown>>
  ): Promise<void>;
}

export interface AuthorizedContextVerifier {
  reauthorize(request: AgentExecutionRequest): Promise<boolean>;
}

export interface ExplicitMemoryWriter {
  write(request: AgentExecutionRequest, operation: MemoryWriteOperation): Promise<string>;
}

export class AgentRuntimeFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AgentRuntimeFailure";
  }
}

export class GovernedAgentRuntime {
  constructor(
    private readonly model: AgentModelClient,
    private readonly tools: AgentToolClient,
    private readonly contextVerifier: AuthorizedContextVerifier,
    private readonly memory: ExplicitMemoryWriter,
    private readonly journal: AgentExecutionJournal,
    private readonly options: { readonly now?: () => number } = {}
  ) {}

  async execute(input: unknown, signal: AbortSignal): Promise<AgentExecutionResult> {
    const request = agentExecutionRequestSchema.parse(input);
    const started = this.options.now?.() ?? Date.now();
    if (!(await this.contextVerifier.reauthorize(request)))
      throw new AgentRuntimeFailure("AUTHORIZED_CONTEXT_STALE");
    if (Date.parse(request.contextManifest.dispatchProofExpiresAt) <= started)
      throw new AgentRuntimeFailure("AUTHORIZED_CONTEXT_EXPIRED");
    if (request.contextManifest.totalBytes > request.limits.maxContextBytes)
      throw new AgentRuntimeFailure("CONTEXT_LIMIT_EXCEEDED");
    await this.journal.transition(request.executionId, "running", {
      runId: request.runId,
      taskId: request.taskId,
      agentId: request.agentId,
      agentVersion: request.agentVersion,
      contextManifestId: request.contextManifest.manifestId
    });
    const provenanceRootId = await this.journal.provenance(
      request.executionId,
      "agent_version",
      `${request.agentId}:${String(request.agentVersion)}`,
      hash(`${request.agentId}:${String(request.agentVersion)}`)
    );
    for (const reference of request.contextManifest.references)
      await this.journal.provenance(
        request.executionId,
        reference.kind,
        reference.referenceId,
        reference.contentHash
      );
    const transcript: Readonly<Record<string, unknown>>[] = [];
    let turns = 0;
    let modelCalls = 0;
    let toolCalls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let costUnits = 0n;
    while (turns < request.limits.maxTurns) {
      this.#checkCancelled(signal);
      this.#checkTime(request, started);
      if (!(await this.contextVerifier.reauthorize(request)))
        throw new AgentRuntimeFailure("AUTHORIZED_CONTEXT_STALE");
      if (modelCalls >= request.limits.maxModelCalls)
        throw new AgentRuntimeFailure("MODEL_CALL_LIMIT_EXCEEDED");
      const step = await this.model.next(request, transcript, signal);
      turns += 1;
      modelCalls += 1;
      inputTokens += step.usage.inputTokens;
      outputTokens += step.usage.outputTokens;
      costUnits += decimalUnits(step.usage.costDecimal);
      this.#checkUsage(request, inputTokens, outputTokens, costUnits);
      await this.journal.turn?.(request.executionId, turns, {
        stepType: step.type === "final" ? "final" : step.type,
        state: "completed",
        usage: step.usage
      });
      if (step.type === "memory_write") {
        const operation = memoryWriteOperationSchema.parse(step.operation);
        const memoryId = await this.memory.write(request, operation);
        transcript.push({
          type: "memory_write_receipt",
          memoryId,
          operationId: operation.operationId
        });
        await this.journal.provenance(
          request.executionId,
          "memory_write",
          memoryId,
          hash(JSON.stringify(operation.value))
        );
        continue;
      }
      if (step.type === "tool_call") {
        if (toolCalls >= request.limits.maxToolCalls)
          throw new AgentRuntimeFailure("TOOL_CALL_LIMIT_EXCEEDED");
        if (step.requiresApproval && request.reviewMode === "selected_tools") {
          await this.journal.transition(request.executionId, "approval_wait", {
            toolName: step.name,
            turn: turns
          });
          return this.#result(request, provenanceRootId, "approval_wait", "Approval required.", {
            turns,
            modelCalls,
            toolCalls,
            inputTokens,
            outputTokens,
            costUnits
          });
        }
        const toolOutput = await this.tools.execute(step, request, signal);
        toolCalls += 1;
        transcript.push({ type: "tool_result", name: step.name, output: toolOutput });
        await this.journal.provenance(
          request.executionId,
          "tool_receipt",
          `${step.name}:${String(toolCalls)}`,
          hash(JSON.stringify(toolOutput))
        );
        continue;
      }
      if (!matchesSchema(step.output, request.outputSchema))
        throw new AgentRuntimeFailure("OUTPUT_SCHEMA_INVALID");
      if (Buffer.byteLength(JSON.stringify(step.output)) > request.limits.maxOutputBytes)
        throw new AgentRuntimeFailure("OUTPUT_LIMIT_EXCEEDED");
      const outputHash = hash(JSON.stringify(step.output));
      await this.journal.provenance(
        request.executionId,
        "typed_output",
        request.taskId,
        outputHash
      );
      const result = this.#result(
        request,
        provenanceRootId,
        "succeeded",
        step.summary,
        {
          turns,
          modelCalls,
          toolCalls,
          inputTokens,
          outputTokens,
          costUnits
        },
        step.output,
        outputHash
      );
      await this.journal.transition(request.executionId, "succeeded", {
        outputHash,
        turns,
        modelCalls,
        toolCalls,
        costDecimal: result.costDecimal
      });
      return result;
    }
    throw new AgentRuntimeFailure("TURN_LIMIT_EXCEEDED");
  }

  #checkCancelled(signal: AbortSignal) {
    if (signal.aborted) throw new AgentRuntimeFailure("EXECUTION_CANCELLED");
  }

  #checkTime(request: AgentExecutionRequest, started: number) {
    const now = this.options.now?.() ?? Date.now();
    if (now - started >= request.limits.maxWallTimeMs || now >= Date.parse(request.deadlineAt))
      throw new AgentRuntimeFailure("EXECUTION_TIMEOUT");
  }

  #checkUsage(
    request: AgentExecutionRequest,
    inputTokens: number,
    outputTokens: number,
    costUnits: bigint
  ) {
    if (inputTokens > request.limits.maxInputTokens)
      throw new AgentRuntimeFailure("INPUT_TOKEN_LIMIT_EXCEEDED");
    if (outputTokens > request.limits.maxOutputTokens)
      throw new AgentRuntimeFailure("OUTPUT_TOKEN_LIMIT_EXCEEDED");
    if (costUnits > decimalUnits(request.limits.maxCostDecimal))
      throw new AgentRuntimeFailure("COST_LIMIT_EXCEEDED");
  }

  #result(
    request: AgentExecutionRequest,
    provenanceRootId: string,
    state: AgentExecutionResult["state"],
    summary: string,
    usage: {
      turns: number;
      modelCalls: number;
      toolCalls: number;
      inputTokens: number;
      outputTokens: number;
      costUnits: bigint;
    },
    output?: unknown,
    outputHash?: string
  ) {
    return agentExecutionResultSchema.parse({
      executionId: request.executionId,
      state,
      ...(output === undefined ? {} : { output }),
      ...(outputHash ? { outputHash } : {}),
      summary,
      turns: usage.turns,
      modelCalls: usage.modelCalls,
      toolCalls: usage.toolCalls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costDecimal: formatUnits(usage.costUnits),
      provenanceRootId
    });
  }
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const decimalUnits = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(12, "0").slice(0, 12)}`);
};
const formatUnits = (value: bigint) =>
  `${value / 1_000_000_000_000n}.${String(value % 1_000_000_000_000n).padStart(12, "0")}`;

const matchesSchema = (value: unknown, schema: Record<string, unknown>): boolean => {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [];
    if (required.some((key) => !(key in object))) return false;
    const properties =
      schema.properties && typeof schema.properties === "object"
        ? (schema.properties as Record<string, unknown>)
        : {};
    if (
      schema.additionalProperties === false &&
      Object.keys(object).some((key) => !(key in properties))
    )
      return false;
    return Object.entries(properties).every(
      ([key, child]) =>
        !(key in object) ||
        !child ||
        typeof child !== "object" ||
        matchesSchema(object[key], child as Record<string, unknown>)
    );
  }
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      (!schema.items ||
        typeof schema.items !== "object" ||
        value.every((item) => matchesSchema(item, schema.items as Record<string, unknown>)))
    );
  return true;
};
