CREATE TABLE generic_threads (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('workflow','run','task')),
  resource_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed','moderated')),
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace','restricted')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id,resource_type,resource_id)
);

CREATE TABLE generic_comments (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  thread_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_id uuid,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  rendered_html text NOT NULL CHECK (length(rendered_html) BETWEEN 1 AND 100000),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','edited','deleted')),
  attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachment_refs)='array'),
  moderation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(moderation_metadata)='object'),
  editable_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,thread_id) REFERENCES generic_threads(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,parent_id) REFERENCES generic_comments(workspace_id,id) ON DELETE CASCADE,
  CHECK ((state='deleted' AND deleted_at IS NOT NULL AND body='[deleted]') OR state <> 'deleted')
);
CREATE INDEX generic_comments_thread_created_idx ON generic_comments(workspace_id,thread_id,created_at);

CREATE TABLE comment_mentions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL,
  mentioned_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_state text NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending','delivered','suppressed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,comment_id,mentioned_user_id),
  FOREIGN KEY (workspace_id,comment_id) REFERENCES generic_comments(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE comment_reactions (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('thumbs_up','heart','celebrate','eyes')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,comment_id,actor_user_id,reaction),
  FOREIGN KEY (workspace_id,comment_id) REFERENCES generic_comments(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE resource_follows (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('workflow','run','task')),
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_policy text NOT NULL DEFAULT 'all' CHECK (event_policy IN ('all','mentions','important')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,resource_type,resource_id,user_id)
);

CREATE TABLE resource_activity_events (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('workflow','run','task')),
  resource_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,100}$'),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);
CREATE INDEX resource_activity_resource_idx
  ON resource_activity_events(workspace_id,resource_type,resource_id,created_at DESC);

CREATE TABLE notification_intents (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('mention','followed_activity')),
  resource_type text NOT NULL CHECK (resource_type IN ('workflow','run','task')),
  resource_id uuid NOT NULL,
  comment_id uuid,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','delivered','suppressed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,comment_id) REFERENCES generic_comments(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX notification_intents_pending_idx ON notification_intents(workspace_id,state,created_at);

CREATE TABLE saved_resource_filters (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('workflow','run','task')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  visibility text NOT NULL CHECK (visibility IN ('private','workspace')),
  filter jsonb NOT NULL CHECK (jsonb_typeof(filter)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'generic_threads','generic_comments','comment_mentions','comment_reactions','resource_follows',
    'resource_activity_events','notification_intents','saved_resource_filters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (knotline_tenant_visible(workspace_id)) WITH CHECK (knotline_tenant_visible(workspace_id))',
      table_name,table_name
    );
  END LOOP;
END
$$;

REVOKE ALL ON generic_threads,generic_comments,comment_mentions,comment_reactions,resource_follows,
  resource_activity_events,notification_intents,saved_resource_filters FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON generic_threads,generic_comments,comment_mentions,
  comment_reactions,resource_follows,resource_activity_events,notification_intents,
  saved_resource_filters TO knotline_runtime;
GRANT SELECT ON generic_threads,generic_comments,comment_mentions,comment_reactions,resource_follows,
  resource_activity_events,notification_intents,saved_resource_filters TO knotline_reporting;
