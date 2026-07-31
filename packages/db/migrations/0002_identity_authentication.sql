ALTER TABLE users
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  ADD COLUMN locale text NOT NULL DEFAULT 'en',
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';

CREATE TABLE identity_links (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'saml', 'oidc')),
  issuer text NOT NULL,
  subject text NOT NULL,
  email_at_link text,
  claims_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(claims_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (provider, issuer, subject)
);
CREATE INDEX identity_links_user_idx ON identity_links(user_id, provider);

CREATE TABLE magic_link_tokens (
  id uuid PRIMARY KEY,
  normalized_email_hash text NOT NULL CHECK (normalized_email_hash ~ '^sha256:[a-f0-9]{64}$'),
  token_verifier_hash text NOT NULL UNIQUE CHECK (token_verifier_hash ~ '^sha256:[a-f0-9]{64}$'),
  intent text NOT NULL CHECK (intent IN ('login', 'step_up')),
  return_target_id text NOT NULL,
  requested_ip_hash text NOT NULL CHECK (requested_ip_hash ~ '^sha256:[a-f0-9]{64}$'),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at)
);
CREATE INDEX magic_link_tokens_email_created_idx
  ON magic_link_tokens(normalized_email_hash, created_at DESC);

CREATE TABLE identity_authorization_transactions (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('google', 'saml', 'oidc')),
  connection_locator text,
  application_id text NOT NULL,
  environment text NOT NULL,
  authorization_locator_hash text NOT NULL UNIQUE
    CHECK (authorization_locator_hash ~ '^sha256:[a-f0-9]{64}$'),
  state_hash text NOT NULL UNIQUE CHECK (state_hash ~ '^sha256:[a-f0-9]{64}$'),
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^sha256:[a-f0-9]{64}$'),
  pkce_verifier_hash text NOT NULL CHECK (pkce_verifier_hash ~ '^sha256:[a-f0-9]{64}$'),
  pkce_verifier_ciphertext text NOT NULL,
  saml_request_id_hash text CHECK (saml_request_id_hash IS NULL OR saml_request_id_hash ~ '^sha256:[a-f0-9]{64}$'),
  relay_state_hash text CHECK (relay_state_hash IS NULL OR relay_state_hash ~ '^sha256:[a-f0-9]{64}$'),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^sha256:[a-f0-9]{64}$'),
  callback_uri text NOT NULL,
  return_target_id text NOT NULL,
  requested_scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  callback_consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at)
);
CREATE INDEX identity_authorization_transactions_expiry_idx
  ON identity_authorization_transactions(expires_at) WHERE callback_consumed_at IS NULL;

CREATE TABLE identity_authorization_results (
  id uuid PRIMARY KEY,
  authorization_transaction_id uuid NOT NULL UNIQUE
    REFERENCES identity_authorization_transactions(id) ON DELETE CASCADE,
  result_handle_hash text NOT NULL UNIQUE CHECK (result_handle_hash ~ '^sha256:[a-f0-9]{64}$'),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^sha256:[a-f0-9]{64}$'),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  return_target_id text NOT NULL,
  result_code text NOT NULL CHECK (result_code IN ('success', 'provider_denied', 'account_suspended')),
  expires_at timestamptz NOT NULL,
  exchanged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at)
);
CREATE INDEX identity_authorization_results_expiry_idx
  ON identity_authorization_results(expires_at) WHERE exchanged_at IS NULL;

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  active_workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  last_step_up_at timestamptz,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^sha256:[a-f0-9]{64}$'),
  device_summary text NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  CHECK (idle_expires_at > issued_at),
  CHECK (absolute_expires_at >= idle_expires_at),
  CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR
         (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);
CREATE INDEX sessions_user_active_idx ON sessions(user_id, last_used_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX sessions_family_idx ON sessions(family_id);

CREATE TABLE session_verifiers (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  verifier_hash text NOT NULL UNIQUE CHECK (verifier_hash ~ '^sha256:[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('active', 'rotated', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz,
  CHECK ((state = 'active' AND consumed_at IS NULL) OR
         (state <> 'active' AND consumed_at IS NOT NULL))
);
CREATE UNIQUE INDEX session_verifiers_one_active_idx ON session_verifiers(session_id)
  WHERE state = 'active';

CREATE TABLE auth_rate_limits (
  scope text NOT NULL,
  subject_hash text NOT NULL CHECK (subject_hash ~ '^sha256:[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (scope, subject_hash, window_started_at)
);

CREATE TABLE security_notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new_session', 'session_reuse', 'email_bounced', 'email_complained')),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at timestamptz
);
CREATE INDEX security_notifications_user_created_idx
  ON security_notifications(user_id, created_at DESC);

CREATE TABLE auth_email_deliveries (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  normalized_email_hash text NOT NULL CHECK (normalized_email_hash ~ '^sha256:[a-f0-9]{64}$'),
  provider_message_id text UNIQUE,
  state text NOT NULL CHECK (state IN ('captured', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION knotline_identity_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

CREATE FUNCTION knotline_identity_workspaces(selected_user_id uuid)
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  membership_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT w.id, w.name, w.slug, m.role
  FROM memberships m
  JOIN workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = selected_user_id
    AND m.state = 'active'
    AND w.state = 'active'
  ORDER BY w.created_at, w.id
$$;

CREATE TRIGGER magic_link_tokens_no_delete BEFORE DELETE ON magic_link_tokens
FOR EACH ROW EXECUTE FUNCTION knotline_identity_append_only();
CREATE TRIGGER identity_authorization_transactions_no_delete
BEFORE DELETE ON identity_authorization_transactions
FOR EACH ROW EXECUTE FUNCTION knotline_identity_append_only();
CREATE TRIGGER identity_authorization_results_no_delete
BEFORE DELETE ON identity_authorization_results
FOR EACH ROW EXECUTE FUNCTION knotline_identity_append_only();
CREATE TRIGGER session_verifiers_no_delete BEFORE DELETE ON session_verifiers
FOR EACH ROW EXECUTE FUNCTION knotline_identity_append_only();

REVOKE ALL ON identity_links, magic_link_tokens, identity_authorization_transactions,
  identity_authorization_results, sessions, session_verifiers, auth_rate_limits,
  security_notifications, auth_email_deliveries FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON users, identity_links, magic_link_tokens,
  identity_authorization_transactions, identity_authorization_results, sessions,
  session_verifiers, auth_rate_limits, security_notifications, auth_email_deliveries
  TO knotline_runtime;
GRANT SELECT ON identity_links, sessions, security_notifications TO knotline_reporting;
GRANT EXECUTE ON FUNCTION knotline_identity_append_only() TO knotline_runtime, knotline_repair;
REVOKE ALL ON FUNCTION knotline_identity_workspaces(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION knotline_identity_workspaces(uuid) TO knotline_runtime;
