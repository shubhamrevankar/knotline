INSERT INTO agent_drafts(
  workspace_id,
  agent_id,
  revision,
  definition,
  content_hash,
  validation_findings,
  updated_by
)
SELECT
  agent.workspace_id,
  agent.id,
  1,
  version.definition,
  version.content_hash,
  '[]'::jsonb,
  version.published_by
FROM agent_definitions agent
JOIN agent_versions version
  ON version.workspace_id = agent.workspace_id
 AND version.agent_id = agent.id
 AND version.version = agent.current_version
LEFT JOIN agent_drafts draft
  ON draft.workspace_id = agent.workspace_id
 AND draft.agent_id = agent.id
WHERE draft.agent_id IS NULL
ON CONFLICT (workspace_id,agent_id) DO NOTHING;
