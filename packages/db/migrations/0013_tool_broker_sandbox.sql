CREATE TABLE tool_definitions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  stable_name text NOT NULL,
  owner text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','disabled','deprecated')),
  current_version integer NOT NULL DEFAULT 1,
  revision bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,stable_name)
);

CREATE TABLE tool_versions (
  workspace_id uuid NOT NULL,
  tool_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  semantic_version text NOT NULL,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  content_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,tool_id,version),
  UNIQUE (workspace_id,tool_id,semantic_version),
  UNIQUE (workspace_id,tool_id,content_hash),
  FOREIGN KEY (workspace_id,tool_id) REFERENCES tool_definitions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE tool_grants (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  tool_id uuid NOT NULL,
  tool_version integer NOT NULL,
  agent_version_id uuid NOT NULL,
  workflow_version_id uuid,
  environment text NOT NULL CHECK (environment IN ('development','test','production')),
  data_classifications jsonb NOT NULL CHECK (jsonb_typeof(data_classifications)='array'),
  connection_id uuid,
  budget_amount_decimal numeric(38,12) NOT NULL CHECK (budget_amount_decimal >= 0),
  approval_policy_id uuid,
  state text NOT NULL CHECK (state IN ('active','disabled','expired')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,tool_id,tool_version) REFERENCES tool_versions(workspace_id,tool_id,version) ON DELETE RESTRICT
);
CREATE INDEX tool_grants_agent_idx ON tool_grants(workspace_id,agent_version_id,state,tool_id);

CREATE TABLE credential_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  provider text NOT NULL,
  account_label text NOT NULL,
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes)='array'),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  secret_reference text NOT NULL,
  rotation_state text NOT NULL CHECK (rotation_state IN ('current','rotation_due','rotating','revoked')),
  revision bigint NOT NULL DEFAULT 1,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,provider,account_label)
);
CREATE INDEX credential_records_rotation_idx ON credential_records(workspace_id,rotation_state,updated_at,id);

CREATE TABLE oauth_refresh_leases (
  workspace_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  lease_owner text NOT NULL,
  fencing_token bigint NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,credential_id),
  FOREIGN KEY (workspace_id,credential_id) REFERENCES credential_records(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE tool_operation_bindings (
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  tool_id uuid NOT NULL,
  tool_version integer NOT NULL,
  credential_id uuid,
  approval_id uuid,
  destination text,
  provider_account text,
  PRIMARY KEY (workspace_id,operation_id),
  FOREIGN KEY (workspace_id,operation_id) REFERENCES external_operations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tool_id,tool_version) REFERENCES tool_versions(workspace_id,tool_id,version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,credential_id) REFERENCES credential_records(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE tool_execution_receipts (
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  policy_decision jsonb NOT NULL CHECK (jsonb_typeof(policy_decision)='object'),
  sanitized_input jsonb,
  sanitized_output jsonb,
  side_effect_state text NOT NULL CHECK (side_effect_state IN ('prepared','sent','confirmed','failed','uncertain','reconciled')),
  provider_request_id text,
  provider_receipt_id text,
  error_code text,
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,operation_id,sequence),
  FOREIGN KEY (workspace_id,operation_id) REFERENCES external_operations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE sandbox_executions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  operation_id text NOT NULL,
  runtime text NOT NULL,
  image_digest text NOT NULL,
  input_manifest jsonb NOT NULL CHECK (jsonb_typeof(input_manifest)='object'),
  output_manifest jsonb,
  network_policy text NOT NULL CHECK (network_policy IN ('deny_all','allowlist')),
  state text NOT NULL CHECK (state IN ('queued','running','succeeded','failed','timed_out','cancelled')),
  exit_code integer,
  cpu_milliseconds bigint NOT NULL DEFAULT 0 CHECK (cpu_milliseconds >= 0),
  peak_memory_bytes bigint NOT NULL DEFAULT 0 CHECK (peak_memory_bytes >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,operation_id)
);
CREATE INDEX sandbox_executions_state_idx ON sandbox_executions(workspace_id,state,created_at,id);

CREATE TABLE tool_control_switches (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('workspace','agent','tool','global')),
  scope_id text NOT NULL,
  enabled boolean NOT NULL,
  reason text NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,scope,scope_id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tool_definitions','tool_versions','tool_grants','credential_records','oauth_refresh_leases',
    'tool_operation_bindings','tool_execution_receipts','sandbox_executions','tool_control_switches'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER tool_versions_append_only BEFORE UPDATE OR DELETE ON tool_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER tool_execution_receipts_append_only BEFORE UPDATE OR DELETE ON tool_execution_receipts FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON tool_definitions,tool_versions,tool_grants,credential_records,oauth_refresh_leases,
 tool_operation_bindings,tool_execution_receipts,sandbox_executions,tool_control_switches FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON tool_definitions,tool_grants,credential_records,oauth_refresh_leases,
 sandbox_executions,tool_control_switches TO knotline_runtime;
GRANT SELECT,INSERT ON tool_versions,tool_operation_bindings,tool_execution_receipts TO knotline_runtime;
GRANT SELECT ON tool_definitions,tool_versions,tool_grants,credential_records,tool_operation_bindings,
 tool_execution_receipts,sandbox_executions,tool_control_switches TO knotline_reporting;
