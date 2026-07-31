import {
  runDeterministicGeneration,
  workflowGenerationRequestSchema,
  type WorkflowGenerationRequest,
  type WorkflowGenerationResult
} from "@knotline/contracts";
import type {
  TenantContext,
  WorkflowGenerationRecord,
  WorkflowGenerationRepository
} from "@knotline/db";

export interface WorkflowGenerationWorker {
  generate(
    request: WorkflowGenerationRequest,
    signal: AbortSignal
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
      const result = await this.worker.generate(request, controller.signal);
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
