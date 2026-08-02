import type {
  WorkflowDefinition,
  WorkflowDefinitionEdge,
  WorkflowDefinitionNode
} from "@knotline/contracts";

export interface StudioState {
  readonly definition: WorkflowDefinition;
  readonly selectedNodeKeys: readonly string[];
  readonly selectedEdgeKey: string | undefined;
  readonly past: readonly WorkflowDefinition[];
  readonly future: readonly WorkflowDefinition[];
  readonly clipboard: readonly WorkflowDefinitionNode[];
  readonly direction: "horizontal" | "vertical";
  readonly revision: number;
}

export type StudioCommand =
  | { type: "select_node"; key: string; additive?: boolean }
  | { type: "select_edge"; key: string }
  | {
      type: "update_workflow";
      patch: Partial<Pick<WorkflowDefinition, "name" | "description">>;
    }
  | { type: "add_node"; node: WorkflowDefinitionNode }
  | { type: "update_node"; key: string; patch: Partial<WorkflowDefinitionNode> }
  | { type: "move_node"; key: string; position: { x: number; y: number } }
  | { type: "delete_nodes"; keys: readonly string[] }
  | { type: "duplicate_nodes"; keys: readonly string[] }
  | { type: "connect"; edge: WorkflowDefinitionEdge }
  | { type: "update_edge"; key: string; patch: Partial<WorkflowDefinitionEdge> }
  | { type: "delete_edge"; key: string }
  | { type: "split_edge"; key: string; node: WorkflowDefinitionNode }
  | { type: "copy"; keys: readonly string[] }
  | { type: "paste" }
  | { type: "group"; keys: readonly string[]; groupId: string }
  | { type: "disable"; keys: readonly string[]; disabled: boolean }
  | { type: "align"; keys: readonly string[]; axis: "x" | "y" }
  | { type: "distribute"; keys: readonly string[]; axis: "x" | "y" }
  | {
      type: "layout";
      positions: Readonly<Record<string, { x: number; y: number }>>;
      direction: "horizontal" | "vertical";
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; definition: WorkflowDefinition; revision: number };

export const initialStudioState = (
  definition: WorkflowDefinition,
  revision: number
): StudioState => ({
  definition,
  selectedNodeKeys: [],
  selectedEdgeKey: undefined,
  past: [],
  future: [],
  clipboard: [],
  direction: "horizontal",
  revision
});

const uniqueKey = (base: string, occupied: ReadonlySet<string>) => {
  let key = base;
  let suffix = 2;
  while (occupied.has(key)) key = `${base}_${suffix++}`;
  return key;
};

function commit(state: StudioState, definition: WorkflowDefinition): StudioState {
  if (definition === state.definition) return state;
  return {
    ...state,
    definition,
    past: [...state.past.slice(-99), state.definition],
    future: [],
    revision: state.revision + 1
  };
}

const patchNodes = (
  definition: WorkflowDefinition,
  keys: ReadonlySet<string>,
  patch: (node: WorkflowDefinitionNode) => WorkflowDefinitionNode
) => ({
  ...definition,
  nodes: definition.nodes.map((node) => (keys.has(node.key) ? patch(node) : node))
});

export function studioReducer(state: StudioState, command: StudioCommand): StudioState {
  switch (command.type) {
    case "select_node":
      return {
        ...state,
        selectedNodeKeys: command.additive
          ? state.selectedNodeKeys.includes(command.key)
            ? state.selectedNodeKeys.filter((key) => key !== command.key)
            : [...state.selectedNodeKeys, command.key]
          : [command.key],
        selectedEdgeKey: undefined
      };
    case "select_edge":
      return { ...state, selectedNodeKeys: [], selectedEdgeKey: command.key };
    case "update_workflow":
      return commit(state, { ...state.definition, ...command.patch });
    case "add_node":
      return {
        ...commit(state, { ...state.definition, nodes: [...state.definition.nodes, command.node] }),
        selectedNodeKeys: [command.node.key]
      };
    case "update_node":
      return commit(
        state,
        patchNodes(state.definition, new Set([command.key]), (node) => ({
          ...node,
          ...command.patch
        }))
      );
    case "move_node":
      return commit(
        state,
        patchNodes(state.definition, new Set([command.key]), (node) => ({
          ...node,
          position: command.position
        }))
      );
    case "delete_nodes": {
      const removed = new Set(command.keys);
      return {
        ...commit(state, {
          ...state.definition,
          nodes: state.definition.nodes.filter(({ key }) => !removed.has(key)),
          edges: state.definition.edges.filter(
            ({ source, target }) => !removed.has(source) && !removed.has(target)
          )
        }),
        selectedNodeKeys: state.selectedNodeKeys.filter((key) => !removed.has(key))
      };
    }
    case "duplicate_nodes": {
      const selected = new Set(command.keys);
      const occupied = new Set(state.definition.nodes.map(({ key }) => key));
      const duplicated: WorkflowDefinitionNode[] = [];
      const mapping = new Map<string, string>();
      const occupiedEdgeKeys = new Set(state.definition.edges.map(({ key }) => key));
      for (const node of state.definition.nodes.filter(({ key }) => selected.has(key))) {
        const key = uniqueKey(`${node.key}_copy`, occupied);
        occupied.add(key);
        mapping.set(node.key, key);
        duplicated.push({
          ...node,
          key,
          name: `${node.name} copy`,
          position: { x: node.position.x + 48, y: node.position.y + 48 }
        });
      }
      const edges = state.definition.edges
        .filter(({ source, target }) => selected.has(source) && selected.has(target))
        .map((edge) => {
          const key = uniqueKey(`${edge.key}_copy`, occupiedEdgeKeys);
          occupiedEdgeKeys.add(key);
          return {
            ...edge,
            key,
            source: mapping.get(edge.source)!,
            target: mapping.get(edge.target)!
          };
        });
      return {
        ...commit(state, {
          ...state.definition,
          nodes: [...state.definition.nodes, ...duplicated],
          edges: [...state.definition.edges, ...edges]
        }),
        selectedNodeKeys: duplicated.map(({ key }) => key)
      };
    }
    case "connect":
      return commit(state, {
        ...state.definition,
        edges: [...state.definition.edges, command.edge]
      });
    case "update_edge":
      return commit(state, {
        ...state.definition,
        edges: state.definition.edges.map((edge) =>
          edge.key === command.key ? { ...edge, ...command.patch } : edge
        )
      });
    case "delete_edge":
      return {
        ...commit(state, {
          ...state.definition,
          edges: state.definition.edges.filter(({ key }) => key !== command.key)
        }),
        selectedEdgeKey: undefined
      };
    case "split_edge": {
      const edge = state.definition.edges.find(({ key }) => key === command.key);
      if (!edge) return state;
      return commit(state, {
        ...state.definition,
        nodes: [...state.definition.nodes, command.node],
        edges: [
          ...state.definition.edges.filter(({ key }) => key !== command.key),
          { key: `${edge.key}_in`, source: edge.source, target: command.node.key },
          {
            key: `${edge.key}_out`,
            source: command.node.key,
            target: edge.target,
            ...(edge.condition ? { condition: edge.condition } : {})
          }
        ]
      });
    }
    case "copy":
      return {
        ...state,
        clipboard: state.definition.nodes.filter(({ key }) => command.keys.includes(key))
      };
    case "paste": {
      const occupied = new Set(state.definition.nodes.map(({ key }) => key));
      const nodes = state.clipboard.map((node) => {
        const key = uniqueKey(`${node.key}_copy`, occupied);
        occupied.add(key);
        return {
          ...node,
          key,
          name: `${node.name} copy`,
          position: { x: node.position.x + 48, y: node.position.y + 48 }
        };
      });
      return {
        ...commit(state, { ...state.definition, nodes: [...state.definition.nodes, ...nodes] }),
        selectedNodeKeys: nodes.map(({ key }) => key)
      };
    }
    case "group":
      return commit(
        state,
        patchNodes(state.definition, new Set(command.keys), (node) => ({
          ...node,
          configuration: { ...node.configuration, groupId: command.groupId }
        }))
      );
    case "disable":
      return commit(
        state,
        patchNodes(state.definition, new Set(command.keys), (node) => ({
          ...node,
          configuration: { ...node.configuration, disabled: command.disabled }
        }))
      );
    case "align": {
      const selected = state.definition.nodes.filter(({ key }) => command.keys.includes(key));
      if (selected.length < 2) return state;
      const value = Math.min(...selected.map(({ position }) => position[command.axis]));
      return commit(
        state,
        patchNodes(state.definition, new Set(command.keys), (node) => ({
          ...node,
          position: { ...node.position, [command.axis]: value }
        }))
      );
    }
    case "distribute": {
      const selected = state.definition.nodes
        .filter(({ key }) => command.keys.includes(key))
        .sort((a, b) => a.position[command.axis] - b.position[command.axis]);
      if (selected.length < 3) return state;
      const first = selected[0]!.position[command.axis];
      const step = (selected.at(-1)!.position[command.axis] - first) / (selected.length - 1);
      const positions = new Map(selected.map((node, index) => [node.key, first + step * index]));
      return commit(
        state,
        patchNodes(state.definition, new Set(command.keys), (node) => ({
          ...node,
          position: { ...node.position, [command.axis]: positions.get(node.key)! }
        }))
      );
    }
    case "layout":
      return {
        ...commit(state, {
          ...state.definition,
          nodes: state.definition.nodes.map((node) => ({
            ...node,
            position: command.positions[node.key] ?? node.position
          }))
        }),
        direction: command.direction
      };
    case "undo": {
      const previous = state.past.at(-1);
      return previous
        ? {
            ...state,
            definition: previous,
            past: state.past.slice(0, -1),
            future: [state.definition, ...state.future],
            revision: state.revision + 1
          }
        : state;
    }
    case "redo": {
      const next = state.future[0];
      return next
        ? {
            ...state,
            definition: next,
            past: [...state.past, state.definition],
            future: state.future.slice(1),
            revision: state.revision + 1
          }
        : state;
    }
    case "replace":
      return initialStudioState(command.definition, command.revision);
  }
}

export function deterministicLayout(
  definition: WorkflowDefinition,
  direction: "horizontal" | "vertical"
): Readonly<Record<string, { x: number; y: number }>> {
  const incoming = new Map(definition.nodes.map(({ key }) => [key, 0]));
  for (const edge of definition.edges)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const levels = new Map<string, number>();
  const queue = definition.nodes
    .filter(({ key }) => (incoming.get(key) ?? 0) === 0)
    .map(({ key }) => key);
  for (const key of queue) levels.set(key, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!;
    for (const edge of definition.edges.filter(({ source }) => source === key)) {
      levels.set(edge.target, Math.max(levels.get(edge.target) ?? 0, (levels.get(key) ?? 0) + 1));
      incoming.set(edge.target, (incoming.get(edge.target) ?? 1) - 1);
      if (incoming.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  const counts = new Map<number, number>();
  return Object.fromEntries(
    definition.nodes.map((node, index) => {
      const level = levels.get(node.key) ?? index;
      const lane = counts.get(level) ?? 0;
      counts.set(level, lane + 1);
      return [
        node.key,
        direction === "horizontal"
          ? { x: level * 280, y: lane * 180 }
          : { x: lane * 280, y: level * 180 }
      ];
    })
  );
}
