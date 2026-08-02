UPDATE task_runs AS task
SET state = 'failed',
    state_version = task.state_version + 1,
    output = coalesce(task.output, '{}'::jsonb) || jsonb_build_object(
      'code', 'APPROVAL_EXPIRED',
      'approvalId', approval.id,
      'outcome', approval.state
    ),
    finished_at = coalesce(task.finished_at, approval.resolved_at, clock_timestamp()),
    updated_at = clock_timestamp()
FROM approvals AS approval
WHERE approval.workspace_id = task.workspace_id
  AND approval.task_id = task.id
  AND approval.state IN ('EXPIRED', 'REJECTED', 'CANCELLED', 'REVOKED')
  AND task.state IN ('ready', 'running');
