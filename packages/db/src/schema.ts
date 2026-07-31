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
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  ...timestamps
});

export const identityLinks = pgTable(
  "identity_links",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    emailAtLink: text("email_at_link"),
    claimsMetadata: jsonb("claims_metadata").notNull().default({}),
    ...timestamps
  },
  (table) => [
    unique("identity_links_provider_subject_unique").on(
      table.provider,
      table.issuer,
      table.subject
    ),
    index("identity_links_user_idx").on(table.userId, table.provider)
  ]
);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    id: uuid("id").primaryKey(),
    normalizedEmailHash: text("normalized_email_hash").notNull(),
    tokenVerifierHash: text("token_verifier_hash").notNull().unique(),
    intent: text("intent").notNull(),
    returnTargetId: text("return_target_id").notNull(),
    requestedIpHash: text("requested_ip_hash").notNull(),
    userId: uuid("user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("magic_link_tokens_email_created_idx").on(table.normalizedEmailHash, table.createdAt)
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    familyId: uuid("family_id").notNull(),
    activeWorkspaceId: uuid("active_workspace_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    lastStepUpAt: timestamp("last_step_up_at", { withTimezone: true }),
    ipHash: text("ip_hash").notNull(),
    deviceSummary: text("device_summary").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason")
  },
  (table) => [
    index("sessions_user_active_idx").on(table.userId, table.lastUsedAt),
    index("sessions_family_idx").on(table.familyId)
  ]
);

export const identityAuthorizationTransactions = pgTable(
  "identity_authorization_transactions",
  {
    id: uuid("id").primaryKey(),
    provider: text("provider").notNull(),
    connectionLocator: text("connection_locator"),
    applicationId: text("application_id").notNull(),
    environment: text("environment").notNull(),
    authorizationLocatorHash: text("authorization_locator_hash").notNull().unique(),
    stateHash: text("state_hash").notNull().unique(),
    nonceHash: text("nonce_hash").notNull(),
    pkceVerifierHash: text("pkce_verifier_hash").notNull(),
    pkceVerifierCiphertext: text("pkce_verifier_ciphertext").notNull(),
    samlRequestIdHash: text("saml_request_id_hash"),
    relayStateHash: text("relay_state_hash"),
    browserBindingHash: text("browser_binding_hash").notNull(),
    callbackUri: text("callback_uri").notNull(),
    returnTargetId: text("return_target_id").notNull(),
    requestedScopes: text("requested_scopes").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    callbackConsumedAt: timestamp("callback_consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("identity_authorization_transactions_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.callbackConsumedAt} IS NULL`)
  ]
);

export const identityAuthorizationResults = pgTable(
  "identity_authorization_results",
  {
    id: uuid("id").primaryKey(),
    authorizationTransactionId: uuid("authorization_transaction_id").notNull().unique(),
    resultHandleHash: text("result_handle_hash").notNull().unique(),
    browserBindingHash: text("browser_binding_hash").notNull(),
    userId: uuid("user_id"),
    returnTargetId: text("return_target_id").notNull(),
    resultCode: text("result_code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    exchangedAt: timestamp("exchanged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("identity_authorization_results_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.exchangedAt} IS NULL`)
  ]
);

export const sessionVerifiers = pgTable(
  "session_verifiers",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id").notNull(),
    verifierHash: text("verifier_hash").notNull().unique(),
    state: text("state").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("session_verifiers_one_active_idx")
      .on(table.sessionId)
      .where(sql`${table.state} = 'active'`)
  ]
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull()
  },
  (table) => [primaryKey({ columns: [table.scope, table.subjectHash, table.windowStartedAt] })]
);

export const securityNotifications = pgTable(
  "security_notifications",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull(),
    safeMetadata: jsonb("safe_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true })
  },
  (table) => [index("security_notifications_user_created_idx").on(table.userId, table.createdAt)]
);

export const authEmailDeliveries = pgTable("auth_email_deliveries", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id"),
  normalizedEmailHash: text("normalized_email_hash").notNull(),
  providerMessageId: text("provider_message_id").unique(),
  state: text("state").notNull(),
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
  identityLinks,
  magicLinkTokens,
  sessions,
  identityAuthorizationTransactions,
  identityAuthorizationResults,
  sessionVerifiers,
  authRateLimits,
  securityNotifications,
  authEmailDeliveries,
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
