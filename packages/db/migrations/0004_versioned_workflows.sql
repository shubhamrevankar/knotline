ALTER TABLE workflow_nodes DROP CONSTRAINT workflow_nodes_kind_check;
ALTER TABLE workflow_nodes ADD CONSTRAINT workflow_nodes_kind_check CHECK (
  kind IN ('trigger','human','agent','approval','condition','delay','loop','subworkflow','transform','integration_action')
);

ALTER TABLE workflows DROP CONSTRAINT workflows_state_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_state_check
  CHECK (state IN ('draft','active','archived','deleting'));

ALTER TABLE workflows
  ADD COLUMN owner_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN folder_id uuid,
  ADD COLUMN entitlement_class text NOT NULL DEFAULT 'standard'
    CHECK (entitlement_class IN ('standard','premium'));

UPDATE workflows w SET owner_user_id = (
  SELECT m.user_id FROM memberships m
  WHERE m.workspace_id=w.workspace_id AND m.state='active'
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at
  LIMIT 1
);

ALTER TABLE workflow_versions
  ADD COLUMN draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
  ADD COLUMN release_note text NOT NULL DEFAULT '' CHECK (length(release_note) <= 2000),
  ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE RESTRICT;

CREATE TABLE workflow_folders (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  normalized_name text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,parent_id,normalized_name),
  FOREIGN KEY (workspace_id,parent_id) REFERENCES workflow_folders(workspace_id,id) ON DELETE CASCADE
);

ALTER TABLE workflows ADD CONSTRAINT workflows_folder_fk
  FOREIGN KEY (workspace_id,folder_id) REFERENCES workflow_folders(workspace_id,id) ON DELETE SET NULL (folder_id);

CREATE TABLE workflow_tags (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  normalized_name text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  color text NOT NULL DEFAULT 'slate' CHECK (color IN ('slate','blue','lime','amber','rose','violet')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,normalized_name)
);

CREATE TABLE workflow_tag_assignments (
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,workflow_id,tag_id),
  FOREIGN KEY (workspace_id,workflow_id) REFERENCES workflows(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,tag_id) REFERENCES workflow_tags(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE workflow_favorites (
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,workflow_id,user_id),
  FOREIGN KEY (workspace_id,workflow_id) REFERENCES workflows(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE workflow_validation_findings (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version integer NOT NULL,
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  code text NOT NULL CHECK (code ~ '^WF_[A-Z0-9_]+$'),
  severity text NOT NULL CHECK (severity IN ('error','warning')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  location jsonb NOT NULL CHECK (jsonb_typeof(location)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,workflow_id,workflow_version)
    REFERENCES workflow_versions(workspace_id,workflow_id,version) ON DELETE CASCADE
);
CREATE INDEX workflow_validation_revision_idx
  ON workflow_validation_findings(workspace_id,workflow_id,workflow_version,draft_revision);

CREATE TABLE workflow_templates (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace','first_party')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);
CREATE INDEX workflow_templates_workspace_state_idx ON workflow_templates(workspace_id,state,updated_at DESC);

CREATE TABLE workflow_template_versions (
  workspace_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','superseded')),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables)='array'),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,template_id,version),
  FOREIGN KEY (workspace_id,template_id) REFERENCES workflow_templates(workspace_id,id) ON DELETE CASCADE,
  CHECK ((state='published' AND published_at IS NOT NULL) OR state <> 'published')
);

CREATE TABLE workflow_triggers (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version integer NOT NULL,
  trigger_key text NOT NULL CHECK (trigger_key ~ '^[a-z][a-z0-9_-]{0,79}$'),
  kind text NOT NULL CHECK (kind IN ('manual','schedule','webhook','event')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration)='object'),
  state text NOT NULL DEFAULT 'disabled' CHECK (state IN ('enabled','disabled')),
  secret_version integer NOT NULL DEFAULT 1 CHECK (secret_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,workflow_id,trigger_key),
  FOREIGN KEY (workspace_id,workflow_id,workflow_version)
    REFERENCES workflow_versions(workspace_id,workflow_id,version) ON DELETE CASCADE
);

CREATE FUNCTION knotline_template_version_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('published','superseded') THEN
    RAISE EXCEPTION 'published template versions are immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER workflow_template_versions_immutable
  BEFORE UPDATE OR DELETE ON workflow_template_versions
  FOR EACH ROW EXECUTE FUNCTION knotline_template_version_immutable();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workflow_folders','workflow_tags','workflow_tag_assignments','workflow_favorites',
    'workflow_validation_findings','workflow_templates','workflow_template_versions','workflow_triggers'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',
      table_name,table_name
    );
  END LOOP;
END
$$;

REVOKE ALL ON workflow_folders,workflow_tags,workflow_tag_assignments,workflow_favorites,
  workflow_validation_findings,workflow_templates,workflow_template_versions,workflow_triggers FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON workflow_folders,workflow_tags,workflow_tag_assignments,
  workflow_favorites,workflow_templates,workflow_template_versions,workflow_triggers TO knotline_runtime;
GRANT SELECT,INSERT,DELETE ON workflow_validation_findings TO knotline_runtime;
GRANT SELECT ON workflow_folders,workflow_tags,workflow_tag_assignments,workflow_favorites,
  workflow_validation_findings,workflow_templates,workflow_template_versions,workflow_triggers TO knotline_reporting;
GRANT EXECUTE ON FUNCTION knotline_template_version_immutable() TO knotline_runtime,knotline_reporting,knotline_repair;
