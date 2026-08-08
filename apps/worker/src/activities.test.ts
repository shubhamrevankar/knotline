import { describe, expect, it } from "vitest";

import {
  executeTransformMapping,
  normalizeProviderActionPayload,
  preparePublishedAgent
} from "./activities.js";

describe("transform execution", () => {
  it("maps typed run input and dependency outputs without evaluating arbitrary code", () => {
    expect(
      executeTransformMapping(
        {
          caseId: "${input.caseId}",
          impact: "${nodes.classify.output.impact}",
          title: "Case ${input.caseId}",
          optional: "${input.missing}"
        },
        {
          input: { caseId: "case-42" },
          nodes: { classify: { output: { impact: 91 } } }
        },
        true
      )
    ).toEqual({ caseId: "case-42", impact: 91, title: "Case case-42" });
  });

  it("rejects a missing mapping instead of pretending a transform succeeded", () => {
    expect(() => executeTransformMapping(undefined, { input: {}, nodes: {} }, false)).toThrow(
      "TRANSFORM_MAPPING_REQUIRED"
    );
  });
});

describe("provider action payloads", () => {
  it("derives a valid Slack message from workflow input and agent evidence", () => {
    const payload = normalizeProviderActionPayload(
      "slack",
      "message.post",
      { workflowInput: {}, completedSteps: {} },
      {
        input: {
          incidentId: "INC-42",
          customerName: "Northstar Health",
          coordinationChannel: "C123"
        },
        nodes: {
          triage: {
            output: {
              incidentSummary: "Employees cannot access the production workspace.",
              severity: "high",
              confidence: 0.91
            }
          }
        }
      }
    );

    expect(payload.channel).toBe("C123");
    expect(String(payload.text)).toContain("Employees cannot access the production workspace.");
  });

  it("preserves explicit Slack channel and text mappings", () => {
    expect(
      normalizeProviderActionPayload(
        "slack",
        "message.post",
        { channel: "C999", text: "Explicit update" },
        { input: { coordinationChannel: "C123" }, nodes: {} }
      )
    ).toEqual({ channel: "C999", text: "Explicit update" });
  });

  it("renders an auditable final Slack update from canonical human-task output", () => {
    const payload = normalizeProviderActionPayload(
      "slack",
      "message.post",
      { workflowInput: {}, completedSteps: {} },
      {
        input: {
          incidentId: "INC-42",
          customerName: "Northstar Health",
          coordinationChannel: "C123"
        },
        nodes: {
          closure_result: {
            output: {
              closure_outcome: "resolved",
              actions_recorded: "Recorded the approved recovery and auditable closure.",
              audit_record_reference: "AUDIT-42",
              customer_communication_reference: "COMMS-42"
            }
          }
        }
      }
    );

    expect(String(payload.text)).toContain("Recorded the approved recovery");
    expect(String(payload.text)).toContain("Resolution status: resolved");
    expect(String(payload.text)).toContain("Audit record: AUDIT-42");
    expect(String(payload.text)).toContain("Customer communication: COMMS-42");
  });
});

describe("published agent execution preparation", () => {
  it("renders a published agent with real workflow input, model policy, limits and tools", () => {
    const prepared = preparePublishedAgent(
      {
        schemaVersion: 1,
        name: "Incident analyst",
        description: "Classifies operational incidents",
        purpose: "Produce a typed severity assessment",
        visibility: "workspace",
        tags: ["operations"],
        prompts: {
          system: "You classify incidents using only authorized evidence.",
          developer: "Return the declared output.",
          user: "Assess {{incident}}",
          variables: [
            {
              key: "incident",
              type: "object",
              required: true,
              description: "Incident input",
              sensitive: false
            }
          ]
        },
        modelPolicy: {
          role: "reasoning",
          requiredCapabilities: ["text", "structured_output", "tool_use"],
          temperature: 0.2,
          reasoning: "medium",
          fallbackRoles: []
        },
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          required: ["severity"],
          properties: { severity: { type: "string" } },
          additionalProperties: false
        },
        tools: [
          {
            toolKey: "records.create",
            version: 1,
            scopes: ["records.write"],
            risk: "high",
            environment: "sandbox",
            approvalRequired: true
          }
        ],
        knowledge: [],
        memory: { scope: "none", retentionDays: 0, purpose: "" },
        limits: {
          maxModelCalls: 4,
          maxToolCalls: 1,
          maxInputTokens: 5000,
          maxOutputTokens: 1000,
          maxDurationMs: 90000,
          maxCostMinor: 25
        },
        fallback: { behavior: "human_task", message: "Ask an operator" },
        humanApproval: { requiredForRisk: ["high", "critical"] }
      },
      { input: { incident: { id: "inc-42", summary: "Checkout unavailable" } }, nodes: {} },
      {
        toolSchemas: {
          "records.create": {
            description: "Create the approved incident record",
            parameters: {
              type: "object",
              properties: { title: { type: "string" } },
              additionalProperties: false
            }
          }
        }
      },
      "SOURCE: Incident policy\nCritical incidents require customer updates every 30 minutes."
    );
    expect(prepared.role).toBe("quality");
    expect(prepared.reviewMode).toBe("selected_tools");
    expect(prepared.maxToolCalls).toBe(1);
    expect(prepared.maxCostDecimal).toBe("0.250000000000");
    expect(prepared.prompts.map(({ content }) => content).join("\n")).toContain("inc-42");
    expect(prepared.prompts.map(({ content }) => content).join("\n")).toContain(
      "customer updates every 30 minutes"
    );
    expect(prepared.toolAliases.records_create).toEqual({ name: "records.create", version: "1" });
  });

  it("binds a generic string request to serialized workflow context", () => {
    const prepared = preparePublishedAgent(
      {
        schemaVersion: 1,
        name: "Incident analyst",
        description: "Classifies operational incidents",
        purpose: "Produce a typed severity assessment",
        visibility: "workspace",
        tags: ["operations"],
        prompts: {
          system: "Use the supplied incident evidence.",
          developer: "Return the declared output.",
          user: "Assess {{request}}",
          variables: [
            {
              key: "request",
              type: "string",
              required: true,
              description: "The operator request",
              sensitive: false
            }
          ]
        },
        modelPolicy: {
          role: "reasoning",
          requiredCapabilities: ["text", "structured_output"],
          temperature: 0.1,
          reasoning: "high",
          fallbackRoles: []
        },
        inputSchema: { type: "object" },
        outputSchema: { type: "object", additionalProperties: true },
        tools: [],
        knowledge: [],
        memory: { scope: "none", retentionDays: 0, purpose: "" },
        limits: {
          maxModelCalls: 2,
          maxToolCalls: 0,
          maxInputTokens: 12000,
          maxOutputTokens: 3000,
          maxDurationMs: 90000,
          maxCostMinor: 100
        },
        fallback: { behavior: "human_task", message: "Ask an operator" },
        humanApproval: { requiredForRisk: ["high", "critical"] }
      },
      {
        input: { incidentId: "INC-42", customerName: "Northstar Health" },
        nodes: { intake: { output: { reported: true } } }
      }
    );

    expect(prepared.prompts.at(-1)?.content).toContain("incidentId");
    expect(prepared.prompts.at(-1)?.content).toContain("INC-42");
    expect(prepared.prompts.at(-1)?.content).toContain("reported");
  });
});
