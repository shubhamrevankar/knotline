import { createHash } from "node:crypto";

import {
  generationResultSchema,
  modelRequestSchema,
  type ModelGatewayError,
  type ModelRequest,
  type ModelResult,
  type ModelRole
} from "@knotline/contracts";

export interface ModelMapping {
  readonly role: ModelRole;
  readonly provider: "openai" | "recorded";
  readonly modelId: string;
  readonly snapshot?: string;
  readonly capabilities: readonly string[];
  readonly residency: readonly string[];
  readonly inputPricePerMillion: string;
  readonly outputPricePerMillion: string;
  readonly priceVersionId: string;
  readonly currency: string;
  readonly enabled: boolean;
}

export interface ModelPolicy {
  readonly versionId: string;
  readonly allowedRoles: readonly ModelRole[];
  readonly allowedProviders: readonly string[];
  readonly maxCostDecimal: string;
  readonly emergencyDisabled: boolean;
  readonly allowedResidencies: readonly string[];
}

export interface AdapterContext {
  readonly mapping: ModelMapping;
  readonly safetyIdentifierHash: string;
  readonly signal: AbortSignal;
}

export interface ModelAdapter {
  invoke(request: ModelRequest, context: AdapterContext): Promise<ModelResult>;
}

export interface GatewayObservation {
  readonly phase: "started" | "completed" | "failed";
  readonly operationId: string;
  readonly role: ModelRole;
  readonly provider?: string;
  readonly modelId?: string;
  readonly status?: ModelResult["status"];
  readonly errorCode?: ModelGatewayError["code"];
  readonly latencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costDecimal?: string;
}

export class GatewayFailure extends Error {
  constructor(readonly detail: ModelGatewayError) {
    super(detail.message);
    this.name = "GatewayFailure";
  }
}

type Circuit = { failures: number; openUntil: number };

export class GovernedModelGateway {
  readonly #results = new Map<string, ModelResult>();
  readonly #circuits = new Map<string, Circuit>();
  #active = 0;

  constructor(
    private readonly mappings: readonly ModelMapping[],
    private readonly policies: ReadonlyMap<string, ModelPolicy>,
    private readonly adapters: ReadonlyMap<string, ModelAdapter>,
    private readonly options: {
      readonly safetySalt: string;
      readonly maxConcurrency?: number;
      readonly retryLimit?: number;
      readonly circuitFailureThreshold?: number;
      readonly circuitResetMs?: number;
      readonly now?: () => number;
      readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
      readonly inputPolicy?: (request: ModelRequest) => ModelGatewayError | undefined;
      readonly outputPolicy?: (
        request: ModelRequest,
        result: ModelResult
      ) => ModelGatewayError | undefined;
      readonly observe?: (observation: GatewayObservation) => void;
    }
  ) {}

  async invoke(
    input: unknown,
    invocation?: { readonly signal?: AbortSignal }
  ): Promise<ModelResult> {
    const request = modelRequestSchema.parse(input);
    this.options.observe?.({
      phase: "started",
      operationId: request.operationId,
      role: request.role
    });
    const cached = this.#results.get(`${request.workspaceId}:${request.operationId}`);
    if (cached) return structuredClone(cached);
    const inputPolicyError = this.options.inputPolicy?.(request);
    if (inputPolicyError) throw new GatewayFailure(inputPolicyError);
    const policy = this.policies.get(request.modelPolicyVersionId);
    if (!policy) throw failure("POLICY_BLOCKED", false, false, "Unknown model policy version.");
    if (policy.emergencyDisabled)
      throw failure("EMERGENCY_DISABLED", false, false, "Model execution is disabled by policy.");
    if (!policy.allowedRoles.includes(request.role))
      throw failure("POLICY_BLOCKED", false, false, "The requested model role is not allowed.");
    if (request.residency && !policy.allowedResidencies.includes(request.residency))
      throw failure("REGION_MISMATCH", false, false, "No compliant model route exists.");
    const mapping = this.mappings.find(
      (candidate) =>
        candidate.role === request.role &&
        candidate.enabled &&
        policy.allowedProviders.includes(candidate.provider) &&
        (!request.residency || candidate.residency.includes(request.residency))
    );
    if (!mapping)
      throw failure("POLICY_BLOCKED", false, false, "No approved model mapping is available.");
    if (this.#active >= (this.options.maxConcurrency ?? 16))
      throw failure("RATE_LIMITED", true, false, "Gateway concurrency is exhausted.", 250);
    const now = this.options.now?.() ?? Date.now();
    const circuit = this.#circuits.get(mapping.modelId);
    if (circuit && circuit.openUntil > now)
      throw failure(
        "CIRCUIT_OPEN",
        true,
        false,
        "The provider circuit is open.",
        circuit.openUntil - now
      );
    const adapter = this.adapters.get(mapping.provider);
    if (!adapter)
      throw failure("PROVIDER_UNAVAILABLE", true, false, "The provider adapter is unavailable.");
    const deadline = Date.parse(request.deadlineAt);
    if (!Number.isFinite(deadline) || deadline <= now)
      throw failure("TIMEOUT", false, false, "The model deadline has elapsed.");
    const controller = new AbortController();
    const cancel = () => controller.abort("cancelled");
    if (invocation?.signal?.aborted) cancel();
    invocation?.signal?.addEventListener("abort", cancel, { once: true });
    const timeout = globalThis.setTimeout(
      () => controller.abort("deadline"),
      Math.min(deadline - now, 2_147_483_647)
    );
    this.#active += 1;
    try {
      const result = await this.#invokeWithRetry(request, mapping, adapter, controller.signal);
      if (result.estimatedCost.currency !== mapping.currency)
        throw failure(
          "INVALID_OUTPUT",
          false,
          true,
          "Provider cost currency did not match mapping."
        );
      if (decimalGreaterThan(result.estimatedCost.amountDecimal, policy.maxCostDecimal))
        throw failure("BUDGET_EXHAUSTED", false, true, "Final model cost exceeded policy.");
      const outputPolicyError = this.options.outputPolicy?.(request, result);
      if (outputPolicyError) throw new GatewayFailure(outputPolicyError);
      this.#results.set(`${request.workspaceId}:${request.operationId}`, structuredClone(result));
      this.#circuits.delete(mapping.modelId);
      this.options.observe?.({
        phase: "completed",
        operationId: request.operationId,
        role: request.role,
        provider: result.provider,
        modelId: result.modelId,
        status: result.status,
        latencyMs: result.latencyMs,
        ...(result.kind === "moderation" ? {} : { inputTokens: result.usage.inputTokens }),
        ...(result.kind === "generation" ? { outputTokens: result.usage.outputTokens } : {}),
        costDecimal: result.estimatedCost.amountDecimal
      });
      return result;
    } catch (cause) {
      const error = normalizeFailure(cause, controller.signal);
      this.options.observe?.({
        phase: "failed",
        operationId: request.operationId,
        role: request.role,
        provider: mapping.provider,
        modelId: mapping.modelId,
        errorCode: error.detail.code
      });
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      invocation?.signal?.removeEventListener("abort", cancel);
      this.#active -= 1;
    }
  }

  async #invokeWithRetry(
    request: ModelRequest,
    mapping: ModelMapping,
    adapter: ModelAdapter,
    signal: AbortSignal
  ) {
    const attempts = (this.options.retryLimit ?? 2) + 1;
    let repairAttempted = false;
    let activeRequest = request;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await adapter.invoke(activeRequest, {
          mapping,
          safetyIdentifierHash: createHash("sha256")
            .update(`${this.options.safetySalt}:${request.safetyIdentifier}`)
            .digest("hex"),
          signal
        });
        return request.kind === "generation" ? generationResultSchema.parse(result) : result;
      } catch (cause) {
        const error = normalizeFailure(cause, signal);
        if (
          !repairAttempted &&
          request.kind === "generation" &&
          request.outputSchema &&
          error.detail.code === "INVALID_OUTPUT" &&
          error.detail.providerAccepted
        ) {
          repairAttempted = true;
          activeRequest = {
            ...request,
            messages: [
              ...request.messages,
              {
                role: "developer",
                content:
                  "The prior result failed the declared JSON schema. Return one corrected result matching it exactly."
              }
            ]
          };
          continue;
        }
        if (!error.detail.retryable || error.detail.providerAccepted || attempt === attempts) {
          this.#recordFailure(mapping.modelId);
          throw error;
        }
        const delay = error.detail.retryAfterMs ?? Math.min(1_000, 100 * 2 ** (attempt - 1));
        await (this.options.wait ?? abortableWait)(delay, signal);
      }
    }
    throw failure("PROVIDER_UNAVAILABLE", true, false, "Provider retries were exhausted.");
  }

  #recordFailure(modelId: string) {
    const now = this.options.now?.() ?? Date.now();
    const prior = this.#circuits.get(modelId) ?? { failures: 0, openUntil: 0 };
    const failures = prior.failures + 1;
    this.#circuits.set(modelId, {
      failures,
      openUntil:
        failures >= (this.options.circuitFailureThreshold ?? 5)
          ? now + (this.options.circuitResetMs ?? 30_000)
          : 0
    });
  }
}

const abortableWait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(failure("TIMEOUT", false, false, "The model deadline elapsed."));
      },
      { once: true }
    );
  });

const decimalGreaterThan = (left: string, right: string) => {
  const scaled = (value: string) => {
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(`${whole}${fraction.padEnd(12, "0").slice(0, 12)}`);
  };
  return scaled(left) > scaled(right);
};

export const failure = (
  code: ModelGatewayError["code"],
  retryable: boolean,
  providerAccepted: boolean,
  message: string,
  retryAfterMs?: number
) =>
  new GatewayFailure({
    code,
    retryable,
    providerAccepted,
    message,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs })
  });

const normalizeFailure = (cause: unknown, signal: AbortSignal) => {
  if (cause instanceof GatewayFailure) return cause;
  if (signal.aborted)
    return signal.reason === "cancelled"
      ? failure("CANCELLED", false, false, "The model invocation was cancelled.")
      : failure("TIMEOUT", false, false, "The model deadline elapsed.");
  return failure("PROVIDER_OUTCOME_UNKNOWN", false, true, "The provider outcome is unknown.");
};

export const estimateCost = (
  usage: { inputTokens: number; outputTokens: number },
  mapping: ModelMapping
) => {
  const parse = (value: string) => {
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(`${whole}${fraction.padEnd(12, "0").slice(0, 12)}`);
  };
  const units =
    (BigInt(usage.inputTokens) * parse(mapping.inputPricePerMillion) +
      BigInt(usage.outputTokens) * parse(mapping.outputPricePerMillion)) /
    1_000_000n;
  return {
    amountDecimal: `${units / 1_000_000_000_000n}.${String(units % 1_000_000_000_000n).padStart(12, "0")}`,
    currency: mapping.currency,
    scale: 12 as const,
    priceVersionId: mapping.priceVersionId
  };
};
