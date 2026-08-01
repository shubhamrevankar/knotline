CREATE TABLE connection_source_selections (
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('all','selected')),
  source_ids text[] NOT NULL DEFAULT '{}',
  include_rules text[] NOT NULL DEFAULT '{}',
  exclude_rules text[] NOT NULL DEFAULT '{}',
  estimated_objects bigint NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,connection_id),
  FOREIGN KEY (workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);

CREATE TABLE provider_source_inventory (
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_source_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('drive','folder','space','page','database')),
  display_name text NOT NULL,
  parent_external_id text,
  estimated_objects bigint NOT NULL DEFAULT 0,
  selectable boolean NOT NULL DEFAULT true,
  limitation text,
  provider_version text NOT NULL,
  permission_hash text NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (workspace_id,connection_id,external_source_id),
  FOREIGN KEY (workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE INDEX provider_source_inventory_picker_idx
  ON provider_source_inventory(workspace_id,connection_id,source_kind,display_name)
  WHERE deleted_at IS NULL;

CREATE TABLE provider_action_operations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  connection_id uuid NOT NULL,
  provider text NOT NULL,
  action_key text NOT NULL,
  account_id text NOT NULL,
  target jsonb NOT NULL,
  expected_version text,
  content_hash text NOT NULL,
  preview jsonb NOT NULL,
  risk text NOT NULL CHECK (risk IN ('low','medium','high')),
  approval_id uuid NOT NULL,
  broker_operation_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('PREVIEWED','AUTHORIZED','EXECUTING','CONFIRMED','CONFLICT','UNCERTAIN','FAILED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,connection_id,idempotency_key),
  FOREIGN KEY (workspace_id,connection_id) REFERENCES connections(workspace_id,id),
  FOREIGN KEY (workspace_id,approval_id) REFERENCES approvals(workspace_id,id)
);
CREATE INDEX provider_action_operations_state_idx
  ON provider_action_operations(workspace_id,state,updated_at);

CREATE TABLE provider_action_receipts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  operation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('CONFIRMED','CONFLICT','UNCERTAIN','FAILED')),
  provider_object_id text,
  provider_version text,
  provider_visible_hash text,
  reconciliation_strategy text NOT NULL CHECK (reconciliation_strategy IN ('native-idempotency','deterministic-lookup')),
  provider_receipt jsonb NOT NULL DEFAULT '{}',
  repair jsonb,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,operation_id) REFERENCES provider_action_operations(workspace_id,id)
);

CREATE TABLE provider_connector_certifications (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  connector_key text NOT NULL,
  manifest_version text NOT NULL,
  engineering_status text NOT NULL CHECK (engineering_status IN ('RECORDED','LIVE')),
  live_status text NOT NULL CHECK (live_status IN ('LIVE','BLOCKED_EXTERNAL')),
  external_gate text NOT NULL,
  fixture_digest text NOT NULL,
  capabilities jsonb NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]',
  certified_at timestamptz NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,connector_key,manifest_version)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'connection_source_selections',
    'provider_source_inventory',
    'provider_action_operations',
    'provider_action_receipts',
    'provider_connector_certifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',
      table_name,
      table_name
    );
  END LOOP;
END $$;

CREATE TRIGGER provider_action_receipts_append_only
  BEFORE UPDATE OR DELETE ON provider_action_receipts
  FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON
  connection_source_selections,
  provider_source_inventory,
  provider_action_operations,
  provider_action_receipts,
  provider_connector_certifications
FROM PUBLIC;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  connection_source_selections,
  provider_source_inventory,
  provider_action_operations
TO knotline_runtime;
GRANT SELECT,INSERT ON provider_action_receipts TO knotline_runtime;
GRANT SELECT ON provider_connector_certifications TO knotline_runtime;
GRANT SELECT ON
  connection_source_selections,
  provider_source_inventory,
  provider_action_operations,
  provider_action_receipts,
  provider_connector_certifications
TO knotline_reporting;
