import { describe, expect, it } from "vitest";

import {
  assertPublishableWorkflow,
  restrictedExpressionSchema,
  validateWorkflowDefinition,
  type WorkflowDefinition
} from "./workflow-definition.js";

const valid: WorkflowDefinition = {
  schemaVersion: 1,
  name: "Customer onboarding",
  description: "",
  inputSchema: {},
  outputSchema: {},
  nodes: [
    {
      key: "start",
      kind: "trigger",
      name: "Start",
      description: "",
      position: { x: 0, y: 0 },
      configuration: {}
    },
    {
      key: "review",
      kind: "human",
      name: "Review",
      description: "",
      position: { x: 200, y: 0 },
      configuration: {}
    }
  ],
  edges: [{ key: "start_review", source: "start", target: "review" }]
};

describe("versioned workflow definition validation", () => {
  it("accepts a reachable typed DAG and returns stable deep-link findings", () => {
    expect(validateWorkflowDefinition(valid)).toEqual([]);
    expect(assertPublishableWorkflow(valid)).toEqual(valid);
    const invalid = { ...valid, nodes: [...valid.nodes, { ...valid.nodes[1], key: "orphan" }] };
    expect(validateWorkflowDefinition(invalid)).toContainEqual(
      expect.objectContaining({
        code: "WF_NODE_UNREACHABLE",
        location: { type: "node", key: "orphan" }
      })
    );
  });

  it("rejects cycles, unbounded loops, unsafe writes, and raw secrets", () => {
    const invalid = {
      ...valid,
      nodes: [
        valid.nodes[0],
        {
          key: "loop",
          kind: "loop",
          name: "Loop",
          description: "",
          position: { x: 1, y: 1 },
          configuration: { maxIterations: 0 }
        },
        {
          key: "write",
          kind: "integration_action",
          name: "Write",
          description: "",
          position: { x: 2, y: 1 },
          configuration: { secretRef: "plaintext" }
        }
      ],
      edges: [
        { key: "a", source: "start", target: "loop" },
        { key: "b", source: "loop", target: "write" },
        { key: "c", source: "write", target: "loop" }
      ]
    };
    const codes = validateWorkflowDefinition(invalid).map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "WF_LOOP_UNBOUNDED",
        "WF_CYCLE_FORBIDDEN",
        "WF_IDEMPOTENCY_REQUIRED",
        "WF_RISK_REQUIRED",
        "WF_SECRET_REFERENCE_INVALID"
      ])
    );
  });

  it("keeps the expression language non-evaluating and deterministic", () => {
    expect(restrictedExpressionSchema.safeParse("${nodes.start.output.total} > 2").success).toBe(
      true
    );
    expect(
      restrictedExpressionSchema.safeParse("constructor.constructor('return process')()").success
    ).toBe(false);
    expect(restrictedExpressionSchema.safeParse("value; import('x')").success).toBe(false);
  });

  it("rejects approval policies with no independent approver or usable deadline", () => {
    const findings = validateWorkflowDefinition({
      ...valid,
      nodes: [
        valid.nodes[0],
        {
          ...valid.nodes[1],
          kind: "approval",
          configuration: {
            policy: "independent-review",
            allowSelfApproval: false,
            dueInMinutes: 0
          }
        }
      ]
    });

    expect(findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["WF_APPROVER_REQUIRED", "WF_APPROVAL_DEADLINE_INVALID"])
    );
  });

  it("validates generated linear DAGs without findings", () => {
    for (let size = 2; size <= 32; size += 5) {
      const nodes: WorkflowDefinition["nodes"] = Array.from({ length: size }, (_, index) => ({
        key: `node_${index}`,
        kind: index === 0 ? "trigger" : "transform",
        name: `Node ${index}`,
        description: "",
        position: { x: index * 100, y: 0 },
        configuration: index === 0 ? {} : { mapping: { value: "${input.value}" } }
      }));
      const edges: WorkflowDefinition["edges"] = nodes.slice(1).map((node, index) => ({
        key: `edge_${index}`,
        source: nodes[index]!.key,
        target: node.key
      }));
      expect(validateWorkflowDefinition({ ...valid, nodes, edges })).toEqual([]);
    }
  });

  it("rejects transform nodes without an executable field mapping", () => {
    const findings = validateWorkflowDefinition({
      ...valid,
      nodes: [
        valid.nodes[0],
        {
          ...valid.nodes[1],
          kind: "transform",
          configuration: {}
        }
      ]
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "WF_TRANSFORM_MAPPING_REQUIRED",
        location: { type: "node", key: "review", path: "configuration.mapping" }
      })
    );
  });

  it("reports malformed contracts, duplicate keys, missing references, and typed configuration gaps", () => {
    expect(validateWorkflowDefinition({ schemaVersion: 2 })[0]?.code).toBe("WF_DEFINITION_INVALID");
    const approval = {
      key: "approve",
      kind: "approval" as const,
      name: "Approve",
      description: "",
      position: { x: 1, y: 1 },
      configuration: {}
    };
    const subworkflow = {
      ...approval,
      key: "child",
      kind: "subworkflow" as const,
      name: "Child"
    };
    const findings = validateWorkflowDefinition({
      ...valid,
      nodes: [valid.nodes[0], approval, approval, subworkflow],
      edges: [
        { key: "duplicate", source: "start", target: "approve" },
        { key: "duplicate", source: "missing", target: "child" }
      ]
    });
    expect(findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "WF_NODE_KEY_DUPLICATE",
        "WF_EDGE_KEY_DUPLICATE",
        "WF_EDGE_NODE_MISSING",
        "WF_APPROVAL_POLICY_REQUIRED",
        "WF_SUBWORKFLOW_CONTRACT_REQUIRED"
      ])
    );
  });
});
