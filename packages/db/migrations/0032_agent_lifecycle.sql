ALTER TABLE agent_definitions DROP CONSTRAINT agent_definitions_state_check;
ALTER TABLE agent_definitions
  ADD CONSTRAINT agent_definitions_state_check
  CHECK (state IN ('draft','active','disabled','deprecated','archived'));
