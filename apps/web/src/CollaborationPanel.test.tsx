// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationPanel } from "./CollaborationPanel.js";

const api = vi.hoisted(() => ({
  createResourceComment: vi.fn(),
  deleteResourceComment: vi.fn(),
  editResourceComment: vi.fn(),
  fetchMeBootstrap: vi.fn(),
  fetchMembers: vi.fn(),
  fetchResourceThread: vi.fn(),
  setCommentReaction: vi.fn(),
  setWorkflowFollow: vi.fn()
}));
const clipboardWrite = vi.hoisted(() => vi.fn());

vi.mock("./api.js", () => api);

const thread = {
  id: "thread-1",
  workspaceId: "workspace-1",
  resourceType: "workflow",
  resourceId: "workflow-1",
  state: "open",
  followed: false,
  sharePath: "/app/workflows/workflow-1",
  presence: [
    { id: "presence-1", displayName: "Sam Rivera", lastSeenAt: "2026-08-01T00:00:00.000Z" }
  ],
  comments: [
    {
      id: "comment-1",
      threadId: "thread-1",
      authorUserId: "user-1",
      authorDisplayName: "Avery Morgan",
      body: "Review **the approval**",
      renderedHtml: "Review <strong>the approval</strong>",
      state: "active",
      parentId: null,
      mentionedUserIds: ["user-2"],
      attachmentRefs: ["artifact_reference_12345678"],
      reactions: [{ reaction: "thumbs_up", count: 1, reacted: true }],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    }
  ],
  activity: [
    {
      id: "activity-1",
      type: "comment.created",
      summary: "Comment added",
      createdAt: "2026-08-01T00:00:00.000Z"
    }
  ]
};

describe("CollaborationPanel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchMeBootstrap.mockResolvedValue({
      user: { id: "user-1" },
      activeWorkspaceId: "workspace-1"
    });
    api.fetchMembers.mockResolvedValue([
      {
        id: "membership-2",
        userId: "user-2",
        email: "sam@example.test",
        displayName: "Sam Rivera",
        role: "member",
        state: "active",
        createdAt: "2026-08-01T00:00:00.000Z"
      },
      {
        id: "membership-3",
        userId: "user-3",
        email: "paused@example.test",
        displayName: "Paused Member",
        role: "member",
        state: "suspended",
        createdAt: "2026-08-01T00:00:00.000Z"
      }
    ]);
    api.fetchResourceThread.mockResolvedValue(thread);
    api.createResourceComment.mockResolvedValue({ id: "comment-2" });
    api.deleteResourceComment.mockResolvedValue(undefined);
    api.editResourceComment.mockResolvedValue({ updated: true });
    api.setCommentReaction.mockResolvedValue(undefined);
    api.setWorkflowFollow.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite.mockResolvedValue(undefined) }
    });
  });

  it("loads a thread and exercises durable collaboration controls", async () => {
    render(<CollaborationPanel workflowId="workflow-1" />);

    await waitFor(() =>
      expect(document.querySelector(".comment-body")?.textContent).toBe("Review the approval")
    );
    expect(screen.getAllByText("Sam Rivera")).toHaveLength(2);
    expect(screen.queryByText("Paused Member")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() => expect(api.setWorkflowFollow).toHaveBeenCalledWith("workflow-1", true));
    fireEvent.click(screen.getByRole("button", { name: "Copy internal link" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "React with thumbs_up" }));
    await waitFor(() =>
      expect(api.setCommentReaction).toHaveBeenCalledWith("comment-1", "thumbs_up", false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying in thread")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit comment" }), {
      target: { value: "Updated review" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
    await waitFor(() =>
      expect(api.editResourceComment).toHaveBeenCalledWith("comment-1", "Updated review")
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteResourceComment).toHaveBeenCalledWith("comment-1"));

    const composer = screen.getByRole("textbox", { name: "Comment in Markdown" });
    fireEvent.change(composer, { target: { value: "Hello <script>bad()</script> **team**" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Sam Rivera" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Attachment references" }), {
      target: { value: "artifact_reference_12345678, artifact_reference_87654321" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(document.querySelector(".comment-preview")?.textContent).toContain(
      "Hello <script>bad()</script> team"
    );
    expect(document.querySelector(".comment-preview script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    fireEvent.submit(screen.getByRole("button", { name: "Send comment" }).closest("form")!);
    await waitFor(() =>
      expect(api.createResourceComment).toHaveBeenCalledWith(
        "workflow-1",
        expect.objectContaining({
          parentId: "comment-1",
          mentionedUserIds: ["user-2"],
          attachmentRefs: ["artifact_reference_12345678", "artifact_reference_87654321"]
        })
      )
    );

    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText("Comment added", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Discussion" }));
  });

  it("surfaces load failures without making presence authoritative", async () => {
    api.fetchResourceThread.mockRejectedValueOnce(new Error("thread unavailable"));
    render(<CollaborationPanel workflowId="workflow-1" />);
    expect((await screen.findByRole("status")).textContent).toContain("thread unavailable");
    expect(screen.getByText("0 collaborators recently present")).toBeTruthy();
  });
});
