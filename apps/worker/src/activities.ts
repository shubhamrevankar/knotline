import { createHash, randomUUID } from "node:crypto";

import { Context, activityInfo } from "@temporalio/activity";
import { GovernedAgentRuntime, type AgentModelStep } from "@knotline/agent-runtime";
import {
  generationResultSchema,
  toolExecutionReceiptSchema,
  type AgentExecutionRequest,
  type GenerationResult,
  type ToolExecutionReceipt
} from "@knotline/contracts";
import {
  createPool,
  PostgresAgentExecutionRepository,
  PostgresApprovalRepository,
  PostgresMemoryRepository,
  PostgresRuntimeRepository
} from "@knotline/db";

import type { DurableRunInput } from "./workflows.js";

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? createPool(databaseUrl, { application_name: "knotline-runtime-worker" })
  : undefined;
const repository = pool ? new PostgresRuntimeRepository(pool) : undefined;
const approvals = pool ? new PostgresApprovalRepository(pool) : undefined;
const agentExecutions = pool ? new PostgresAgentExecutionRepository(pool) : undefined;
const memories = pool ? new PostgresMemoryRepository(pool) : undefined;

type TransformScope = {
  readonly input: Record<string, unknown>;
  readonly nodes: Record<string, { readonly output: unknown }>;
};

const readTransformPath = (scope: TransformScope, path: string): unknown => {
  const segments = path.split(".");
  let value: unknown = scope;
  for (const segment of segments) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
};

const renderTransformValue = (value: unknown, scope: TransformScope): unknown => {
  if (Array.isArray(value)) return value.map((item) => renderTransformValue(item, scope));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderTransformValue(item, scope)])
    );
  if (typeof value !== "string") return value;
  const exact = /^\$\{([a-zA-Z0-9_.-]+)\}$/u.exec(value);
  if (exact?.[1]) return readTransformPath(scope, exact[1]);
  return value.replaceAll(/\$\{([a-zA-Z0-9_.-]+)\}/gu, (_match, path: string) => {
    const resolved = readTransformPath(scope, path);
    if (resolved === undefined || resolved === null) return "";
    if (typeof resolved === "string") return resolved;
    if (typeof resolved === "number" || typeof resolved === "boolean") return `${resolved}`;
    return JSON.stringify(resolved);
  });
};

const removeEmptyTransformValues = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value
      .map(removeEmptyTransformValues)
      .filter((item) => item !== undefined && item !== null && item !== "");
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, removeEmptyTransformValues(item)] as const)
        .filter(([, item]) => item !== undefined && item !== null && item !== "")
    );
  return value;
};

export const executeTransformMapping = (
  mapping: unknown,
  scope: TransformScope,
  dropEmpty: boolean
): unknown => {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
    throw new Error("TRANSFORM_MAPPING_REQUIRED");
  const rendered = renderTransformValue(mapping, scope);
  return dropEmpty ? removeEmptyTransformValues(rendered) : rendered;
};

export async function recordRunTransition(
  input: DurableRunInput & {
    readonly expected: "queued" | "running" | "paused" | "cancelling";
    readonly next:
      "running" | "paused" | "cancelling" | "cancelled" | "succeeded" | "policy_stopped";
    readonly expectedVersion: number;
  }
) {
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  return repository.transitionRun(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.expected,
    input.expectedVersion,
    1,
    input.next,
    `run.${input.next}`
  );
}

export async function consumeApproval(
  input: DurableRunInput & {
    readonly node: DurableRunInput["plan"][number];
    readonly operationId: string;
    readonly fencingToken: number;
  }
) {
  if (!approvals) throw new Error("DATABASE_URL_REQUIRED");
  return approvals.consumeForNode(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.node.key,
    input.operationId,
    input.fencingToken
  );
}

export async function expireApproval(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  if (!approvals) throw new Error("DATABASE_URL_REQUIRED");
  return approvals.expireForNode(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.node.key
  );
}

export async function executeSyntheticTask(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  const info = activityInfo();
  if (
    input.node.kind === "integration_action" &&
    input.node.configuration.fixtureOutcome === "uncertain"
  )
    throw new Error("EXTERNAL_OPERATION_UNCERTAIN");
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  const output =
    input.node.kind === "transform"
      ? executeTransformMapping(
          input.node.configuration.mapping,
          await repository.taskExecutionContext(
            {
              workspaceId: input.workspaceId,
              principalId: input.principalId,
              requestId: `activity-${info.activityId}`
            },
            input.runId,
            input.node.key
          ),
          input.node.configuration.dropEmpty === true
        )
      : input.node.configuration.fixtureOutput ?? {};
  const result = {
    nodeKey: input.node.key,
    attempt: info.attempt,
    queue: input.node.queue,
    output
  };
  await repository.completeSyntheticTask(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${info.activityId}`
    },
    input.runId,
    input.node.key,
    info.activityId,
    result.output
  );
  return result;
}

export async function executeGovernedAgent(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  if (!repository || !agentExecutions || !memories) throw new Error("DATABASE_URL_REQUIRED");
  const configuredRequest = input.node.configuration.agentExecutionRequest as
    AgentExecutionRequest | undefined;
  const executionId = randomUUID();
  const taskId = randomUUID();
  const now = new Date();
  const contextText = JSON.stringify({
    objective: "Prepare a governed launch intelligence brief",
    workflowRunId: input.runId,
    node: input.node.key
  });
  const request: AgentExecutionRequest =
    configuredRequest ??
    ({
      workspaceId: input.workspaceId,
      executionId,
      runId: input.runId,
      taskId,
      attemptId: randomUUID(),
      principalId: input.principalId,
      agentId:
        typeof input.node.configuration.agentId === "string"
          ? input.node.configuration.agentId
          : "33000000-0000-4000-8000-000000000001",
      agentVersion: Number(input.node.configuration.agentVersion ?? 1),
      modelPolicyVersionId: "local-recorded-v1",
      promptVersionId: "market-intelligence-v1",
      outputSchema: { type: "object", additionalProperties: true },
      contextManifest: {
        manifestId: randomUUID(),
        workspaceId: input.workspaceId,
        principalId: input.principalId,
        executionId,
        references: [
          {
            kind: "workflow_input",
            referenceId: `run:${input.runId}`,
            contentHash: createHash("sha256").update(contextText).digest("hex"),
            permissionProofId: `workspace-membership:${input.workspaceId}`,
            permissionRevision: 1,
            authorizedAt: now.toISOString(),
            reauthorizeBefore: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
            dataClassification: "internal",
            content: contextText
          }
        ],
        totalBytes: Buffer.byteLength(contextText),
        totalTokensEstimate: Math.ceil(contextText.length / 4),
        assembledAt: now.toISOString(),
        dispatchProofExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
      },
      limits: {
        maxTurns: 3,
        maxModelCalls: 3,
        maxToolCalls: 0,
        maxInputTokens: 4000,
        maxOutputTokens: 2000,
        maxCostDecimal: "1.000000000000",
        maxWallTimeMs: 120000,
        maxOutputBytes: 50000,
        maxContextBytes: 50000
      },
      reviewMode: "none",
      deadlineAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString()
    } satisfies AgentExecutionRequest);
  const context = {
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    requestId: `activity-${activityInfo().activityId}`
  };
  await agentExecutions.create(context, request);
  let journalTurn = 0;
  const runtime = new GovernedAgentRuntime(
    {
      async next(agentRequest, transcript, signal) {
        const fixture = input.node.configuration.fixtureAgentSteps as
          readonly AgentModelStep[] | undefined;
        if (fixture) {
          const next = fixture[Math.min(journalTurn, fixture.length - 1)];
          if (!next) throw new Error("AGENT_FIXTURE_EXHAUSTED");
          return structuredClone(next);
        }
        const result = await invokeModelGateway(agentRequest, transcript, signal, journalTurn);
        return modelResultToStep(result, input.node.configuration);
      }
    },
    {
      async execute(call, agentRequest, signal) {
        return invokeToolBroker(call, agentRequest, input.node.configuration, signal);
      }
    },
    {
      reauthorize(agentRequest) {
        const now = Date.now();
        return Promise.resolve(
          agentRequest.contextManifest.workspaceId === context.workspaceId &&
            agentRequest.contextManifest.principalId === context.principalId &&
            agentRequest.contextManifest.references.every(
              (reference) => Date.parse(reference.reauthorizeBefore) > now
            )
        );
      }
    },
    {
      async write(agentRequest, operation) {
        const record = await memories.writeExplicit(
          context,
          agentRequest.agentId,
          agentRequest.executionId,
          operation
        );
        return record.id;
      }
    },
    {
      transition(executionId, state, detail) {
        return agentExecutions.transition(context, executionId, state, detail);
      },
      provenance(executionId, kind, reference, hash) {
        return agentExecutions.addProvenance(context, executionId, kind, reference, hash);
      },
      turn(executionId, turn, detail) {
        journalTurn = turn;
        return agentExecutions.appendTurn(context, executionId, turn, detail);
      }
    }
  );
  try {
    const result = await runtime.execute(request, Context.current().cancellationSignal);
    if (result.state === "succeeded")
      await repository.completeSyntheticTask(
        context,
        input.runId,
        input.node.key,
        activityInfo().activityId,
        result.output ?? {}
      );
    return result;
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "AGENT_EXECUTION_FAILED";
    await agentExecutions.transition(
      context,
      request.executionId,
      Context.current().cancellationSignal.aborted ? "cancelled" : "failed",
      { errorCode: code }
    );
    throw cause;
  }
}

async function invokeModelGateway(
  request: AgentExecutionRequest,
  transcript: readonly Readonly<Record<string, unknown>>[],
  signal: AbortSignal,
  turn: number
): Promise<GenerationResult> {
  const url = process.env.MODEL_GATEWAY_URL ?? "http://127.0.0.1:4200";
  const token = process.env.MODEL_GATEWAY_INTERNAL_TOKEN;
  if (!token) throw new Error("MODEL_GATEWAY_INTERNAL_TOKEN_REQUIRED");
  const context = request.contextManifest.references
    .map((reference) => reference.content)
    .join("\n\n");
  const response = await fetch(`${url}/internal/v1/model-invocations`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "generation",
      workspaceId: request.workspaceId,
      operationId: `${request.executionId}:turn:${String(turn + 1)}`,
      taskAttemptId: request.attemptId,
      modelPolicyVersionId: request.modelPolicyVersionId,
      deadlineAt: request.deadlineAt,
      safetyIdentifier: request.principalId,
      retention: "no-store",
      role: "balanced",
      promptVersionId: request.promptVersionId,
      messages: [
        { role: "system", content: context },
        { role: "user", content: JSON.stringify(transcript) }
      ],
      outputSchema: request.outputSchema,
      tools: [],
      maxOutputTokens: request.limits.maxOutputTokens,
      maxToolCalls: request.limits.maxToolCalls
    }),
    signal
  });
  const body = (await response.json()) as { data?: unknown; error?: { code?: string } };
  if (!response.ok || !body.data) throw new Error(body.error?.code ?? "MODEL_GATEWAY_FAILED");
  return generationResultSchema.parse(body.data);
}

function modelResultToStep(
  result: GenerationResult,
  configuration: Readonly<Record<string, unknown>>
): AgentModelStep {
  const usage = {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costDecimal: result.estimatedCost.amountDecimal
  };
  const tool = result.outputItems.find((item) => item.type === "tool_call");
  if (tool?.type === "tool_call")
    return {
      type: "tool_call",
      name: tool.name,
      version: typeof configuration.toolVersion === "string" ? configuration.toolVersion : "1.0.0",
      input: JSON.parse(tool.arguments),
      requiresApproval: Boolean(configuration.toolRequiresApproval),
      usage
    };
  return {
    type: "final",
    output: result.parsedOutput,
    summary: "Completed with governed context, policy, and provenance.",
    usage
  };
}

async function invokeToolBroker(
  call: Extract<AgentModelStep, { type: "tool_call" }>,
  request: AgentExecutionRequest,
  configuration: Readonly<Record<string, unknown>>,
  signal: AbortSignal
): Promise<ToolExecutionReceipt> {
  const url = process.env.TOOL_BROKER_URL ?? "http://127.0.0.1:4400";
  const token = process.env.TOOL_BROKER_INTERNAL_TOKEN;
  if (!token) throw new Error("TOOL_BROKER_INTERNAL_TOKEN_REQUIRED");
  const operationId = `${request.executionId}:${call.name}`;
  const invocation = {
    operationId,
    requestHash: createHash("sha256").update(JSON.stringify(call.input)).digest("hex"),
    toolName: call.name,
    toolVersion: call.version,
    input: call.input,
    context: {
      workspaceId: request.workspaceId,
      principalId: request.principalId,
      agentVersionId: request.agentId,
      environment: configuration.testMode ? "test" : "production",
      dataClassification: "internal",
      budgetRemainingDecimal: request.limits.maxCostDecimal
    }
  };
  const response = await fetch(`${url}/internal/v1/tool-executions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(invocation),
    signal
  });
  const body = (await response.json()) as {
    data?: unknown;
    error?: { code?: string; uncertain?: boolean };
  };
  if (!response.ok || !body.data)
    throw new Error(
      body.error?.uncertain
        ? "EXTERNAL_OPERATION_UNCERTAIN"
        : (body.error?.code ?? "TOOL_BROKER_FAILED")
    );
  return toolExecutionReceiptSchema.parse(body.data);
}

export async function closeActivityPool() {
  await pool?.end();
}
