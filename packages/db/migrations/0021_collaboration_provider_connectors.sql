CREATE TABLE collaboration_provider_accounts (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL,
  provider text NOT NULL, external_account_id text NOT NULL, display_name text NOT NULL,
  capability_tier text NOT NULL, granted_scopes text[] NOT NULL DEFAULT '{}',
  capability_config jsonb NOT NULL DEFAULT '{}', verified_at timestamptz NOT NULL,
  disabled_at timestamptz, PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,provider,external_account_id),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);

CREATE TABLE provider_metadata_snapshots (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL,
  external_account_id text NOT NULL, object_kind text NOT NULL, provider_revision text NOT NULL,
  values jsonb NOT NULL, fetched_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  content_hash text NOT NULL, PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,connection_id,object_kind,provider_revision),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE INDEX provider_metadata_expiry_idx ON provider_metadata_snapshots(workspace_id,connection_id,expires_at DESC);

CREATE TABLE provider_identity_bindings (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL,
  provider_account_id text NOT NULL, provider_user_id text NOT NULL, user_id uuid NOT NULL,
  binding_method text NOT NULL CHECK(binding_method IN ('verified_identifier','explicit_administration')),
  verified_identifier_hash text, verified_by uuid NOT NULL, verified_at timestamptz NOT NULL,
  revoked_at timestamptz, PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,connection_id,provider_user_id),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE github_installation_binding_versions (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL,
  application_id text NOT NULL, environment text NOT NULL, installation_id text NOT NULL,
  active_from timestamptz NOT NULL, active_to timestamptz, disabled_at timestamptz,
  binding_version bigint NOT NULL, PRIMARY KEY(workspace_id,id),
  UNIQUE(application_id,environment,installation_id,binding_version),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE INDEX github_installation_event_route_idx ON github_installation_binding_versions(application_id,environment,installation_id,active_from,active_to);

CREATE TABLE collaboration_action_policy_snapshots (
  workspace_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL,
  provider text NOT NULL, action_key text NOT NULL, risk text NOT NULL CHECK(risk IN ('low','medium','high')),
  required_scope text NOT NULL, approval_mode text NOT NULL CHECK(approval_mode IN ('recommended','required')),
  idempotency_mode text NOT NULL CHECK(idempotency_mode IN ('native','receipt-lookup')),
  compensation_limit text NOT NULL, manifest_version text NOT NULL, recorded_at timestamptz NOT NULL,
  PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,connection_id,action_key,manifest_version),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);

CREATE TABLE provider_webhook_quarantine (
  workspace_id uuid NOT NULL, id uuid NOT NULL, provider text NOT NULL,
  application_id text NOT NULL, environment text NOT NULL, installation_id text,
  delivery_id text NOT NULL, event_time timestamptz, reason text NOT NULL,
  payload_hash text NOT NULL, binding_candidates integer NOT NULL, recorded_at timestamptz NOT NULL,
  resolved_at timestamptz, resolved_by uuid, PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,provider,installation_id,delivery_id)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['collaboration_provider_accounts','provider_metadata_snapshots','provider_identity_bindings','github_installation_binding_versions','collaboration_action_policy_snapshots','provider_webhook_quarantine'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER provider_metadata_snapshots_append_only BEFORE UPDATE OR DELETE ON provider_metadata_snapshots FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER collaboration_action_policy_snapshots_append_only BEFORE UPDATE OR DELETE ON collaboration_action_policy_snapshots FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON collaboration_provider_accounts,provider_metadata_snapshots,provider_identity_bindings,github_installation_binding_versions,collaboration_action_policy_snapshots,provider_webhook_quarantine FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON collaboration_provider_accounts,provider_identity_bindings,github_installation_binding_versions,provider_webhook_quarantine TO knotline_runtime;
GRANT SELECT,INSERT ON provider_metadata_snapshots,collaboration_action_policy_snapshots TO knotline_runtime;
GRANT SELECT ON collaboration_provider_accounts,provider_metadata_snapshots,provider_identity_bindings,github_installation_binding_versions,collaboration_action_policy_snapshots,provider_webhook_quarantine TO knotline_reporting;
