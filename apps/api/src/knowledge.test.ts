import { describe, expect, it, vi } from "vitest";

import {
  extractKnowledgeDocument,
  fetchWebsiteSnapshot,
  KnowledgeIngestionService
} from "./knowledge.js";

describe("company knowledge ingestion", () => {
  it("extracts and sections plain-text sources", async () => {
    const result = await extractKnowledgeDocument(
      Buffer.from("Incident policy\n\nCritical incidents require an accountable owner."),
      "incident-policy.md",
      "text/markdown"
    );

    expect(result.text).toContain("Critical incidents");
    expect(result.sections).toEqual([
      expect.objectContaining({
        coordinate: { kind: "section", index: 0, label: "Section 1" }
      })
    ]);
  });

  it("rejects unsupported binary formats", async () => {
    await expect(
      extractKnowledgeDocument(Buffer.from([0, 1, 2]), "archive.bin", "application/octet-stream")
    ).rejects.toThrow("KNOWLEDGE_FILE_TYPE_UNSUPPORTED");
  });

  it("blocks private-network website sources", async () => {
    await expect(fetchWebsiteSnapshot("https://127.0.0.1/internal")).rejects.toThrow(
      "WEBSITE_PRIVATE_NETWORK_FORBIDDEN"
    );
  });

  it("indexes content before marking the document ready", async () => {
    const calls: string[] = [];
    const files = {
      inspectUpload: vi.fn().mockResolvedValue({
        fileId: "file-1",
        filename: "policy.md",
        classification: "internal",
        sourceType: "file",
        mediaType: "text/markdown",
        expectedSize: 6,
        expectedChecksum:
          "sha256:5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03"
      }),
      completeTrustedUpload: vi
        .fn()
        .mockResolvedValue({ fileId: "file-1", version: 1, state: "processing", jobId: "job-1" }),
      completeProcessing: vi
        .fn()
        .mockImplementation((_context: unknown, _job: unknown, input: { state: string }) => {
        calls.push(`processing:${String(input.state)}`);
        return Promise.resolve({ fileId: "file-1", state: input.state });
        })
    };
    const retrieval = {
      indexDocument: vi.fn().mockImplementation(() => {
        calls.push("index");
        return Promise.resolve({ sourceId: "source-1", chunks: 1 });
      })
    };
    const objects = {
      put: vi.fn().mockResolvedValue(undefined),
      ensureReady: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      close: vi.fn()
    };
    const service = new KnowledgeIngestionService(files as never, retrieval as never, objects);

    await service.ingestUpload(
      {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        principalId: "00000000-0000-4000-8000-000000000002",
        requestId: "request-1"
      },
      "upload-1",
      Buffer.from("hello\n")
    );

    expect(calls).toEqual(["index", "processing:ready"]);
  });

  it("marks processing failed when indexing cannot complete", async () => {
    const files = {
      inspectUpload: vi.fn().mockResolvedValue({
        fileId: "file-1",
        filename: "policy.md",
        classification: "internal",
        sourceType: "file",
        mediaType: "text/markdown",
        expectedSize: 6,
        expectedChecksum:
          "sha256:5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03"
      }),
      completeTrustedUpload: vi
        .fn()
        .mockResolvedValue({ fileId: "file-1", version: 1, state: "processing", jobId: "job-1" }),
      completeProcessing: vi.fn().mockResolvedValue({ fileId: "file-1", state: "failed" })
    };
    const retrieval = {
      indexDocument: vi.fn().mockRejectedValue(new Error("VECTOR_PERMISSION_DENIED"))
    };
    const objects = {
      put: vi.fn().mockResolvedValue(undefined),
      ensureReady: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      close: vi.fn()
    };
    const service = new KnowledgeIngestionService(files as never, retrieval as never, objects);

    await expect(
      service.ingestUpload(
        {
          workspaceId: "00000000-0000-4000-8000-000000000001",
          principalId: "00000000-0000-4000-8000-000000000002",
          requestId: "request-1"
        },
        "upload-1",
        Buffer.from("hello\n")
      )
    ).rejects.toThrow("VECTOR_PERMISSION_DENIED");
    expect(files.completeProcessing).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      expect.objectContaining({ state: "failed", errorCode: "KNOWLEDGE_INDEXING_FAILED" })
    );
  });
});
