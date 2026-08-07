import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("workspace-scoped API requests", () => {
  it("uses the authenticated active workspace instead of the local seed ID", async () => {
    const activeWorkspaceId = "87000000-0000-4000-8000-000000000001";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              email: "owner@example.com",
              displayName: "Owner",
              status: "active",
              locale: "en",
              timezone: "UTC"
            },
            workspaces: [],
            activeWorkspaceId,
            serverTime: new Date(0).toISOString()
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAgents, fetchMeBootstrap } = await import("./api.js");
    await fetchMeBootstrap();
    await fetchAgents();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`/v1/workspaces/${activeWorkspaceId}/agents?`),
      expect.any(Object)
    );
  });
});
