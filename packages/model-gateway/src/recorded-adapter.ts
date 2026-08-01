import type { ModelRequest, ModelResult } from "@knotline/contracts";

import { estimateCost, failure, type AdapterContext, type ModelAdapter } from "./gateway.js";

export class RecordedContractAdapter implements ModelAdapter {
  constructor(private readonly fixture: Readonly<Record<string, unknown>>) {}

  invoke(request: ModelRequest, context: AdapterContext): Promise<ModelResult> {
    if (request.kind !== "generation")
      return Promise.reject(
        failure("POLICY_BLOCKED", false, false, "Recorded fixture supports generation only.")
      );
    const output = structuredClone(this.fixture);
    const text = JSON.stringify(output);
    const usage = {
      inputTokens: Math.ceil(request.messages.map(({ content }) => content).join("\n").length / 4),
      cachedInputTokens: 0,
      outputTokens: Math.ceil(text.length / 4)
    };
    return Promise.resolve({
      kind: "generation",
      provider: "recorded",
      modelId: context.mapping.modelId,
      status: "completed",
      latencyMs: 1,
      estimatedCost: estimateCost(usage, context.mapping),
      outputItems: [{ type: "text", text }],
      parsedOutput: output,
      usage
    });
  }
}
