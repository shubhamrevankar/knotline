export type WorkflowStatus = "draft" | "active" | "paused" | "archived";
export type NodeStatus = "queued" | "running" | "waiting" | "complete" | "failed";
export type NodeKind = "trigger" | "human" | "agent" | "approval" | "action";

export interface WorkflowNode {
  id: string;
  title: string;
  description: string;
  kind: NodeKind;
  owner: string;
  status: NodeStatus;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  teamId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  version: number;
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowSummary extends Omit<Workflow, "nodes" | "edges"> {
  nodeCount: number;
  activeRuns: number;
}

export interface ApiEnvelope<T> {
  data: T;
}
