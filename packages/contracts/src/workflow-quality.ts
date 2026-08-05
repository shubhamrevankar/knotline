import { z } from "zod";

import {
  validateWorkflowDefinition,
  validationFindingSchema,
  type ValidationFinding,
  type WorkflowDefinition,
  type WorkflowDefinitionEdge,
  type WorkflowDefinitionNode
} from "./workflow-definition.js";
import { evaluateRuntimeExpression } from "./runtime.js";

export interface WorkflowQualityCapabilities {
  readonly agents: readonly {
    readonly id: string;
    readonly version: number;
    readonly name: string;
    readonly description: string;
    readonly purpose: string;
    readonly tags?: readonly string[];
    readonly tools?: readonly string[];
  }[];
  readonly connections: readonly {
    readonly id: string;
    readonly name: string;
    readonly provider: string;
    readonly state: string;
    readonly actions: readonly string[];
  }[];
}

export const workflowQualityReportSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    draftAcceptable: z.boolean(),
    publishable: z.boolean(),
    summary: z
      .object({
        automatedSteps: z.number().int().nonnegative(),
        agentSteps: z.number().int().nonnegative(),
        agentCapabilityGaps: z.number().int().nonnegative(),
        humanSteps: z.number().int().nonnegative(),
        approvalSteps: z.number().int().nonnegative(),
        conditionalApprovals: z.number().int().nonnegative(),
        connectedActions: z.number().int().nonnegative(),
        manualFallbacks: z.number().int().nonnegative(),
        automationOpportunities: z.number().int().nonnegative(),
        scenariosPassed: z.number().int().nonnegative(),
        scenariosTotal: z.number().int().nonnegative()
      })
      .strict(),
    agents: z.array(
      z
        .object({
          nodeKey: z.string(),
          nodeName: z.string(),
          agentId: z.string(),
          agentVersion: z.number().int().positive(),
          agentName: z.string(),
          suitable: z.boolean(),
          reason: z.string()
        })
        .strict()
    ),
    agentGaps: z.array(z.string().min(1).max(500)),
    integrations: z.array(
      z
        .object({
          key: z.string(),
          label: z.string(),
          mode: z.enum(["connected", "manual_fallback", "missing"]),
          nodeKey: z.string().optional(),
          connectionId: z.string().optional(),
          connectionName: z.string().optional(),
          action: z.string().optional(),
          reason: z.string()
        })
        .strict()
    ),
    approvals: z.array(
      z
        .object({
          nodeKey: z.string(),
          nodeName: z.string(),
          riskLevel: z.enum(["low", "medium", "high", "critical"]),
          required: z.boolean(),
          reason: z.string()
        })
        .strict()
    ),
    scenarios: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          path: z.array(z.string()),
          terminalNodeKey: z.string().optional(),
          status: z.enum(["passed", "failed"]),
          assertions: z.array(z.string())
        })
        .strict()
    ),
    findings: z.array(validationFindingSchema)
  })
  .strict();

export type WorkflowQualityReport = z.infer<typeof workflowQualityReportSchema>;
export const WORKFLOW_COMPILER_VERSION = "workflow-compiler.v1" as const;

const finding = (
  code: string,
  message: string,
  location: ValidationFinding["location"],
  severity: ValidationFinding["severity"] = "error"
): ValidationFinding => ({ code, message, location, severity });

const DOMAIN_VOCABULARY = {
  incident: [
    "incident",
    "outage",
    "recovery",
    "remediation",
    "severity",
    "service restoration",
    "customer impact"
  ],
  market: ["market", "competitor", "competitive", "trend", "intelligence", "research"],
  sales: ["sales", "lead", "opportunity", "pipeline", "prospect", "account executive"],
  support: ["support", "ticket", "case", "customer service", "resolution"],
  security: ["security", "vulnerability", "threat", "access review", "compliance", "risk"],
  finance: ["finance", "invoice", "billing", "payment", "revenue", "expense"],
  communication: ["notify", "notification", "message", "email", "communication"]
} as const;

function normalizedText(...values: readonly unknown[]): string {
  const text: string[] = [];
  for (const value of values) {
    if (typeof value === "string") text.push(value);
    else if (Array.isArray(value))
      text.push(...value.filter((item): item is string => typeof item === "string"));
  }
  return text.join(" ").toLowerCase();
}

function domains(text: string): Set<string> {
  return new Set(
    Object.entries(DOMAIN_VOCABULARY)
      .filter(([, words]) => words.some((word) => text.includes(word)))
      .map(([domain]) => domain)
  );
}

function meaningfulTokens(text: string): Set<string> {
  const ignored = new Set([
    "agent",
    "using",
    "with",
    "from",
    "into",
    "produce",
    "create",
    "draft",
    "based",
    "evidence",
    "workflow",
    "task",
    "customer"
  ]);
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length >= 5 && !ignored.has(token))
  );
}

function agentSuitable(
  node: WorkflowDefinitionNode,
  agent: WorkflowQualityCapabilities["agents"][number]
) {
  const required = normalizedText(
    node.name,
    node.description,
    node.configuration.requiredCapability,
    node.configuration.agentRole
  );
  const available = normalizedText(
    agent.name,
    agent.description,
    agent.purpose,
    agent.tags,
    agent.tools
  );
  const requiredDomains = domains(required);
  const availableDomains = domains(available);
  if (requiredDomains.size > 0) {
    const overlap = [...requiredDomains].filter((domain) => availableDomains.has(domain));
    return {
      suitable: overlap.length > 0,
      reason:
        overlap.length > 0
          ? `Matched declared ${overlap.join(", ")} capability.`
          : `The task requires ${[...requiredDomains].join(", ")}, but the agent is described for ${
              [...availableDomains].join(", ") || "a different domain"
            }.`
    };
  }
  const requiredTokens = meaningfulTokens(required);
  const availableTokens = meaningfulTokens(available);
  const overlap = [...requiredTokens].filter((token) => availableTokens.has(token));
  return {
    suitable: overlap.length > 0,
    reason:
      overlap.length > 0
        ? `Matched task terms: ${overlap.slice(0, 3).join(", ")}.`
        : "The agent description does not declare a capability matching this task."
  };
}

function configuredRisk(node: WorkflowDefinitionNode): "low" | "medium" | "high" | "critical" {
  const risk = node.configuration.riskLevel;
  return risk === "low" || risk === "medium" || risk === "high" || risk === "critical"
    ? risk
    : "medium";
}

function outgoingFor(definition: WorkflowDefinition, key: string): WorkflowDefinitionEdge[] {
  return definition.edges.filter(({ source }) => source === key);
}

function incomingFor(definition: WorkflowDefinition, key: string): WorkflowDefinitionEdge[] {
  return definition.edges.filter(({ target }) => target === key);
}

function simulatePaths(definition: WorkflowDefinition): WorkflowQualityReport["scenarios"] {
  const nodes = new Map(definition.nodes.map((node) => [node.key, node]));
  const scenarios: WorkflowQualityReport["scenarios"] = [];
  const maximumScenarios = 100;
  const maximumDepth = definition.nodes.length + 1;
  const addScenario = (path: readonly string[], labels: readonly string[], failure: string) => {
    if (scenarios.length >= maximumScenarios) return;
    scenarios.push({
      id: `scenario_${String(scenarios.length + 1)}`,
      name: labels.filter(Boolean).join(" → ") || `Path ${String(scenarios.length + 1)}`,
      path: [...path],
      status: "failed",
      assertions: [failure]
    });
  };
  const visit = (key: string, path: readonly string[], labels: readonly string[]) => {
    if (scenarios.length >= maximumScenarios) return;
    if (path.includes(key)) {
      addScenario([...path, key], labels, "Cycle-free execution failed.");
      return;
    }
    const nextPath = [...path, key];
    if (nextPath.length > maximumDepth) {
      addScenario(nextPath, labels, "Bounded execution failed.");
      return;
    }
    const outgoing = outgoingFor(definition, key);
    if (outgoing.length === 0) {
      const highRiskWrites = nextPath
        .map((nodeKey) => nodes.get(nodeKey))
        .filter(
          (node): node is WorkflowDefinitionNode =>
            node?.kind === "integration_action" &&
            (node.configuration.risk === "high" || node.configuration.risk === "critical")
        );
      const firstHighRiskWrite = highRiskWrites[0];
      const approvalBeforeWrite = firstHighRiskWrite
        ? nextPath
            .slice(0, nextPath.indexOf(firstHighRiskWrite.key))
            .some((nodeKey) => nodes.get(nodeKey)?.kind === "approval")
        : true;
      scenarios.push({
        id: `scenario_${String(scenarios.length + 1)}`,
        name: labels.filter(Boolean).join(" → ") || `Path ${String(scenarios.length + 1)}`,
        path: nextPath,
        terminalNodeKey: key,
        status: approvalBeforeWrite ? "passed" : "failed",
        assertions: [
          "Exactly one terminal outcome is reachable on this path.",
          "The path is finite and cycle-free.",
          approvalBeforeWrite
            ? "Consequential writes are governed before execution."
            : "A high-risk write is reachable without prior approval."
        ]
      });
      return;
    }
    for (const edge of outgoing) {
      const label = edge.label || edge.condition || edge.pathType || edge.key;
      visit(edge.target, nextPath, [...labels, label]);
    }
  };
  for (const trigger of definition.nodes.filter(({ kind }) => kind === "trigger"))
    visit(trigger.key, [], [trigger.name]);
  return scenarios;
}

export function analyzeWorkflowQuality(input: {
  readonly definition: WorkflowDefinition;
  readonly sourcePrompt: string;
  readonly missingIntegrations: readonly string[];
  readonly missingAgentCapabilities?: readonly string[];
  readonly capabilities?: WorkflowQualityCapabilities;
}): WorkflowQualityReport {
  const { definition, capabilities = { agents: [], connections: [] } } = input;
  const findings = [...validateWorkflowDefinition(definition)];
  const agents: WorkflowQualityReport["agents"] = [];
  const integrations: WorkflowQualityReport["integrations"] = [];
  const approvals: WorkflowQualityReport["approvals"] = [];
  const agentGaps = [...(input.missingAgentCapabilities ?? [])];

  const decisionSamples = ["low", "medium", "high", "critical"].flatMap((severity) =>
    [false, true].flatMap((highRiskAction) =>
      ["approve", "reject", "request_changes"].map((outcome) => ({
        severity,
        highRiskAction,
        approved: outcome === "approve",
        outcome,
        iteration: outcome === "request_changes" ? 1 : 0
      }))
    )
  );
  for (const decision of definition.nodes.filter(({ kind }) => kind === "condition")) {
    const edges = outgoingFor(definition, decision.key).filter(
      ({ pathType }) => pathType !== "failure"
    );
    if (
      !edges.every(
        ({ condition }) =>
          condition && /\b(?:severity|highRiskAction|approved|outcome)\b/u.test(condition)
      )
    )
      continue;
    for (const sample of decisionSamples) {
      const nodes = Object.fromEntries(
        definition.nodes.map(({ key }) => [key, { output: sample }])
      );
      const matches = edges.filter(
        ({ condition }) =>
          condition &&
          evaluateRuntimeExpression(condition, {
            input: sample,
            nodes,
            sourceOutput: sample,
            iteration: sample.iteration
          })
      );
      if (matches.length > 1) {
        findings.push(
          finding(
            "WF_CONDITION_PATHS_OVERLAP",
            `Decision paths ${matches.map(({ key }) => key).join(", ")} overlap for a representative output.`,
            { type: "node", key: decision.key }
          )
        );
        break;
      }
      if (matches.length === 0) {
        findings.push(
          finding(
            "WF_CONDITION_PATH_NOT_EXHAUSTIVE",
            "Decision paths do not cover a representative output; add an explicit complementary condition.",
            { type: "node", key: decision.key }
          )
        );
        break;
      }
    }
  }

  for (const node of definition.nodes) {
    if (node.kind === "agent") {
      const agentId =
        typeof node.configuration.agentId === "string" ? node.configuration.agentId : "";
      const agentVersion = Number(node.configuration.agentVersion ?? 0);
      const agent = capabilities.agents.find(
        (candidate) => candidate.id === agentId && candidate.version === agentVersion
      );
      if (!agent) {
        findings.push(
          finding(
            "WF_AGENT_CAPABILITY_UNAVAILABLE",
            "The selected agent and immutable version are not available in this workspace.",
            { type: "node", key: node.key, path: "configuration.agentId" }
          )
        );
        agents.push({
          nodeKey: node.key,
          nodeName: node.name,
          agentId,
          agentVersion: Math.max(1, agentVersion),
          agentName: "Unavailable agent",
          suitable: false,
          reason: "The referenced agent version is unavailable."
        });
      } else {
        const suitability = agentSuitable(node, agent);
        agents.push({
          nodeKey: node.key,
          nodeName: node.name,
          agentId,
          agentVersion,
          agentName: agent.name,
          ...suitability
        });
        if (!suitability.suitable)
          findings.push(
            finding("WF_AGENT_CAPABILITY_MISMATCH", suitability.reason, {
              type: "node",
              key: node.key,
              path: "configuration.agentId"
            })
          );
      }
    }

    if (node.kind === "integration_action") {
      const connectionId =
        typeof node.configuration.connectionRef === "string"
          ? node.configuration.connectionRef
          : "";
      const action = typeof node.configuration.action === "string" ? node.configuration.action : "";
      const connection = capabilities.connections.find(({ id }) => id === connectionId);
      const actionAvailable = Boolean(
        connection &&
        ["active", "degraded"].includes(connection.state) &&
        connection.actions.includes(action)
      );
      integrations.push({
        key: `connected:${node.key}`,
        label: node.name,
        mode: connection && actionAvailable ? "connected" : "missing",
        nodeKey: node.key,
        ...(connectionId ? { connectionId } : {}),
        ...(connection ? { connectionName: connection.name } : {}),
        ...(action ? { action } : {}),
        reason:
          connection && actionAvailable
            ? `${connection.name} provides ${action}.`
            : "The referenced active connection does not provide this action."
      });
      if (!connection || !actionAvailable)
        findings.push(
          finding(
            "WF_INTEGRATION_CAPABILITY_UNAVAILABLE",
            "An integration action must bind to an active connection that declares the requested action.",
            { type: "node", key: node.key, path: "configuration.action" }
          )
        );
    }

    if (node.kind === "human") {
      const fallback = node.configuration.manualFallbackFor;
      const looksAutomatable =
        typeof fallback === "string" ||
        /\b(?:fetch|retrieve|sync|send|notify|update|write|publish|record|execute)\b/iu.test(
          `${node.name} ${node.description}`
        );
      if (looksAutomatable) {
        const label = typeof fallback === "string" ? fallback : node.name;
        integrations.push({
          key: `manual:${node.key}`,
          label,
          mode: "manual_fallback",
          nodeKey: node.key,
          reason:
            typeof fallback === "string"
              ? `No matching connection is configured for ${fallback}.`
              : "This system-oriented action is currently assigned to a person."
        });
        findings.push(
          finding(
            "WF_MANUAL_AUTOMATION_FALLBACK",
            `${label} is assigned to a person; configure a connection or explicitly retain the manual mode in the draft.`,
            { type: "node", key: node.key, path: "configuration.manualFallbackFor" },
            "warning"
          )
        );
      }
      if (typeof node.configuration.justification !== "string")
        findings.push(
          finding(
            "WF_HUMAN_JUDGMENT_JUSTIFICATION_REQUIRED",
            "Human work requires a concise explanation of why judgment or accountability is necessary.",
            { type: "node", key: node.key, path: "configuration.justification" }
          )
        );
    }

    if (node.kind === "approval") {
      const riskLevel = configuredRisk(node);
      const required = riskLevel === "high" || riskLevel === "critical";
      const reason =
        typeof node.configuration.justification === "string"
          ? node.configuration.justification
          : required
            ? `${riskLevel} risk requires accountable authorization.`
            : "No policy justification was provided for this approval.";
      approvals.push({ nodeKey: node.key, nodeName: node.name, riskLevel, required, reason });
      const promptLimitsApprovalToHighRisk =
        /(?:approval.{0,60}high[- ]risk|high[- ]risk.{0,60}approval)/iu.test(input.sourcePrompt);
      if (
        !required &&
        (typeof node.configuration.justification !== "string" || promptLimitsApprovalToHighRisk)
      )
        findings.push(
          finding(
            promptLimitsApprovalToHighRisk
              ? "WF_STANDARD_APPROVAL_UNNECESSARY"
              : "WF_APPROVAL_JUSTIFICATION_REQUIRED",
            promptLimitsApprovalToHighRisk
              ? "The requested policy limits approval to high-risk work, so remove this standard-risk gate."
              : "Low- and standard-risk approvals must be explicitly requested or cite a workspace policy; otherwise remove the gate.",
            { type: "node", key: node.key, path: "configuration.justification" }
          )
        );
      if (
        incomingFor(definition, node.key).some(
          ({ source }) => definition.nodes.find(({ key }) => key === source)?.kind === "approval"
        )
      )
        findings.push(
          finding("WF_APPROVAL_REDUNDANT", "Consecutive approvals must be consolidated.", {
            type: "node",
            key: node.key
          })
        );
    }

    if (node.kind === "transform") {
      const mapping = node.configuration.mapping;
      const values =
        mapping && typeof mapping === "object" && !Array.isArray(mapping)
          ? Object.values(mapping)
          : [];
      const executable = values.some(
        (value) => typeof value === "string" && /\$\{(?:input|nodes)\./u.test(value)
      );
      const terminal = outgoingFor(definition, node.key).length === 0;
      if (!terminal && !executable)
        findings.push(
          finding(
            "WF_TRANSFORM_LOGIC_REQUIRED",
            "A non-terminal transform must map at least one real input or prior-node output.",
            { type: "node", key: node.key, path: "configuration.mapping" }
          )
        );
    }
  }

  input.missingIntegrations.forEach((label, index) => {
    integrations.push({
      key: `missing:${String(index + 1)}`,
      label,
      mode: "missing",
      reason: "Configure a connection to automate this action before publication."
    });
    findings.push(
      finding(
        "WF_AUTOMATION_CONNECTION_MISSING",
        `${label} Configure the required connection before publication.`,
        { type: "workflow", path: `missingIntegrations[${String(index)}]` },
        "warning"
      )
    );
  });

  if (
    /\b(?:agent|artificial intelligence|ai)\b/iu.test(input.sourcePrompt) &&
    definition.nodes.every(({ kind }) => kind !== "agent") &&
    agentGaps.length === 0
  )
    agentGaps.push("A suitable agent capability requested by the workflow is unavailable.");
  agentGaps.forEach((capability, index) =>
    findings.push(
      finding(
        "WF_AGENT_CAPABILITY_MISSING",
        `${capability} Create or publish a suitable agent before workflow publication.`,
        { type: "workflow", path: `missingAgentCapabilities[${String(index)}]` },
        "warning"
      )
    )
  );

  const gates = definition.nodes.filter(
    (node) =>
      node.kind === "approval" ||
      (node.kind === "human" && typeof node.configuration.manualFallbackFor !== "string")
  );
  if (gates.length > 3 && gates.length / Math.max(1, definition.nodes.length) > 0.4)
    findings.push(
      finding(
        "WF_EXCESSIVE_MANUAL_GATES",
        `${String(gates.length)} of ${String(definition.nodes.length)} steps require human work or approval; consolidate gates and automate system actions.`,
        { type: "workflow" }
      )
    );

  const scenarios = simulatePaths(definition);
  for (const scenario of scenarios.filter(({ status }) => status === "failed"))
    findings.push(
      finding("WF_SCENARIO_FAILED", `${scenario.name}: ${scenario.assertions.at(-1)}`, {
        type: "workflow",
        path: scenario.id
      })
    );

  const uniqueFindings = [
    ...new Map(
      findings.map((item) => [
        `${item.code}:${item.location.key ?? ""}:${item.location.path ?? ""}`,
        item
      ])
    ).values()
  ];
  const errors = uniqueFindings.filter(({ severity }) => severity === "error").length;
  const warnings = uniqueFindings.length - errors;
  const automationBlockers = integrations.filter(({ mode }) => mode === "missing").length;
  const manualFallbacks = integrations.filter(({ mode }) => mode === "manual_fallback").length;
  const scenariosPassed = scenarios.filter(({ status }) => status === "passed").length;
  const draftAcceptable = errors === 0;
  const publishable =
    draftAcceptable &&
    automationBlockers === 0 &&
    manualFallbacks === 0 &&
    agentGaps.length === 0 &&
    scenarios.length > 0 &&
    scenariosPassed === scenarios.length;
  const automatedSteps = definition.nodes.filter(({ kind }) =>
    ["trigger", "agent", "condition", "delay", "transform", "integration_action"].includes(kind)
  ).length;

  return workflowQualityReportSchema.parse({
    score: Math.max(
      0,
      100 - errors * 18 - warnings * 4 - automationBlockers * 8 - manualFallbacks * 4
    ),
    draftAcceptable,
    publishable,
    summary: {
      automatedSteps,
      agentSteps: definition.nodes.filter(({ kind }) => kind === "agent").length,
      agentCapabilityGaps: agentGaps.length,
      humanSteps: definition.nodes.filter(({ kind }) => kind === "human").length,
      approvalSteps: approvals.length,
      conditionalApprovals: approvals.filter(({ required }) => required).length,
      connectedActions: integrations.filter(({ mode }) => mode === "connected").length,
      manualFallbacks,
      automationOpportunities: Math.max(automationBlockers, manualFallbacks),
      scenariosPassed,
      scenariosTotal: scenarios.length
    },
    agents,
    agentGaps,
    integrations,
    approvals,
    scenarios,
    findings: uniqueFindings
  });
}

export function compileWorkflowGeneration(input: {
  readonly definition: WorkflowDefinition;
  readonly sourcePrompt: string;
  readonly missingIntegrations: readonly string[];
  readonly missingAgentCapabilities?: readonly string[];
  readonly capabilities?: WorkflowQualityCapabilities;
}): { readonly definition: WorkflowDefinition; readonly quality: WorkflowQualityReport } {
  const capabilities = input.capabilities ?? { agents: [], connections: [] };
  const definition: WorkflowDefinition = {
    ...input.definition,
    nodes: input.definition.nodes.map((node) => {
      const configuration = { ...node.configuration };
      if (node.kind === "human") {
        if (Array.isArray(configuration.manualFallbackFor))
          configuration.manualFallbackFor = configuration.manualFallbackFor
            .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
            .join("; ");
        const outputs = configuration.outputs;
        if (outputs && typeof outputs === "object" && !Array.isArray(outputs)) {
          const fields = Object.entries(outputs)
            .slice(0, 200)
            .map(([rawKey, value], index) => {
              const specification =
                value && typeof value === "object" && !Array.isArray(value)
                  ? (value as Record<string, unknown>)
                  : {};
              const key =
                rawKey
                  .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/gu, "_")
                  .replace(/^[^a-z]+/u, "")
                  .slice(0, 64) || `field_${String(index + 1)}`;
              const declaredType = specification.type;
              const type =
                declaredType === "number" || declaredType === "integer"
                  ? "number"
                  : declaredType === "boolean"
                    ? "boolean"
                    : declaredType === "object" || declaredType === "array"
                      ? "json"
                      : "text";
              const label = rawKey
                .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
                .replace(/[_-]+/gu, " ")
                .replace(/^./u, (character) => character.toUpperCase())
                .slice(0, 160);
              return {
                key,
                label,
                type,
                required: true,
                ...(typeof specification.description === "string"
                  ? { help: specification.description.slice(0, 500) }
                  : {})
              };
            });
          if (fields.length > 0)
            configuration.formSchema = { schemaVersion: 1, title: node.name, fields };
        }
      }
      let executionMode: string;
      if (node.kind === "agent") executionMode = "bounded_agent";
      else if (node.kind === "integration_action") executionMode = "connected_action";
      else if (node.kind === "human")
        executionMode =
          typeof configuration.manualFallbackFor === "string" &&
          configuration.manualFallbackFor.length > 0
            ? "manual_fallback"
            : "human_judgment";
      else if (node.kind === "approval") executionMode = "governance_gate";
      else executionMode = "deterministic";
      return {
        ...node,
        configuration: { ...configuration, executionMode }
      };
    })
  };
  return {
    definition,
    quality: analyzeWorkflowQuality({ ...input, definition, capabilities })
  };
}
