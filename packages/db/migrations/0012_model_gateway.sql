CREATE TABLE model_providers (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  endpoint_class text NOT NULL,
  credential_reference text,
  region text NOT NULL,
  state text NOT NULL CHECK (state IN ('recorded','active','disabled','degraded')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,provider_key)
);

CREATE TABLE model_registry (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  provider_key text NOT NULL,
  model_id text NOT NULL,
  snapshot text,
  role text NOT NULL CHECK (role IN ('fast','balanced','quality','judge','embedding','moderation')),
  capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities)='array'),
  context_tokens integer NOT NULL CHECK (context_tokens > 0),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens > 0),
  pricing_version text NOT NULL,
  residency jsonb NOT NULL CHECK (jsonb_typeof(residency)='array'),
  state text NOT NULL CHECK (state IN ('recorded','approved','disabled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,provider_key,model_id,role),
  FOREIGN KEY (workspace_id,provider_key) REFERENCES model_providers(workspace_id,provider_key) ON DELETE RESTRICT
);
CREATE INDEX model_registry_role_idx ON model_registry(workspace_id,role,state,id);

CREATE TABLE model_policies (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','disabled','archived')),
  current_version integer NOT NULL DEFAULT 1,
  revision bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,name)
);

CREATE TABLE model_policy_versions (
  workspace_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  version integer NOT NULL,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  content_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,policy_id,version),
  UNIQUE (workspace_id,policy_id,content_hash),
  FOREIGN KEY (workspace_id,policy_id) REFERENCES model_policies(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE prompt_versions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  prompt_key text NOT NULL,
  version integer NOT NULL,
  template jsonb NOT NULL CHECK (jsonb_typeof(template)='object'),
  variables_schema jsonb NOT NULL CHECK (jsonb_typeof(variables_schema)='object'),
  content_hash text NOT NULL,
  release_state text NOT NULL CHECK (release_state IN ('recorded','development','stable','deprecated')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,prompt_key,version),
  UNIQUE (workspace_id,prompt_key,content_hash)
);

CREATE TABLE model_invocations (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  operation_id text NOT NULL,
  task_attempt_id uuid,
  policy_id uuid,
  policy_version integer,
  prompt_version_id uuid,
  provider_key text NOT NULL,
  model_id text NOT NULL,
  model_snapshot text,
  response_id text,
  status text NOT NULL CHECK (status IN ('reserved','running','completed','incomplete','refused','failed','unknown')),
  input_ref text,
  output_ref text,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens bigint NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_amount_decimal numeric(38,12) NOT NULL DEFAULT 0 CHECK (cost_amount_decimal >= 0),
  currency text NOT NULL,
  price_version_id text NOT NULL,
  provider_reconciliation_state text NOT NULL CHECK (provider_reconciliation_state IN ('estimated','final','unknown','reconciled')),
  latency_ms integer CHECK (latency_ms >= 0),
  refusal_code text,
  error_code text,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,operation_id),
  FOREIGN KEY (workspace_id,policy_id,policy_version) REFERENCES model_policy_versions(workspace_id,policy_id,version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prompt_version_id) REFERENCES prompt_versions(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX model_invocations_status_idx ON model_invocations(workspace_id,status,created_at DESC,id);

CREATE TABLE model_usage_charges (
  workspace_id uuid NOT NULL,
  invocation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  charge_type text NOT NULL CHECK (charge_type IN ('reservation','final','release','reconciliation')),
  amount_decimal numeric(38,12) NOT NULL,
  currency text NOT NULL,
  usage jsonb NOT NULL CHECK (jsonb_typeof(usage)='object'),
  price_version_id text NOT NULL,
  provider_receipt_ref text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,invocation_id,sequence),
  FOREIGN KEY (workspace_id,invocation_id) REFERENCES model_invocations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE provider_circuit_states (
  workspace_id uuid NOT NULL,
  provider_key text NOT NULL,
  model_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('closed','open','half_open')),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  open_until timestamptz,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,provider_key,model_id),
  FOREIGN KEY (workspace_id,provider_key) REFERENCES model_providers(workspace_id,provider_key) ON DELETE CASCADE
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'model_providers','model_registry','model_policies','model_policy_versions','prompt_versions',
    'model_invocations','model_usage_charges','provider_circuit_states'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER model_policy_versions_append_only BEFORE UPDATE OR DELETE ON model_policy_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER prompt_versions_append_only BEFORE UPDATE OR DELETE ON prompt_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER model_usage_charges_append_only BEFORE UPDATE OR DELETE ON model_usage_charges FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON model_providers,model_registry,model_policies,model_policy_versions,prompt_versions,
 model_invocations,model_usage_charges,provider_circuit_states FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON model_providers,model_registry,model_policies,model_invocations,provider_circuit_states TO knotline_runtime;
GRANT SELECT,INSERT ON model_policy_versions,prompt_versions,model_usage_charges TO knotline_runtime;
GRANT SELECT ON model_providers,model_registry,model_policies,model_policy_versions,prompt_versions,
 model_invocations,model_usage_charges,provider_circuit_states TO knotline_reporting;
