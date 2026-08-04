ALTER TABLE connections
  ADD COLUMN runtime_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN encrypted_credential text,
  ADD COLUMN health_checked_at timestamptz,
  ADD COLUMN health_latency_ms integer;

CREATE TABLE connection_action_receipts (
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  connection_id uuid NOT NULL,
  run_id uuid,
  node_key text,
  operation_id text NOT NULL,
  request_method text NOT NULL,
  request_url_hash text NOT NULL,
  request_body_hash text NOT NULL,
  response_status integer,
  response_body_hash text,
  response_excerpt jsonb,
  duration_ms integer NOT NULL,
  state text NOT NULL CHECK (state IN ('succeeded','failed','uncertain')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,connection_id,operation_id),
  FOREIGN KEY (workspace_id,connection_id) REFERENCES connections(workspace_id,id)
);
CREATE INDEX connection_action_receipts_connection_idx
  ON connection_action_receipts(workspace_id,connection_id,created_at DESC);

ALTER TABLE connection_action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_action_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY connection_action_receipts_tenant ON connection_action_receipts
  USING (knotline_tenant_visible(workspace_id))
  WITH CHECK (knotline_tenant_visible(workspace_id));
CREATE TRIGGER connection_action_receipts_append_only
  BEFORE UPDATE OR DELETE ON connection_action_receipts
  FOR EACH ROW EXECUTE FUNCTION knotline_append_only();
REVOKE ALL ON connection_action_receipts FROM PUBLIC;
GRANT SELECT,INSERT ON connection_action_receipts TO knotline_runtime;
GRANT SELECT ON connection_action_receipts TO knotline_reporting;
