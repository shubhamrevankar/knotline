ALTER TABLE outbox_events
  ADD COLUMN publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN claimed_by text,
  ADD COLUMN claim_expires_at timestamptz,
  ADD COLUMN published_at timestamptz;

CREATE TABLE workflow_runs (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','paused','cancelling','cancelled','succeeded','failed','policy_stopped')),
  state_version bigint NOT NULL DEFAULT 1,
  fencing_token bigint NOT NULL DEFAULT 1,
  temporal_workflow_id text NOT NULL,
  temporal_run_id text,
  idempotency_key text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input)='object'),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot)='object'),
  parent_run_id uuid,
  forked_from_event_sequence bigint,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,workflow_id,idempotency_key),
  UNIQUE (temporal_workflow_id),
  FOREIGN KEY (workspace_id,workflow_id,workflow_version) REFERENCES workflow_versions(workspace_id,workflow_id,version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,parent_run_id) REFERENCES workflow_runs(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX workflow_runs_workspace_state_idx ON workflow_runs(workspace_id,state,created_at DESC);

CREATE TABLE task_runs (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  node_key text NOT NULL,
  node_kind text NOT NULL,
  instance_key text NOT NULL,
  execution_path text NOT NULL,
  queue_class text NOT NULL CHECK (queue_class IN ('system','human','agent','connector')),
  runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(runtime_config)='object'),
  maximum_attempts integer NOT NULL CHECK (maximum_attempts BETWEEN 1 AND 10),
  timeout_ms integer NOT NULL CHECK (timeout_ms BETWEEN 1000 AND 86400000),
  state text NOT NULL CHECK (state IN ('pending','ready','running','waiting','retry_wait','succeeded','failed','cancelled','uncertain','skipped')),
  state_version bigint NOT NULL DEFAULT 1,
  fencing_token bigint NOT NULL DEFAULT 1,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,run_id,node_key,instance_key),
  FOREIGN KEY (workspace_id,run_id) REFERENCES workflow_runs(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX task_runs_dispatch_idx ON task_runs(workspace_id,queue_class,state,available_at);

CREATE TABLE task_dependencies (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  task_id uuid NOT NULL,
  depends_on_task_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','satisfied','failed','skipped')),
  PRIMARY KEY (workspace_id,task_id,depends_on_task_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,depends_on_task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE task_attempts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  state text NOT NULL CHECK (state IN ('started','succeeded','failed','timed_out','cancelled','uncertain')),
  worker_identity text NOT NULL,
  fencing_token bigint NOT NULL,
  error_code text,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,task_id,attempt),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE run_events (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  sequence bigint NOT NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user','system','worker','reconciler')),
  actor_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,run_id,sequence),
  FOREIGN KEY (workspace_id,run_id) REFERENCES workflow_runs(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE event_receipts (
  workspace_id uuid NOT NULL,
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,consumer,event_id)
);

CREATE TABLE external_operations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  logical_operation_id text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','claimed','succeeded','failed_safe','uncertain','reconciled')),
  claim_generation bigint NOT NULL DEFAULT 0,
  fencing_token bigint NOT NULL DEFAULT 1,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,logical_operation_id),
  FOREIGN KEY (workspace_id,task_id) REFERENCES task_runs(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE external_operation_attempts (
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  request_hash text NOT NULL,
  fencing_token bigint NOT NULL,
  provider_idempotency_key text NOT NULL,
  state text NOT NULL,
  PRIMARY KEY (workspace_id,operation_id,attempt),
  FOREIGN KEY (workspace_id,operation_id) REFERENCES external_operations(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE external_operation_attempt_records (
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  attempt integer NOT NULL,
  sequence integer NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('send_started','sent','response','receipt','failed_safe','uncertain')),
  fencing_token bigint NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,operation_id,attempt,sequence),
  FOREIGN KEY (workspace_id,operation_id,attempt) REFERENCES external_operation_attempts(workspace_id,operation_id,attempt) ON DELETE CASCADE
);

CREATE TABLE dead_letter_items (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  source text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_ref text NOT NULL,
  attempts integer NOT NULL,
  error_code text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','replaying','resolved','discarded')),
  resolution jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);

CREATE TABLE entitlement_policies (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  version text NOT NULL,
  meter text NOT NULL,
  hard_limit numeric(38,0) NOT NULL CHECK (hard_limit >= 0),
  soft_limit numeric(38,0) NOT NULL CHECK (soft_limit >= 0 AND soft_limit <= hard_limit),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,version,meter)
);

CREATE TABLE budget_periods (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  policy_version text NOT NULL,
  meter text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  committed_units numeric(38,0) NOT NULL DEFAULT 0,
  reserved_units numeric(38,0) NOT NULL DEFAULT 0,
  spend_stop boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id,id),
  CHECK (ends_at > starts_at)
);

CREATE TABLE admission_reservations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  period_id uuid NOT NULL,
  operation_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  maximum_units numeric(38,0) NOT NULL CHECK (maximum_units > 0),
  used_units numeric(38,0) NOT NULL DEFAULT 0,
  state text NOT NULL CHECK (state IN ('reserved','finalized','released','expired','unknown_hold')),
  fencing_token bigint NOT NULL DEFAULT 1,
  lease_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,idempotency_key),
  UNIQUE (workspace_id,operation_id),
  FOREIGN KEY (workspace_id,period_id) REFERENCES budget_periods(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE admission_ledger_entries (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('reserve','increment','finalize','release','expire','debt','credit','threshold')),
  units numeric(38,0) NOT NULL,
  fencing_token bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,reservation_id) REFERENCES admission_reservations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE runtime_control_switches (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('workspace_start','global_start')),
  enabled boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT '',
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,scope)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workflow_runs','task_runs','task_dependencies','task_attempts','run_events','event_receipts',
    'external_operations','external_operation_attempts','external_operation_attempt_records','dead_letter_items',
    'entitlement_policies','budget_periods','admission_reservations','admission_ledger_entries','runtime_control_switches'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER admission_ledger_append_only BEFORE UPDATE OR DELETE ON admission_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER run_events_append_only BEFORE UPDATE OR DELETE ON run_events
  FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER external_attempt_records_append_only BEFORE UPDATE OR DELETE ON external_operation_attempt_records
  FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON workflow_runs,task_runs,task_dependencies,task_attempts,run_events,event_receipts,
 external_operations,external_operation_attempts,external_operation_attempt_records,dead_letter_items,
 entitlement_policies,budget_periods,admission_reservations,admission_ledger_entries,runtime_control_switches FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON workflow_runs,task_runs,task_dependencies,task_attempts,event_receipts,
 external_operations,external_operation_attempts,dead_letter_items,entitlement_policies,budget_periods,
 admission_reservations,runtime_control_switches TO knotline_runtime;
GRANT SELECT,INSERT ON run_events,external_operation_attempt_records,admission_ledger_entries TO knotline_runtime;
GRANT SELECT ON workflow_runs,task_runs,task_dependencies,task_attempts,run_events,event_receipts,
 external_operations,external_operation_attempts,external_operation_attempt_records,dead_letter_items,
 entitlement_policies,budget_periods,admission_reservations,admission_ledger_entries,runtime_control_switches TO knotline_reporting;
