import { afterEach, describe, expect, it } from "vitest";

import { requestHash } from "@knotline/tool-broker";

import { buildBrokerFromEnvironment } from "./config.js";

const prior = { ...process.env };
afterEach(() => {
  process.env = { ...prior };
});

describe("tool broker process boundary", () => {
  it("executes the approved recorded adapter without leaking its credential", async () => {
    process.env.TOOL_BROKER_LOCAL_KEY = "test-local-encryption-material";
    process.env.TOOL_BROKER_RECORDED_CREDENTIAL = ["credential", "canary"].join("-");
    const broker = await buildBrokerFromEnvironment();
    const input = { title: "Fixture record" };
    const receipt = await broker.execute({
      operationId: "recorded-tool-operation-1",
      requestHash: requestHash(input),
      toolName: "records.create",
      toolVersion: "1.0.0",
      input,
      context: {
        workspaceId: "10000000-0000-4000-8000-000000000001",
        principalId: "10000000-0000-4000-8000-000000000001",
        agentVersionId: "10000000-0000-4000-8000-000000000021",
        environment: "test",
        credentialId: "10000000-0000-4000-8000-000000000031",
        dataClassification: "internal",
        budgetRemainingDecimal: "1.000000000000",
        approvalId: "10000000-0000-4000-8000-000000000040"
      }
    });
    expect(receipt).toMatchObject({ state: "confirmed", policyReasonCode: "HIGH_RISK_APPROVAL" });
    expect(JSON.stringify(receipt)).not.toContain(["credential", "canary"].join("-"));
  });
});
