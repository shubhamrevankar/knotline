import { createHash } from "node:crypto";

import type { CredentialMetadata, ToolDefinition } from "@knotline/contracts";
import {
  EncryptedMemorySecretBackend,
  ToolBroker,
  type PolicyDecision,
  type ToolAdapter
} from "@knotline/tool-broker";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required tool broker configuration: ${name}`);
  return value;
};

const definition: ToolDefinition = {
  name: "records.create",
  version: "1.0.0",
  owner: "platform",
  description: "Recorded contract for a governed record write",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  risk: "high",
  idempotency: "provider",
  sideEffect: "reversible",
  requiredConnectionScopes: ["records.write"],
  allowedDestinations: ["recorded.invalid"],
  timeoutMs: 10_000,
  maxInputBytes: 10_000,
  maxOutputBytes: 10_000,
  deprecated: false
};

export const buildBrokerFromEnvironment = async () => {
  const key = createHash("sha256").update(required("TOOL_BROKER_LOCAL_KEY")).digest();
  const secrets = new EncryptedMemorySecretBackend(key);
  const credential: CredentialMetadata = {
    id: "10000000-0000-4000-8000-000000000031",
    provider: "recorded",
    accountLabel: "Recorded contract account",
    scopes: ["records.write"],
    ownerId: "10000000-0000-4000-8000-000000000001",
    secretReference: "local/recorded-contract",
    rotationState: process.env.TOOL_BROKER_REVOKED === "true" ? "revoked" : "current"
  };
  await secrets.put(credential.secretReference, required("TOOL_BROKER_RECORDED_CREDENTIAL"));
  const adapter: ToolAdapter = {
    execute: (input, context) =>
      Promise.resolve({
        output: {
          recorded: true,
          acceptedInput: input,
          credentialVisible: Boolean(context.secret)
        },
        providerRequestId: `recorded-${context.operationId}`,
        providerReceiptId: `receipt-${context.operationId}`,
        accepted: true
      })
  };
  return new ToolBroker(
    new Map([[`${definition.name}@${definition.version}`, definition]]),
    new Map([[`${definition.name}@${definition.version}`, adapter]]),
    new Map([[credential.id, credential]]),
    secrets,
    (request, tool): PolicyDecision => {
      if (request.context.environment === "production")
        return { decision: "deny", reasonCode: "RECORDED_TOOL_NOT_PRODUCTION" };
      if (tool.risk === "high" || tool.risk === "critical")
        return { decision: "approval_required", reasonCode: "HIGH_RISK_APPROVAL" };
      return { decision: "allow", reasonCode: "POLICY_ALLOW" };
    },
    { globalDisabled: process.env.TOOL_BROKER_DISABLED === "true" }
  );
};
