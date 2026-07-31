import { renderSafeMarkdown } from "@knotline/contracts";
import { Badge, Button, Card } from "@knotline/ui";
import { Bell, Eye, MessageSquare, Paperclip, Reply, Send, Share2, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  createResourceComment,
  deleteResourceComment,
  editResourceComment,
  fetchMeBootstrap,
  fetchMembers,
  fetchResourceThread,
  setCommentReaction,
  setWorkflowFollow,
  type CollaborationThreadView,
  type WorkspaceMember
} from "./api.js";
import { msg } from "./i18n.js";

const reactionLabels = {
  thumbs_up: "👍",
  heart: "♥",
  celebrate: "🎉",
  eyes: "👀"
} as const;

export function CollaborationPanel({ workflowId }: { readonly workflowId: string }) {
  const [thread, setThread] = useState<CollaborationThreadView>();
  const [members, setMembers] = useState<readonly WorkspaceMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [tab, setTab] = useState<"discussion" | "activity">("discussion");
  const [body, setBody] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<readonly string[]>([]);
  const [attachmentRefs, setAttachmentRefs] = useState("");
  const [preview, setPreview] = useState(false);
  const [replyTo, setReplyTo] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [editBody, setEditBody] = useState("");
  const [notice, setNotice] = useState("");

  const reload = async () => setThread(await fetchResourceThread("workflow", workflowId));
  useEffect(() => {
    void Promise.all([fetchMeBootstrap(), fetchResourceThread("workflow", workflowId)])
      .then(async ([bootstrap, nextThread]) => {
        setCurrentUserId(bootstrap.user.id);
        setThread(nextThread);
        if (bootstrap.activeWorkspaceId)
          setMembers(await fetchMembers(bootstrap.activeWorkspaceId));
      })
      .catch((reason: unknown) => setNotice(String(reason)));
  }, [workflowId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await createResourceComment(workflowId, {
      body,
      ...(replyTo ? { parentId: replyTo } : {}),
      mentionedUserIds,
      attachmentRefs: attachmentRefs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    });
    setBody("");
    setMentionedUserIds([]);
    setAttachmentRefs("");
    setReplyTo(undefined);
    setPreview(false);
    setNotice(msg("collaboration.comment.created"));
    await reload();
  };

  return (
    <Card className="collaboration-card">
      <div className="row-between">
        <div>
          <h2>{msg("collaboration.heading")}</h2>
          <p>{msg("collaboration.body")}</p>
        </div>
        <div className="action-row">
          <Button
            onClick={() =>
              void setWorkflowFollow(workflowId, !thread?.followed).then(async () => reload())
            }
          >
            <Bell aria-hidden="true" />
            {thread?.followed ? msg("collaboration.unfollow") : msg("collaboration.follow")}
          </Button>
          <Button
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  `${globalThis.location.origin}${thread?.sharePath ?? globalThis.location.pathname}`
                )
                .then(() => setNotice(msg("collaboration.link.copied")))
            }
          >
            <Share2 aria-hidden="true" /> {msg("collaboration.share")}
          </Button>
        </div>
      </div>
      <div className="collaboration-presence" aria-live="polite">
        <Eye aria-hidden="true" />
        {msg("collaboration.presence", { count: thread?.presence.length ?? 0 })}
        {thread?.presence.map(({ id, displayName }) => (
          <Badge key={id} tone="neutral">
            {displayName}
          </Badge>
        ))}
      </div>
      <div className="collaboration-tabs" role="tablist" aria-label={msg("collaboration.tabs")}>
        <Button
          role="tab"
          aria-selected={tab === "discussion"}
          onClick={() => setTab("discussion")}
        >
          <MessageSquare aria-hidden="true" /> {msg("collaboration.discussion")}
        </Button>
        <Button role="tab" aria-selected={tab === "activity"} onClick={() => setTab("activity")}>
          {msg("collaboration.activity")}
        </Button>
      </div>

      {tab === "activity" ? (
        <ol className="activity-list">
          {thread?.activity.length ? (
            thread.activity.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.summary}</strong>
                <small>{new Date(entry.createdAt).toLocaleString()}</small>
              </li>
            ))
          ) : (
            <li>{msg("collaboration.activity.empty")}</li>
          )}
        </ol>
      ) : (
        <>
          <ol className="comment-thread">
            {thread?.comments.length ? (
              thread.comments.map((comment) => (
                <li key={comment.id} className={comment.parentId ? "comment-reply" : ""}>
                  <article>
                    <header className="row-between">
                      <strong>{comment.authorDisplayName}</strong>
                      <small>{new Date(comment.createdAt).toLocaleString()}</small>
                    </header>
                    {editingId === comment.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void editResourceComment(comment.id, editBody).then(async () => {
                            setEditingId(undefined);
                            await reload();
                          });
                        }}
                      >
                        <label>
                          {msg("collaboration.edit.label")}
                          <textarea
                            value={editBody}
                            onChange={(event) => setEditBody(event.target.value)}
                          />
                        </label>
                        <Button type="submit">{msg("collaboration.edit.save")}</Button>
                      </form>
                    ) : (
                      <div
                        className="comment-body"
                        dangerouslySetInnerHTML={{ __html: comment.renderedHtml }}
                      />
                    )}
                    {comment.mentionedUserIds.length ? (
                      <small>
                        {msg("collaboration.mentions", { count: comment.mentionedUserIds.length })}
                      </small>
                    ) : null}
                    {comment.attachmentRefs.length ? (
                      <ul>
                        {comment.attachmentRefs.map((reference) => (
                          <li key={reference}>
                            <Paperclip aria-hidden="true" /> {reference}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="action-row">
                      {(Object.keys(reactionLabels) as (keyof typeof reactionLabels)[]).map(
                        (reaction) => {
                          const current = comment.reactions.find(
                            (value) => value.reaction === reaction
                          );
                          return (
                            <Button
                              key={reaction}
                              aria-label={msg("collaboration.react", { reaction })}
                              onClick={() =>
                                void setCommentReaction(
                                  comment.id,
                                  reaction,
                                  !current?.reacted
                                ).then(reload)
                              }
                            >
                              {reactionLabels[reaction]} {current?.count ?? 0}
                            </Button>
                          );
                        }
                      )}
                      <Button onClick={() => setReplyTo(comment.id)}>
                        <Reply aria-hidden="true" /> {msg("collaboration.reply")}
                      </Button>
                      {comment.authorUserId === currentUserId && comment.state !== "deleted" ? (
                        <>
                          <Button
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditBody(comment.body);
                            }}
                          >
                            {msg("collaboration.edit")}
                          </Button>
                          <Button
                            onClick={() => void deleteResourceComment(comment.id).then(reload)}
                          >
                            <Trash2 aria-hidden="true" /> {msg("collaboration.delete")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </article>
                </li>
              ))
            ) : (
              <li>{msg("collaboration.empty")}</li>
            )}
          </ol>
          <form className="comment-composer" onSubmit={(event) => void submit(event)}>
            <div className="row-between">
              <strong>
                {replyTo ? msg("collaboration.replying") : msg("collaboration.compose")}
              </strong>
              <Button type="button" onClick={() => setPreview((value) => !value)}>
                {preview ? msg("collaboration.write") : msg("collaboration.preview")}
              </Button>
            </div>
            {preview ? (
              <div
                className="comment-preview"
                dangerouslySetInnerHTML={{
                  __html: renderSafeMarkdown(body || msg("collaboration.preview.empty"))
                }}
              />
            ) : (
              <label>
                {msg("collaboration.comment.label")}
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  required
                  maxLength={20000}
                />
              </label>
            )}
            <fieldset>
              <legend>{msg("collaboration.mention.heading")}</legend>
              {members
                .filter(({ state }) => state === "active")
                .map((member) => (
                  <label key={member.userId}>
                    <input
                      type="checkbox"
                      checked={mentionedUserIds.includes(member.userId)}
                      onChange={(event) =>
                        setMentionedUserIds(
                          event.target.checked
                            ? [...mentionedUserIds, member.userId]
                            : mentionedUserIds.filter((id) => id !== member.userId)
                        )
                      }
                    />
                    {member.displayName}
                  </label>
                ))}
            </fieldset>
            <label>
              <Paperclip aria-hidden="true" /> {msg("collaboration.attachments")}
              <input
                value={attachmentRefs}
                onChange={(event) => setAttachmentRefs(event.target.value)}
                placeholder={msg("collaboration.attachments.placeholder")}
              />
            </label>
            <Button tone="accent" type="submit" disabled={!body.trim()}>
              <Send aria-hidden="true" /> {msg("collaboration.send")}
            </Button>
          </form>
        </>
      )}
      {notice ? (
        <p role="status" className="inline-notice">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
