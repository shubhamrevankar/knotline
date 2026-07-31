import { describe, expect, it, vi } from "vitest";

import type { WorkflowGenerationRequest, WorkflowGenerationResult } from "@knotline/contracts";

import { WorkflowGenerationService, type WorkflowGenerationWorker } from "./workflow-generation.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const principalId = "20000000-0000-4000-8000-000000000001";
const context = { workspaceId, principalId, requestId: "request-generation-test" };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("WorkflowGenerationService", () => {
  it("runs asynchronously, records deterministic usage, and accepts idempotently", async () => {
    const service = new WorkflowGenerationService();
    const created = await service.start(context, {
      prompt: "Collect a launch request and require owner approval.",
      fixture: "standard"
    });
    expect(created.lifecycle).toBe("QUEUED");
    expect(created.result).toBeUndefined();
    await settle();
    const finished = await service.get(context, created.id);
    expect(finished).toMatchObject({ lifecycle: "SUCCEEDED", phase: "READY_TO_ACCEPT" });
    expect(finished?.result?.usage.costMinor).toBe(0);
    expect(
      (await service.accept(context, created.id, "workflow-fixture"))?.acceptedWorkflowId
    ).toBe("workflow-fixture");
    expect((await service.accept(context, created.id, "other"))?.acceptedWorkflowId).toBe(
      "workflow-fixture"
    );
  });

  it("fails closed and permits only linked terminal retries", async () => {
    const service = new WorkflowGenerationService();
    const failed = await service.start(context, {
      prompt: "Create a detailed workflow that can be reviewed.",
      fixture: "refusal"
    });
    await expect(
      service.start(context, {
        prompt: "Retry this detailed workflow generation.",
        fixture: "standard",
        retryOf: failed.id
      })
    ).rejects.toThrow("GENERATION_RETRY_NOT_TERMINAL");
    await settle();
    expect(await service.get(context, failed.id)).toMatchObject({
      lifecycle: "FAILED",
      failureCode: "GENERATION_REFUSED"
    });
    const retry = await service.start(context, {
      prompt: "Retry this detailed workflow generation.",
      fixture: "standard",
      retryOf: failed.id
    });
    expect(retry.retryOf).toBe(failed.id);
  });

  it("cancels active worker work without publishing a result", async () => {
    let release: (() => void) | undefined;
    const worker: WorkflowGenerationWorker = {
      generate: vi.fn(
        (_request: WorkflowGenerationRequest, signal: AbortSignal) =>
          new Promise<WorkflowGenerationResult>((_resolve, reject) => {
            release = () => reject(new DOMException("cancelled", "AbortError"));
            signal.addEventListener("abort", () => release?.());
          })
      )
    };
    const service = new WorkflowGenerationService(worker);
    const created = await service.start(context, {
      prompt: "Create a long running detailed workflow.",
      fixture: "standard"
    });
    await Promise.resolve();
    expect((await service.cancel(context, created.id))?.lifecycle).toBe("CANCELLED");
    await settle();
    expect((await service.get(context, created.id))?.result).toBeUndefined();
    expect(
      await service.get(
        { ...context, workspaceId: "10000000-0000-4000-8000-000000000099" },
        created.id
      )
    ).toBeUndefined();
  });
});
