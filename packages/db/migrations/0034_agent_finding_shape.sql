UPDATE agent_drafts
SET validation_findings = '[]'::jsonb
WHERE jsonb_typeof(validation_findings) <> 'array';

UPDATE agent_simulations
SET findings = '[]'::jsonb
WHERE jsonb_typeof(findings) <> 'array';
