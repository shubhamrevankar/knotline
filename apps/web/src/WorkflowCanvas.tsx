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
import { Bot, Check, CircleDot, Send, ShieldCheck, UserRound } from "lucide-react";

type OperationNodeData = {
  title: string;
  description: string;
  kind: NodeKind;
  owner: string;
  status: NodeStatus;
};

const iconByKind = {
  trigger: CircleDot,
  human: UserRound,
  agent: Bot,
  approval: ShieldCheck,
  action: Send
};

function OperationNode({ data }: NodeProps<Node<OperationNodeData>>) {
  const Icon = iconByKind[data.kind];
  return (
    <article className={`operation-node operation-node--${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span className="node-kind">
          <Icon size={13} strokeWidth={2.2} />
          {data.kind}
        </span>
        <span className={`status-dot status-dot--${data.status}`} />
      </header>
      <h3>{data.title}</h3>
      <p>{data.description}</p>
      <footer>
        <span className="avatar">{data.owner.charAt(0)}</span>
        <span>{data.owner}</span>
        {data.status === "complete" && <Check className="node-check" size={14} />}
      </footer>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const nodeTypes = { operation: OperationNode };

export function WorkflowCanvas({ workflow }: { workflow: Workflow }) {
  const nodes: Node<OperationNodeData>[] = workflow.nodes.map((node) => ({
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
    markerEnd: { type: MarkerType.ArrowClosed, color: "#7f8b8f" },
    style: { stroke: "#7f8b8f", strokeWidth: 1.5 }
  }));

  return (
    <div className="canvas">
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
          color="rgba(190, 205, 209, 0.14)"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) =>
            node.data.status === "running" ? "#c8ff52" : "#5e6b70"
          }
          maskColor="rgba(17, 19, 21, 0.78)"
        />
      </ReactFlow>
    </div>
  );
}
