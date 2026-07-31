CREATE TABLE human_task_details (
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  queue_id uuid,
  assignee_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  assignee_group_id uuid,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at timestamptz,
  form_schema jsonb NOT NULL CHECK (jsonb_typeof(form_schema)='object'),
  form_schema_version integer NOT NULL CHECK (form_schema_version > 0),
  assignment_version bigint NOT NULL DEFAULT 1,
  output_revision integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  completed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reopened_from_task_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,task_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,assignee_group_id) REFERENCES workspace_groups(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reopened_from_task_id) REFERENCES task_runs(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX human_task_inbox_idx ON human_task_details(workspace_id,assignee_user_id,priority,due_at,task_id);
CREATE INDEX human_task_unassigned_idx ON human_task_details(workspace_id,queue_id,due_at,task_id) WHERE assignee_user_id IS NULL AND assignee_group_id IS NULL;

CREATE TABLE human_task_drafts (
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 1,
  schema_version integer NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(values)='object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,task_id,user_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE human_task_submissions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  revision integer NOT NULL,
  schema_version integer NOT NULL,
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  values jsonb NOT NULL CHECK (jsonb_typeof(values)='object'),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,task_id,revision),
  UNIQUE (workspace_id,task_id,idempotency_key),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE task_delegations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  delegator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delegate_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  retain_watcher boolean NOT NULL DEFAULT true,
  recallable boolean NOT NULL DEFAULT true,
  state text NOT NULL CHECK (state IN ('active','recalled','expired','completed')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  CHECK (ends_at > starts_at AND delegator_id != delegate_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE task_watchers (
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,task_id,user_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE task_queues (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  routing_mode text NOT NULL CHECK (routing_mode IN ('manual','round_robin','least_loaded','skills')),
  capacity integer NOT NULL CHECK (capacity > 0),
  fallback_owner_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  calendar_id uuid,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,name)
);

CREATE TABLE task_queue_members (
  workspace_id uuid NOT NULL,
  queue_id uuid NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('user','group')),
  principal_id uuid NOT NULL,
  skills text[] NOT NULL DEFAULT '{}',
  capacity integer CHECK (capacity > 0),
  PRIMARY KEY (workspace_id,queue_id,principal_type,principal_id),
  FOREIGN KEY (workspace_id,queue_id) REFERENCES task_queues(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE task_routing_policy_versions (
  workspace_id uuid NOT NULL,
  queue_id uuid NOT NULL,
  version integer NOT NULL,
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules)='array'),
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,queue_id,version),
  FOREIGN KEY (workspace_id,queue_id) REFERENCES task_queues(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE task_routing_decisions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  queue_id uuid NOT NULL,
  policy_version integer NOT NULL,
  selected_principal_id uuid,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,queue_id,policy_version) REFERENCES task_routing_policy_versions(workspace_id,queue_id,version) ON DELETE RESTRICT
);

CREATE TABLE business_calendars (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,name)
);
CREATE TABLE business_calendar_versions (
  workspace_id uuid NOT NULL,
  calendar_id uuid NOT NULL,
  version integer NOT NULL,
  business_hours jsonb NOT NULL,
  holidays jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id,calendar_id,version),
  FOREIGN KEY (workspace_id,calendar_id) REFERENCES business_calendars(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE task_templates (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','published','archived')),
  draft_definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_definition)='object'),
  optimistic_version bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);
CREATE TABLE task_template_versions (
  workspace_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version integer NOT NULL,
  form_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,template_id,version),
  FOREIGN KEY (workspace_id,template_id) REFERENCES task_templates(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE files (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('task_attachment','comment_attachment')),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('uploading','scanning','clean','quarantined','deleted')),
  current_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);
CREATE TABLE file_versions (
  workspace_id uuid NOT NULL,
  file_id uuid NOT NULL,
  version integer NOT NULL,
  object_key text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 26214400),
  checksum text NOT NULL,
  malware_state text NOT NULL CHECK (malware_state IN ('pending','clean','quarantined','rejected')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,file_id,version),
  FOREIGN KEY (workspace_id,file_id) REFERENCES files(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE file_upload_sessions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  file_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  expected_size bigint NOT NULL CHECK (expected_size BETWEEN 1 AND 26214400),
  expected_checksum text NOT NULL,
  state text NOT NULL CHECK (state IN ('created','uploading','uploaded','verified','expired','rejected')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,idempotency_key),
  FOREIGN KEY (workspace_id,file_id) REFERENCES files(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE task_file_attachments (
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  file_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,task_id,file_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,file_id) REFERENCES files(workspace_id,id) ON DELETE CASCADE
);

ALTER TABLE human_task_details ADD CONSTRAINT human_task_queue_fk FOREIGN KEY (workspace_id,queue_id) REFERENCES task_queues(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE task_queues ADD CONSTRAINT task_queue_calendar_fk FOREIGN KEY (workspace_id,calendar_id) REFERENCES business_calendars(workspace_id,id) ON DELETE RESTRICT;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'human_task_details','human_task_drafts','human_task_submissions','task_delegations','task_watchers',
    'task_queues','task_queue_members','task_routing_policy_versions','task_routing_decisions',
    'business_calendars','business_calendar_versions','task_templates','task_template_versions',
    'files','file_versions','file_upload_sessions','task_file_attachments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER human_task_submissions_append_only BEFORE UPDATE OR DELETE ON human_task_submissions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER task_routing_decisions_append_only BEFORE UPDATE OR DELETE ON task_routing_decisions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER file_versions_append_only BEFORE UPDATE OR DELETE ON file_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON human_task_details,human_task_drafts,human_task_submissions,task_delegations,task_watchers,
 task_queues,task_queue_members,task_routing_policy_versions,task_routing_decisions,business_calendars,
 business_calendar_versions,task_templates,task_template_versions,files,file_versions,file_upload_sessions,task_file_attachments FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON human_task_details,human_task_drafts,task_delegations,task_watchers,
 task_queues,task_queue_members,business_calendars,task_templates,files,file_upload_sessions,task_file_attachments TO knotline_runtime;
GRANT SELECT,INSERT ON human_task_submissions,task_routing_policy_versions,task_routing_decisions,
 business_calendar_versions,task_template_versions,file_versions TO knotline_runtime;
GRANT SELECT ON human_task_details,human_task_drafts,human_task_submissions,task_delegations,task_watchers,
 task_queues,task_queue_members,task_routing_policy_versions,task_routing_decisions,business_calendars,
 business_calendar_versions,task_templates,task_template_versions,files,file_versions,file_upload_sessions,task_file_attachments TO knotline_reporting;
