import { randomBytes } from "node:crypto";

import type { CredentialMetadata, ToolDefinition, ToolInvocation } from "@knotline/contracts";
import { describe, expect, it, vi } from "vitest";

import { requestHash, ToolBroker, type ToolAdapter } from "./broker.js";
import { isForbiddenIp, validateOutboundUrl } from "./network.js";
import { EncryptedMemorySecretBackend, SerializedRefresh } from "./secrets.js";

const tool: ToolDefinition = {
  name: "records.create",
  version: "1.0.0",
  owner: "platform",
  description: "Create an approved record",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  risk: "high",
  idempotency: "provider",
  sideEffect: "reversible",
  requiredConnectionScopes: ["records.write"],
  allowedDestinations: ["api.example.test"],
  timeoutMs: 1_000,
  maxInputBytes: 10_000,
  maxOutputBytes: 10_000,
  deprecated: false
};

const credential: CredentialMetadata = {
  id: "10000000-0000-4000-8000-000000000031",
  provider: "example",
  accountLabel: "Test account",
  scopes: ["records.write"],
  ownerId: "10000000-0000-4000-8000-000000000001",
  secretReference: "local/records",
  rotationState: "current"
};

const invocation = (input: unknown = { title: "Safe" }): ToolInvocation => ({
  operationId: "tool-operation-0001",
  requestHash: requestHash(input),
  toolName: tool.name,
  toolVersion: tool.version,
  input,
  context: {
    workspaceId: "10000000-0000-4000-8000-000000000001",
    principalId: "10000000-0000-4000-8000-000000000001",
    agentVersionId: "10000000-0000-4000-8000-000000000021",
    workflowVersionId: "10000000-0000-4000-8000-000000000022",
    environment: "test",
    connectionId: "10000000-0000-4000-8000-000000000030",
    credentialId: credential.id,
    dataClassification: "internal",
    budgetRemainingDecimal: "1.000000000000",
    approvalId: "10000000-0000-4000-8000-000000000040"
  }
});

const setup = async (
  adapter: ToolAdapter,
  decision: "allow" | "deny" | "approval_required" = "allow"
) => {
  const secrets = new EncryptedMemorySecretBackend(randomBytes(32));
  await secrets.put(credential.secretReference, "canary-provider-value");
  return new ToolBroker(
    new Map([[`${tool.name}@${tool.version}`, tool]]),
    new Map([[`${tool.name}@${tool.version}`, adapter]]),
    new Map([[credential.id, credential]]),
    secrets,
    () => ({ decision, reasonCode: decision === "allow" ? "POLICY_ALLOW" : "POLICY_DENY" })
  );
};

describe("tool broker", () => {
  it("injects a credential only at execution and scrubs every receipt field", async () => {
    const adapter: ToolAdapter = {
      execute: (input, context) =>
        Promise.resolve({
          output: { input, echoed: context.secret },
          providerRequestId: "provider-request-1",
          providerReceiptId: "provider-receipt-1",
          accepted: true
        })
    };
    const receipt = await (
      await setup(adapter)
    ).execute(invocation({ authorization: "canary-provider-value" }));
    expect(receipt).toMatchObject({ state: "confirmed", policyDecision: "allow", fence: 1 });
    expect(JSON.stringify(receipt)).not.toContain("canary-provider-value");
    expect(JSON.stringify(receipt)).toContain("[REDACTED]");
  });

  it("deduplicates a confirmed operation and rejects hash conflicts", async () => {
    const execute = vi.fn(() => Promise.resolve({ output: { ok: true }, accepted: true }));
    const broker = await setup({ execute });
    const first = await broker.execute(invocation());
    expect(await broker.execute(invocation())).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(
      broker.execute({ ...invocation({ changed: true }), requestHash: "a".repeat(64) })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_HASH_CONFLICT" });
  });

  it("requires recorded approval and complete credential scopes", async () => {
    const adapter = { execute: () => Promise.resolve({ output: {}, accepted: true }) };
    const approvalBroker = await setup(adapter, "approval_required");
    await expect(
      approvalBroker.execute({
        ...invocation(),
        operationId: "tool-operation-approval",
        context: { ...invocation().context, approvalId: undefined }
      })
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });

    const insufficient = { ...credential, scopes: [] };
    const secrets = new EncryptedMemorySecretBackend(randomBytes(32));
    await secrets.put(credential.secretReference, "value");
    const broker = new ToolBroker(
      new Map([[`${tool.name}@${tool.version}`, tool]]),
      new Map([[`${tool.name}@${tool.version}`, adapter]]),
      new Map([[credential.id, insufficient]]),
      secrets,
      () => ({ decision: "allow", reasonCode: "ALLOW" })
    );
    await expect(broker.execute(invocation())).rejects.toMatchObject({
      code: "CREDENTIAL_SCOPE_INSUFFICIENT"
    });
  });

  it("marks an unknown external result uncertain and never repeats it", async () => {
    const execute = vi.fn(() => Promise.reject(new Error("connection reset after send")));
    const broker = await setup({ execute });
    await expect(broker.execute(invocation())).rejects.toMatchObject({
      code: "EXTERNAL_OUTCOME_UNCERTAIN",
      uncertain: true
    });
    await expect(broker.execute(invocation())).rejects.toMatchObject({
      code: "EXTERNAL_OUTCOME_UNCERTAIN"
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("honors workspace, agent, and global kill switches", async () => {
    const secrets = new EncryptedMemorySecretBackend(randomBytes(32));
    const adapter = { execute: () => Promise.resolve({ output: {}, accepted: true }) };
    for (const options of [
      { globalDisabled: true },
      { disabledWorkspaces: new Set([invocation().context.workspaceId]) },
      { disabledAgents: new Set([invocation().context.agentVersionId]) }
    ]) {
      const broker = new ToolBroker(
        new Map([[`${tool.name}@${tool.version}`, tool]]),
        new Map([[`${tool.name}@${tool.version}`, adapter]]),
        new Map(),
        secrets,
        () => ({ decision: "allow", reasonCode: "ALLOW" }),
        options
      );
      await expect(
        broker.execute({
          ...invocation(),
          operationId: `operation-${JSON.stringify(options).length}-kill`,
          context: { ...invocation().context, credentialId: undefined }
        })
      ).rejects.toMatchObject({ code: "TOOL_EXECUTION_DISABLED" });
    }
  });
});

describe("credential and network boundaries", () => {
  it("encrypts development secrets and serializes refresh races", async () => {
    const backend = new EncryptedMemorySecretBackend(randomBytes(32));
    await backend.put("one", "value");
    expect(await backend.get("one")).toBe("value");
    await backend.delete("one");
    expect(await backend.get("one")).toBeUndefined();

    const refresh = new SerializedRefresh();
    const action = vi.fn(() => Promise.resolve("new-token"));
    expect(
      await Promise.all([refresh.run("credential", action), refresh.run("credential", action)])
    ).toEqual(["new-token", "new-token"]);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "::1", "fd00::1"])(
    "denies private or metadata address %s",
    (address) => expect(isForbiddenIp(address)).toBe(true)
  );

  it("requires an allowlisted public destination and revalidates resolved addresses", async () => {
    await expect(
      validateOutboundUrl("https://api.example.test/v1", ["api.example.test"], () =>
        Promise.resolve(["203.0.113.10"])
      )
    ).resolves.toBeInstanceOf(URL);
    await expect(
      validateOutboundUrl("http://api.example.test/latest", ["api.example.test"], () =>
        Promise.resolve(["169.254.169.254"])
      )
    ).rejects.toThrow("SSRF_ADDRESS_DENIED");
    await expect(
      validateOutboundUrl("https://evil.test", ["api.example.test"], () =>
        Promise.resolve(["203.0.113.11"])
      )
    ).rejects.toThrow("DESTINATION_NOT_ALLOWLISTED");
  });
});
