import { z } from "zod";

import {
  validateWorkflowDefinition,
  workflowDefinitionSchema,
  type ValidationFinding,
  type WorkflowDefinition
} from "./workflow-definition.js";

export const WORKFLOW_GENERATION_PROMPT_VERSION = "workflow-generation.v1" as const;
export const DETERMINISTIC_GENERATION_PROVIDER = "fixture-v1" as const;

export const workflowGenerationLifecycleSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLING",
  "CANCELLED"
]);
export const workflowGenerationPhaseSchema = z.enum([
  "GENERATING",
  "VALIDATING",
  "REPAIRING",
  "READY_TO_ACCEPT"
]);

export const workflowGenerationRequestSchema = z
  .object({
    prompt: z.string().trim().min(10).max(8_000),
    retryOf: z.string().uuid().optional(),
    fixture: z.enum(["standard", "refusal", "truncated", "invalid", "timeout"]).default("standard")
  })
  .strict();

export const workflowGenerationResultSchema = z
  .object({
    promptVersion: z.literal(WORKFLOW_GENERATION_PROMPT_VERSION),
    provider: z.string().min(1),
    simulated: z.boolean(),
    environmentStatus: z
      .enum(["RECORDED_CONTRACT", "PROVIDER_SANDBOX"])
      .default("RECORDED_CONTRACT"),
    providerResponseId: z.string().optional(),
    exactModelId: z.string().optional(),
    definition: workflowDefinitionSchema,
    assumptions: z.array(z.string().min(1).max(500)).max(50),
    assignments: z.array(z.string().min(1).max(500)).max(50),
    missingIntegrations: z.array(z.string().min(1).max(160)).max(50),
    findings: z.array(
      z.object({
        code: z.string(),
        severity: z.enum(["error", "warning"]),
        message: z.string(),
        location: z.object({
          type: z.enum(["workflow", "node", "edge"]),
          key: z.string().optional(),
          path: z.string().optional()
        })
      })
    ),
    repairAttempts: z.number().int().min(0).max(2),
    usage: z.object({
      inputUnits: z.number().int().nonnegative(),
      outputUnits: z.number().int().nonnegative(),
      costMinor: z.number().int().nonnegative(),
      currency: z.literal("USD")
    }),
    diff: z.object({
      addedNodes: z.number().int().nonnegative(),
      addedEdges: z.number().int().nonnegative()
    })
  })
  .strict();

export type WorkflowGenerationRequest = z.infer<typeof workflowGenerationRequestSchema>;
export type WorkflowGenerationResult = z.infer<typeof workflowGenerationResultSchema>;

const node = (
  key: string,
  kind: WorkflowDefinition["nodes"][number]["kind"],
  name: string,
  x: number,
  configuration: Record<string, unknown> = {}
): WorkflowDefinition["nodes"][number] => ({
  key,
  kind,
  name,
  description: "",
  position: { x, y: 120 },
  configuration
});

function generatedDefinition(prompt: string): WorkflowDefinition {
  const normalized = prompt.toLowerCase();
  const includesApproval = /approv|review|sign.?off/u.test(normalized);
  const includesNotification = /notify|message|email|slack/u.test(normalized);
  const nodes: WorkflowDefinition["nodes"] = [
    node("request_received", "trigger", "Request received", 80, { triggerType: "manual" }),
    node("prepare_request", "human", "Prepare request", 360, { assignment: "workflow_initiator" })
  ];
  if (includesApproval)
    nodes.push(
      node("review_request", "approval", "Review request", 640, {
        policy: "workspace_owner",
        allowSelfApproval: true,
        dueInMinutes: 30
      })
    );
  if (includesNotification)
    nodes.push(
      node(
        "record_notification",
        "transform",
        "Prepare notification",
        includesApproval ? 920 : 640,
        {
          expression: "${nodes.prepare_request.output}"
        }
      )
    );
  const edges = nodes.slice(1).map((current, index) => ({
    key: `path_${index + 1}`,
    source: nodes[index]!.key,
    target: current.key,
    pathType: "success" as const
  }));
  const words = prompt.trim().split(/\s+/u);
  return workflowDefinitionSchema.parse({
    schemaVersion: 1,
    name:
      words
        .slice(0, 7)
        .join(" ")
        .replace(/[.!?]+$/u, "") || "Guided workflow",
    description: `SIMULATED workflow generated from: ${prompt.slice(0, 240)}`,
    inputSchema: { type: "object", additionalProperties: true },
    outputSchema: { type: "object", additionalProperties: true },
    nodes,
    edges
  });
}

/** A local, deterministic worker contract. Provider instructions never include user data as authority. */
export async function runDeterministicGeneration(
  requestInput: WorkflowGenerationRequest,
  signal?: AbortSignal
): Promise<WorkflowGenerationResult> {
  await Promise.resolve();
  const request = workflowGenerationRequestSchema.parse(requestInput);
  if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
  if (request.fixture === "timeout") throw new Error("GENERATION_TIMEOUT");
  if (request.fixture === "refusal") throw new Error("GENERATION_REFUSED");
  if (request.fixture === "truncated") throw new Error("GENERATION_TRUNCATED");
  let definition = generatedDefinition(request.prompt);
  let repairAttempts = 0;
  if (request.fixture === "invalid") {
    definition = {
      ...definition,
      nodes: definition.nodes.filter(({ kind }) => kind !== "trigger")
    };
    if (validateWorkflowDefinition(definition).some(({ severity }) => severity === "error")) {
      repairAttempts = 1;
      definition = generatedDefinition(request.prompt);
    }
  }
  const findings = validateWorkflowDefinition(definition);
  return workflowGenerationResultSchema.parse({
    promptVersion: WORKFLOW_GENERATION_PROMPT_VERSION,
    provider: DETERMINISTIC_GENERATION_PROVIDER,
    simulated: true,
    environmentStatus: "RECORDED_CONTRACT",
    definition,
    assumptions: [
      "The workflow starts manually.",
      "The workflow initiator supplies the request data.",
      "All generated actions are review-only until accepted."
    ],
    assignments: ["Prepare request → workflow initiator"],
    missingIntegrations: /notify|message|email|slack/iu.test(request.prompt)
      ? ["A production notification connection must be selected before activation."]
      : [],
    findings,
    repairAttempts,
    usage: {
      inputUnits: request.prompt.length,
      outputUnits: JSON.stringify(definition).length,
      costMinor: 0,
      currency: "USD"
    },
    diff: { addedNodes: definition.nodes.length, addedEdges: definition.edges.length }
  });
}

export const dryRunFixtureSchema = z
  .object({
    input: z.record(z.string(), z.unknown()).default({}),
    humanSubmissions: z.record(z.string(), z.unknown()).default({}),
    agentOutputs: z.record(z.string(), z.unknown()).default({}),
    connectorOutputs: z.record(z.string(), z.unknown()).default({}),
    permissions: z.array(z.string()).default(["workflow.run"]),
    entitlements: z.array(z.string()).default(["workflows"]),
    healthyConnections: z.array(z.string()).default([]),
    budgetMinor: z.number().int().nonnegative().default(0),
    timezone: z.string().default("UTC")
  })
  .strict();

export interface DryRunStep {
  readonly nodeKey: string;
  readonly kind: string;
  readonly source:
    "input" | "human_fixture" | "agent_fixture" | "connector_fixture" | "deterministic";
  readonly value: unknown;
  readonly externalWrite: false;
}

export interface WorkflowDryRunReport {
  readonly simulated: true;
  readonly externalWrites: 0;
  readonly path: readonly string[];
  readonly steps: readonly DryRunStep[];
  readonly findings: readonly ValidationFinding[];
  readonly preflight: {
    readonly allowed: boolean;
    readonly checks: readonly {
      readonly key: string;
      readonly passed: boolean;
      readonly message: string;
    }[];
    readonly expectedCostMinor: number;
    readonly currency: "USD";
  };
}

function referencedConnection(definition: WorkflowDefinition, key: string): string | undefined {
  const value = definition.nodes.find((candidate) => candidate.key === key)?.configuration
    .connectionRef;
  return typeof value === "string" ? value : undefined;
}

export function dryRunWorkflow(
  definitionInput: unknown,
  fixtureInput: unknown
): WorkflowDryRunReport {
  const definition = workflowDefinitionSchema.parse(definitionInput);
  const fixture = dryRunFixtureSchema.parse(fixtureInput);
  const findings = validateWorkflowDefinition(definition);
  const expectedCostMinor = definition.nodes.filter(({ kind }) => kind === "agent").length;
  const requiredConnections = definition.nodes
    .filter(({ kind }) => kind === "integration_action")
    .map(({ key }) => referencedConnection(definition, key))
    .filter((value): value is string => Boolean(value));
  const riskyNodes = definition.nodes.filter(
    ({ kind, configuration }) => kind === "integration_action" && configuration.risk === "high"
  );
  const approvalNodes = definition.nodes.filter(({ kind }) => kind === "approval");
  const checks = [
    {
      key: "permission",
      passed: fixture.permissions.includes("workflow.run"),
      message: "Workflow run permission"
    },
    {
      key: "entitlement",
      passed: fixture.entitlements.includes("workflows"),
      message: "Workflow entitlement"
    },
    {
      key: "connections",
      passed: requiredConnections.every((value) => fixture.healthyConnections.includes(value)),
      message: "Required connections are healthy"
    },
    {
      key: "budget",
      passed: fixture.budgetMinor >= expectedCostMinor,
      message: "Expected cost is within budget"
    },
    {
      key: "approval",
      passed: riskyNodes.length === 0 || approvalNodes.length > 0,
      message: "Risky effects have approval coverage"
    },
    {
      key: "timezone",
      passed: fixture.timezone.length > 0,
      message: "Schedule timezone is explicit"
    },
    {
      key: "definition",
      passed: !findings.some(({ severity }) => severity === "error"),
      message: "Workflow definition is valid"
    }
  ];
  const outgoing = new Map<string, WorkflowDefinition["edges"]>();
  for (const edge of definition.edges)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  const start = definition.nodes.find(({ kind }) => kind === "trigger");
  const path: string[] = [];
  const seen = new Set<string>();
  let current = start;
  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    path.push(current.key);
    current = definition.nodes.find(({ key }) => key === outgoing.get(current!.key)?.[0]?.target);
  }
  const steps: DryRunStep[] = path.map((nodeKey) => {
    const currentNode = definition.nodes.find(({ key }) => key === nodeKey)!;
    const fixtureSource =
      currentNode.kind === "human"
        ? [fixture.humanSubmissions[nodeKey], "human_fixture"]
        : currentNode.kind === "agent"
          ? [fixture.agentOutputs[nodeKey], "agent_fixture"]
          : currentNode.kind === "integration_action"
            ? [fixture.connectorOutputs[nodeKey], "connector_fixture"]
            : currentNode.kind === "trigger"
              ? [fixture.input, "input"]
              : [{ status: "simulated" }, "deterministic"];
    return {
      nodeKey,
      kind: currentNode.kind,
      source: fixtureSource[1] as DryRunStep["source"],
      value: fixtureSource[0] ?? { status: "fixture_missing" },
      externalWrite: false
    };
  });
  return {
    simulated: true,
    externalWrites: 0,
    path,
    steps,
    findings,
    preflight: {
      allowed: checks.every(({ passed }) => passed),
      checks,
      expectedCostMinor,
      currency: "USD"
    }
  };
}

const csvCell = (value: string) => value.trim().replace(/^"|"$/gu, "");

/** CSV columns: key,name,kind,depends_on. Dependencies are pipe-separated node keys. */
export function importWorkflowCsv(csv: string): WorkflowDefinition {
  const lines = csv.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV_EMPTY");
  const headers = lines[0]!.split(",").map(csvCell);
  if (headers.join(",") !== "key,name,kind,depends_on") throw new Error("CSV_HEADER_INVALID");
  const rows = lines.slice(1).map((line) => line.split(",").map(csvCell));
  const nodes = rows.map(([key, name, kind], index) =>
    workflowDefinitionSchema.shape.nodes.element.parse({
      key,
      name,
      kind,
      description: "Imported from CSV",
      position: { x: 100 + index * 260, y: 120 },
      configuration:
        kind === "approval"
          ? { policy: "workspace_owner" }
          : kind === "loop"
            ? { maxIterations: 10 }
            : {}
    })
  );
  const edges = rows.flatMap(([target, , , dependencies], rowIndex) =>
    (dependencies ?? "")
      .split("|")
      .filter(Boolean)
      .map((source, dependencyIndex) => ({
        key: `import_${rowIndex}_${dependencyIndex}`,
        source,
        target: target!
      }))
  );
  return workflowDefinitionSchema.parse({
    schemaVersion: 1,
    name: "Imported workflow",
    description: "Imported from the documented key,name,kind,depends_on CSV format.",
    inputSchema: {},
    outputSchema: {},
    nodes,
    edges
  });
}
