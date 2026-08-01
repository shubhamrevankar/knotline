CREATE TABLE evaluation_datasets (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL, name text NOT NULL, description text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK(state IN ('draft','active','archived')),
  current_version integer, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,name)
);
CREATE TABLE evaluation_dataset_versions (
  workspace_id uuid NOT NULL, dataset_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
  content_hash text NOT NULL, case_count integer NOT NULL CHECK(case_count>=0),
  source_type text NOT NULL CHECK(source_type IN ('synthetic','curated','run_snapshot','csv','jsonl','manual')),
  consent_reference text, published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,dataset_id,version),
  UNIQUE(workspace_id,dataset_id,content_hash),
  FOREIGN KEY(workspace_id,dataset_id) REFERENCES evaluation_datasets(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE evaluation_cases (
  workspace_id uuid NOT NULL, id uuid NOT NULL, dataset_id uuid NOT NULL, dataset_version integer NOT NULL,
  stable_key text NOT NULL, input jsonb NOT NULL, expected jsonb, reference_data jsonb NOT NULL DEFAULT '[]',
  tags text[] NOT NULL DEFAULT '{}', difficulty text NOT NULL, risk text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false, encrypted_fixture bytea, fixture_key_reference text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,dataset_id,dataset_version,stable_key),
  FOREIGN KEY(workspace_id,dataset_id,dataset_version) REFERENCES evaluation_dataset_versions(workspace_id,dataset_id,version) ON DELETE RESTRICT,
  CHECK((sensitive AND encrypted_fixture IS NOT NULL AND input='null'::jsonb) OR NOT sensitive)
);
CREATE TABLE evaluation_suites (
  workspace_id uuid NOT NULL, id uuid NOT NULL, name text NOT NULL, version integer NOT NULL,
  grader_definitions jsonb NOT NULL CHECK(jsonb_typeof(grader_definitions)='array'), adversarial_categories text[] NOT NULL DEFAULT '{}',
  budget_cap_decimal numeric(24,12) NOT NULL CHECK(budget_cap_decimal>=0), schedule text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id,version)
);
CREATE TABLE evaluation_runs (
  workspace_id uuid NOT NULL, id uuid NOT NULL, suite_id uuid NOT NULL, suite_version integer NOT NULL,
  agent_id uuid NOT NULL, agent_version integer NOT NULL, dataset_id uuid NOT NULL, dataset_version integer NOT NULL,
  state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled','budget_stopped')),
  reproducibility_snapshot jsonb NOT NULL CHECK(jsonb_typeof(reproducibility_snapshot)='object'),
  idempotency_key text NOT NULL, total_cost_decimal numeric(24,12) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
  PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,idempotency_key),
  FOREIGN KEY(workspace_id,suite_id,suite_version) REFERENCES evaluation_suites(workspace_id,id,version) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_id,agent_version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,dataset_id,dataset_version) REFERENCES evaluation_dataset_versions(workspace_id,dataset_id,version) ON DELETE RESTRICT
);
CREATE TABLE evaluation_case_results (
  workspace_id uuid NOT NULL, eval_run_id uuid NOT NULL, case_id uuid NOT NULL,
  output jsonb, output_hash text NOT NULL, trajectory jsonb NOT NULL DEFAULT '[]', citations jsonb NOT NULL DEFAULT '[]',
  latency_ms integer NOT NULL CHECK(latency_ms>=0), cost_decimal numeric(24,12) NOT NULL CHECK(cost_decimal>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,eval_run_id,case_id),
  FOREIGN KEY(workspace_id,eval_run_id) REFERENCES evaluation_runs(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,case_id) REFERENCES evaluation_cases(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE evaluation_grader_results (
  workspace_id uuid NOT NULL, eval_run_id uuid NOT NULL, case_id uuid NOT NULL, grader_kind text NOT NULL,
  grader_version text NOT NULL, passed boolean NOT NULL, score numeric(10,9) NOT NULL CHECK(score BETWEEN 0 AND 1),
  reason_code text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,eval_run_id,case_id,grader_kind,grader_version),
  FOREIGN KEY(workspace_id,eval_run_id,case_id) REFERENCES evaluation_case_results(workspace_id,eval_run_id,case_id) ON DELETE RESTRICT
);
CREATE TABLE evaluation_comparisons (
  workspace_id uuid NOT NULL, id uuid NOT NULL, baseline_run_id uuid NOT NULL, candidate_run_id uuid NOT NULL,
  summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object'), gate_decision jsonb,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,baseline_run_id,candidate_run_id),
  FOREIGN KEY(workspace_id,baseline_run_id) REFERENCES evaluation_runs(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,candidate_run_id) REFERENCES evaluation_runs(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE evaluation_human_reviews (
  workspace_id uuid NOT NULL, id uuid NOT NULL, comparison_id uuid NOT NULL, case_id uuid NOT NULL,
  blind_order text[] NOT NULL, rubric_version text NOT NULL, assigned_to uuid REFERENCES users(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK(state IN ('queued','claimed','submitted','adjudicated')),
  decision jsonb, disagreement boolean NOT NULL DEFAULT false, adjudicated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,comparison_id) REFERENCES evaluation_comparisons(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,case_id) REFERENCES evaluation_cases(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE agent_release_policies (
  workspace_id uuid NOT NULL, agent_id uuid NOT NULL, environment text NOT NULL, risk_class text NOT NULL,
  revision bigint NOT NULL DEFAULT 1, gate_definition jsonb NOT NULL CHECK(jsonb_typeof(gate_definition)='object'),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,agent_id,environment,risk_class),
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE agent_releases (
  workspace_id uuid NOT NULL, id uuid NOT NULL, agent_id uuid NOT NULL, version integer NOT NULL,
  environment text NOT NULL CHECK(environment IN ('development','staging','production')),
  channel text NOT NULL CHECK(channel IN ('shadow','canary','stable','rolled_back')),
  canary_percentage integer NOT NULL CHECK(canary_percentage BETWEEN 0 AND 100), comparison_id uuid NOT NULL,
  gate_snapshot jsonb NOT NULL, state text NOT NULL CHECK(state IN ('active','superseded','rolled_back')),
  promoted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, promoted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  rolled_back_at timestamptz, rollback_of uuid, PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,agent_id,version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,comparison_id) REFERENCES evaluation_comparisons(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,rollback_of) REFERENCES agent_releases(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE agent_release_allocations (
  workspace_id uuid NOT NULL, release_id uuid NOT NULL, subject_hash text NOT NULL, selected_version integer NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,release_id,subject_hash),
  FOREIGN KEY(workspace_id,release_id) REFERENCES agent_releases(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE agent_online_metric_buckets (
  workspace_id uuid NOT NULL, agent_id uuid NOT NULL, agent_version integer NOT NULL, bucket_start timestamptz NOT NULL,
  metric text NOT NULL, sample_count bigint NOT NULL CHECK(sample_count>=0), value_sum numeric(30,12) NOT NULL,
  warning text, PRIMARY KEY(workspace_id,agent_id,agent_version,bucket_start,metric),
  FOREIGN KEY(workspace_id,agent_id,agent_version) REFERENCES agent_versions(workspace_id,agent_id,version) ON DELETE RESTRICT
);
CREATE TABLE scheduled_evaluations (
  workspace_id uuid NOT NULL, id uuid NOT NULL, suite_id uuid NOT NULL, suite_version integer NOT NULL,
  agent_id uuid NOT NULL, cron_expression text NOT NULL, next_run_at timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true,
  budget_cap_decimal numeric(24,12) NOT NULL, last_idempotency_key text, revision bigint NOT NULL DEFAULT 1,
  PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,suite_id,suite_version) REFERENCES evaluation_suites(workspace_id,id,version) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX evaluation_runs_agent_idx ON evaluation_runs(workspace_id,agent_id,agent_version,created_at DESC,id);
CREATE INDEX evaluation_cases_dataset_idx ON evaluation_cases(workspace_id,dataset_id,dataset_version,stable_key);
CREATE INDEX agent_releases_agent_idx ON agent_releases(workspace_id,agent_id,environment,promoted_at DESC,id);
CREATE INDEX agent_metrics_lookup_idx ON agent_online_metric_buckets(workspace_id,agent_id,bucket_start DESC,metric);
DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY[
 'evaluation_datasets','evaluation_dataset_versions','evaluation_cases','evaluation_suites','evaluation_runs',
 'evaluation_case_results','evaluation_grader_results','evaluation_comparisons','evaluation_human_reviews',
 'agent_release_policies','agent_releases','agent_release_allocations','agent_online_metric_buckets','scheduled_evaluations'
] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name); END LOOP; END $$;
CREATE TRIGGER evaluation_dataset_versions_append_only BEFORE UPDATE OR DELETE ON evaluation_dataset_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER evaluation_cases_append_only BEFORE UPDATE OR DELETE ON evaluation_cases FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER evaluation_case_results_append_only BEFORE UPDATE OR DELETE ON evaluation_case_results FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER evaluation_grader_results_append_only BEFORE UPDATE OR DELETE ON evaluation_grader_results FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER evaluation_comparisons_append_only BEFORE UPDATE OR DELETE ON evaluation_comparisons FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
REVOKE ALL ON evaluation_datasets,evaluation_dataset_versions,evaluation_cases,evaluation_suites,evaluation_runs,evaluation_case_results,evaluation_grader_results,evaluation_comparisons,evaluation_human_reviews,agent_release_policies,agent_releases,agent_release_allocations,agent_online_metric_buckets,scheduled_evaluations FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON evaluation_datasets,evaluation_suites,evaluation_runs,evaluation_human_reviews,agent_release_policies,agent_online_metric_buckets,scheduled_evaluations TO knotline_runtime;
GRANT SELECT,INSERT ON evaluation_dataset_versions,evaluation_cases,evaluation_case_results,evaluation_grader_results,evaluation_comparisons,agent_releases,agent_release_allocations TO knotline_runtime;
GRANT SELECT ON evaluation_datasets,evaluation_dataset_versions,evaluation_cases,evaluation_suites,evaluation_runs,evaluation_case_results,evaluation_grader_results,evaluation_comparisons,evaluation_human_reviews,agent_release_policies,agent_releases,agent_release_allocations,agent_online_metric_buckets,scheduled_evaluations TO knotline_reporting;
