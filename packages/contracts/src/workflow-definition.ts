import { z } from "zod";

export const workflowNodeKindSchema = z.enum([
  "trigger",
  "human",
  "agent",
  "approval",
  "condition",
  "delay",
  "loop",
  "subworkflow",
  "transform",
  "integration_action"
]);

const keySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const opaqueReferenceSchema = z
  .string()
  .regex(/^(?:sec|conn|agent|tool|wf)_[A-Za-z0-9_-]{8,160}$/u);

export const restrictedExpressionSchema = z
  .string()
  .min(1)
  .max(2_000)
  .refine((value) => !/;|\b(?:eval|function|constructor|prototype|import|require)\b/u.test(value), {
    message: "Expression contains a forbidden token."
  })
  .refine(
    (value) =>
      /^(?:[\w.\s'"(),:+*/%!?<>=&|-]|\$\{nodes\.[a-z][a-z0-9_-]*\.output(?:\.[a-zA-Z0-9_-]+)*\})+$/u.test(
        value
      ),
    { message: "Expression is outside the restricted expression language." }
  );

export const workflowDefinitionNodeSchema = z
  .object({
    key: keySchema,
    kind: workflowNodeKindSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().max(1_000).default(""),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    configuration: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export const workflowDefinitionEdgeSchema = z
  .object({
    key: keySchema,
    source: keySchema,
    target: keySchema,
    condition: restrictedExpressionSchema.optional()
  })
  .strict();

export const workflowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(160),
    description: z.string().max(4_000).default(""),
    inputSchema: z.record(z.string(), z.unknown()).default({}),
    outputSchema: z.record(z.string(), z.unknown()).default({}),
    nodes: z.array(workflowDefinitionNodeSchema).max(2_000),
    edges: z.array(workflowDefinitionEdgeSchema).max(4_000)
  })
  .strict();

export const validationFindingSchema = z
  .object({
    code: z.string().regex(/^WF_[A-Z0-9_]+$/u),
    severity: z.enum(["error", "warning"]),
    message: z.string().min(1).max(500),
    location: z
      .object({
        type: z.enum(["workflow", "node", "edge"]),
        key: z.string().max(80).optional(),
        path: z.string().max(300).optional()
      })
      .strict()
  })
  .strict();

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowDefinitionNode = z.infer<typeof workflowDefinitionNodeSchema>;
export type WorkflowDefinitionEdge = z.infer<typeof workflowDefinitionEdgeSchema>;
export type ValidationFinding = z.infer<typeof validationFindingSchema>;

const finding = (
  code: string,
  message: string,
  location: ValidationFinding["location"],
  severity: ValidationFinding["severity"] = "error"
): ValidationFinding => ({ code, severity, message, location });

function opaqueConfigurationFindings(node: WorkflowDefinitionNode): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const next = path ? `${path}.${key}` : key;
        if (/secretRef$/iu.test(key) && !opaqueReferenceSchema.safeParse(child).success) {
          findings.push(
            finding("WF_SECRET_REFERENCE_INVALID", "Secrets must use an opaque secret reference.", {
              type: "node",
              key: node.key,
              path: `configuration.${next}`
            })
          );
        }
        visit(child, next);
      }
    }
  };
  visit(node.configuration, "");
  return findings;
}

export function validateWorkflowDefinition(input: unknown): readonly ValidationFinding[] {
  const parsed = workflowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) =>
      finding("WF_DEFINITION_INVALID", issue.message, {
        type: "workflow",
        path: issue.path.join(".")
      })
    );
  }
  const definition = parsed.data;
  const findings: ValidationFinding[] = [];
  const nodes = new Map<string, WorkflowDefinitionNode>();
  for (const node of definition.nodes) {
    if (nodes.has(node.key))
      findings.push(
        finding("WF_NODE_KEY_DUPLICATE", `Node key ${node.key} is duplicated.`, {
          type: "node",
          key: node.key
        })
      );
    nodes.set(node.key, node);
    findings.push(...opaqueConfigurationFindings(node));
    if (node.kind === "loop") {
      const limit = node.configuration.maxIterations;
      if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 1_000)
        findings.push(
          finding("WF_LOOP_UNBOUNDED", "Loop nodes require maxIterations from 1 to 1000.", {
            type: "node",
            key: node.key,
            path: "configuration.maxIterations"
          })
        );
    }
    if (node.kind === "approval" && typeof node.configuration.policy !== "string")
      findings.push(
        finding("WF_APPROVAL_POLICY_REQUIRED", "Approval nodes require a policy.", {
          type: "node",
          key: node.key,
          path: "configuration.policy"
        })
      );
    if (node.kind === "integration_action") {
      if (typeof node.configuration.connectionRef !== "string")
        findings.push(
          finding("WF_CONNECTION_REQUIRED", "Integration actions require a connection reference.", {
            type: "node",
            key: node.key,
            path: "configuration.connectionRef"
          })
        );
      if (typeof node.configuration.idempotencyKey !== "string")
        findings.push(
          finding("WF_IDEMPOTENCY_REQUIRED", "External writes require an idempotency key.", {
            type: "node",
            key: node.key,
            path: "configuration.idempotencyKey"
          })
        );
      if (!(["low", "medium", "high"] as const).includes(node.configuration.risk as never))
        findings.push(
          finding("WF_RISK_REQUIRED", "External writes require a declared risk level.", {
            type: "node",
            key: node.key,
            path: "configuration.risk"
          })
        );
    }
    if (node.kind === "subworkflow" && typeof node.configuration.workflowRef !== "string")
      findings.push(
        finding(
          "WF_SUBWORKFLOW_CONTRACT_REQUIRED",
          "Subworkflow nodes require a workflow contract reference.",
          {
            type: "node",
            key: node.key,
            path: "configuration.workflowRef"
          }
        )
      );
  }
  const triggers = definition.nodes.filter(({ kind }) => kind === "trigger");
  if (triggers.length === 0)
    findings.push(
      finding("WF_TRIGGER_REQUIRED", "A workflow requires at least one trigger.", {
        type: "workflow"
      })
    );

  const edgeKeys = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const edge of definition.edges) {
    if (edgeKeys.has(edge.key))
      findings.push(
        finding("WF_EDGE_KEY_DUPLICATE", `Edge key ${edge.key} is duplicated.`, {
          type: "edge",
          key: edge.key
        })
      );
    edgeKeys.add(edge.key);
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
      findings.push(
        finding("WF_EDGE_NODE_MISSING", "An edge references a missing node.", {
          type: "edge",
          key: edge.key
        })
      );
      continue;
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const reachable = new Set<string>();
  const visitReachable = (key: string) => {
    if (reachable.has(key)) return;
    reachable.add(key);
    for (const target of outgoing.get(key) ?? []) visitReachable(target);
  };
  triggers.forEach(({ key }) => visitReachable(key));
  for (const node of definition.nodes)
    if (!reachable.has(node.key))
      findings.push(
        finding("WF_NODE_UNREACHABLE", `Node ${node.key} is not reachable from a trigger.`, {
          type: "node",
          key: node.key
        })
      );

  if (
    definition.nodes.length > 0 &&
    !definition.nodes.some(({ key }) => (outgoing.get(key) ?? []).length === 0)
  )
    findings.push(
      finding("WF_TERMINAL_REQUIRED", "At least one reachable terminal path is required.", {
        type: "workflow"
      })
    );

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const detectCycle = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const cyclic = (outgoing.get(key) ?? []).some((target) => detectCycle(target));
    visiting.delete(key);
    visited.add(key);
    return cyclic;
  };
  if (definition.nodes.some(({ key }) => detectCycle(key)))
    findings.push(
      finding(
        "WF_CYCLE_FORBIDDEN",
        "Graph cycles must be modeled with an explicit bounded loop node.",
        { type: "workflow" }
      )
    );
  return findings;
}

export function assertPublishableWorkflow(input: unknown): WorkflowDefinition {
  const findings = validateWorkflowDefinition(input);
  if (findings.some(({ severity }) => severity === "error"))
    throw new Error(`WORKFLOW_INVALID:${JSON.stringify(findings)}`);
  return workflowDefinitionSchema.parse(input);
}
