DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'knotline_runtime') THEN
    CREATE ROLE knotline_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'knotline_reporting') THEN
    CREATE ROLE knotline_reporting NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'knotline_migration') THEN
    CREATE ROLE knotline_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'knotline_repair') THEN
    CREATE ROLE knotline_repair NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE knotline_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE knotline_reporting NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE knotline_migration NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
ALTER ROLE knotline_repair NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived', 'deleting')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'builder', 'member', 'viewer')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX memberships_workspace_state_idx ON memberships(workspace_id, state);

CREATE TABLE workflows (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'archived')),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  optimistic_version integer NOT NULL DEFAULT 1 CHECK (optimistic_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX workflows_workspace_updated_idx ON workflows(workspace_id, updated_at DESC, id);

CREATE TABLE workflow_versions (
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'superseded')),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(definition) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, workflow_id, version),
  FOREIGN KEY (workspace_id, workflow_id) REFERENCES workflows(workspace_id, id) ON DELETE CASCADE,
  CHECK ((state = 'published' AND published_at IS NOT NULL) OR state <> 'published')
);

CREATE TABLE workflow_nodes (
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version integer NOT NULL,
  id uuid NOT NULL,
  stable_key text NOT NULL CHECK (stable_key ~ '^[a-z][a-z0-9_-]{0,79}$'),
  kind text NOT NULL CHECK (kind IN ('trigger', 'agent', 'approval', 'action', 'human', 'condition')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, workflow_id, workflow_version, id),
  UNIQUE (workspace_id, workflow_id, workflow_version, stable_key),
  FOREIGN KEY (workspace_id, workflow_id, workflow_version)
    REFERENCES workflow_versions(workspace_id, workflow_id, version) ON DELETE CASCADE
);

CREATE TABLE workflow_edges (
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version integer NOT NULL,
  id uuid NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  PRIMARY KEY (workspace_id, workflow_id, workflow_version, id),
  FOREIGN KEY (workspace_id, workflow_id, workflow_version)
    REFERENCES workflow_versions(workspace_id, workflow_id, version) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, workflow_id, workflow_version, source_node_id)
    REFERENCES workflow_nodes(workspace_id, workflow_id, workflow_version, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, workflow_id, workflow_version, target_node_id)
    REFERENCES workflow_nodes(workspace_id, workflow_id, workflow_version, id) ON DELETE CASCADE,
  CHECK (source_node_id <> target_node_id)
);

CREATE TABLE idempotency_records (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('started', 'completed', 'failed')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, principal_id, operation, key)
);

CREATE TABLE audit_events (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  result text NOT NULL CHECK (result IN ('succeeded', 'denied', 'failed')),
  request_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX audit_events_workspace_time_idx ON audit_events(workspace_id, occurred_at DESC);

CREATE TABLE outbox_events (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  published boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX outbox_unpublished_idx ON outbox_events(published, occurred_at) WHERE published = false;

CREATE FUNCTION knotline_tenant_visible(row_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid = row_workspace_id
$$;

CREATE FUNCTION knotline_mutations_enabled() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.mutations_disabled', true), 'false') = 'true' THEN
    RAISE EXCEPTION 'KNOTLINE_MUTATIONS_DISABLED' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION knotline_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

CREATE FUNCTION knotline_published_version_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('published', 'superseded') THEN
    RAISE EXCEPTION 'published workflow versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION knotline_draft_version_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE selected_workspace_id uuid;
DECLARE selected_workflow_id uuid;
DECLARE selected_version integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    selected_workspace_id := OLD.workspace_id;
    selected_workflow_id := OLD.workflow_id;
    selected_version := OLD.workflow_version;
  ELSE
    selected_workspace_id := NEW.workspace_id;
    selected_workflow_id := NEW.workflow_id;
    selected_version := NEW.workflow_version;
  END IF;
  IF EXISTS (
    SELECT 1 FROM workflow_versions
    WHERE workspace_id = selected_workspace_id
      AND workflow_id = selected_workflow_id
      AND version = selected_version
      AND state <> 'draft'
  ) THEN
    RAISE EXCEPTION 'published workflow version children are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workspaces', 'memberships', 'workflows', 'workflow_versions', 'workflow_nodes',
    'workflow_edges', 'idempotency_records', 'audit_events', 'outbox_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF table_name = 'workspaces' THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(id)) WITH CHECK (knotline_tenant_visible(id))',
        table_name, table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',
        table_name, table_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE TRIGGER workflows_mutation_guard BEFORE INSERT OR UPDATE OR DELETE ON workflows
FOR EACH ROW EXECUTE FUNCTION knotline_mutations_enabled();
CREATE TRIGGER workflow_versions_mutation_guard BEFORE INSERT OR UPDATE OR DELETE ON workflow_versions
FOR EACH ROW EXECUTE FUNCTION knotline_mutations_enabled();
CREATE TRIGGER workflow_versions_immutable BEFORE UPDATE OR DELETE ON workflow_versions
FOR EACH ROW EXECUTE FUNCTION knotline_published_version_immutable();
CREATE TRIGGER workflow_nodes_mutation_guard BEFORE INSERT OR UPDATE OR DELETE ON workflow_nodes
FOR EACH ROW EXECUTE FUNCTION knotline_mutations_enabled();
CREATE TRIGGER workflow_nodes_draft_only BEFORE INSERT OR UPDATE OR DELETE ON workflow_nodes
FOR EACH ROW EXECUTE FUNCTION knotline_draft_version_only();
CREATE TRIGGER workflow_edges_mutation_guard BEFORE INSERT OR UPDATE OR DELETE ON workflow_edges
FOR EACH ROW EXECUTE FUNCTION knotline_mutations_enabled();
CREATE TRIGGER workflow_edges_draft_only BEFORE INSERT OR UPDATE OR DELETE ON workflow_edges
FOR EACH ROW EXECUTE FUNCTION knotline_draft_version_only();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER outbox_events_append_only BEFORE UPDATE OR DELETE ON outbox_events
FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO knotline_runtime, knotline_reporting, knotline_repair;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces, memberships, workflows, workflow_versions,
  workflow_nodes, workflow_edges, idempotency_records TO knotline_runtime;
GRANT SELECT, INSERT ON audit_events, outbox_events TO knotline_runtime;
GRANT SELECT ON workspaces, memberships, workflows, workflow_versions, workflow_nodes,
  workflow_edges, audit_events TO knotline_reporting;
GRANT SELECT, UPDATE ON workflows, workflow_versions, workflow_nodes, workflow_edges TO knotline_repair;
GRANT SELECT ON users TO knotline_runtime, knotline_reporting, knotline_repair;
GRANT EXECUTE ON FUNCTION knotline_tenant_visible(uuid), knotline_mutations_enabled(),
  knotline_append_only(), knotline_published_version_immutable()
  TO knotline_runtime, knotline_reporting, knotline_repair;
GRANT EXECUTE ON FUNCTION knotline_draft_version_only()
  TO knotline_runtime, knotline_reporting, knotline_repair;
