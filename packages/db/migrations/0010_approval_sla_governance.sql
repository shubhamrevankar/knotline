CREATE TABLE approval_policies (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','published','archived')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,name)
);

CREATE TABLE approval_policy_versions (
  workspace_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  content_hash text NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,policy_id,version),
  UNIQUE (workspace_id,policy_id,content_hash),
  FOREIGN KEY (workspace_id,policy_id) REFERENCES approval_policies(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE approvals (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  policy_id uuid,
  policy_version integer,
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot)='object'),
  packet jsonb NOT NULL CHECK (jsonb_typeof(packet)='object'),
  packet_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','IN_REVIEW','APPROVED_PENDING_EXECUTION','REJECTED','REVISION_REQUESTED','EXPIRED','CANCELLED','CONSUMED','REVOKED')),
  state_version bigint NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  linked_approval_id uuid,
  resolved_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,task_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,policy_id,policy_version) REFERENCES approval_policy_versions(workspace_id,policy_id,version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,linked_approval_id) REFERENCES approvals(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX approvals_inbox_idx ON approvals(workspace_id,state,expires_at,id);

CREATE TABLE approval_steps (
  workspace_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  step_key text NOT NULL,
  step_order integer NOT NULL CHECK (step_order >= 0),
  mode text NOT NULL CHECK (mode IN ('single','any','all','quorum')),
  quorum integer CHECK (quorum > 0),
  eligible_user_ids uuid[] NOT NULL,
  resolution_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','approved','rejected','revision_requested','exhausted')),
  PRIMARY KEY (workspace_id,approval_id,step_key),
  FOREIGN KEY (workspace_id,approval_id) REFERENCES approvals(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE approval_decisions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  approval_id uuid NOT NULL,
  step_key text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('approve','reject','request_changes','abstain','cancel')),
  reason text NOT NULL,
  packet_hash text NOT NULL,
  session_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,approval_id,idempotency_key),
  UNIQUE (workspace_id,approval_id,step_key,actor_id),
  FOREIGN KEY (workspace_id,approval_id,step_key) REFERENCES approval_steps(workspace_id,approval_id,step_key) ON DELETE RESTRICT
);

CREATE TABLE approval_delegations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  approval_id uuid NOT NULL,
  delegator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delegate_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('approval','policy','workspace')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  exclusions text[] NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','recalled','expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  CHECK (delegator_id <> delegate_id AND ends_at > starts_at),
  FOREIGN KEY (workspace_id,approval_id) REFERENCES approvals(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE sla_definitions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','published','archived')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,name)
);

CREATE TABLE sla_definition_versions (
  workspace_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  version integer NOT NULL,
  calendar_id uuid NOT NULL,
  calendar_version integer NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  warning_thresholds integer[] NOT NULL DEFAULT '{}',
  breach_action text NOT NULL CHECK (breach_action IN ('notify','escalate','expire','auto_reject','auto_cancel')),
  pause_states text[] NOT NULL DEFAULT '{}',
  escalation_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,definition_id,version),
  FOREIGN KEY (workspace_id,definition_id) REFERENCES sla_definitions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,calendar_id,calendar_version) REFERENCES business_calendar_versions(workspace_id,calendar_id,version) ON DELETE RESTRICT
);

CREATE TABLE sla_timer_events (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  approval_id uuid NOT NULL,
  sla_definition_id uuid,
  sla_version integer,
  timer_type text NOT NULL CHECK (timer_type IN ('warning','reminder','expiry','escalation')),
  tier integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','fired','handled','cancelled')),
  temporal_timer_id text NOT NULL,
  idempotency_key text NOT NULL,
  fired_at timestamptz,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,idempotency_key),
  UNIQUE (workspace_id,approval_id,timer_type,tier),
  FOREIGN KEY (workspace_id,approval_id) REFERENCES approvals(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,sla_definition_id,sla_version) REFERENCES sla_definition_versions(workspace_id,definition_id,version) ON DELETE RESTRICT
);
CREATE INDEX sla_timer_due_idx ON sla_timer_events(workspace_id,state,due_at,id);

CREATE TABLE approval_consumptions (
  workspace_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  packet_hash text NOT NULL,
  fencing_token bigint NOT NULL,
  consumed_by text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,approval_id),
  UNIQUE (workspace_id,operation_id),
  FOREIGN KEY (workspace_id,approval_id) REFERENCES approvals(workspace_id,id) ON DELETE RESTRICT
);

ALTER TABLE notification_intents DROP CONSTRAINT notification_intents_source_type_check;
ALTER TABLE notification_intents ADD CONSTRAINT notification_intents_source_type_check CHECK (source_type IN ('mention','followed_activity','approval_sla'));
ALTER TABLE notification_intents DROP CONSTRAINT notification_intents_resource_type_check;
ALTER TABLE notification_intents ADD CONSTRAINT notification_intents_resource_type_check CHECK (resource_type IN ('workflow','run','task','approval'));
ALTER TABLE notification_intents ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notification_intents_dedupe_idx ON notification_intents(workspace_id,dedupe_key) WHERE dedupe_key IS NOT NULL;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'approval_policies','approval_policy_versions','approvals','approval_steps','approval_decisions',
    'approval_delegations','sla_definitions','sla_definition_versions','sla_timer_events','approval_consumptions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER approval_policy_versions_append_only BEFORE UPDATE OR DELETE ON approval_policy_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER approval_decisions_append_only BEFORE UPDATE OR DELETE ON approval_decisions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER approval_consumptions_append_only BEFORE UPDATE OR DELETE ON approval_consumptions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON approval_policies,approval_policy_versions,approvals,approval_steps,approval_decisions,
 approval_delegations,sla_definitions,sla_definition_versions,sla_timer_events,approval_consumptions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON approval_policies,approvals,approval_steps,approval_delegations,
 sla_definitions,sla_timer_events TO knotline_runtime;
GRANT SELECT,INSERT ON approval_policy_versions,approval_decisions,sla_definition_versions,approval_consumptions TO knotline_runtime;
GRANT SELECT ON approval_policies,approval_policy_versions,approvals,approval_steps,approval_decisions,
 approval_delegations,sla_definitions,sla_definition_versions,sla_timer_events,approval_consumptions TO knotline_reporting;
