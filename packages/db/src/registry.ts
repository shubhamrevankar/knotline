import { readFile } from "node:fs/promises";

interface Registry {
  schemaVersion: number;
  owner: { team: string; contact: string };
  runbook: string;
  stores: readonly {
    name: string;
    class: string;
    retentionDays: number;
    exportHandler: string;
    deleteHandler: string;
  }[];
  indexes: readonly string[];
  caches: readonly string[];
}

export const REQUIRED_STORES = [
  "users",
  "workspaces",
  "memberships",
  "workflows",
  "workflow_versions",
  "workflow_nodes",
  "workflow_edges",
  "idempotency_records",
  "audit_events",
  "outbox_events",
  "knotline_schema_migrations",
  "identity_links",
  "magic_link_tokens",
  "identity_authorization_transactions",
  "identity_authorization_results",
  "sessions",
  "session_verifiers",
  "auth_rate_limits",
  "security_notifications",
  "auth_email_deliveries",
  "permission_catalog",
  "workspace_roles",
  "workspace_invitations",
  "workspace_groups",
  "workspace_group_memberships",
  "organization_relationships",
  "resource_grants",
  "onboarding_progress",
  "sandbox_resources",
  "guest_identities",
  "workflow_folders",
  "workflow_tags",
  "workflow_tag_assignments",
  "workflow_favorites",
  "workflow_validation_findings",
  "workflow_templates",
  "workflow_template_versions",
  "workflow_triggers",
  "workflow_generations",
  "workflow_test_runs",
  "generic_threads",
  "generic_comments",
  "comment_mentions",
  "comment_reactions",
  "resource_follows",
  "resource_activity_events",
  "notification_intents",
  "saved_resource_filters",
  "workflow_runs",
  "task_runs",
  "task_dependencies",
  "task_attempts",
  "run_events",
  "event_receipts",
  "external_operations",
  "external_operation_attempts",
  "external_operation_attempt_records",
  "dead_letter_items",
  "entitlement_policies",
  "budget_periods",
  "admission_reservations",
  "admission_ledger_entries",
  "runtime_control_switches",
  "run_saved_views",
  "run_follows",
  "run_artifacts",
  "human_task_details",
  "human_task_drafts",
  "human_task_submissions",
  "task_delegations",
  "task_watchers",
  "task_queues",
  "task_queue_members",
  "task_routing_policy_versions",
  "task_routing_decisions",
  "business_calendars",
  "business_calendar_versions",
  "task_templates",
  "task_template_versions",
  "files",
  "file_versions",
  "file_upload_sessions",
  "task_file_attachments",
  "approval_policies",
  "approval_policy_versions",
  "approvals",
  "approval_steps",
  "approval_decisions",
  "approval_delegations",
  "sla_definitions",
  "sla_definition_versions",
  "sla_timer_events",
  "approval_consumptions",
  "agent_definitions",
  "agent_drafts",
  "agent_versions",
  "agent_release_channels",
  "agent_tags",
  "agent_tag_assignments",
  "agent_version_references",
  "agent_simulations",
  "reusable_schemas",
  "reusable_schema_versions",
  "agent_activity_events",
  "model_providers",
  "model_registry",
  "model_policies",
  "model_policy_versions",
  "prompt_versions",
  "model_invocations",
  "model_usage_charges",
  "provider_circuit_states",
  "tool_definitions",
  "tool_versions",
  "tool_grants",
  "credential_records",
  "oauth_refresh_leases",
  "tool_operation_bindings",
  "tool_execution_receipts",
  "sandbox_executions",
  "tool_control_switches",
  "agent_executions",
  "agent_execution_turns",
  "agent_context_manifests",
  "provenance_nodes",
  "provenance_edges",
  "memory_policies",
  "memory_records",
  "memory_versions",
  "memory_uses",
  "memory_tombstones"
] as const;

export async function validateDataStoreRegistry(): Promise<Registry> {
  const registry = JSON.parse(
    await readFile(new URL("../registry/data-stores.json", import.meta.url), "utf8")
  ) as Registry;
  const errors: string[] = [];
  if (registry.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!registry.owner.team || !registry.owner.contact) errors.push("owner is required");
  if (!registry.runbook.startsWith("docs/operations/knotline/")) errors.push("runbook is invalid");
  const names = new Set(registry.stores.map(({ name }) => name));
  for (const required of REQUIRED_STORES)
    if (!names.has(required)) errors.push(`missing ${required}`);
  for (const store of registry.stores) {
    if (!store.class.includes(".")) errors.push(`${store.name} has invalid class`);
    if (!Number.isInteger(store.retentionDays) || store.retentionDays < 0)
      errors.push(`${store.name} has invalid retention`);
    if (!store.exportHandler || !store.deleteHandler)
      errors.push(`${store.name} has no export/delete handler`);
  }
  if (new Set(registry.indexes).size !== registry.indexes.length) errors.push("duplicate index");
  if (errors.length > 0) throw new Error(`Invalid data-store registry:\n- ${errors.join("\n- ")}`);
  return registry;
}
