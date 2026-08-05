CREATE INDEX workflow_generations_accepted_workflow_idx
  ON workflow_generations(workspace_id,accepted_workflow_id,created_at DESC)
  WHERE accepted_workflow_id IS NOT NULL;
