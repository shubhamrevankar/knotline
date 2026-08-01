CREATE TABLE connector_manifest_versions (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connector_key text NOT NULL, semantic_version text NOT NULL,
  manifest jsonb NOT NULL, content_hash text NOT NULL, state text NOT NULL CHECK (state IN ('draft','staged','active','retired')),
  rollout_percent integer NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100), created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,connector_key,semantic_version), UNIQUE (workspace_id,connector_key,content_hash)
);
CREATE TABLE connections (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connector_manifest_id uuid NOT NULL, connector_key text NOT NULL,
  display_name text NOT NULL, auth_method text NOT NULL, credential_reference text, external_account_id text,
  external_account_label text, state text NOT NULL CHECK (state IN ('draft','authorizing','active','degraded','reauthorization_required','disabled','revoked','deleting','deleted')),
  region text NOT NULL, granted_scopes text[] NOT NULL DEFAULT '{}', requested_scopes text[] NOT NULL DEFAULT '{}',
  permission_fidelity text NOT NULL CHECK (permission_fidelity IN ('exact','conservative','unsupported')),
  last_success_at timestamptz, freshness_lag_seconds integer, next_retry_at timestamptz, current_operation text,
  object_count bigint NOT NULL DEFAULT 0, error_count bigint NOT NULL DEFAULT 0, error_summary jsonb,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz, PRIMARY KEY (workspace_id,id), FOREIGN KEY (workspace_id,connector_manifest_id) REFERENCES connector_manifest_versions(workspace_id,id)
);
CREATE INDEX connections_health_idx ON connections(workspace_id,state,next_retry_at,updated_at);
CREATE TABLE connection_authorization_transactions (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, user_id uuid NOT NULL, session_id uuid NOT NULL,
  browser_nonce_hash text NOT NULL, state_hash text NOT NULL, verifier_hash text NOT NULL, connector_manifest_id uuid NOT NULL,
  provider text NOT NULL, client_application_id text NOT NULL, config_version text NOT NULL, redirect_uri text NOT NULL,
  requested_scopes text[] NOT NULL, return_target text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (workspace_id,id), UNIQUE(workspace_id,state_hash),
  FOREIGN KEY (workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connection_scope_snapshots (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, requested_scopes text[] NOT NULL,
  granted_scopes text[] NOT NULL, missing_required_scopes text[] NOT NULL, manifest_version text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connection_sync_runs (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, mode text NOT NULL,
  state text NOT NULL CHECK(state IN ('queued','running','rate_limited','paused','succeeded','failed','cancelled')),
  object_types text[] NOT NULL DEFAULT '{}', discovered_count bigint NOT NULL DEFAULT 0, processed_count bigint NOT NULL DEFAULT 0,
  deleted_count bigint NOT NULL DEFAULT 0, permission_change_count bigint NOT NULL DEFAULT 0, attempt integer NOT NULL DEFAULT 0,
  error_kind text, error_detail jsonb, started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE INDEX connection_sync_runs_queue_idx ON connection_sync_runs(workspace_id,state,created_at);
CREATE TABLE connection_sync_checkpoints (
  workspace_id uuid NOT NULL, connection_id uuid NOT NULL, object_type text NOT NULL, sequence bigint NOT NULL DEFAULT 0,
  cursor_value text, cursor_version text, last_page_id text, provider_watermark text, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,connection_id,object_type), FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connection_sync_pages (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, sync_run_id uuid NOT NULL, object_type text NOT NULL,
  provider_page_id text NOT NULL, sequence bigint NOT NULL, content_hash text NOT NULL, state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), applied_at timestamptz, PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,connection_id,object_type,provider_page_id), FOREIGN KEY(workspace_id,sync_run_id) REFERENCES connection_sync_runs(workspace_id,id)
);
CREATE TABLE connection_external_objects (
  workspace_id uuid NOT NULL, connection_id uuid NOT NULL, object_type text NOT NULL, external_id text NOT NULL,
  external_version text NOT NULL, payload_reference text NOT NULL, permission_hash text NOT NULL, deleted boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,connection_id,object_type,external_id), FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connector_webhook_endpoints (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid, connector_key text NOT NULL, endpoint_locator_hash text NOT NULL,
  verification_scope text NOT NULL CHECK(verification_scope IN ('connection','application')), application_id text NOT NULL,
  environment text NOT NULL, secret_reference text NOT NULL, secret_version text NOT NULL, state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), disabled_at timestamptz, PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,endpoint_locator_hash)
);
CREATE TABLE provider_installation_bindings (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, connector_key text NOT NULL,
  application_id text NOT NULL, environment text NOT NULL, installation_id text NOT NULL, active_from timestamptz NOT NULL,
  active_to timestamptz, disabled_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id), CHECK(active_to IS NULL OR active_to > active_from)
);
CREATE UNIQUE INDEX provider_installation_active_idx ON provider_installation_bindings(application_id,environment,installation_id) WHERE active_to IS NULL;
CREATE TABLE connector_webhook_receipts (
  workspace_id uuid NOT NULL, id uuid NOT NULL, endpoint_id uuid NOT NULL, connection_id uuid, installation_id text,
  provider_event_id text, authenticated_order text, authenticated_event_time timestamptz, signature_version text NOT NULL,
  raw_body_hash text NOT NULL, dedupe_hash text NOT NULL, state text NOT NULL CHECK(state IN ('accepted','duplicate','quarantined','rejected','processed')),
  quarantine_reason text, received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz,
  PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,endpoint_id,dedupe_hash)
);
CREATE TABLE connector_reconciliations (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, state text NOT NULL,
  provider_count bigint, local_count bigint, divergence_count bigint NOT NULL DEFAULT 0, repaired_count bigint NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '{}', started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connector_control_switches (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connector_key text, connector_version text, connection_id uuid,
  capability text, direction text CHECK(direction IN ('inbound','outbound','both')), enabled boolean NOT NULL,
  reason text NOT NULL, changed_by uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,id)
);
CREATE TABLE connector_rate_buckets (
  workspace_id uuid NOT NULL, connection_id uuid NOT NULL, bucket_key text NOT NULL, available numeric NOT NULL,
  refill_at timestamptz NOT NULL, concurrency_in_use integer NOT NULL DEFAULT 0, backpressure_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,connection_id,bucket_key)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['connector_manifest_versions','connections','connection_authorization_transactions','connection_scope_snapshots','connection_sync_runs','connection_sync_checkpoints','connection_sync_pages','connection_external_objects','connector_webhook_endpoints','provider_installation_bindings','connector_webhook_receipts','connector_reconciliations','connector_control_switches','connector_rate_buckets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))', table_name, table_name);
  END LOOP;
END $$;
CREATE TRIGGER connector_webhook_receipts_append_only BEFORE UPDATE OR DELETE ON connector_webhook_receipts FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
REVOKE ALL ON connector_manifest_versions,connections,connection_authorization_transactions,connection_scope_snapshots,connection_sync_runs,connection_sync_checkpoints,connection_sync_pages,connection_external_objects,connector_webhook_endpoints,provider_installation_bindings,connector_webhook_receipts,connector_reconciliations,connector_control_switches,connector_rate_buckets FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON connector_manifest_versions,connections,connection_authorization_transactions,connection_scope_snapshots,connection_sync_runs,connection_sync_checkpoints,connection_sync_pages,connection_external_objects,connector_webhook_endpoints,provider_installation_bindings,connector_reconciliations,connector_control_switches,connector_rate_buckets TO knotline_runtime;
GRANT SELECT,INSERT ON connector_webhook_receipts TO knotline_runtime;
GRANT SELECT ON connector_manifest_versions,connections,connection_scope_snapshots,connection_sync_runs,connection_sync_checkpoints,connection_sync_pages,connection_external_objects,connector_webhook_endpoints,provider_installation_bindings,connector_webhook_receipts,connector_reconciliations,connector_control_switches,connector_rate_buckets TO knotline_reporting;
