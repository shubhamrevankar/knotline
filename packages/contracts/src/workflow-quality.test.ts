import { describe, expect, it } from "vitest";

import type { WorkflowDefinition } from "./workflow-definition.js";
import { analyzeWorkflowQuality, compileWorkflowGeneration } from "./workflow-quality.js";

const node = (
  key: string,
  kind: WorkflowDefinition["nodes"][number]["kind"],
  name: string,
  configuration: Record<string, unknown> = {}
): WorkflowDefinition["nodes"][number] => ({
  key,
  kind,
  name,
  description: name,
  position: { x: 100, y: 100 },
  configuration
});

const definition = (
  nodes: WorkflowDefinition["nodes"],
  edges: WorkflowDefinition["edges"]
): WorkflowDefinition => ({
  schemaVersion: 1,
  name: "Quality fixture",
  description: "Quality fixture",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  nodes,
  edges
});

const terminal = node("outcome", "transform", "Publish resolved outcome", {
  mapping: { status: "resolved" }
});

describe("workflow generation quality", () => {
  it("rejects an available but unsuitable agent", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("plan", "agent", "Classify incident severity and plan recovery", {
          agentId: "33000000-0000-4000-8000-000000000001",
          agentVersion: 1,
          requiredCapability: "incident recovery planning"
        }),
        terminal
      ],
      [
        { key: "to_plan", source: "start", target: "plan", pathType: "success" },
        { key: "to_outcome", source: "plan", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Recover a customer incident.",
      missingIntegrations: [],
      capabilities: {
        agents: [
          {
            id: "33000000-0000-4000-8000-000000000001",
            version: 1,
            name: "Market intelligence analyst",
            description: "Researches competitors and market trends",
            purpose: "Prepare market intelligence",
            tags: ["market-research"],
            tools: []
          }
        ],
        connections: []
      }
    });
    expect(quality.draftAcceptable).toBe(false);
    expect(quality.agents[0]).toMatchObject({ suitable: false });
    expect(quality.findings.map(({ code }) => code)).toContain("WF_AGENT_CAPABILITY_MISMATCH");
  });

  it("accepts a suitable immutable agent assignment", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("plan", "agent", "Classify incident severity and plan recovery", {
          agentId: "33000000-0000-4000-8000-000000000002",
          agentVersion: 3,
          requiredCapability: "incident recovery planning"
        }),
        terminal
      ],
      [
        { key: "to_plan", source: "start", target: "plan", pathType: "success" },
        { key: "to_outcome", source: "plan", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Recover a customer incident.",
      missingIntegrations: [],
      capabilities: {
        agents: [
          {
            id: "33000000-0000-4000-8000-000000000002",
            version: 3,
            name: "Incident Recovery Planner",
            description: "Classifies severity and drafts bounded recovery plans",
            purpose: "Coordinate evidence-backed incident recovery",
            tags: ["incident", "recovery"],
            tools: []
          }
        ],
        connections: []
      }
    });
    expect(quality.publishable).toBe(true);
    expect(quality.agents[0]).toMatchObject({ suitable: true, agentVersion: 3 });
  });

  it("keeps a valid design as draft-only when automation connections are missing", () => {
    const workflow = definition(
      [node("start", "trigger", "Incident received", { triggerType: "manual" }), terminal],
      [{ key: "to_outcome", source: "start", target: "outcome", pathType: "success" }]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Notify the customer and write the audit record.",
      missingIntegrations: ["Customer messaging connection", "Audit record connection"]
    });
    expect(quality.draftAcceptable).toBe(true);
    expect(quality.publishable).toBe(false);
    expect(quality.summary.automationOpportunities).toBe(2);
    expect(quality.score).toBeGreaterThanOrEqual(90);
  });

  it("keeps an honest human fallback as draft-only when the requested agent is unavailable", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("plan", "human", "Classify severity and prepare a recovery plan", {
          assignment: "workflow_initiator",
          justification: "No suitable incident-recovery agent is published in this workspace.",
          outputs: ["severity", "recoveryPlan", "supportingEvidence"]
        }),
        terminal
      ],
      [
        { key: "to_plan", source: "start", target: "plan", pathType: "success" },
        { key: "to_outcome", source: "plan", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Use an AI agent to classify severity and plan incident recovery.",
      missingIntegrations: [],
      missingAgentCapabilities: ["Incident severity classification and recovery planning"]
    });
    expect(quality.draftAcceptable).toBe(true);
    expect(quality.publishable).toBe(false);
    expect(quality.summary.agentCapabilityGaps).toBe(1);
    expect(quality.findings.map(({ code }) => code)).toContain("WF_AGENT_CAPABILITY_MISSING");
  });

  it("does not misclassify connection fallbacks as excessive judgment gates", () => {
    const manualActions = Array.from({ length: 5 }, (_, index) =>
      node(`manual_${String(index)}`, "human", `Perform missing system action ${String(index)}`, {
        assignment: "workflow_initiator",
        justification: "The required connection is unavailable.",
        manualFallbackFor: `System action ${String(index)}`,
        outputs: ["owner", "evidence", "completed"]
      })
    );
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        ...manualActions,
        terminal
      ],
      [
        { key: "to_manual_0", source: "start", target: "manual_0", pathType: "success" },
        ...manualActions.slice(0, -1).map((action, index) => ({
          key: `to_manual_${String(index + 1)}`,
          source: action.key,
          target: manualActions[index + 1]!.key,
          pathType: "success" as const
        })),
        { key: "to_outcome", source: "manual_4", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Handle a customer incident using the available systems.",
      missingIntegrations: []
    });
    expect(quality.findings.map(({ code }) => code)).not.toContain("WF_EXCESSIVE_MANUAL_GATES");
    expect(quality.draftAcceptable).toBe(true);
    expect(quality.publishable).toBe(false);
  });

  it("keeps explicitly assigned accountable human work publishable", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("audit", "human", "Record auditable incident closure", {
          assignment: "workflow_initiator",
          justification:
            "The operator is explicitly accountable for confirming evidence and recording closure.",
          outputs: ["owner", "evidence", "completed"]
        }),
        terminal
      ],
      [
        { key: "to_audit", source: "start", target: "audit", pathType: "success" },
        { key: "to_outcome", source: "audit", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt:
        "Assign audit recording to an accountable person and do not require an audit integration.",
      missingIntegrations: []
    });
    expect(quality.publishable).toBe(true);
    expect(quality.summary.manualFallbacks).toBe(0);
    expect(quality.summary.automationOpportunities).toBe(0);
    expect(quality.findings.map(({ code }) => code)).not.toContain(
      "WF_MANUAL_AUTOMATION_FALLBACK"
    );
  });

  it("compiles typed model outputs and fallback lists into executable human configuration", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("recover", "human", "Recover access and record evidence", {
          assignment: "workflow_initiator",
          justification: "Required systems are not connected.",
          manualFallbackFor: ["Identity provider", "Customer messaging"],
          outputs: {
            recoveryEvidence: { type: "string", description: "Evidence of restored access." },
            customerNotified: { type: "boolean" },
            auditRecord: { type: "object" }
          }
        }),
        terminal
      ],
      [
        { key: "to_recover", source: "start", target: "recover", pathType: "success" },
        { key: "to_outcome", source: "recover", target: "outcome", pathType: "success" }
      ]
    );
    const compiled = compileWorkflowGeneration({
      definition: workflow,
      sourcePrompt: "Recover critical customer access.",
      missingIntegrations: []
    });
    const recover = compiled.definition.nodes.find(({ key }) => key === "recover");
    expect(recover?.configuration).toMatchObject({
      executionMode: "manual_fallback",
      manualFallbackFor: "Identity provider; Customer messaging",
      formSchema: {
        schemaVersion: 1,
        fields: [
          { key: "recovery_evidence", type: "text" },
          { key: "customer_notified", type: "boolean" },
          { key: "audit_record", type: "json" }
        ]
      }
    });
    expect(compiled.quality.draftAcceptable).toBe(true);
  });

  it("rejects an unjustified standard-risk approval", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Request received", { triggerType: "manual" }),
        node("review", "approval", "Approve standard request", {
          policy: "workspace_owner",
          allowSelfApproval: true,
          riskLevel: "medium",
          dueInMinutes: 30
        }),
        terminal
      ],
      [
        { key: "to_review", source: "start", target: "review", pathType: "success" },
        { key: "to_outcome", source: "review", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Process a standard request.",
      missingIntegrations: []
    });
    expect(quality.findings.map(({ code }) => code)).toContain(
      "WF_APPROVAL_JUSTIFICATION_REQUIRED"
    );
    expect(quality.draftAcceptable).toBe(false);
  });

  it("fails a simulated path when a high-risk write has no prior approval", () => {
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("remediate", "integration_action", "Execute recovery", {
          connectionRef: "connection-1",
          action: "execute_recovery",
          idempotencyKey: "${input.incidentId}",
          risk: "high"
        }),
        terminal
      ],
      [
        { key: "to_write", source: "start", target: "remediate", pathType: "success" },
        { key: "to_outcome", source: "remediate", target: "outcome", pathType: "success" }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Execute recovery.",
      missingIntegrations: [],
      capabilities: {
        agents: [],
        connections: [
          {
            id: "connection-1",
            name: "Recovery service",
            provider: "internal",
            state: "active",
            actions: ["execute_recovery"]
          }
        ]
      }
    });
    expect(quality.scenarios[0]?.status).toBe("failed");
    expect(quality.findings.map(({ code }) => code)).toContain("WF_SCENARIO_FAILED");
  });

  it("rejects overlapping representative decision paths", () => {
    const escalated = node("escalated", "transform", "Publish escalated outcome", {
      mapping: { status: "escalated" }
    });
    const workflow = definition(
      [
        node("start", "trigger", "Incident received", { triggerType: "manual" }),
        node("route", "condition", "Route by severity"),
        terminal,
        escalated
      ],
      [
        { key: "to_route", source: "start", target: "route", pathType: "success" },
        {
          key: "mostly_resolved",
          source: "route",
          target: "outcome",
          pathType: "default",
          condition: "severity != 'critical'"
        },
        {
          key: "mostly_escalated",
          source: "route",
          target: "escalated",
          pathType: "default",
          condition: "severity != 'high'"
        }
      ]
    );
    const quality = analyzeWorkflowQuality({
      definition: workflow,
      sourcePrompt: "Route an incident by severity.",
      missingIntegrations: []
    });
    expect(quality.findings.map(({ code }) => code)).toContain("WF_CONDITION_PATHS_OVERLAP");
    expect(quality.draftAcceptable).toBe(false);
  });
});
