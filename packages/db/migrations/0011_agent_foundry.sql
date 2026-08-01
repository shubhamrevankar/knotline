CREATE TABLE agent_definitions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  stable_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  visibility text NOT NULL CHECK (visibility IN ('private','workspace')),
  state text NOT NULL CHECK (state IN ('draft','active','deprecated','archived')),
  current_version integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,stable_key)
);
CREATE INDEX agent_definitions_catalog_idx ON agent_definitions(workspace_id,state,visibility,updated_at DESC,id);

CREATE TABLE agent_drafts (
  workspace_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  content_hash text NOT NULL,
  validation_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,agent_id),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE agent_versions (
  workspace_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  content_hash text NOT NULL,
  change_summary text NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,agent_id,version),
  UNIQUE (workspace_id,agent_id,content_hash),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_release_channels (
  workspace_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('development','stable','deprecated')),
  version integer NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,agent_id,channel),
  FOREIGN KEY (workspace_id,agent_id,version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT
);

CREATE TABLE agent_tags (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,normalized_name),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE agent_tag_assignments (
  workspace_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  PRIMARY KEY (workspace_id,agent_id,tag_id),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,tag_id) REFERENCES agent_tags(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE agent_version_references (
  workspace_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_version integer NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('workflow_version','agent_version','template_version')),
  resource_id text NOT NULL,
  resource_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,agent_id,agent_version,resource_type,resource_id,resource_version),
  FOREIGN KEY (workspace_id,agent_id,agent_version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT
);

CREATE TABLE agent_simulations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_version integer,
  draft_revision bigint,
  fixture jsonb NOT NULL CHECK (jsonb_typeof(fixture)='object'),
  prompt_preview jsonb NOT NULL CHECK (jsonb_typeof(prompt_preview)='object'),
  output jsonb NOT NULL CHECK (jsonb_typeof(output)='object'),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_estimate integer NOT NULL CHECK (token_estimate >= 0),
  execution_class text NOT NULL DEFAULT 'SIMULATED' CHECK (execution_class='SIMULATED'),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,agent_id,agent_version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT,
  CHECK ((agent_version IS NULL) <> (draft_revision IS NULL))
);
CREATE INDEX agent_simulations_agent_idx ON agent_simulations(workspace_id,agent_id,created_at DESC,id);

CREATE TABLE reusable_schemas (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('draft','published','archived')),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,name)
);

CREATE TABLE reusable_schema_versions (
  workspace_id uuid NOT NULL,
  schema_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  schema jsonb NOT NULL CHECK (jsonb_typeof(schema)='object'),
  content_hash text NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,schema_id,version),
  UNIQUE (workspace_id,schema_id,content_hash),
  FOREIGN KEY (workspace_id,schema_id) REFERENCES reusable_schemas(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_activity_events (
  workspace_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  sequence bigint NOT NULL,
  event_type text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,agent_id,sequence),
  FOREIGN KEY (workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE CASCADE
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_definitions','agent_drafts','agent_versions','agent_release_channels','agent_tags',
    'agent_tag_assignments','agent_version_references','agent_simulations','reusable_schemas',
    'reusable_schema_versions','agent_activity_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER agent_versions_append_only BEFORE UPDATE OR DELETE ON agent_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER reusable_schema_versions_append_only BEFORE UPDATE OR DELETE ON reusable_schema_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER agent_activity_events_append_only BEFORE UPDATE OR DELETE ON agent_activity_events FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON agent_definitions,agent_drafts,agent_versions,agent_release_channels,agent_tags,
 agent_tag_assignments,agent_version_references,agent_simulations,reusable_schemas,reusable_schema_versions,
 agent_activity_events FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON agent_definitions,agent_drafts,agent_release_channels,agent_tags,
 agent_tag_assignments,agent_simulations,reusable_schemas TO knotline_runtime;
GRANT SELECT,INSERT ON agent_versions,agent_version_references,reusable_schema_versions,agent_activity_events TO knotline_runtime;
GRANT SELECT ON agent_definitions,agent_versions,agent_release_channels,agent_tags,agent_tag_assignments,
 agent_version_references,agent_simulations,reusable_schemas,reusable_schema_versions,agent_activity_events TO knotline_reporting;
