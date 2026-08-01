CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_index_generations (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  state text NOT NULL CHECK(state IN ('building','active','retired','failed')),
  reason text NOT NULL CHECK(reason IN ('full','incremental','changed_version','parser_upgrade','chunker_upgrade','embedder_upgrade','acl_only','delete')),
  parser_version text NOT NULL,
  chunker_version text NOT NULL,
  embedder_version text NOT NULL,
  source_count integer NOT NULL DEFAULT 0 CHECK(source_count>=0),
  chunk_count bigint NOT NULL DEFAULT 0 CHECK(chunk_count>=0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_at timestamptz,
  retired_at timestamptz,
  PRIMARY KEY(workspace_id,id)
);

CREATE UNIQUE INDEX knowledge_active_generation_idx ON knowledge_index_generations(workspace_id) WHERE state='active';

CREATE TABLE knowledge_sources (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version integer NOT NULL,
  generation_id uuid NOT NULL,
  source_type text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  connector_id uuid,
  title text NOT NULL,
  source_checksum text NOT NULL,
  parser_version text NOT NULL,
  chunker_version text NOT NULL,
  embedder_version text NOT NULL,
  classification text NOT NULL CHECK(classification IN ('public','internal','confidential','restricted')),
  state text NOT NULL CHECK(state IN ('indexing','ready','superseded','deleted','failed')),
  indexed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,document_id,document_version,generation_id),
  FOREIGN KEY(workspace_id,document_id,document_version) REFERENCES file_versions(workspace_id,file_id,version) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,generation_id) REFERENCES knowledge_index_generations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_document_sections (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  source_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>=0),
  coordinate jsonb NOT NULL CHECK(jsonb_typeof(coordinate)='object'),
  content_hash text NOT NULL,
  text_content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,source_id,ordinal),
  FOREIGN KEY(workspace_id,source_id) REFERENCES knowledge_sources(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_chunks (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  source_id uuid NOT NULL,
  section_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>=0),
  text_content text NOT NULL,
  content_hash text NOT NULL,
  coordinate jsonb NOT NULL CHECK(jsonb_typeof(coordinate)='object'),
  tags text[] NOT NULL DEFAULT '{}',
  injection_signals text[] NOT NULL DEFAULT '{}',
  token_count integer NOT NULL CHECK(token_count>0),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',text_content)) STORED,
  embedding vector(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id),
  UNIQUE(workspace_id,source_id,generation_id,ordinal),
  FOREIGN KEY(workspace_id,source_id) REFERENCES knowledge_sources(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,section_id) REFERENCES knowledge_document_sections(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,generation_id) REFERENCES knowledge_index_generations(workspace_id,id) ON DELETE RESTRICT
);

CREATE INDEX knowledge_chunks_lexical_idx ON knowledge_chunks USING gin(search_vector);
CREATE INDEX knowledge_chunks_vector_idx ON knowledge_chunks USING hnsw(embedding vector_cosine_ops);
CREATE INDEX knowledge_chunks_serving_idx ON knowledge_chunks(workspace_id,generation_id,source_id,ordinal);

CREATE TABLE knowledge_acl_projections (
  workspace_id uuid NOT NULL,
  source_id uuid NOT NULL,
  epoch bigint NOT NULL CHECK(epoch>0),
  projection_hash text NOT NULL,
  provider_revision text NOT NULL,
  complete boolean NOT NULL,
  authoritative boolean NOT NULL DEFAULT false,
  predecessor_epoch bigint,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,source_id,epoch),
  FOREIGN KEY(workspace_id,source_id) REFERENCES knowledge_sources(workspace_id,id) ON DELETE RESTRICT,
  CHECK(expires_at<=observed_at+interval '5 minutes')
);

CREATE UNIQUE INDEX knowledge_acl_authoritative_idx ON knowledge_acl_projections(workspace_id,source_id) WHERE authoritative;

CREATE TABLE knowledge_acl_members (
  workspace_id uuid NOT NULL,
  source_id uuid NOT NULL,
  epoch bigint NOT NULL,
  subject_kind text NOT NULL CHECK(subject_kind IN ('user','group','workspace')),
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,source_id,epoch,subject_kind,subject_id),
  FOREIGN KEY(workspace_id,source_id,epoch) REFERENCES knowledge_acl_projections(workspace_id,source_id,epoch) ON DELETE RESTRICT
);

CREATE INDEX knowledge_acl_subject_idx ON knowledge_acl_members(workspace_id,subject_kind,subject_id,source_id,epoch);

CREATE TABLE knowledge_authorization_proofs (
  workspace_id uuid NOT NULL,
  proof_hash text NOT NULL,
  key_id text NOT NULL,
  subject_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_hash text NOT NULL,
  group_ids uuid[] NOT NULL DEFAULT '{}',
  resource_id uuid NOT NULL,
  acl_epoch bigint NOT NULL,
  acl_hash text NOT NULL,
  device_id uuid,
  session_id uuid,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,proof_hash),
  CHECK(expires_at<=issued_at+interval '5 minutes')
);

CREATE INDEX knowledge_proof_expiry_idx ON knowledge_authorization_proofs(workspace_id,subject_id,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE knowledge_retrieval_manifests (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL,
  query_hash text NOT NULL,
  policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),
  selected_chunk_ids uuid[] NOT NULL,
  excluded_counts jsonb NOT NULL CHECK(jsonb_typeof(excluded_counts)='object'),
  scoring_version text NOT NULL,
  permission_proof_hash text NOT NULL,
  latency_ms integer NOT NULL CHECK(latency_ms>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,generation_id) REFERENCES knowledge_index_generations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_embedding_cache (
  workspace_id uuid NOT NULL,
  content_hash text NOT NULL,
  embedder_version text NOT NULL,
  dimensions integer NOT NULL CHECK(dimensions=16),
  embedding vector(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,content_hash,embedder_version)
);

CREATE TABLE knowledge_embedding_usage (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  generation_id uuid NOT NULL,
  embedder_version text NOT NULL,
  input_count integer NOT NULL CHECK(input_count>=0),
  input_tokens bigint NOT NULL CHECK(input_tokens>=0),
  cache_hits integer NOT NULL CHECK(cache_hits>=0),
  retry_count integer NOT NULL CHECK(retry_count>=0),
  cost_decimal numeric(24,12) NOT NULL CHECK(cost_decimal>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,generation_id) REFERENCES knowledge_index_generations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_reindex_jobs (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  generation_id uuid NOT NULL,
  mode text NOT NULL CHECK(mode IN ('full','incremental','changed_version','parser_upgrade','chunker_upgrade','embedder_upgrade','acl_only','delete')),
  state text NOT NULL CHECK(state IN ('queued','running','ready','failed','cancelled')),
  cursor jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(cursor)='object'),
  error_code text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,generation_id) REFERENCES knowledge_index_generations(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_permission_invalidations (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  source_id uuid NOT NULL,
  prior_epoch bigint NOT NULL,
  next_epoch bigint NOT NULL CHECK(next_epoch>prior_epoch),
  reason text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cache_deadline timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,source_id) REFERENCES knowledge_sources(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_citation_accesses (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  manifest_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK(outcome IN ('opened','deleted','superseded','permission_revoked','proof_stale')),
  permission_proof_hash text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id),
  FOREIGN KEY(workspace_id,manifest_id) REFERENCES knowledge_retrieval_manifests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,chunk_id) REFERENCES knowledge_chunks(workspace_id,id) ON DELETE RESTRICT
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'knowledge_index_generations','knowledge_sources','knowledge_document_sections','knowledge_chunks',
    'knowledge_acl_projections','knowledge_acl_members','knowledge_authorization_proofs','knowledge_retrieval_manifests',
    'knowledge_embedding_cache','knowledge_embedding_usage','knowledge_reindex_jobs','knowledge_permission_invalidations',
    'knowledge_citation_accesses'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER knowledge_document_sections_append_only BEFORE UPDATE OR DELETE ON knowledge_document_sections FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER knowledge_chunks_append_only BEFORE UPDATE OR DELETE ON knowledge_chunks FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER knowledge_retrieval_manifests_append_only BEFORE UPDATE OR DELETE ON knowledge_retrieval_manifests FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER knowledge_citation_accesses_append_only BEFORE UPDATE OR DELETE ON knowledge_citation_accesses FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON knowledge_index_generations,knowledge_sources,knowledge_document_sections,knowledge_chunks,knowledge_acl_projections,knowledge_acl_members,knowledge_authorization_proofs,knowledge_retrieval_manifests,knowledge_embedding_cache,knowledge_embedding_usage,knowledge_reindex_jobs,knowledge_permission_invalidations,knowledge_citation_accesses FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON knowledge_index_generations,knowledge_sources,knowledge_acl_projections,knowledge_authorization_proofs,knowledge_embedding_cache,knowledge_reindex_jobs,knowledge_permission_invalidations TO knotline_runtime;
GRANT SELECT,INSERT ON knowledge_document_sections,knowledge_chunks,knowledge_acl_members,knowledge_retrieval_manifests,knowledge_embedding_usage,knowledge_citation_accesses TO knotline_runtime;
GRANT SELECT ON knowledge_index_generations,knowledge_sources,knowledge_document_sections,knowledge_chunks,knowledge_acl_projections,knowledge_acl_members,knowledge_authorization_proofs,knowledge_retrieval_manifests,knowledge_embedding_cache,knowledge_embedding_usage,knowledge_reindex_jobs,knowledge_permission_invalidations,knowledge_citation_accesses TO knotline_reporting;
