CREATE TABLE connector_resource_grants (
 workspace_id uuid NOT NULL,id uuid NOT NULL,connection_id uuid NOT NULL,external_resource_id text NOT NULL,principal_id text NOT NULL,permission text NOT NULL CHECK(permission IN('read','write')),delegated boolean NOT NULL,inherited_from text,permission_hash text NOT NULL,observed_at timestamptz NOT NULL,revoked_at timestamptz,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,connection_id,external_resource_id,principal_id),FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connector_delta_cursors (
 workspace_id uuid NOT NULL,connection_id uuid NOT NULL,resource_kind text NOT NULL,cursor_reference text,mode text NOT NULL CHECK(mode IN('incremental','bounded_rescan')),reset_count integer NOT NULL DEFAULT 0,checkpoint_sequence bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL,PRIMARY KEY(workspace_id,connection_id,resource_kind),FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connector_import_batches (
 workspace_id uuid NOT NULL,id uuid NOT NULL,connection_id uuid NOT NULL,source_kind text NOT NULL,source_identity text NOT NULL,mapping jsonb NOT NULL,type_overrides jsonb NOT NULL,upsert_key text NOT NULL,checkpoint bigint NOT NULL DEFAULT 0,state text NOT NULL CHECK(state IN('PREVIEWED','RUNNING','COMPLETED','FAILED','ROLLING_BACK','ROLLED_BACK')),row_count bigint NOT NULL DEFAULT 0,error_count bigint NOT NULL DEFAULT 0,created_by uuid NOT NULL,created_at timestamptz NOT NULL,completed_at timestamptz,PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE connector_import_row_receipts (
 workspace_id uuid NOT NULL,id uuid NOT NULL,batch_id uuid NOT NULL,row_number bigint NOT NULL,upsert_key_hash text,content_hash text NOT NULL,state text NOT NULL CHECK(state IN('IMPORTED','UPDATED','SKIPPED','ERROR','ROLLED_BACK')),error_code text,provider_object_id text,recorded_at timestamptz NOT NULL,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,batch_id,row_number),FOREIGN KEY(workspace_id,batch_id) REFERENCES connector_import_batches(workspace_id,id)
);
CREATE TABLE generic_rest_spec_versions (
 workspace_id uuid NOT NULL,id uuid NOT NULL,connection_id uuid NOT NULL,version bigint NOT NULL,base_origins text[] NOT NULL,specification jsonb NOT NULL,operation_catalog jsonb NOT NULL,content_hash text NOT NULL,state text NOT NULL CHECK(state IN('DRAFT','ACTIVE','RETIRED')),created_by uuid NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,connection_id,version),FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE webhook_schema_versions (
 workspace_id uuid NOT NULL,id uuid NOT NULL,connection_id uuid NOT NULL,direction text NOT NULL CHECK(direction IN('INBOUND','OUTBOUND')),schema_key text NOT NULL,version integer NOT NULL,json_schema jsonb NOT NULL,content_hash text NOT NULL,active_from timestamptz NOT NULL,retired_at timestamptz,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,connection_id,direction,schema_key,version),FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE TABLE webhook_delivery_receipts (
 workspace_id uuid NOT NULL,id uuid NOT NULL,connection_id uuid NOT NULL,direction text NOT NULL CHECK(direction IN('INBOUND','OUTBOUND')),delivery_id text NOT NULL,schema_version_id uuid NOT NULL,payload_hash text NOT NULL,signature_key_version integer NOT NULL,attempt integer NOT NULL,state text NOT NULL CHECK(state IN('ACCEPTED','DELIVERED','RETRYING','DEAD_LETTER','REJECTED')),response_status integer,next_retry_at timestamptz,recorded_at timestamptz NOT NULL,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,connection_id,direction,delivery_id),FOREIGN KEY(workspace_id,connection_id) REFERENCES connections(workspace_id,id),FOREIGN KEY(workspace_id,schema_version_id) REFERENCES webhook_schema_versions(workspace_id,id)
);
CREATE INDEX connector_resource_grants_acl_idx ON connector_resource_grants(workspace_id,connection_id,external_resource_id) WHERE revoked_at IS NULL;
CREATE INDEX connector_import_batches_state_idx ON connector_import_batches(workspace_id,state,created_at);
CREATE INDEX webhook_delivery_retry_idx ON webhook_delivery_receipts(workspace_id,state,next_retry_at) WHERE state IN('RETRYING','DEAD_LETTER');
DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['connector_resource_grants','connector_delta_cursors','connector_import_batches','connector_import_row_receipts','generic_rest_spec_versions','webhook_schema_versions','webhook_delivery_receipts'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);EXECUTE format('CREATE POLICY %I_tenant ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',table_name,table_name);END LOOP;END $$;
CREATE TRIGGER connector_import_row_receipts_append_only BEFORE UPDATE OR DELETE ON connector_import_row_receipts FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER generic_rest_spec_versions_append_only BEFORE UPDATE OR DELETE ON generic_rest_spec_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER webhook_schema_versions_append_only BEFORE UPDATE OR DELETE ON webhook_schema_versions FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
CREATE TRIGGER webhook_delivery_receipts_append_only BEFORE UPDATE OR DELETE ON webhook_delivery_receipts FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
REVOKE ALL ON connector_resource_grants,connector_delta_cursors,connector_import_batches,connector_import_row_receipts,generic_rest_spec_versions,webhook_schema_versions,webhook_delivery_receipts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON connector_resource_grants,connector_delta_cursors,connector_import_batches TO knotline_runtime;
GRANT SELECT,INSERT ON connector_import_row_receipts,generic_rest_spec_versions,webhook_schema_versions,webhook_delivery_receipts TO knotline_runtime;
GRANT SELECT ON connector_resource_grants,connector_delta_cursors,connector_import_batches,connector_import_row_receipts,generic_rest_spec_versions,webhook_schema_versions,webhook_delivery_receipts TO knotline_reporting;
