import {
  runDeterministicGeneration,
  modelResultSchema,
  validateWorkflowDefinition,
  workflowDefinitionSchema,
  workflowGenerationRequestSchema,
  type WorkflowGenerationRequest,
  type WorkflowGenerationResult
} from "@knotline/contracts";
import type {
  TenantContext,
  WorkflowGenerationRecord,
  WorkflowGenerationRepository
} from "@knotline/db";
import { z } from "zod";

export interface WorkflowGenerationWorker {
  generate(
    request: WorkflowGenerationRequest,
    signal: AbortSignal,
    context?: TenantContext
  ): Promise<WorkflowGenerationResult>;
}

export type WorkflowGenerationResource = WorkflowGenerationRecord;

type MutableGeneration = {
  -readonly [Key in keyof WorkflowGenerationResource]: WorkflowGenerationResource[Key];
};

const snapshot = (value: MutableGeneration): WorkflowGenerationResource => structuredClone(value);

export class DeterministicWorkflowGenerationWorker implements WorkflowGenerationWorker {
  generate(request: WorkflowGenerationRequest, signal: AbortSignal) {
    return runDeterministicGeneration(request, signal);
  }
}

export class GatewayWorkflowGenerationWorker implements WorkflowGenerationWorker {
  constructor(
    private readonly endpoint: string,
    private readonly internalToken: string,
    private readonly fetcher: typeof fetch = globalThis.fetch
  ) {}

  async generate(
    request: WorkflowGenerationRequest,
    signal: AbortSignal,
    context?: TenantContext
  ): Promise<WorkflowGenerationResult> {
    if (!context) throw new Error("GENERATION_CONTEXT_REQUIRED");
    const outputSchema = {
      type: "object",
      additionalProperties: false,
      required: ["definition", "assumptions", "assignments", "missingIntegrations"],
      properties: {
        definition: {
          type: "object",
          additionalProperties: true
        },
        assumptions: { type: "array", items: { type: "string" } },
        assignments: { type: "array", items: { type: "string" } },
        missingIntegrations: { type: "array", items: { type: "string" } }
      }
    };
    const response = await this.fetcher(`${this.endpoint}/internal/v1/model-invocations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.internalToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: "generation",
        workspaceId: context.workspaceId,
        operationId: `workflow-generation:${context.requestId}`,
        modelPolicyVersionId: "default-v1",
        role: "balanced",
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        safetyIdentifier: context.principalId,
        retention: "no-store",
        promptVersionId: "workflow-generation.v1",
        messages: [
          {
            role: "developer",
            content:
              "Design a minimal valid workflow. Return only the declared structure. Do not add external effects or claim integrations are configured."
          },
          { role: "user", content: request.prompt }
        ],
        outputSchema,
        tools: [],
        maxOutputTokens: 8_000,
        maxToolCalls: 0
      }),
      signal
    });
    const envelope = (await response.json()) as { data?: unknown; error?: { code?: string } };
    if (!response.ok) throw new Error(envelope.error?.code ?? "MODEL_GATEWAY_FAILED");
    const result = modelResultSchema.parse(envelope.data);
    if (result.kind !== "generation") throw new Error("MODEL_GATEWAY_KIND_MISMATCH");
    if (result.status === "refused") throw new Error("GENERATION_REFUSED");
    if (result.status === "incomplete") throw new Error("GENERATION_TRUNCATED");
    if (result.status !== "completed") throw new Error("GENERATION_PROVIDER_FAILED");
    const parsed = z
      .object({
        definition: workflowDefinitionSchema,
        assumptions: z.array(z.string()).max(50),
        assignments: z.array(z.string()).max(50),
        missingIntegrations: z.array(z.string()).max(50)
      })
      .parse(result.parsedOutput);
    const findings = validateWorkflowDefinition(parsed.definition);
    if (findings.some(({ severity }) => severity === "error"))
      throw new Error("GENERATION_INVALID_OUTPUT");
    return {
      promptVersion: "workflow-generation.v1",
      provider: result.provider,
      simulated: result.provider === "recorded",
      environmentStatus: result.provider === "recorded" ? "RECORDED_CONTRACT" : "PROVIDER_SANDBOX",
      ...(result.responseId ? { providerResponseId: result.responseId } : {}),
      exactModelId: result.modelId,
      definition: parsed.definition,
      assumptions: parsed.assumptions,
      assignments: parsed.assignments,
      missingIntegrations: parsed.missingIntegrations,
      findings: [...findings],
      repairAttempts: 0,
      usage: {
        inputUnits: result.usage.inputTokens,
        outputUnits: result.usage.outputTokens,
        costMinor: Math.ceil(Number(result.estimatedCost.amountDecimal) * 100),
        currency: "USD"
      },
      diff: {
        addedNodes: parsed.definition.nodes.length,
        addedEdges: parsed.definition.edges.length
      }
    };
  }
}

export class WorkflowGenerationService {
  readonly #resources = new Map<string, MutableGeneration>();
  readonly #controllers = new Map<string, AbortController>();

  constructor(
    private readonly worker: WorkflowGenerationWorker = new DeterministicWorkflowGenerationWorker(),
    private readonly repository?: WorkflowGenerationRepository
  ) {}

  async start(context: TenantContext, input: unknown): Promise<WorkflowGenerationResource> {
    const request = workflowGenerationRequestSchema.parse(input);
    if (request.retryOf) {
      const prior = await this.get(context, request.retryOf);
      if (!prior) throw new Error("GENERATION_RETRY_NOT_FOUND");
      if (!["FAILED", "CANCELLED", "SUCCEEDED"].includes(prior.lifecycle))
        throw new Error("GENERATION_RETRY_NOT_TERMINAL");
    }
    const now = new Date().toISOString();
    const resource: MutableGeneration = {
      id: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      principalId: context.principalId,
      sourcePrompt: request.prompt,
      lifecycle: "QUEUED",
      createdAt: now,
      updatedAt: now,
      ...(request.retryOf ? { retryOf: request.retryOf } : {})
    };
    const controller = new AbortController();
    this.#resources.set(resource.id, resource);
    this.#controllers.set(resource.id, controller);
    await this.repository?.put(context, resource);
    queueMicrotask(() => void this.#execute(context, resource, request, controller));
    return snapshot(resource);
  }

  async #execute(
    context: TenantContext,
    resource: MutableGeneration,
    request: WorkflowGenerationRequest,
    controller: AbortController
  ) {
    if (resource.lifecycle === "CANCELLED") return;
    resource.lifecycle = "RUNNING";
    resource.phase = "GENERATING";
    resource.updatedAt = new Date().toISOString();
    await this.repository?.put(context, resource);
    try {
      const result = await this.worker.generate(request, controller.signal, context);
      if (controller.signal.aborted) {
        resource.lifecycle = "CANCELLED";
        delete resource.phase;
      } else {
        resource.phase = result.repairAttempts > 0 ? "REPAIRING" : "VALIDATING";
        resource.result = result;
        resource.phase = "READY_TO_ACCEPT";
        resource.lifecycle = "SUCCEEDED";
      }
    } catch (error) {
      resource.lifecycle = controller.signal.aborted ? "CANCELLED" : "FAILED";
      resource.failureCode = error instanceof Error ? error.message : "GENERATION_FAILED";
      delete resource.phase;
    } finally {
      resource.updatedAt = new Date().toISOString();
      await this.repository?.put(context, resource);
      this.#controllers.delete(resource.id);
    }
  }

  async get(context: TenantContext, id: string): Promise<WorkflowGenerationResource | undefined> {
    const resource = this.#resources.get(id);
    if (resource?.workspaceId === context.workspaceId) return snapshot(resource);
    return this.repository?.get(context, id);
  }

  async cancel(
    context: TenantContext,
    id: string
  ): Promise<WorkflowGenerationResource | undefined> {
    const persisted = await this.get(context, id);
    if (!persisted) return undefined;
    const resource: MutableGeneration = this.#resources.get(id) ?? { ...persisted };
    this.#resources.set(id, resource);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(resource.lifecycle))
      return snapshot(resource);
    resource.lifecycle = "CANCELLING";
    resource.updatedAt = new Date().toISOString();
    this.#controllers.get(id)?.abort();
    resource.lifecycle = "CANCELLED";
    delete resource.phase;
    resource.updatedAt = new Date().toISOString();
    await this.repository?.put(context, resource);
    return snapshot(resource);
  }

  async accept(
    context: TenantContext,
    id: string,
    workflowId: string
  ): Promise<WorkflowGenerationResource | undefined> {
    const persisted = await this.get(context, id);
    if (!persisted) return undefined;
    const resource: MutableGeneration = this.#resources.get(id) ?? { ...persisted };
    this.#resources.set(id, resource);
    if (resource.lifecycle !== "SUCCEEDED" || !resource.result) return undefined;
    resource.acceptedWorkflowId ??= workflowId;
    resource.updatedAt = new Date().toISOString();
    await this.repository?.put(context, resource);
    return snapshot(resource);
  }
}
