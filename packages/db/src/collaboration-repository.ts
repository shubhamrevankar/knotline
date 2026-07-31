import type {
  CollaborationComment,
  CollaborationThread,
  ResourceActivity
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";

type ResourceType = CollaborationThread["resourceType"];
type Reaction = CollaborationComment["reactions"][number]["reaction"];

interface CommentRow {
  id: string;
  thread_id: string;
  author_user_id: string;
  display_name: string;
  body: string;
  rendered_html: string;
  state: CollaborationComment["state"];
  parent_id: string | null;
  attachment_refs: string[];
  created_at: Date;
  updated_at: Date;
  editable_until: Date;
}

async function requireResource(
  client: PoolClient,
  context: TenantContext,
  type: ResourceType,
  id: string
) {
  if (type !== "workflow") throw new Error("RESOURCE_TYPE_NOT_ACTIVATED");
  const result = await client.query(
    "SELECT 1 FROM workflows WHERE workspace_id=$1 AND id=$2 AND state<>'deleting'",
    [context.workspaceId, id]
  );
  if (result.rowCount !== 1) throw new Error("RESOURCE_NOT_FOUND");
}

async function hydrateComments(
  client: PoolClient,
  context: TenantContext,
  threadId: string
): Promise<readonly CollaborationComment[]> {
  const rows = await client.query<CommentRow>(
    `SELECT c.id,c.thread_id,c.author_user_id,u.display_name,c.body,c.rendered_html,c.state,
            c.parent_id,c.attachment_refs,c.created_at,c.updated_at,c.editable_until
     FROM generic_comments c JOIN users u ON u.id=c.author_user_id
     WHERE c.workspace_id=$1 AND c.thread_id=$2 ORDER BY c.created_at,c.id`,
    [context.workspaceId, threadId]
  );
  const mentions = await client.query<{ comment_id: string; mentioned_user_id: string }>(
    "SELECT comment_id,mentioned_user_id FROM comment_mentions WHERE workspace_id=$1 AND comment_id=ANY($2::uuid[])",
    [context.workspaceId, rows.rows.map(({ id }) => id)]
  );
  const reactions = await client.query<{
    comment_id: string;
    reaction: Reaction;
    count: string;
    reacted: boolean;
  }>(
    `SELECT comment_id,reaction,count(*)::text AS count,
            bool_or(actor_user_id=$3) AS reacted
     FROM comment_reactions WHERE workspace_id=$1 AND comment_id=ANY($2::uuid[])
     GROUP BY comment_id,reaction`,
    [context.workspaceId, rows.rows.map(({ id }) => id), context.principalId]
  );
  return rows.rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    authorDisplayName: row.display_name,
    body: row.body,
    renderedHtml: row.rendered_html,
    state: row.state,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    attachmentRefs: row.attachment_refs,
    mentionedUserIds: mentions.rows
      .filter(({ comment_id }) => comment_id === row.id)
      .map(({ mentioned_user_id }) => mentioned_user_id),
    reactions: reactions.rows
      .filter(({ comment_id }) => comment_id === row.id)
      .map(({ reaction, count, reacted }) => ({ reaction, count: Number(count), reacted })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    editableUntil: row.editable_until.toISOString()
  }));
}

export interface CollaborationRepository {
  thread(
    context: TenantContext,
    type: ResourceType,
    resourceId: string
  ): Promise<CollaborationThread>;
  createComment(
    context: TenantContext,
    type: ResourceType,
    resourceId: string,
    input: {
      body: string;
      renderedHtml: string;
      parentId?: string;
      mentionedUserIds: readonly string[];
      attachmentRefs: readonly string[];
    }
  ): Promise<string>;
  editComment(
    context: TenantContext,
    commentId: string,
    body: string,
    renderedHtml: string
  ): Promise<boolean>;
  deleteComment(context: TenantContext, commentId: string): Promise<boolean>;
  setReaction(
    context: TenantContext,
    commentId: string,
    reaction: Reaction,
    enabled: boolean
  ): Promise<void>;
  setFollow(
    context: TenantContext,
    type: ResourceType,
    resourceId: string,
    enabled: boolean
  ): Promise<void>;
}

export class PostgresCollaborationRepository implements CollaborationRepository {
  constructor(private readonly pool: Pool) {}

  thread(
    context: TenantContext,
    type: ResourceType,
    resourceId: string
  ): Promise<CollaborationThread> {
    return withTenantTransaction(this.pool, context, async (client) => {
      await requireResource(client, context, type, resourceId);
      const thread = await client.query<{ id: string }>(
        "SELECT id FROM generic_threads WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3",
        [context.workspaceId, type, resourceId]
      );
      const followed =
        (
          await client.query(
            "SELECT 1 FROM resource_follows WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3 AND user_id=$4",
            [context.workspaceId, type, resourceId, context.principalId]
          )
        ).rowCount === 1;
      const activity = await client.query<{
        id: string;
        event_type: string;
        actor_user_id: string;
        summary: string;
        created_at: Date;
      }>(
        `SELECT id,event_type,actor_user_id,summary,created_at FROM resource_activity_events
         WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3 AND deleted_at IS NULL
         ORDER BY created_at DESC,id DESC LIMIT 100`,
        [context.workspaceId, type, resourceId]
      );
      const threadId = thread.rows[0]?.id;
      return {
        ...(threadId ? { id: threadId } : {}),
        resourceType: type,
        resourceId,
        followed,
        comments: threadId ? await hydrateComments(client, context, threadId) : [],
        activity: activity.rows.map(
          ({ id, event_type, actor_user_id, summary, created_at }): ResourceActivity => ({
            id,
            type: event_type,
            actorUserId: actor_user_id,
            summary,
            createdAt: created_at.toISOString()
          })
        )
      };
    });
  }

  createComment(
    context: TenantContext,
    type: ResourceType,
    resourceId: string,
    input: {
      body: string;
      renderedHtml: string;
      parentId?: string;
      mentionedUserIds: readonly string[];
      attachmentRefs: readonly string[];
    }
  ): Promise<string> {
    return withTenantTransaction(this.pool, context, async (client) => {
      await requireResource(client, context, type, resourceId);
      const authorizedMentions = await client.query<{ user_id: string }>(
        `SELECT user_id FROM memberships
         WHERE workspace_id=$1 AND state='active' AND user_id=ANY($2::uuid[])`,
        [context.workspaceId, input.mentionedUserIds]
      );
      if (authorizedMentions.rowCount !== new Set(input.mentionedUserIds).size)
        throw new Error("MENTION_NOT_AUTHORIZED");
      const threadId = crypto.randomUUID();
      const thread = await client.query<{ id: string }>(
        `INSERT INTO generic_threads(workspace_id,id,resource_type,resource_id,created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (workspace_id,resource_type,resource_id) DO UPDATE SET state=generic_threads.state
         RETURNING id`,
        [context.workspaceId, threadId, type, resourceId, context.principalId]
      );
      const selectedThreadId = thread.rows[0]!.id;
      if (input.parentId) {
        const parent = await client.query(
          "SELECT 1 FROM generic_comments WHERE workspace_id=$1 AND id=$2 AND thread_id=$3",
          [context.workspaceId, input.parentId, selectedThreadId]
        );
        if (parent.rowCount !== 1) throw new Error("COMMENT_PARENT_NOT_FOUND");
      }
      const commentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO generic_comments(
           workspace_id,id,thread_id,author_user_id,parent_id,body,rendered_html,attachment_refs
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.workspaceId,
          commentId,
          selectedThreadId,
          context.principalId,
          input.parentId ?? null,
          input.body,
          input.renderedHtml,
          JSON.stringify(input.attachmentRefs)
        ]
      );
      for (const mentionedUserId of new Set(input.mentionedUserIds)) {
        await client.query(
          `INSERT INTO comment_mentions(workspace_id,comment_id,mentioned_user_id)
           VALUES ($1,$2,$3)`,
          [context.workspaceId, commentId, mentionedUserId]
        );
        await client.query(
          `INSERT INTO notification_intents(
             workspace_id,id,recipient_user_id,source_type,resource_type,resource_id,comment_id
           ) VALUES ($1,$2,$3,'mention',$4,$5,$6)`,
          [context.workspaceId, crypto.randomUUID(), mentionedUserId, type, resourceId, commentId]
        );
      }
      const activityId = crypto.randomUUID();
      await client.query(
        `INSERT INTO resource_activity_events(
           workspace_id,id,resource_type,resource_id,actor_user_id,event_type,summary,metadata
         ) VALUES ($1,$2,$3,$4,$5,'comment.created','Comment added',$6)`,
        [context.workspaceId, activityId, type, resourceId, context.principalId, { commentId }]
      );
      const followers = await client.query<{ user_id: string }>(
        `SELECT user_id FROM resource_follows
          WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3
            AND user_id<>$4 AND user_id<>ALL($5::uuid[])`,
        [context.workspaceId, type, resourceId, context.principalId, input.mentionedUserIds]
      );
      for (const { user_id: followerId } of followers.rows)
        await client.query(
          `INSERT INTO notification_intents(
             workspace_id,id,recipient_user_id,source_type,resource_type,resource_id,comment_id
           ) VALUES ($1,$2,$3,'followed_activity',$4,$5,$6)`,
          [context.workspaceId, crypto.randomUUID(), followerId, type, resourceId, commentId]
        );
      return commentId;
    });
  }

  editComment(
    context: TenantContext,
    commentId: string,
    body: string,
    renderedHtml: string
  ): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE generic_comments SET body=$3,rendered_html=$4,state='edited',updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND author_user_id=$5 AND state<>'deleted'
           AND editable_until>=clock_timestamp()`,
        [context.workspaceId, commentId, body, renderedHtml, context.principalId]
      );
      return result.rowCount === 1;
    });
  }

  deleteComment(context: TenantContext, commentId: string): Promise<boolean> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE generic_comments SET body='[deleted]',rendered_html='[deleted]',state='deleted',
                 attachment_refs='[]',deleted_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND author_user_id=$3 AND state<>'deleted'`,
        [context.workspaceId, commentId, context.principalId]
      );
      return result.rowCount === 1;
    });
  }

  setReaction(
    context: TenantContext,
    commentId: string,
    reaction: Reaction,
    enabled: boolean
  ): Promise<void> {
    return withTenantTransaction(this.pool, context, async (client) => {
      if (enabled)
        await client.query(
          `INSERT INTO comment_reactions(workspace_id,comment_id,actor_user_id,reaction)
           SELECT $1,$2,$3,$4 WHERE EXISTS(
             SELECT 1 FROM generic_comments WHERE workspace_id=$1 AND id=$2 AND state<>'deleted'
           ) ON CONFLICT DO NOTHING`,
          [context.workspaceId, commentId, context.principalId, reaction]
        );
      else
        await client.query(
          "DELETE FROM comment_reactions WHERE workspace_id=$1 AND comment_id=$2 AND actor_user_id=$3 AND reaction=$4",
          [context.workspaceId, commentId, context.principalId, reaction]
        );
    });
  }

  setFollow(
    context: TenantContext,
    type: ResourceType,
    resourceId: string,
    enabled: boolean
  ): Promise<void> {
    return withTenantTransaction(this.pool, context, async (client) => {
      await requireResource(client, context, type, resourceId);
      if (enabled)
        await client.query(
          `INSERT INTO resource_follows(workspace_id,resource_type,resource_id,user_id)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [context.workspaceId, type, resourceId, context.principalId]
        );
      else
        await client.query(
          "DELETE FROM resource_follows WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3 AND user_id=$4",
          [context.workspaceId, type, resourceId, context.principalId]
        );
    });
  }
}
