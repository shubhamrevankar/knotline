import type { NodeKind, NodeStatus, Workflow } from "@knotline/contracts";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import {
  Bot,
  Braces,
  Check,
  CircleDot,
  Clock3,
  GitBranch,
  Network,
  PlugZap,
  Repeat2,
  Send,
  ShieldCheck,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { msg } from "./i18n.js";

type OperationNodeData = {
  title: string;
  description: string;
  kind: NodeKind;
  owner: string;
  status: NodeStatus;
};

const iconByKind: Record<NodeKind, LucideIcon> = {
  trigger: CircleDot,
  human: UserRound,
  agent: Bot,
  approval: ShieldCheck,
  action: Send,
  condition: GitBranch,
  delay: Clock3,
  loop: Repeat2,
  subworkflow: Network,
  transform: Braces,
  integration_action: PlugZap
};

const kindLabels = (): Record<NodeKind, string> => ({
  action: msg("canvas.kind.action"),
  agent: msg("canvas.kind.agent"),
  approval: msg("canvas.kind.approval"),
  condition: msg("canvas.kind.condition"),
  delay: msg("canvas.kind.delay"),
  human: msg("canvas.kind.human"),
  integration_action: msg("canvas.kind.integrationaction"),
  loop: msg("canvas.kind.loop"),
  subworkflow: msg("canvas.kind.subworkflow"),
  transform: msg("canvas.kind.transform"),
  trigger: msg("canvas.kind.trigger")
});

function OperationNode({ data }: NodeProps<Node<OperationNodeData>>) {
  const Icon = iconByKind[data.kind] ?? CircleDot;
  const kindLabel = kindLabels()[data.kind] ?? data.kind;
  return (
    <article className={`operation-node operation-node--${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span className="node-kind">
          <Icon aria-hidden="true" size={13} strokeWidth={2.2} />
          {kindLabel}
        </span>
        <span aria-hidden="true" className={`status-dot status-dot--${data.status}`} />
      </header>
      <h3>{data.title}</h3>
      <p>{data.description}</p>
      <footer>
        <span aria-hidden="true" className="avatar">
          {data.owner.charAt(0)}
        </span>
        <span>{data.owner}</span>
        {data.status === "complete" && (
          <Check aria-hidden="true" className="node-check" size={14} />
        )}
      </footer>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const nodeTypes = { operation: OperationNode };

export function WorkflowCanvas({ workflow }: { workflow: Workflow }) {
  const labelsByKind = kindLabels();
  const statusLabels: Record<NodeStatus, string> = {
    complete: msg("canvas.status.complete"),
    failed: msg("canvas.status.failed"),
    queued: msg("canvas.status.queued"),
    running: msg("canvas.status.running"),
    waiting: msg("canvas.status.waiting")
  };
  const nodes: Node<OperationNodeData>[] = workflow.nodes.map((node) => ({
    ariaLabel: msg("canvas.node.aria", {
      kind: labelsByKind[node.kind] ?? node.kind,
      owner: node.owner,
      status: statusLabels[node.status],
      title: node.title
    }),
    id: node.id,
    type: "operation",
    position: { x: node.x, y: node.y },
    data: {
      title: node.title,
      description: node.description,
      kind: node.kind,
      owner: node.owner,
      status: node.status
    }
  }));

  const edges: Edge[] = workflow.edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#77938a" },
    style: { stroke: "#77938a", strokeWidth: 1.5 }
  }));

  return (
    <div
      aria-label={msg("canvas.region.aria", { count: nodes.length, name: workflow.name })}
      className="canvas"
      role="region"
    >
      <p className="sr-only">{msg("canvas.instructions", { count: nodes.length })}</p>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.35}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="rgba(23, 107, 91, 0.16)"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => (node.data.status === "running" ? "#176b5b" : "#a9bbb4")}
          maskColor="rgba(245, 246, 241, 0.72)"
        />
      </ReactFlow>
    </div>
  );
}
