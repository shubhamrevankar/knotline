CREATE TABLE knowledge_type_versions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  type_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('entity','relation')),
  version integer NOT NULL CHECK (version > 0),
  display_name text NOT NULL,
  schema jsonb NOT NULL,
  migration jsonb,
  state text NOT NULL CHECK (state IN ('active','superseded','retired')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id), UNIQUE (workspace_id,type_key,kind,version)
);
CREATE UNIQUE INDEX knowledge_type_versions_active_idx ON knowledge_type_versions(workspace_id,type_key,kind) WHERE state='active';

CREATE TABLE knowledge_entities (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  type_key text NOT NULL,
  type_version integer NOT NULL,
  canonical_name text NOT NULL,
  canonical_metadata jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL CHECK (state IN ('active','merged','split','deleted')),
  merged_into_id uuid,
  revision bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,merged_into_id) REFERENCES knowledge_entities(workspace_id,id)
);
CREATE INDEX knowledge_entities_list_idx ON knowledge_entities(workspace_id,type_key,state,canonical_name,id);

CREATE TABLE knowledge_entity_aliases (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  entity_id uuid NOT NULL,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  provider text,
  provider_id text,
  provider_identity_hash text,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  state text NOT NULL CHECK (state IN ('active','moved','removed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,entity_id) REFERENCES knowledge_entities(workspace_id,id)
);
CREATE UNIQUE INDEX knowledge_entity_aliases_provider_idx ON knowledge_entity_aliases(workspace_id,provider,provider_id) WHERE provider IS NOT NULL AND provider_id IS NOT NULL;
CREATE INDEX knowledge_entity_aliases_lookup_idx ON knowledge_entity_aliases(workspace_id,normalized_alias) WHERE state='active';

CREATE TABLE knowledge_entity_facts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  entity_id uuid NOT NULL,
  attribute_key text NOT NULL,
  typed_value jsonb NOT NULL,
  fact_kind text NOT NULL CHECK (fact_kind IN ('provider','user','inferred','suggestion')),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  state text NOT NULL CHECK (state IN ('active','superseded','disputed','removed')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,entity_id) REFERENCES knowledge_entities(workspace_id,id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX knowledge_entity_facts_profile_idx ON knowledge_entity_facts(workspace_id,entity_id,attribute_key,state,valid_from DESC);

CREATE TABLE knowledge_fact_evidence (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  fact_id uuid NOT NULL,
  source_id uuid,
  document_id uuid,
  chunk_id uuid,
  action_id uuid,
  coordinate jsonb,
  content_hash text NOT NULL,
  acl_epoch bigint NOT NULL CHECK (acl_epoch > 0),
  principal_ids uuid[] NOT NULL DEFAULT '{}',
  group_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,fact_id) REFERENCES knowledge_entity_facts(workspace_id,id),
  CHECK (source_id IS NOT NULL OR action_id IS NOT NULL)
);
CREATE INDEX knowledge_fact_evidence_fact_idx ON knowledge_fact_evidence(workspace_id,fact_id);

CREATE TABLE knowledge_relations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  source_entity_id uuid NOT NULL,
  target_entity_id uuid NOT NULL,
  type_key text NOT NULL,
  type_version integer NOT NULL,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound','bidirectional')),
  fact_kind text NOT NULL CHECK (fact_kind IN ('provider','user','inferred','suggestion')),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  state text NOT NULL CHECK (state IN ('active','superseded','removed')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,source_entity_id) REFERENCES knowledge_entities(workspace_id,id),
  FOREIGN KEY (workspace_id,target_entity_id) REFERENCES knowledge_entities(workspace_id,id),
  CHECK (source_entity_id <> target_entity_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX knowledge_relations_traverse_source_idx ON knowledge_relations(workspace_id,source_entity_id,state,type_key);
CREATE INDEX knowledge_relations_traverse_target_idx ON knowledge_relations(workspace_id,target_entity_id,state,type_key);

CREATE TABLE knowledge_relation_evidence (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  relation_id uuid NOT NULL,
  source_id uuid,
  document_id uuid,
  chunk_id uuid,
  action_id uuid,
  coordinate jsonb,
  content_hash text NOT NULL,
  acl_epoch bigint NOT NULL CHECK (acl_epoch > 0),
  principal_ids uuid[] NOT NULL DEFAULT '{}',
  group_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,relation_id) REFERENCES knowledge_relations(workspace_id,id),
  CHECK (source_id IS NOT NULL OR action_id IS NOT NULL)
);

CREATE TABLE knowledge_entity_merge_candidates (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  left_entity_id uuid NOT NULL,
  right_entity_id uuid NOT NULL,
  score numeric(5,4) NOT NULL,
  resolver_version text NOT NULL,
  evidence jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','accepted','rejected','expired')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,left_entity_id,right_entity_id,resolver_version)
);

CREATE TABLE knowledge_entity_fact_conflicts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  entity_id uuid NOT NULL,
  attribute_key text NOT NULL,
  fact_ids uuid[] NOT NULL,
  state text NOT NULL CHECK (state IN ('open','resolved','dismissed')),
  resolution jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,entity_id) REFERENCES knowledge_entities(workspace_id,id)
);

CREATE TABLE knowledge_entity_changes (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  entity_id uuid NOT NULL,
  revision bigint NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL,
  reason text,
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id), UNIQUE (workspace_id,entity_id,revision)
);

CREATE TABLE knowledge_provenance_packets (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  authorization_proof_hash text NOT NULL,
  packet jsonb NOT NULL,
  content_hash text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);

CREATE TABLE knowledge_graph_query_receipts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  root_entity_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  depth integer NOT NULL CHECK (depth BETWEEN 0 AND 4),
  result_count integer NOT NULL CHECK (result_count BETWEEN 0 AND 200),
  visited_count integer NOT NULL,
  elapsed_ms integer NOT NULL,
  truncated boolean NOT NULL,
  query_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);

CREATE TABLE knowledge_admin_actions (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  state text NOT NULL,
  actor_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (workspace_id,id)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['knowledge_type_versions','knowledge_entities','knowledge_entity_aliases','knowledge_entity_facts','knowledge_fact_evidence','knowledge_relations','knowledge_relation_evidence','knowledge_entity_merge_candidates','knowledge_entity_fact_conflicts','knowledge_entity_changes','knowledge_provenance_packets','knowledge_graph_query_receipts','knowledge_admin_actions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))', table_name, table_name);
  END LOOP;
END $$;

CREATE TRIGGER knowledge_entity_changes_append_only BEFORE UPDATE OR DELETE ON knowledge_entity_changes FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER knowledge_provenance_packets_append_only BEFORE UPDATE OR DELETE ON knowledge_provenance_packets FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER knowledge_graph_query_receipts_append_only BEFORE UPDATE OR DELETE ON knowledge_graph_query_receipts FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON knowledge_type_versions,knowledge_entities,knowledge_entity_aliases,knowledge_entity_facts,knowledge_fact_evidence,knowledge_relations,knowledge_relation_evidence,knowledge_entity_merge_candidates,knowledge_entity_fact_conflicts,knowledge_entity_changes,knowledge_provenance_packets,knowledge_graph_query_receipts,knowledge_admin_actions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON knowledge_type_versions,knowledge_entities,knowledge_entity_aliases,knowledge_entity_facts,knowledge_fact_evidence,knowledge_relations,knowledge_relation_evidence,knowledge_entity_merge_candidates,knowledge_entity_fact_conflicts,knowledge_admin_actions TO knotline_runtime;
GRANT SELECT,INSERT ON knowledge_entity_changes,knowledge_provenance_packets,knowledge_graph_query_receipts TO knotline_runtime;
GRANT SELECT ON knowledge_type_versions,knowledge_entities,knowledge_entity_aliases,knowledge_entity_facts,knowledge_fact_evidence,knowledge_relations,knowledge_relation_evidence,knowledge_entity_merge_candidates,knowledge_entity_fact_conflicts,knowledge_entity_changes,knowledge_provenance_packets,knowledge_graph_query_receipts,knowledge_admin_actions TO knotline_reporting;
