ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS output jsonb;
