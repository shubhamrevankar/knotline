import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  ...timestamps
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  state: text("state").notNull().default("active"),
  version: integer("version").notNull().default(1),
  ...timestamps
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id").notNull(),
    id: uuid("id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    state: text("state").notNull().default("active"),
    ...timestamps
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    unique("memberships_workspace_user_unique").on(table.workspaceId, table.userId),
    index("memberships_workspace_state_idx").on(table.workspaceId, table.state)
  ]
);

export const workflows = pgTable(
  "workflows",
  {
    workspaceId: uuid("workspace_id").notNull(),
    id: uuid("id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    state: text("state").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(1),
    optimisticVersion: integer("optimistic_version").notNull().default(1),
    ...timestamps
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("workflows_workspace_updated_idx").on(table.workspaceId, table.updatedAt, table.id)
  ]
);

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    workspaceId: uuid("workspace_id").notNull(),
    workflowId: uuid("workflow_id").notNull(),
    version: integer("version").notNull(),
    state: text("state").notNull().default("draft"),
    definition: jsonb("definition").notNull().default({}),
    contentHash: text("content_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.workflowId, table.version] })]
);

export const workflowNodes = pgTable(
  "workflow_nodes",
  {
    workspaceId: uuid("workspace_id").notNull(),
    workflowId: uuid("workflow_id").notNull(),
    workflowVersion: integer("workflow_version").notNull(),
    id: uuid("id").notNull(),
    stableKey: text("stable_key").notNull(),
    kind: text("kind").notNull(),
    configuration: jsonb("configuration").notNull().default({}),
    positionX: integer("position_x").notNull().default(0),
    positionY: integer("position_y").notNull().default(0)
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.workflowId, table.workflowVersion, table.id] }),
    unique("workflow_nodes_stable_key_unique").on(
      table.workspaceId,
      table.workflowId,
      table.workflowVersion,
      table.stableKey
    )
  ]
);

export const workflowEdges = pgTable(
  "workflow_edges",
  {
    workspaceId: uuid("workspace_id").notNull(),
    workflowId: uuid("workflow_id").notNull(),
    workflowVersion: integer("workflow_version").notNull(),
    id: uuid("id").notNull(),
    sourceNodeId: uuid("source_node_id").notNull(),
    targetNodeId: uuid("target_node_id").notNull(),
    configuration: jsonb("configuration").notNull().default({})
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.workflowId, table.workflowVersion, table.id] })
  ]
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    workspaceId: uuid("workspace_id").notNull(),
    id: uuid("id").notNull(),
    principalId: uuid("principal_id").notNull(),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull(),
    result: jsonb("result"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    unique("idempotency_scope_key_unique").on(
      table.workspaceId,
      table.principalId,
      table.operation,
      table.key
    )
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    workspaceId: uuid("workspace_id").notNull(),
    id: uuid("id").notNull(),
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    result: text("result").notNull(),
    requestId: text("request_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("audit_events_workspace_time_idx").on(table.workspaceId, table.occurredAt)
  ]
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    workspaceId: uuid("workspace_id").notNull(),
    id: uuid("id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    published: boolean("published").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("outbox_unpublished_idx").on(table.published, table.occurredAt)
  ]
);

export const schema = {
  users,
  workspaces,
  memberships,
  workflows,
  workflowVersions,
  workflowNodes,
  workflowEdges,
  idempotencyRecords,
  auditEvents,
  outboxEvents
};
