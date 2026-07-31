import { z } from "zod";

export const resourceTypeSchema = z.enum(["workflow", "run", "task"]);
export const commentBodySchema = z.string().trim().min(1).max(20_000);
export const reactionSchema = z.enum(["thumbs_up", "heart", "celebrate", "eyes"]);
export const attachmentReferenceSchema = z.string().regex(/^artifact_[A-Za-z0-9_-]{8,160}$/u);

export const createCommentRequestSchema = z
  .object({
    body: commentBodySchema,
    parentId: z.string().uuid().optional(),
    mentionedUserIds: z.array(z.string().uuid()).max(50).default([]),
    attachmentRefs: z.array(attachmentReferenceSchema).max(20).default([])
  })
  .strict();

export const savedFilterSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    visibility: z.enum(["private", "workspace"]),
    resourceType: resourceTypeSchema,
    filter: z.record(z.string(), z.unknown())
  })
  .strict();

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Minimal deterministic Markdown subset. Raw HTML and unsafe URL schemes always remain inert text. */
export function renderSafeMarkdown(input: string): string {
  const body = commentBodySchema.parse(input);
  const escaped = escapeHtml(body);
  const links = escaped.replace(
    /\[([^\]]{1,200})\]\((https?:\/\/[^\s)]+)\)/giu,
    (_match, label: string, url: string) =>
      `<a href="${url}" rel="nofollow noopener noreferrer" target="_blank">${label}</a>`
  );
  return links
    .replace(/\*\*([^*\n]{1,500})\*\*/gu, "<strong>$1</strong>")
    .replace(/`([^`\n]{1,500})`/gu, "<code>$1</code>")
    .replaceAll("\n", "<br>");
}

export function changedWorkflowSections(before: unknown, after: unknown): readonly string[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object")
    return ["workflow"];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

export function mergeChangedSections<T extends Record<string, unknown>>(
  base: T,
  local: T,
  remote: T
): {
  readonly merged: T;
  readonly conflicts: readonly string[];
  readonly reapplied: readonly string[];
} {
  const merged = { ...remote };
  const conflicts: string[] = [];
  const reapplied: string[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote)
  ])) {
    const baseValue = JSON.stringify(base[key]);
    const localValue = JSON.stringify(local[key]);
    const remoteValue = JSON.stringify(remote[key]);
    if (localValue === baseValue) continue;
    if (remoteValue !== baseValue && remoteValue !== localValue) {
      conflicts.push(key);
      continue;
    }
    merged[key as keyof T] = local[key] as T[keyof T];
    reapplied.push(key);
  }
  return { merged, conflicts: conflicts.sort(), reapplied: reapplied.sort() };
}

export interface CollaborationComment {
  readonly id: string;
  readonly threadId: string;
  readonly authorUserId: string;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly renderedHtml: string;
  readonly state: "active" | "edited" | "deleted";
  readonly parentId?: string;
  readonly attachmentRefs: readonly string[];
  readonly mentionedUserIds: readonly string[];
  readonly reactions: readonly {
    readonly reaction: z.infer<typeof reactionSchema>;
    readonly count: number;
    readonly reacted: boolean;
  }[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly editableUntil: string;
}

export interface ResourceActivity {
  readonly id: string;
  readonly type: string;
  readonly actorUserId: string;
  readonly summary: string;
  readonly createdAt: string;
}

export interface CollaborationThread {
  readonly id?: string;
  readonly resourceType: z.infer<typeof resourceTypeSchema>;
  readonly resourceId: string;
  readonly followed: boolean;
  readonly comments: readonly CollaborationComment[];
  readonly activity: readonly ResourceActivity[];
}
