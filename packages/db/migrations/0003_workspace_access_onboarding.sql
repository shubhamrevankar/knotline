ALTER TABLE workspaces
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN locale text NOT NULL DEFAULT 'en',
  ADD COLUMN region text NOT NULL DEFAULT 'local',
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN deletion_requested_at timestamptz,
  ADD COLUMN deletion_requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN is_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN sandbox_label text,
  ADD CONSTRAINT workspaces_archive_state_check CHECK (
    (state = 'archived' AND archived_at IS NOT NULL) OR state <> 'archived'
  ),
  ADD CONSTRAINT workspaces_sandbox_label_check CHECK (
    (is_sandbox AND length(trim(sandbox_label)) BETWEEN 1 AND 80) OR
    (NOT is_sandbox AND sandbox_label IS NULL)
  );

ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check CHECK (
    role IN ('owner','admin','builder','member','approver','billing','auditor','custom')
  );

CREATE TABLE permission_catalog (
  key text PRIMARY KEY CHECK (key ~ '^[a-z]+(?:\.[a-z]+)+$'),
  description text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('read','write','admin','owner'))
);

INSERT INTO permission_catalog(key, description, risk) VALUES
  ('workspace.read', 'Read workspace profile and navigation', 'read'),
  ('workspace.update', 'Update workspace preferences', 'admin'),
  ('workspace.archive', 'Archive and restore a workspace', 'owner'),
  ('workspace.delete', 'Request guarded workspace deletion', 'owner'),
  ('member.read', 'Read workspace members', 'read'),
  ('member.invite', 'Invite and manage pending invitations', 'admin'),
  ('member.update', 'Change member roles and state', 'admin'),
  ('member.remove', 'Remove and reassign a member', 'admin'),
  ('ownership.transfer', 'Transfer workspace ownership', 'owner'),
  ('role.read', 'Read role definitions', 'read'),
  ('role.manage', 'Create and manage custom roles', 'admin'),
  ('group.read', 'Read groups and reporting relationships', 'read'),
  ('group.manage', 'Manage groups and reporting relationships', 'admin'),
  ('workflow.read', 'Read workflows', 'read'),
  ('workflow.create', 'Create workflows', 'write'),
  ('workflow.manage', 'Manage and publish workflows', 'write'),
  ('billing.read', 'Read billing information', 'read'),
  ('billing.manage', 'Manage billing settings', 'admin'),
  ('audit.read', 'Read audit history', 'read');

CREATE TABLE workspace_roles (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  role_key text NOT NULL CHECK (role_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  permissions text[] NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, role_key),
  CHECK (cardinality(permissions) > 0)
);

ALTER TABLE memberships ADD COLUMN custom_role_id uuid;
ALTER TABLE memberships ADD CONSTRAINT memberships_custom_role_fk
  FOREIGN KEY (workspace_id, custom_role_id) REFERENCES workspace_roles(workspace_id, id)
  ON DELETE RESTRICT;
ALTER TABLE memberships ADD CONSTRAINT memberships_custom_role_shape CHECK (
  (role = 'custom' AND custom_role_id IS NOT NULL) OR
  (role <> 'custom' AND custom_role_id IS NULL)
);

CREATE TABLE workspace_invitations (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  email text NOT NULL CHECK (email = lower(email)),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^sha256:[a-f0-9]{64}$'),
  role text NOT NULL CHECK (role IN ('admin','builder','member','approver','billing','auditor','custom')),
  custom_role_id uuid,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','accepted','declined','cancelled','expired')),
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, custom_role_id) REFERENCES workspace_roles(workspace_id, id),
  CHECK ((role = 'custom' AND custom_role_id IS NOT NULL) OR
         (role <> 'custom' AND custom_role_id IS NULL)),
  CHECK (expires_at > created_at),
  CHECK ((state = 'pending' AND responded_at IS NULL) OR
         (state <> 'pending' AND responded_at IS NOT NULL))
);
CREATE UNIQUE INDEX workspace_invitations_pending_email_idx
  ON workspace_invitations(workspace_id, email) WHERE state = 'pending';
CREATE INDEX workspace_invitations_workspace_state_idx
  ON workspace_invitations(workspace_id, state, created_at DESC);

CREATE TABLE workspace_groups (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scim')),
  external_key text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, name)
);
CREATE UNIQUE INDEX workspace_groups_external_key_idx
  ON workspace_groups(workspace_id, source, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE workspace_group_memberships (
  workspace_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scim')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, group_id, user_id),
  FOREIGN KEY (workspace_id, group_id) REFERENCES workspace_groups(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE organization_relationships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  report_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  manager_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('manual','scim','provider')),
  precedence integer NOT NULL CHECK (precedence BETWEEN 1 AND 1000),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  conflict_state text NOT NULL DEFAULT 'clear' CHECK (conflict_state IN ('clear','shadowed','conflict')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  CHECK (report_user_id <> manager_user_id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX organization_relationships_report_idx
  ON organization_relationships(workspace_id, report_user_id, effective_from DESC);

CREATE TABLE resource_grants (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('user','group','guest')),
  principal_id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  permissions text[] NOT NULL,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, principal_type, principal_id, resource_type, resource_id)
);

CREATE TABLE onboarding_progress (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_step text NOT NULL DEFAULT 'workspace',
  completed_steps text[] NOT NULL DEFAULT '{}'::text[],
  skipped_steps text[] NOT NULL DEFAULT '{}'::text[],
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE sandbox_resources (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Sample data',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, resource_type, resource_id)
);

CREATE TABLE guest_identities (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  email text NOT NULL CHECK (email = lower(email)),
  state text NOT NULL DEFAULT 'disabled' CHECK (state IN ('disabled','active','revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, email)
);

CREATE FUNCTION knotline_invitation_workspace(selected_token_hash text, selected_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT workspace_id FROM workspace_invitations
  WHERE token_hash = selected_token_hash AND email = lower(selected_email)
  LIMIT 1
$$;

CREATE FUNCTION knotline_user_workspaces(selected_user_id uuid)
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  workspace_state text,
  membership_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT workspace.id, workspace.name, workspace.slug, workspace.state, membership.role
  FROM memberships membership
  JOIN workspaces workspace ON workspace.id = membership.workspace_id
  WHERE membership.user_id = selected_user_id
    AND membership.state = 'active'
    AND workspace.state <> 'deleting'
  ORDER BY workspace.created_at, workspace.id
$$;

CREATE FUNCTION knotline_org_cycle_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE managers(user_id) AS (
      SELECT NEW.manager_user_id
      UNION
      SELECT relationship.manager_user_id
      FROM organization_relationships relationship
      JOIN managers ON relationship.report_user_id = managers.user_id
      WHERE relationship.workspace_id = NEW.workspace_id
        AND relationship.effective_to IS NULL
        AND relationship.id <> NEW.id
    )
    SELECT 1 FROM managers WHERE user_id = NEW.report_user_id
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_RELATIONSHIP_CYCLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION knotline_last_owner_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.state = 'active' AND
     (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.state <> 'active') AND
     NOT EXISTS (
       SELECT 1 FROM memberships
       WHERE workspace_id = OLD.workspace_id AND role = 'owner' AND state = 'active'
         AND id <> OLD.id
     ) THEN
    RAISE EXCEPTION 'LAST_WORKSPACE_OWNER' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER organization_relationships_cycle_guard
BEFORE INSERT OR UPDATE ON organization_relationships
FOR EACH ROW EXECUTE FUNCTION knotline_org_cycle_guard();
CREATE TRIGGER memberships_last_owner_guard
BEFORE UPDATE OR DELETE ON memberships
FOR EACH ROW EXECUTE FUNCTION knotline_last_owner_guard();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workspace_roles','workspace_invitations','workspace_groups','workspace_group_memberships',
    'organization_relationships','resource_grants','onboarding_progress','sandbox_resources',
    'guest_identities'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',
      table_name, table_name
    );
  END LOOP;
END
$$;

REVOKE ALL ON permission_catalog, workspace_roles, workspace_invitations, workspace_groups,
  workspace_group_memberships, organization_relationships, resource_grants, onboarding_progress,
  sandbox_resources, guest_identities FROM PUBLIC;
GRANT SELECT ON permission_catalog TO knotline_runtime, knotline_reporting;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_roles, workspace_invitations, workspace_groups,
  workspace_group_memberships, organization_relationships, resource_grants, onboarding_progress,
  sandbox_resources, guest_identities TO knotline_runtime;
GRANT SELECT ON workspace_roles, workspace_groups, workspace_group_memberships,
  organization_relationships, onboarding_progress TO knotline_reporting;
REVOKE ALL ON FUNCTION knotline_invitation_workspace(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION knotline_invitation_workspace(text, text) TO knotline_runtime;
REVOKE ALL ON FUNCTION knotline_user_workspaces(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION knotline_user_workspaces(uuid) TO knotline_runtime;
GRANT EXECUTE ON FUNCTION knotline_org_cycle_guard(), knotline_last_owner_guard()
  TO knotline_runtime, knotline_repair;
