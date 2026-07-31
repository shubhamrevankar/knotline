CREATE TABLE run_saved_views (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters)='object'),
  columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(columns)='array'),
  density text NOT NULL DEFAULT 'comfortable' CHECK (density IN ('compact','comfortable')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,owner_id,name)
);

CREATE TABLE run_follows (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,run_id,user_id),
  FOREIGN KEY (workspace_id,run_id) REFERENCES workflow_runs(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE run_artifacts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  task_id uuid,
  name text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  object_key text NOT NULL,
  content_hash text NOT NULL,
  malware_state text NOT NULL CHECK (malware_state IN ('pending','clean','quarantined','rejected')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,run_id) REFERENCES workflow_runs(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX run_artifacts_run_idx ON run_artifacts(workspace_id,run_id,created_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['run_saved_views','run_follows','run_artifacts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

REVOKE ALL ON run_saved_views,run_follows,run_artifacts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON run_saved_views,run_follows,run_artifacts TO knotline_runtime;
GRANT SELECT ON run_saved_views,run_follows,run_artifacts TO knotline_reporting;
