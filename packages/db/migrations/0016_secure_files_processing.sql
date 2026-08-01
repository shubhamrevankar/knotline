ALTER TABLE files DROP CONSTRAINT files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check CHECK (purpose IN ('task_attachment','comment_attachment','run_input','run_output','agent_fixture','knowledge_source','profile_asset','export'));
ALTER TABLE files DROP CONSTRAINT files_state_check;
ALTER TABLE files ADD CONSTRAINT files_state_check CHECK (state IN ('initiated','uploading','uploaded','quarantined','scanning','processing','ready','rejected','failed','deleted','clean'));
ALTER TABLE files
  ADD COLUMN filename text NOT NULL DEFAULT 'attachment',
  ADD COLUMN classification text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public','internal','confidential','restricted')),
  ADD COLUMN retention_until timestamptz,
  ADD COLUMN legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE file_versions DROP CONSTRAINT file_versions_size_bytes_check;
ALTER TABLE file_versions ADD CONSTRAINT file_versions_size_bytes_check CHECK (size_bytes BETWEEN 0 AND 536870912);
ALTER TABLE file_versions
  ADD COLUMN object_version text NOT NULL DEFAULT 'local-fixture-v1',
  ADD COLUMN detected_media_type text,
  ADD COLUMN scan_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN processing_state text NOT NULL DEFAULT 'pending' CHECK (processing_state IN ('pending','processing','ready','partial','failed','unsupported')),
  ADD COLUMN parser_version text,
  ADD COLUMN language text,
  ADD COLUMN warning_details jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE file_upload_sessions DROP CONSTRAINT file_upload_sessions_expected_size_check;
ALTER TABLE file_upload_sessions ADD CONSTRAINT file_upload_sessions_expected_size_check CHECK (expected_size BETWEEN 1 AND 536870912);
ALTER TABLE file_upload_sessions DROP CONSTRAINT file_upload_sessions_state_check;
ALTER TABLE file_upload_sessions ADD CONSTRAINT file_upload_sessions_state_check CHECK (state IN ('initiated','created','uploading','uploaded','scanning','processing','ready','verified','expired','rejected','failed','cancelled'));
ALTER TABLE file_upload_sessions
  ADD COLUMN media_type text NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN part_count integer NOT NULL DEFAULT 1 CHECK (part_count BETWEEN 1 AND 10000),
  ADD COLUMN reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes>=0),
  ADD COLUMN replacement_of_version integer,
  ADD COLUMN completed_version integer,
  ADD COLUMN upload_filename text NOT NULL DEFAULT 'attachment',
  ADD COLUMN upload_classification text NOT NULL DEFAULT 'internal' CHECK (upload_classification IN ('public','internal','confidential','restricted')),
  ADD COLUMN completed_at timestamptz;

CREATE TABLE file_upload_parts (
  workspace_id uuid NOT NULL,
  upload_id uuid NOT NULL,
  part_number integer NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  size_bytes bigint NOT NULL CHECK (size_bytes>0),
  checksum text NOT NULL,
  etag text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,upload_id,part_number),
  FOREIGN KEY (workspace_id,upload_id) REFERENCES file_upload_sessions(workspace_id,id) ON DELETE CASCADE
);
CREATE TABLE file_derived_artifacts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  file_id uuid NOT NULL,
  file_version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('preview_pdf','preview_png','normalized_text','ocr_text','thumbnail','table')),
  object_key text NOT NULL,
  media_type text NOT NULL,
  checksum text NOT NULL,
  sanitized boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  purged_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,file_id,file_version) REFERENCES file_versions(workspace_id,file_id,version) ON DELETE RESTRICT
);
CREATE TABLE document_processing_jobs (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  file_id uuid NOT NULL,
  file_version integer NOT NULL,
  parser text NOT NULL,
  parser_version text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','ready','partial','failed','unsupported','cancelled')),
  attempt integer NOT NULL DEFAULT 1,
  source_checksum text NOT NULL,
  language text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  CONSTRAINT document_processing_jobs_identity_key UNIQUE (workspace_id,file_id,file_version,parser_version,attempt),
  FOREIGN KEY (workspace_id,file_id,file_version) REFERENCES file_versions(workspace_id,file_id,version) ON DELETE RESTRICT
);
CREATE TABLE file_download_tokens (
  workspace_id uuid NOT NULL,
  token_hash text NOT NULL,
  file_id uuid NOT NULL,
  file_version integer NOT NULL,
  principal_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid,
  grant_revision bigint NOT NULL,
  range_start bigint,
  range_end bigint,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,token_hash),
  FOREIGN KEY (workspace_id,file_id,file_version) REFERENCES file_versions(workspace_id,file_id,version) ON DELETE RESTRICT
);
CREATE TABLE file_usage_references (
  workspace_id uuid NOT NULL,
  file_id uuid NOT NULL,
  file_version integer NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,file_id,file_version,resource_type,resource_id),
  FOREIGN KEY (workspace_id,file_id,file_version) REFERENCES file_versions(workspace_id,file_id,version) ON DELETE RESTRICT
);
CREATE TABLE file_deletion_tombstones (
  workspace_id uuid NOT NULL,
  file_id uuid NOT NULL,
  prior_checksum_hash text NOT NULL,
  reason text NOT NULL,
  derivatives_purged integer NOT NULL,
  downstream_event_id uuid NOT NULL,
  deleted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,file_id)
);
CREATE TABLE workspace_storage_usage (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  ready_bytes bigint NOT NULL DEFAULT 0 CHECK (ready_bytes>=0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes>=0),
  quota_bytes bigint NOT NULL DEFAULT 1073741824 CHECK (quota_bytes>0),
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX file_list_idx ON files(workspace_id,state,created_at DESC);
CREATE INDEX file_processing_jobs_idx ON document_processing_jobs(workspace_id,state,created_at);
CREATE INDEX file_download_expiry_idx ON file_download_tokens(workspace_id,expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX file_usage_resource_idx ON file_usage_references(workspace_id,resource_type,resource_id);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['file_upload_parts','file_derived_artifacts','document_processing_jobs','file_download_tokens','file_usage_references','file_deletion_tombstones','workspace_storage_usage'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);
  END LOOP;
END $$;

CREATE TRIGGER file_upload_parts_append_only BEFORE UPDATE OR DELETE ON file_upload_parts FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER file_usage_references_append_only BEFORE UPDATE OR DELETE ON file_usage_references FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER file_deletion_tombstones_append_only BEFORE UPDATE OR DELETE ON file_deletion_tombstones FOR EACH ROW EXECUTE FUNCTION knotline_append_only();

REVOKE ALL ON file_upload_parts,file_derived_artifacts,document_processing_jobs,file_download_tokens,file_usage_references,file_deletion_tombstones,workspace_storage_usage FROM PUBLIC;
GRANT SELECT,INSERT ON file_upload_parts,file_derived_artifacts,document_processing_jobs,file_download_tokens,file_usage_references,file_deletion_tombstones TO knotline_runtime;
GRANT UPDATE ON document_processing_jobs,file_download_tokens,file_derived_artifacts TO knotline_runtime;
GRANT SELECT,INSERT,UPDATE ON workspace_storage_usage TO knotline_runtime;
GRANT SELECT,INSERT,UPDATE ON files,file_versions,file_upload_sessions TO knotline_runtime;
GRANT SELECT ON files,file_versions,file_upload_sessions,file_upload_parts,file_derived_artifacts,document_processing_jobs,file_download_tokens,file_usage_references,file_deletion_tombstones,workspace_storage_usage TO knotline_reporting;
