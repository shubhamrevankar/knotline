import type { Workflow, WorkflowSummary } from "@knotline/contracts";

export const demoWorkflow: Workflow = {
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
      description: "Collect the launch request and source material.",
      kind: "trigger",
      owner: "Maya Chen",
      status: "complete",
      x: 80,
      y: 250
    },
    {
      id: "research",
      title: "Map the market",
      description: "Find competitor movement and customer language.",
      kind: "agent",
      owner: "Scout",
      status: "running",
      x: 410,
      y: 120
    },
    {
      id: "position",
      title: "Shape the angle",
      description: "Turn evidence into a differentiated narrative.",
      kind: "agent",
      owner: "Strategist",
      status: "queued",
      x: 740,
      y: 120
    },
    {
      id: "review",
      title: "Editorial gate",
      description: "Review claims, tone, risk, and readiness.",
      kind: "approval",
      owner: "Jordan Lee",
      status: "waiting",
      x: 740,
      y: 380
    },
    {
      id: "publish",
      title: "Release the brief",
      description: "Publish approved assets and sync the campaign.",
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

export const demoWorkflows: WorkflowSummary[] = [
  {
    id: demoWorkflow.id,
    teamId: demoWorkflow.teamId,
    name: demoWorkflow.name,
    description: demoWorkflow.description,
    status: demoWorkflow.status,
    version: demoWorkflow.version,
    updatedAt: demoWorkflow.updatedAt,
    nodeCount: demoWorkflow.nodes.length,
    activeRuns: 3
  },
  {
    id: "wf_customer-risk",
    teamId: demoWorkflow.teamId,
    name: "Customer risk radar",
    description: "Detect account risk and route the right intervention.",
    status: "active",
    version: 12,
    updatedAt: "2026-07-31T07:18:00.000Z",
    nodeCount: 9,
    activeRuns: 18
  },
  {
    id: "wf_vendor-intake",
    teamId: demoWorkflow.teamId,
    name: "Vendor intake",
    description: "Collect, screen, approve, and onboard new vendors.",
    status: "draft",
    version: 3,
    updatedAt: "2026-07-30T16:40:00.000Z",
    nodeCount: 7,
    activeRuns: 0
  }
];
