import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowSummary } from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";

import { observedQuery, type QueryObserver } from "./client.js";
import { withTenantTransaction, type TenantContext } from "./context.js";
import { migrationCompatibility } from "./migrations.js";
import { contentHash, createId } from "./values.js";

export interface WorkspaceBootstrap {
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
  readonly activeTeam: { readonly id: string; readonly name: string; readonly role: "owner" };
}

export interface WorkflowRepository {
  bootstrap(context: TenantContext): Promise<WorkspaceBootstrap | undefined>;
  list(context: TenantContext): Promise<readonly WorkflowSummary[]>;
  get(context: TenantContext, workflowId: string): Promise<Workflow | undefined>;
  create(
    context: TenantContext,
    input: { readonly name: string; readonly description?: string }
  ): Promise<Workflow>;
  ready(): Promise<boolean>;
}

interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  state: Workflow["status"];
  current_version: number;
  updated_at: Date;
}

interface NodeRow {
  id: string;
  stable_key: string;
  kind: WorkflowNode["kind"];
  configuration: {
    title?: string;
    description?: string;
    owner?: string;
    status?: WorkflowNode["status"];
  };
  position_x: number;
  position_y: number;
}

interface EdgeRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
}

const workflowSelect = `
  SELECT id, workspace_id, name, description, state, current_version, updated_at
  FROM workflows
`;

function nodeFromRow(row: NodeRow): WorkflowNode {
  return {
    id: row.id,
    title: row.configuration.title ?? row.stable_key,
    description: row.configuration.description ?? "",
    kind: row.kind,
    owner: row.configuration.owner ?? "Unassigned",
    status: row.configuration.status ?? "queued",
    x: row.position_x,
    y: row.position_y
  };
}

const edgeFromRow = (row: EdgeRow): WorkflowEdge => ({
  id: row.id,
  source: row.source_node_id,
  target: row.target_node_id
});

async function detail(client: PoolClient, row: WorkflowRow): Promise<Workflow> {
  const [nodes, edges] = await Promise.all([
    client.query<NodeRow>(
      `SELECT id, stable_key, kind, configuration, position_x, position_y
       FROM workflow_nodes
       WHERE workspace_id = $1 AND workflow_id = $2 AND workflow_version = $3
       ORDER BY stable_key`,
      [row.workspace_id, row.id, row.current_version]
    ),
    client.query<EdgeRow>(
      `SELECT id, source_node_id, target_node_id
       FROM workflow_edges
       WHERE workspace_id = $1 AND workflow_id = $2 AND workflow_version = $3
       ORDER BY id`,
      [row.workspace_id, row.id, row.current_version]
    )
  ]);
  return {
    id: row.id,
    teamId: row.workspace_id,
    name: row.name,
    description: row.description,
    status: row.state,
    version: row.current_version,
    updatedAt: row.updated_at.toISOString(),
    nodes: nodes.rows.map(nodeFromRow),
    edges: edges.rows.map(edgeFromRow)
  };
}

export class PostgresWorkflowRepository implements WorkflowRepository {
  constructor(
    private readonly pool: Pool,
    private readonly observer?: QueryObserver
  ) {}

  async bootstrap(context: TenantContext): Promise<WorkspaceBootstrap | undefined> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        user_id: string;
        display_name: string;
        email: string;
        workspace_id: string;
        workspace_name: string;
        role: string;
      }>(
        `SELECT u.id AS user_id, u.display_name, u.email,
                w.id AS workspace_id, w.name AS workspace_name, m.role
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.state = 'active'`,
        [context.workspaceId, context.principalId]
      );
      const row = result.rows[0];
      if (!row || row.role !== "owner") return undefined;
      return {
        user: { id: row.user_id, name: row.display_name, email: row.email },
        activeTeam: { id: row.workspace_id, name: row.workspace_name, role: "owner" }
      };
    });
  }

  async list(context: TenantContext): Promise<readonly WorkflowSummary[]> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const sql = `
        SELECT w.id, w.workspace_id, w.name, w.description, w.state, w.current_version,
               w.updated_at, count(n.id)::integer AS node_count
        FROM workflows w
        LEFT JOIN workflow_nodes n ON n.workspace_id = w.workspace_id
          AND n.workflow_id = w.id AND n.workflow_version = w.current_version
        WHERE w.workspace_id = $1
        GROUP BY w.workspace_id, w.id
        ORDER BY w.updated_at DESC, w.id
      `;
      const result = await observedQuery(
        () => client.query<WorkflowRow & { node_count: number }>(sql, [context.workspaceId]),
        sql,
        this.observer
      );
      return result.rows.map((row) => ({
        id: row.id,
        teamId: row.workspace_id,
        name: row.name,
        description: row.description,
        status: row.state,
        version: row.current_version,
        updatedAt: row.updated_at.toISOString(),
        nodeCount: row.node_count,
        activeRuns: 0
      }));
    });
  }

  async get(context: TenantContext, workflowId: string): Promise<Workflow | undefined> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const sql = `${workflowSelect} WHERE workspace_id = $1 AND id = $2`;
      const result = await observedQuery(
        () => client.query<WorkflowRow>(sql, [context.workspaceId, workflowId]),
        sql,
        this.observer
      );
      const row = result.rows[0];
      return row ? detail(client, row) : undefined;
    });
  }

  async create(
    context: TenantContext,
    input: { readonly name: string; readonly description?: string }
  ): Promise<Workflow> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const workflowId = createId();
      const auditId = createId();
      const outboxId = createId();
      const definition = { nodes: [], edges: [] };
      const inserted = await client.query<WorkflowRow>(
        `INSERT INTO workflows(workspace_id, id, name, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, workspace_id, name, description, state, current_version, updated_at`,
        [context.workspaceId, workflowId, input.name, input.description ?? ""]
      );
      await client.query(
        `INSERT INTO workflow_versions(
           workspace_id, workflow_id, version, state, definition, content_hash
         ) VALUES ($1, $2, 1, 'draft', $3, $4)`,
        [context.workspaceId, workflowId, definition, contentHash(definition)]
      );
      await client.query(
        `INSERT INTO audit_events(
           workspace_id, id, actor_id, action, resource_type, resource_id, result, request_id, metadata
         ) VALUES ($1, $2, $3, 'workflow.created', 'workflow', $4, 'succeeded', $5, $6)`,
        [context.workspaceId, auditId, context.principalId, workflowId, context.requestId, {}]
      );
      await client.query(
        `INSERT INTO outbox_events(
           workspace_id, id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, $2, 'workflow', $3, 'workflow.created.v1', $4)`,
        [context.workspaceId, outboxId, workflowId, { workflowId }]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Workflow insert returned no row");
      return detail(client, row);
    });
  }

  async ready(): Promise<boolean> {
    return (await migrationCompatibility(this.pool)).compatible;
  }
}
