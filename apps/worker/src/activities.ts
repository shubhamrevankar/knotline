import { createHash, randomUUID } from "node:crypto";

import { Context, activityInfo } from "@temporalio/activity";
import { GovernedAgentRuntime, type AgentModelStep } from "@knotline/agent-runtime";
import { executeLiveHttpRequest } from "@knotline/connector-sdk";
import {
  agentDefinitionSchema,
  generationResultSchema,
  renderAgentPrompts,
  toolExecutionReceiptSchema,
  type AgentDefinition,
  type AgentExecutionRequest,
  type GenerationResult,
  type ModelRole,
  type ToolExecutionReceipt
} from "@knotline/contracts";
import {
  createPool,
  PostgresAgentRepository,
  PostgresAgentExecutionRepository,
  PostgresApprovalRepository,
  PostgresConnectorRepository,
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
const agents = pool ? new PostgresAgentRepository(pool) : undefined;
const agentExecutions = pool ? new PostgresAgentExecutionRepository(pool) : undefined;
const memories = pool ? new PostgresMemoryRepository(pool) : undefined;
const connectorKey = process.env.CONNECTOR_STATE_SIGNING_KEY
  ? Buffer.from(process.env.CONNECTOR_STATE_SIGNING_KEY, "base64")
  : createHash("sha256").update("knotline-local-connector-state").digest();
const connectors = pool ? new PostgresConnectorRepository(pool, connectorKey) : undefined;

type TransformScope = {
  readonly input: Record<string, unknown>;
  readonly nodes: Record<string, { readonly output: unknown }>;
};

type AgentPromptMessage = {
  readonly role: "system" | "developer" | "user";
  readonly content: string;
};

type StrictTool = {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly strict: true;
};

export interface PreparedPublishedAgent {
  readonly prompts: readonly AgentPromptMessage[];
  readonly role: Exclude<ModelRole, "embedding" | "moderation">;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly maxTurns: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxWallTimeMs: number;
  readonly maxCostDecimal: string;
  readonly reviewMode: AgentExecutionRequest["reviewMode"];
  readonly contextText: string;
  readonly tools: readonly StrictTool[];
  readonly toolAliases: Readonly<
    Record<string, { readonly name: string; readonly version: string }>
  >;
}

const modelRole = (role: AgentDefinition["modelPolicy"]["role"]): PreparedPublishedAgent["role"] =>
  role === "reasoning" || role === "vision" ? "quality" : role;

const decimalFromMinor = (minor: number) =>
  `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}0000000000`;

export function preparePublishedAgent(
  definitionInput: unknown,
  scope: TransformScope,
  configuration: Readonly<Record<string, unknown>> = {}
): PreparedPublishedAgent {
  const definition = agentDefinitionSchema.parse(definitionInput);
  const configuredVariables =
    configuration.variables &&
    typeof configuration.variables === "object" &&
    !Array.isArray(configuration.variables)
      ? (configuration.variables as Record<string, unknown>)
      : {};
  const fixture = Object.fromEntries(
    definition.prompts.variables.map((variable) => {
      const value =
        configuredVariables[variable.key] ??
        scope.input[variable.key] ??
        scope.nodes[variable.key]?.output ??
        (["input", "workflow_input", "context"].includes(variable.key)
          ? { input: scope.input, nodes: scope.nodes }
          : undefined);
      return [variable.key, value];
    })
  );
  const rendered = renderAgentPrompts(definition, fixture);
  if (rendered.findings.some(({ severity }) => severity === "error"))
    throw new Error(
      `AGENT_VARIABLES_INVALID:${rendered.findings.map(({ code, path }) => `${code}:${path}`).join(",")}`
    );
  const rawContext = JSON.stringify({ workflowInput: scope.input, completedNodes: scope.nodes });
  const contextText = rawContext.slice(0, Math.min(definition.limits.maxInputTokens * 4, 50_000));
  const toolSchemas =
    configuration.toolSchemas &&
    typeof configuration.toolSchemas === "object" &&
    !Array.isArray(configuration.toolSchemas)
      ? (configuration.toolSchemas as Record<
          string,
          { description?: string; parameters?: Record<string, unknown> }
        >)
      : {};
  const aliases: Record<string, { name: string; version: string }> = {};
  const tools = definition.tools.flatMap((tool): StrictTool[] => {
    const schema = toolSchemas[tool.toolKey];
    if (!schema?.parameters) return [];
    const alias = tool.toolKey.replaceAll(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 64);
    aliases[alias] = { name: tool.toolKey, version: String(tool.version) };
    return [
      {
        name: alias,
        description: schema.description ?? `Execute the approved ${tool.toolKey} capability.`,
        parameters: schema.parameters,
        strict: true
      }
    ];
  });
  return {
    prompts: [
      {
        role: "system",
        content: `${rendered.prompts.system}\n\n<AUTHORIZED_WORKFLOW_CONTEXT>\n${contextText}\n</AUTHORIZED_WORKFLOW_CONTEXT>`
      },
      ...(rendered.prompts.developer
        ? [{ role: "developer" as const, content: rendered.prompts.developer }]
        : []),
      { role: "user", content: rendered.prompts.user }
    ],
    role: modelRole(definition.modelPolicy.role),
    outputSchema: definition.outputSchema,
    maxTurns: Math.min(100, definition.limits.maxModelCalls + definition.limits.maxToolCalls + 1),
    maxModelCalls: definition.limits.maxModelCalls,
    maxToolCalls: definition.limits.maxToolCalls,
    maxInputTokens: definition.limits.maxInputTokens,
    maxOutputTokens: definition.limits.maxOutputTokens,
    maxWallTimeMs: definition.limits.maxDurationMs,
    maxCostDecimal: decimalFromMinor(definition.limits.maxCostMinor),
    reviewMode: definition.tools.some(({ approvalRequired }) => approvalRequired)
      ? "selected_tools"
      : "none",
    contextText,
    tools,
    toolAliases: aliases
  };
}

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
      "running" | "paused" | "cancelling" | "cancelled" | "succeeded" | "failed" | "policy_stopped";
    readonly expectedVersion: number;
    readonly output?: unknown;
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
    `run.${input.next}`,
    input.output
  );
}

export async function recordTaskFailure(
  input: DurableRunInput & { readonly nodeKey: string; readonly errorCode: string }
) {
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  return repository.failTask(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.nodeKey,
    activityInfo().activityId,
    input.errorCode
  );
}

export async function activateTask(input: DurableRunInput & { readonly nodeKey: string }) {
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  return repository.activateTask(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.nodeKey
  );
}

export async function skipTask(
  input: DurableRunInput & { readonly nodeKey: string; readonly reason: string }
) {
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  return repository.skipTask(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.nodeKey,
    input.reason
  );
}

export async function readTaskOutput(input: DurableRunInput & { readonly nodeKey: string }) {
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  return repository.taskOutput(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.nodeKey
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
  const executionScope = await repository.taskExecutionContext(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${info.activityId}`
    },
    input.runId,
    input.node.key
  );
  const dependencyOutputs = Object.values(executionScope.nodes).map(({ output }) => output);
  const output =
    input.node.kind === "transform"
      ? executeTransformMapping(
          input.node.configuration.mapping,
          executionScope,
          input.node.configuration.dropEmpty === true
        )
      : (input.node.configuration.fixtureOutput ??
        (input.node.kind === "trigger"
          ? executionScope.input
          : input.node.kind === "condition"
            ? (dependencyOutputs.at(-1) ?? {})
            : input.node.kind === "loop"
              ? {
                  iteration: 1,
                  maxIterations: Number(input.node.configuration.maxIterations ?? 1)
                }
              : {}));
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

export async function executeConnectorTask(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  if (!repository || !connectors) throw new Error("DATABASE_URL_REQUIRED");
  const info = activityInfo();
  const context = {
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    requestId: `activity-${info.activityId}`
  };
  const connectionId = input.node.configuration.connectionRef;
  if (
    typeof connectionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      connectionId
    )
  )
    throw new Error("HTTP_CONNECTION_ID_INVALID");
  const configuration = await connectors.httpConfiguration(context, connectionId);
  if (!configuration) throw new Error("HTTP_CONNECTION_NOT_CONFIGURED");
  const scope = await repository.taskExecutionContext(context, input.runId, input.node.key);
  const configuredBody = input.node.configuration.body ??
    input.node.configuration.payloadMapping ?? {
      workflowInput: "${input}",
      completedSteps: "${nodes}"
    };
  const body = executeTransformMapping(configuredBody, scope, false);
  const operationId = `${input.runId}:${input.node.key}`;
  const bodyText = JSON.stringify(body);
  const requestUrlHash = createHash("sha256").update(configuration.endpoint).digest("hex");
  const requestBodyHash = createHash("sha256").update(bodyText).digest("hex");
  await repository.startTask(context, input.runId, input.node.key, info.activityId);
  const started = Date.now();
  try {
    const response = await executeLiveHttpRequest({
      ...configuration,
      operationId,
      body
    });
    await connectors.recordHttpReceipt(context, {
      connectionId,
      runId: input.runId,
      nodeKey: input.node.key,
      operationId,
      requestMethod: configuration.method,
      requestUrlHash,
      requestBodyHash,
      responseStatus: response.status,
      responseBodyHash: createHash("sha256").update(JSON.stringify(response.body)).digest("hex"),
      responseExcerpt: response.body,
      durationMs: response.durationMs,
      state: response.ok ? "succeeded" : "failed",
      ...(response.ok ? {} : { errorCode: `HTTP_${String(response.status)}` })
    });
    if (!response.ok) throw new Error(`CONNECTOR_HTTP_${String(response.status)}`);
    const output = {
      delivered: true,
      connectionId,
      operationId,
      status: response.status,
      durationMs: response.durationMs,
      response: response.body
    };
    await repository.completeSyntheticTask(
      context,
      input.runId,
      input.node.key,
      info.activityId,
      output
    );
    return { nodeKey: input.node.key, attempt: info.attempt, queue: input.node.queue, output };
  } catch (cause) {
    const errorCode = cause instanceof Error ? cause.message : "CONNECTOR_EXECUTION_FAILED";
    if (!errorCode.startsWith("CONNECTOR_HTTP_"))
      await connectors.recordHttpReceipt(context, {
        connectionId,
        runId: input.runId,
        nodeKey: input.node.key,
        operationId,
        requestMethod: configuration.method,
        requestUrlHash,
        requestBodyHash,
        durationMs: Date.now() - started,
        state: "failed",
        errorCode
      });
    throw cause;
  }
}

export async function executeGovernedAgent(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  if (!repository || !agents || !agentExecutions || !memories)
    throw new Error("DATABASE_URL_REQUIRED");
  const context = {
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    requestId: `activity-${activityInfo().activityId}`
  };
  await repository.startTask(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.node.key,
    activityInfo().activityId
  );
  const configuredRequest = input.node.configuration.agentExecutionRequest as
    AgentExecutionRequest | undefined;
  const executionId = randomUUID();
  const taskId = randomUUID();
  const now = new Date();
  const executionScope = await repository.taskExecutionContext(
    context,
    input.runId,
    input.node.key
  );
  const requestedAgentId =
    typeof input.node.configuration.agentId === "string"
      ? input.node.configuration.agentId
      : undefined;
  let requestedAgentVersion = Number(input.node.configuration.agentVersion ?? 0);
  let publishedDefinition: AgentDefinition | undefined;
  if (!configuredRequest && requestedAgentId) {
    if (!requestedAgentVersion) {
      const current = await agents.get(context, requestedAgentId);
      requestedAgentVersion = Number(current?.current_version ?? current?.currentVersion ?? 0);
    }
    if (!requestedAgentVersion) throw new Error("AGENT_PUBLISHED_VERSION_REQUIRED");
    const version = await agents.version(context, requestedAgentId, requestedAgentVersion);
    if (!version) throw new Error("AGENT_VERSION_NOT_FOUND");
    publishedDefinition = agentDefinitionSchema.parse(version.definition);
  }
  const prepared = publishedDefinition
    ? preparePublishedAgent(publishedDefinition, executionScope, input.node.configuration)
    : undefined;
  const contextText =
    prepared?.contextText ??
    JSON.stringify({
      workflowInput: executionScope.input,
      completedNodes: executionScope.nodes,
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
      agentId: requestedAgentId ?? "33000000-0000-4000-8000-000000000001",
      agentVersion: requestedAgentVersion || 1,
      modelPolicyVersionId: process.env.MODEL_GATEWAY_POLICY_VERSION ?? "default-v1",
      promptVersionId: `${
        typeof input.node.configuration.agentRole === "string"
          ? input.node.configuration.agentRole
          : "workflow-agent"
      }-v1`,
      outputSchema: prepared?.outputSchema ?? { type: "object", additionalProperties: true },
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
        maxTurns: prepared?.maxTurns ?? 3,
        maxModelCalls: prepared?.maxModelCalls ?? 3,
        maxToolCalls: prepared?.maxToolCalls ?? 0,
        maxInputTokens: prepared?.maxInputTokens ?? 4000,
        maxOutputTokens: prepared?.maxOutputTokens ?? 2000,
        maxCostDecimal: prepared?.maxCostDecimal ?? "1.000000000000",
        maxWallTimeMs: prepared?.maxWallTimeMs ?? 120000,
        maxOutputBytes: 50000,
        maxContextBytes: 50000
      },
      reviewMode: prepared?.reviewMode ?? "none",
      deadlineAt: new Date(now.getTime() + (prepared?.maxWallTimeMs ?? 5 * 60 * 1000)).toISOString()
    } satisfies AgentExecutionRequest);
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
        const result = await invokeModelGateway(
          agentRequest,
          transcript,
          signal,
          journalTurn,
          prepared
        );
        return modelResultToStep(result, input.node.configuration, prepared?.toolAliases ?? {});
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
  turn: number,
  prepared?: PreparedPublishedAgent
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
      role: prepared?.role ?? "balanced",
      promptVersionId: request.promptVersionId,
      messages: prepared
        ? [
            ...prepared.prompts,
            ...(transcript.length
              ? [{ role: "user", content: `Prior tool results:\n${JSON.stringify(transcript)}` }]
              : [])
          ]
        : [
            { role: "system", content: context },
            { role: "user", content: JSON.stringify(transcript) }
          ],
      outputSchema: request.outputSchema,
      tools: prepared?.tools ?? [],
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
  configuration: Readonly<Record<string, unknown>>,
  toolAliases: Readonly<Record<string, { readonly name: string; readonly version: string }>> = {}
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
      name: toolAliases[tool.name]?.name ?? tool.name,
      version:
        toolAliases[tool.name]?.version ??
        (typeof configuration.toolVersion === "string" ? configuration.toolVersion : "1.0.0"),
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
