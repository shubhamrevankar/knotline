import type { Workflow, WorkflowSummary } from "@knotline/contracts";

const seededWorkflow: Workflow = {
  id: "wf_launch-campaign",
  teamId: "team_northstar",
  name: "Launch intelligence brief",
  description: "Turn a product signal into a reviewed, channel-ready launch brief.",
  status: "active",
  version: 7,
  updatedAt: "2026-07-31T08:45:00.000Z",
  nodes: [
    {
      id: "signal",
      title: "Capture signal",
      description: "Collect the launch request, audience, constraints, and source material.",
      kind: "trigger",
      owner: "Maya Chen",
      status: "complete",
      x: 80,
      y: 250
    },
    {
      id: "research",
      title: "Map the market",
      description: "Find competitor movement, customer language, and relevant evidence.",
      kind: "agent",
      owner: "Scout",
      status: "running",
      x: 410,
      y: 120
    },
    {
      id: "position",
      title: "Shape the angle",
      description: "Synthesize the evidence into a differentiated narrative.",
      kind: "agent",
      owner: "Strategist",
      status: "queued",
      x: 740,
      y: 120
    },
    {
      id: "review",
      title: "Editorial gate",
      description: "Review claims, tone, risk, and launch readiness.",
      kind: "approval",
      owner: "Jordan Lee",
      status: "waiting",
      x: 740,
      y: 380
    },
    {
      id: "publish",
      title: "Release the brief",
      description: "Publish approved assets and synchronize the campaign record.",
      kind: "action",
      owner: "Publisher",
      status: "queued",
      x: 1070,
      y: 250
    }
  ],
  edges: [
    { id: "e1", source: "signal", target: "research" },
    { id: "e2", source: "research", target: "position" },
    { id: "e3", source: "position", target: "review" },
    { id: "e4", source: "review", target: "publish" }
  ]
};

const workflows = new Map<string, Workflow>([[seededWorkflow.id, seededWorkflow]]);

export function listWorkflows(teamId: string): WorkflowSummary[] {
  return [...workflows.values()]
    .filter((workflow) => workflow.teamId === teamId)
    .map(({ nodes, edges, ...workflow }) => ({
      ...workflow,
      nodeCount: nodes.length,
      activeRuns: workflow.id === seededWorkflow.id ? 3 : 0
    }));
}

export function getWorkflow(workflowId: string): Workflow | undefined {
  return workflows.get(workflowId);
}

export function createWorkflow(input: {
  teamId: string;
  name: string;
  description?: string;
}): Workflow {
  const now = new Date().toISOString();
  const workflow: Workflow = {
    id: `wf_${crypto.randomUUID()}`,
    teamId: input.teamId,
    name: input.name,
    description: input.description ?? "",
    status: "draft",
    version: 1,
    updatedAt: now,
    nodes: [],
    edges: []
  };
  workflows.set(workflow.id, workflow);
  return workflow;
}
