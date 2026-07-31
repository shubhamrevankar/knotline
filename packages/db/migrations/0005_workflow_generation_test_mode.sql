CREATE TABLE workflow_generations (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  retry_of uuid,
  prompt_version text NOT NULL CHECK (prompt_version ~ '^workflow-generation\.v[0-9]+$'),
  provider text NOT NULL,
  source_prompt text NOT NULL CHECK (length(source_prompt) BETWEEN 10 AND 8000),
  lifecycle text NOT NULL CHECK (lifecycle IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLING','CANCELLED')),
  progress_phase text CHECK (progress_phase IN ('GENERATING','VALIDATING','REPAIRING','READY_TO_ACCEPT')),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result)='object'),
  failure_code text,
  accepted_workflow_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,retry_of) REFERENCES workflow_generations(workspace_id,id) ON DELETE SET NULL (retry_of),
  FOREIGN KEY (workspace_id,accepted_workflow_id) REFERENCES workflows(workspace_id,id) ON DELETE SET NULL (accepted_workflow_id),
  CHECK ((lifecycle='RUNNING' AND progress_phase IS NOT NULL) OR lifecycle <> 'RUNNING'),
  CHECK ((lifecycle='SUCCEEDED' AND result IS NOT NULL) OR lifecycle <> 'SUCCEEDED')
);
CREATE INDEX workflow_generations_workspace_created_idx
  ON workflow_generations(workspace_id,created_at DESC);

CREATE TABLE workflow_test_runs (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  workflow_id uuid,
  generation_id uuid,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  simulated boolean NOT NULL CHECK (simulated),
  fixture_lineage jsonb NOT NULL CHECK (jsonb_typeof(fixture_lineage)='object'),
  report jsonb NOT NULL CHECK (jsonb_typeof(report)='object'),
  external_write_count integer NOT NULL DEFAULT 0 CHECK (external_write_count=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,workflow_id) REFERENCES workflows(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,generation_id) REFERENCES workflow_generations(workspace_id,id) ON DELETE SET NULL (generation_id),
  CHECK (workflow_id IS NOT NULL OR generation_id IS NOT NULL)
);
CREATE INDEX workflow_test_runs_workspace_created_idx
  ON workflow_test_runs(workspace_id,created_at DESC);

ALTER TABLE workflow_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_generations_tenant_policy ON workflow_generations
  USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id));
ALTER TABLE workflow_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_test_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_test_runs_tenant_policy ON workflow_test_runs
  USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id));

REVOKE ALL ON workflow_generations,workflow_test_runs FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON workflow_generations TO knotline_runtime;
GRANT SELECT,INSERT ON workflow_test_runs TO knotline_runtime;
GRANT SELECT ON workflow_generations,workflow_test_runs TO knotline_reporting;
