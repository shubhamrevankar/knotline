import type {
  GenerationRequest,
  GenerationResult,
  ModelRequest,
  ModelResult
} from "@knotline/contracts";

import {
  estimateCost,
  failure,
  type AdapterContext,
  type ModelAdapter,
  type ModelMapping
} from "./gateway.js";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ProviderUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

interface ProviderResponse {
  id?: string;
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: unknown[];
  usage?: ProviderUsage;
}

export class OpenAIResponsesAdapter implements ModelAdapter {
  constructor(
    private readonly options: {
      readonly apiKey: string;
      readonly endpoint?: string;
      readonly fetch?: Fetch;
    }
  ) {
    if (!options.apiKey)
      throw failure("CREDENTIAL_UNAVAILABLE", false, false, "OpenAI credential is unavailable.");
  }

  async invoke(request: ModelRequest, context: AdapterContext): Promise<ModelResult> {
    if (request.kind !== "generation")
      throw failure("POLICY_BLOCKED", false, false, "This adapter route only supports generation.");
    const startedAt = Date.now();
    const response = await (this.options.fetch ?? globalThis.fetch)(
      this.options.endpoint ?? "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": request.operationId
        },
        body: JSON.stringify(toOpenAIRequest(request, context)),
        signal: context.signal
      }
    ).catch((cause: unknown) => {
      if (context.signal.aborted)
        throw failure("TIMEOUT", false, false, "OpenAI request deadline elapsed.");
      throw failure(
        "PROVIDER_OUTCOME_UNKNOWN",
        false,
        true,
        cause instanceof Error
          ? `OpenAI transport failed: ${cause.name}`
          : "OpenAI transport failed."
      );
    });
    if (!response.ok) throw classifyHttpFailure(response);
    const payload = (await response.json()) as ProviderResponse;
    return normalizeOpenAIResponse(request, context.mapping, payload, Date.now() - startedAt);
  }
}

export const toOpenAIRequest = (request: GenerationRequest, context: AdapterContext) => ({
  model: context.mapping.modelId,
  input: request.messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.callId ? { call_id: message.callId } : {})
  })),
  store: false,
  safety_identifier: context.safetyIdentifierHash,
  max_output_tokens: request.maxOutputTokens,
  max_tool_calls: request.maxToolCalls,
  tools: request.tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true
  })),
  ...(request.outputSchema
    ? {
        text: {
          format: {
            type: "json_schema",
            name: "knotline_result",
            schema: request.outputSchema,
            strict: true
          }
        }
      }
    : {}),
  metadata: {
    operation_id: request.operationId,
    prompt_version: request.promptVersionId,
    policy_version: request.modelPolicyVersionId
  }
});

const normalizeItems = (output: unknown[]) => {
  const items: GenerationResult["outputItems"][number][] = [];
  let refusal: GenerationResult["refusal"];
  for (const raw of output) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type === "function_call")
      items.push({
        type: "tool_call",
        callId: stringValue(item.call_id, ""),
        name: stringValue(item.name, ""),
        arguments: stringValue(item.arguments, "{}")
      });
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!content || typeof content !== "object") continue;
      const part = content as Record<string, unknown>;
      if (part.type === "output_text")
        items.push({ type: "text", text: stringValue(part.text, "") });
      if (part.type === "refusal")
        refusal = { message: stringValue(part.refusal, "Request refused") };
    }
  }
  return { items, refusal };
};

const stringValue = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

export const normalizeOpenAIResponse = (
  request: GenerationRequest,
  mapping: ModelMapping,
  payload: ProviderResponse,
  latencyMs: number
): GenerationResult => {
  const { items, refusal } = normalizeItems(payload.output ?? []);
  const usage = {
    inputTokens: payload.usage?.input_tokens ?? 0,
    cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0
  };
  let parsedOutput: unknown;
  if (request.outputSchema && !refusal) {
    const text = items
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");
    try {
      parsedOutput = JSON.parse(text);
    } catch {
      throw failure("INVALID_OUTPUT", false, true, "OpenAI returned malformed structured output.");
    }
    if (!matchesJsonSchema(parsedOutput, request.outputSchema))
      throw failure(
        "INVALID_OUTPUT",
        false,
        true,
        "OpenAI returned structured output that did not match the declared schema."
      );
  }
  const incompleteReason = payload.incomplete_details?.reason;
  return {
    kind: "generation",
    provider: "openai",
    modelId: payload.model ?? mapping.modelId,
    ...(mapping.snapshot ? { modelSnapshot: mapping.snapshot } : {}),
    ...(payload.id ? { responseId: payload.id } : {}),
    status: refusal ? "refused" : payload.status === "incomplete" ? "incomplete" : "completed",
    latencyMs,
    estimatedCost: estimateCost(usage, mapping),
    outputItems: items,
    ...(parsedOutput === undefined ? {} : { parsedOutput }),
    ...(refusal ? { refusal } : {}),
    ...(incompleteReason ? { incompleteReason } : {}),
    usage
  };
};

const matchesJsonSchema = (value: unknown, rawSchema: Record<string, unknown>): boolean => {
  const type = rawSchema.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    const required = Array.isArray(rawSchema.required)
      ? rawSchema.required.filter((key): key is string => typeof key === "string")
      : [];
    if (required.some((key) => !(key in object))) return false;
    const properties =
      rawSchema.properties && typeof rawSchema.properties === "object"
        ? (rawSchema.properties as Record<string, unknown>)
        : {};
    if (rawSchema.additionalProperties === false) {
      if (Object.keys(object).some((key) => !(key in properties))) return false;
    }
    return Object.entries(properties).every(
      ([key, propertySchema]) =>
        !(key in object) ||
        !propertySchema ||
        typeof propertySchema !== "object" ||
        matchesJsonSchema(object[key], propertySchema as Record<string, unknown>)
    );
  }
  if (type === "array") {
    if (!Array.isArray(value)) return false;
    return !rawSchema.items || typeof rawSchema.items !== "object"
      ? true
      : value.every((item) => matchesJsonSchema(item, rawSchema.items as Record<string, unknown>));
  }
  if (type === "string" && typeof value !== "string") return false;
  if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) return false;
  if (type === "boolean" && typeof value !== "boolean") return false;
  if (type === "null" && value !== null) return false;
  if (Array.isArray(rawSchema.enum) && !rawSchema.enum.some((candidate) => candidate === value))
    return false;
  return true;
};

export const aggregateResponseEvents = (
  request: GenerationRequest,
  mapping: ModelMapping,
  events: readonly Readonly<Record<string, unknown>>[],
  latencyMs: number
) => {
  let completed: ProviderResponse | undefined;
  let text = "";
  for (const event of events) {
    if (event.type === "response.output_text.delta") text += stringValue(event.delta, "");
    if (event.type === "response.completed" || event.type === "response.incomplete")
      completed = event.response as ProviderResponse;
  }
  if (!completed)
    throw failure("INCOMPLETE", false, true, "The response stream ended without a terminal event.");
  const output = completed.output?.length
    ? completed.output
    : [{ type: "message", content: [{ type: "output_text", text }] }];
  return normalizeOpenAIResponse(request, mapping, { ...completed, output }, latencyMs);
};

const classifyHttpFailure = (response: Response) => {
  const requestId = response.headers.get("x-request-id");
  const suffix = requestId ? ` Request ${requestId}.` : "";
  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"));
    return failure(
      "RATE_LIMITED",
      true,
      false,
      `OpenAI rate limit was reached.${suffix}`,
      Number.isFinite(seconds) ? seconds * 1_000 : 1_000
    );
  }
  if (response.status === 408)
    return failure("TIMEOUT", true, false, `OpenAI did not accept the request in time.${suffix}`);
  if (response.status >= 500)
    return failure(
      "PROVIDER_OUTCOME_UNKNOWN",
      false,
      true,
      `OpenAI returned a server error.${suffix}`
    );
  return failure("PROVIDER_UNAVAILABLE", false, false, `OpenAI rejected the request.${suffix}`);
};
