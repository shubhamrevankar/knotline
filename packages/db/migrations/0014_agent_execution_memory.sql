CREATE TABLE agent_executions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  task_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_version integer NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  model_policy_version_id text NOT NULL,
  prompt_version_id text NOT NULL,
  review_mode text NOT NULL CHECK (review_mode IN ('none','before_run','selected_tools','conditional','before_effect')),
  state text NOT NULL CHECK (state IN ('queued','running','approval_wait','succeeded','failed','cancelled','timed_out','policy_stopped','uncertain')),
  limits jsonb NOT NULL CHECK (jsonb_typeof(limits)='object'),
  usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage)='object'),
  typed_output jsonb,
  output_hash text,
  error_code text,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,attempt_id),
  FOREIGN KEY (workspace_id,agent_id,agent_version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT
);
CREATE INDEX agent_executions_run_idx ON agent_executions(workspace_id,run_id,created_at,id);

CREATE TABLE agent_execution_turns (
  workspace_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  turn integer NOT NULL CHECK (turn > 0),
  step_type text NOT NULL CHECK (step_type IN ('model','tool','memory_write','approval','final')),
  input_ref text,
  output_ref text,
  model_invocation_id uuid,
  tool_operation_id uuid,
  state text NOT NULL,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,execution_id,turn),
  FOREIGN KEY (workspace_id,execution_id) REFERENCES agent_executions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_context_manifests (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  execution_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  context_references jsonb NOT NULL CHECK (jsonb_typeof(context_references)='array'),
  total_bytes bigint NOT NULL CHECK (total_bytes >= 0),
  total_tokens_estimate bigint NOT NULL CHECK (total_tokens_estimate >= 0),
  manifest_hash text NOT NULL,
  dispatch_proof_expires_at timestamptz NOT NULL,
  assembled_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,execution_id,manifest_hash),
  FOREIGN KEY (workspace_id,execution_id) REFERENCES agent_executions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE provenance_nodes (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  execution_id uuid NOT NULL,
  node_type text NOT NULL,
  reference text NOT NULL,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,execution_id,node_type,reference,content_hash),
  FOREIGN KEY (workspace_id,execution_id) REFERENCES agent_executions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE provenance_edges (
  workspace_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  relation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,execution_id,source_node_id,target_node_id,relation),
  FOREIGN KEY (workspace_id,source_node_id) REFERENCES provenance_nodes(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,target_node_id) REFERENCES provenance_nodes(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE memory_policies (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  content_hash text NOT NULL,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,agent_id),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE memory_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('execution','user_private','workspace_shared')),
  owner_id uuid,
  agent_id uuid NOT NULL,
  subject_id text NOT NULL,
  purpose text NOT NULL,
  sensitivity text NOT NULL CHECK (sensitivity IN ('internal','confidential','restricted')),
  state text NOT NULL CHECK (state IN ('active','corrected','tombstoned','expired','held')),
  current_version integer NOT NULL DEFAULT 1,
  retention_expires_at timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT,
  CHECK ((scope='user_private' AND owner_id IS NOT NULL) OR scope<>'user_private')
);
CREATE INDEX memory_records_user_idx ON memory_records(workspace_id,owner_id,state,updated_at DESC,id);
CREATE INDEX memory_records_agent_idx ON memory_records(workspace_id,agent_id,scope,state,updated_at DESC,id);

CREATE TABLE memory_versions (
  workspace_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  operation text NOT NULL CHECK (operation IN ('create','correct','scope_change','tombstone','expire','hold','release')),
  value jsonb,
  value_hash text,
  source_references jsonb NOT NULL CHECK (jsonb_typeof(source_references)='array'),
  permission_dependencies jsonb NOT NULL CHECK (jsonb_typeof(permission_dependencies)='array'),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object'),
  authorizer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,memory_id,version),
  FOREIGN KEY (workspace_id,memory_id) REFERENCES memory_records(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE memory_uses (
  workspace_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  memory_version integer NOT NULL,
  execution_id uuid NOT NULL,
  use_type text NOT NULL CHECK (use_type IN ('context_read','explicit_write','correction','deletion')),
  permission_proof_id text NOT NULL,
  authorized_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,memory_id,memory_version,execution_id,use_type),
  FOREIGN KEY (workspace_id,memory_id,memory_version) REFERENCES memory_versions(workspace_id,memory_id,version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,execution_id) REFERENCES agent_executions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE memory_tombstones (
  workspace_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('user_delete','source_delete','permission_revoked','membership_removed','workspace_delete','retention_expired','subject_delete')),
  prior_value_hash text,
  purge_after timestamptz NOT NULL,
  purged_at timestamptz,
  audit_fact jsonb NOT NULL CHECK (jsonb_typeof(audit_fact)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,memory_id),
  FOREIGN KEY (workspace_id,memory_id) REFERENCES memory_records(workspace_id,id) ON DELETE RESTRICT
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_executions','agent_execution_turns','agent_context_manifests','provenance_nodes','provenance_edges',
    'memory_policies','memory_records','memory_versions','memory_uses','memory_tombstones'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER agent_execution_turns_append_only BEFORE UPDATE OR DELETE ON agent_execution_turns FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER agent_context_manifests_append_only BEFORE UPDATE OR DELETE ON agent_context_manifests FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER provenance_nodes_append_only BEFORE UPDATE OR DELETE ON provenance_nodes FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER provenance_edges_append_only BEFORE UPDATE OR DELETE ON provenance_edges FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER memory_versions_append_only BEFORE UPDATE OR DELETE ON memory_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER memory_uses_append_only BEFORE UPDATE OR DELETE ON memory_uses FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER memory_tombstones_append_only BEFORE UPDATE OR DELETE ON memory_tombstones FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON agent_executions,agent_execution_turns,agent_context_manifests,provenance_nodes,provenance_edges,
 memory_policies,memory_records,memory_versions,memory_uses,memory_tombstones FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON agent_executions,memory_policies,memory_records TO knotline_runtime;
GRANT SELECT,INSERT ON agent_execution_turns,agent_context_manifests,provenance_nodes,provenance_edges,
 memory_versions,memory_uses,memory_tombstones TO knotline_runtime;
GRANT SELECT ON agent_executions,agent_execution_turns,agent_context_manifests,provenance_nodes,provenance_edges,
 memory_policies,memory_records,memory_versions,memory_uses,memory_tombstones TO knotline_reporting;
