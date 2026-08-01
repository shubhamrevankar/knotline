import { createHash } from "node:crypto";

import {
  credentialMetadataSchema,
  toolDefinitionSchema,
  toolExecutionReceiptSchema,
  toolInvocationSchema,
  type CredentialMetadata,
  type ToolDefinition,
  type ToolExecutionReceipt,
  type ToolInvocation
} from "@knotline/contracts";

import { scrubSecret, type SecretBackend } from "./secrets.js";

export class ToolBrokerFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly uncertain = false
  ) {
    super(code);
    this.name = "ToolBrokerFailure";
  }
}

export interface ToolAdapterResult {
  readonly output: unknown;
  readonly providerRequestId?: string;
  readonly providerReceiptId?: string;
  readonly accepted: boolean;
}

export interface ToolAdapter {
  execute(
    input: unknown,
    context: {
      readonly secret?: string;
      readonly signal: AbortSignal;
      readonly operationId: string;
    }
  ): Promise<ToolAdapterResult>;
}

export type PolicyDecision = {
  readonly decision: "allow" | "deny" | "approval_required";
  readonly reasonCode: string;
};

type Operation = { readonly hash: string; readonly receipt?: ToolExecutionReceipt };

export class ToolBroker {
  readonly #operations = new Map<string, Operation>();

  constructor(
    private readonly tools: ReadonlyMap<string, ToolDefinition>,
    private readonly adapters: ReadonlyMap<string, ToolAdapter>,
    private readonly credentials: ReadonlyMap<string, CredentialMetadata>,
    private readonly secrets: SecretBackend,
    private readonly policy: (request: ToolInvocation, tool: ToolDefinition) => PolicyDecision,
    private readonly options: {
      readonly globalDisabled?: boolean;
      readonly disabledWorkspaces?: ReadonlySet<string>;
      readonly disabledAgents?: ReadonlySet<string>;
      readonly now?: () => Date;
    } = {}
  ) {}

  async execute(input: unknown, callerSignal?: AbortSignal): Promise<ToolExecutionReceipt> {
    const request = toolInvocationSchema.parse(input);
    const key = `${request.context.workspaceId}:${request.operationId}`;
    const prior = this.#operations.get(key);
    if (prior && prior.hash !== request.requestHash)
      throw new ToolBrokerFailure("IDEMPOTENCY_HASH_CONFLICT");
    if (prior?.receipt) {
      if (prior.receipt.state === "uncertain")
        throw new ToolBrokerFailure("EXTERNAL_OUTCOME_UNCERTAIN", false, true);
      return structuredClone(prior.receipt);
    }
    this.#operations.set(key, { hash: request.requestHash });
    const tool = this.tools.get(`${request.toolName}@${request.toolVersion}`);
    if (!tool || tool.deprecated) throw new ToolBrokerFailure("TOOL_UNAVAILABLE");
    toolDefinitionSchema.parse(tool);
    if (
      this.options.globalDisabled ||
      this.options.disabledWorkspaces?.has(request.context.workspaceId) ||
      this.options.disabledAgents?.has(request.context.agentVersionId)
    )
      throw new ToolBrokerFailure("TOOL_EXECUTION_DISABLED");
    const bytes = Buffer.byteLength(JSON.stringify(request.input));
    if (bytes > tool.maxInputBytes) throw new ToolBrokerFailure("TOOL_INPUT_TOO_LARGE");
    const decision = this.policy(request, tool);
    if (decision.decision === "deny") throw new ToolBrokerFailure(decision.reasonCode);
    if (decision.decision === "approval_required" && !request.context.approvalId)
      throw new ToolBrokerFailure("APPROVAL_REQUIRED");
    const credential = request.context.credentialId
      ? this.credentials.get(request.context.credentialId)
      : undefined;
    if (request.context.credentialId && !credential)
      throw new ToolBrokerFailure("CREDENTIAL_NOT_FOUND");
    if (credential) {
      credentialMetadataSchema.parse(credential);
      if (credential.rotationState === "revoked") throw new ToolBrokerFailure("CREDENTIAL_REVOKED");
      if (tool.requiredConnectionScopes.some((scope) => !credential.scopes.includes(scope)))
        throw new ToolBrokerFailure("CREDENTIAL_SCOPE_INSUFFICIENT");
    }
    const secret = credential ? await this.secrets.get(credential.secretReference) : undefined;
    if (credential && !secret) throw new ToolBrokerFailure("CREDENTIAL_SECRET_UNAVAILABLE");
    const controller = new AbortController();
    const abort = () => controller.abort("caller");
    callerSignal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort("timeout"), tool.timeoutMs);
    const started = this.options.now?.() ?? new Date();
    try {
      const adapter = this.adapters.get(`${tool.name}@${tool.version}`);
      if (!adapter) throw new ToolBrokerFailure("TOOL_ADAPTER_UNAVAILABLE");
      let result: ToolAdapterResult;
      try {
        result = await adapter.execute(request.input, {
          ...(secret ? { secret } : {}),
          signal: controller.signal,
          operationId: request.operationId
        });
      } catch (cause) {
        const accepted =
          cause instanceof ToolBrokerFailure ? cause.uncertain : cause instanceof Error;
        const receipt = this.#receipt(
          request,
          tool,
          decision,
          started,
          accepted ? "uncertain" : "failed",
          undefined,
          secret,
          accepted ? "EXTERNAL_OUTCOME_UNCERTAIN" : "TOOL_FAILED"
        );
        this.#operations.set(key, { hash: request.requestHash, receipt });
        throw new ToolBrokerFailure(receipt.errorCode!, false, accepted);
      }
      const outputBytes = Buffer.byteLength(JSON.stringify(result.output));
      if (outputBytes > tool.maxOutputBytes) throw new ToolBrokerFailure("TOOL_OUTPUT_TOO_LARGE");
      const receipt = this.#receipt(
        request,
        tool,
        decision,
        started,
        result.accepted ? "confirmed" : "failed",
        result,
        secret
      );
      this.#operations.set(key, { hash: request.requestHash, receipt });
      return receipt;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abort);
    }
  }

  #receipt(
    request: ToolInvocation,
    tool: ToolDefinition,
    decision: PolicyDecision,
    started: Date,
    state: ToolExecutionReceipt["state"],
    result?: ToolAdapterResult,
    secret?: string,
    errorCode?: string
  ) {
    const ended = this.options.now?.() ?? new Date();
    return toolExecutionReceiptSchema.parse({
      operationId: request.operationId,
      requestHash: request.requestHash,
      toolName: tool.name,
      toolVersion: tool.version,
      policyDecision: decision.decision,
      policyReasonCode: decision.reasonCode,
      ...(request.context.connectionId ? { connectionId: request.context.connectionId } : {}),
      ...(request.context.credentialId ? { credentialId: request.context.credentialId } : {}),
      ...(result?.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(result?.providerReceiptId ? { providerReceiptId: result.providerReceiptId } : {}),
      state,
      sideEffect: tool.sideEffect,
      startedAt: started.toISOString(),
      completedAt: ended.toISOString(),
      durationMs: Math.max(0, ended.getTime() - started.getTime()),
      sanitizedInput: secret ? scrubSecret(request.input, secret) : request.input,
      ...(result
        ? { sanitizedOutput: secret ? scrubSecret(result.output, secret) : result.output }
        : {}),
      ...(errorCode ? { errorCode } : {}),
      fence: 1
    });
  }
}

export const requestHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
