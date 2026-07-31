import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@knotline/contracts";

import { deterministicLayout, initialStudioState, studioReducer } from "./studio-reducer.js";

const definition: WorkflowDefinition = {
  schemaVersion: 1,
  name: "Studio",
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
      position: { x: 10, y: 20 },
      configuration: {}
    }
  ],
  edges: [
    {
      key: "start_review",
      source: "start",
      target: "review",
      pathType: "default",
      mapping: {}
    }
  ]
};

describe("workflow studio command reducer", () => {
  it("supports add, update, connect, split, disable, group, and cascading delete", () => {
    let state = initialStudioState(definition, 1);
    state = studioReducer(state, {
      type: "add_node",
      node: {
        key: "approve",
        kind: "approval",
        name: "Approve",
        description: "",
        position: { x: 30, y: 40 },
        configuration: { policy: "owner" }
      }
    });
    state = studioReducer(state, {
      type: "connect",
      edge: {
        key: "review_approve",
        source: "review",
        target: "approve",
        pathType: "success",
        mapping: {}
      }
    });
    state = studioReducer(state, { type: "disable", keys: ["approve"], disabled: true });
    state = studioReducer(state, {
      type: "group",
      keys: ["review", "approve"],
      groupId: "reviewers"
    });
    state = studioReducer(state, {
      type: "split_edge",
      key: "start_review",
      node: {
        key: "prepare",
        kind: "transform",
        name: "Prepare",
        description: "",
        position: { x: 5, y: 5 },
        configuration: {}
      }
    });
    expect(state.definition.nodes).toHaveLength(4);
    expect(state.definition.edges).toHaveLength(3);
    expect(
      state.definition.nodes.find(({ key }) => key === "approve")?.configuration
    ).toMatchObject({ disabled: true, groupId: "reviewers" });
    state = studioReducer(state, { type: "delete_nodes", keys: ["prepare"] });
    expect(
      state.definition.edges.some(
        ({ source, target }) => source === "prepare" || target === "prepare"
      )
    ).toBe(false);
  });

  it("has lossless undo/redo properties over repeated commands", () => {
    let state = initialStudioState(definition, 1);
    const original = state.definition;
    for (let index = 0; index < 25; index += 1)
      state = studioReducer(state, {
        type: "move_node",
        key: "review",
        position: { x: index, y: index * 2 }
      });
    for (let index = 0; index < 25; index += 1) state = studioReducer(state, { type: "undo" });
    expect(state.definition).toEqual(original);
    for (let index = 0; index < 25; index += 1) state = studioReducer(state, { type: "redo" });
    expect(state.definition.nodes[1]?.position).toEqual({ x: 24, y: 48 });
  });

  it("duplicates, copies, pastes, aligns, distributes, and lays out deterministically", () => {
    let state = initialStudioState(
      {
        ...definition,
        nodes: [
          ...definition.nodes,
          { ...definition.nodes[1]!, key: "finish", name: "Finish", position: { x: 100, y: 100 } }
        ]
      },
      1
    );
    state = studioReducer(state, { type: "duplicate_nodes", keys: ["review", "finish"] });
    expect(new Set(state.definition.nodes.map(({ key }) => key)).size).toBe(
      state.definition.nodes.length
    );
    state = studioReducer(state, { type: "copy", keys: ["start"] });
    state = studioReducer(state, { type: "paste" });
    state = studioReducer(state, { type: "align", keys: ["start", "review"], axis: "y" });
    state = studioReducer(state, {
      type: "distribute",
      keys: ["start", "review", "finish"],
      axis: "x"
    });
    const first = deterministicLayout(state.definition, "horizontal");
    const second = deterministicLayout(state.definition, "horizontal");
    expect(first).toEqual(second);
    state = studioReducer(state, { type: "layout", positions: first, direction: "horizontal" });
    expect(state.definition.nodes[0]?.position).toEqual(first.start);
  });

  it("lays out a 500-node reference graph within the interaction budget", () => {
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      ...definition.nodes[index === 0 ? 0 : 1]!,
      key: `node_${index}`,
      name: `Node ${index}`
    }));
    const edges = nodes.slice(1).map((node, index) => ({
      key: `edge_${index}`,
      source: nodes[index]!.key,
      target: node.key,
      pathType: "default" as const,
      mapping: {}
    }));
    const large = { ...definition, nodes, edges };
    const started = performance.now();
    const result = deterministicLayout(large, "vertical");
    expect(Object.keys(result)).toHaveLength(500);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("handles selection toggles and safe no-op command boundaries", () => {
    let state = initialStudioState(definition, 1);
    expect(studioReducer(state, { type: "undo" })).toBe(state);
    expect(studioReducer(state, { type: "redo" })).toBe(state);
    expect(
      studioReducer(state, { type: "split_edge", key: "missing", node: definition.nodes[0]! })
    ).toBe(state);
    expect(studioReducer(state, { type: "align", keys: ["start"], axis: "x" })).toBe(state);
    expect(studioReducer(state, { type: "distribute", keys: ["start"], axis: "y" })).toBe(state);

    state = studioReducer(state, { type: "select_node", key: "start", additive: true });
    expect(state.selectedNodeKeys).toEqual(["start"]);
    state = studioReducer(state, { type: "select_node", key: "review", additive: true });
    expect(state.selectedNodeKeys).toEqual(["start", "review"]);
    state = studioReducer(state, { type: "select_node", key: "start", additive: true });
    expect(state.selectedNodeKeys).toEqual(["review"]);
    state = studioReducer(state, { type: "select_edge", key: "start_review" });
    expect(state.selectedEdgeKey).toBe("start_review");
    state = studioReducer(state, { type: "delete_edge", key: "start_review" });
    expect(state.definition.edges).toHaveLength(0);

    const replacement = { ...definition, name: "Replacement" };
    state = studioReducer(state, { type: "replace", definition: replacement, revision: 9 });
    expect(state.definition.name).toBe("Replacement");
    expect(state.revision).toBe(9);
  });
});
