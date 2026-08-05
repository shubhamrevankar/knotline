import { describe, expect, it } from "vitest";

import { extractKnowledgeDocument, fetchWebsiteSnapshot } from "./knowledge.js";

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
});
