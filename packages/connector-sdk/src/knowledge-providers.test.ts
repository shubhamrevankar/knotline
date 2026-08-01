import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_PROVIDER_MANIFESTS,
  PROVIDER_CAPABILITY_STATUS,
  RecordedKnowledgeProvider,
  certifyKnowledgeProvider,
  extractConfluenceContent,
  extractGoogleDocument,
  extractGoogleSheet,
  extractNotionPage,
  permissionHash,
  prioritizeProviderChanges,
  sanitizeProviderHtml,
  sourceSelected,
  validateSourceSelection
} from "./knowledge-providers.js";

const hash = async (value: unknown) => {
  const data = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
};

describe("recorded knowledge providers", () => {
  it("declares exact read, permission, cursor, and action capabilities without claiming live", () => {
    for (const provider of ["google-workspace", "notion", "confluence-cloud"] as const) {
      const manifest = KNOWLEDGE_PROVIDER_MANIFESTS[provider];
      expect(manifest.capabilities).toEqual(
        expect.arrayContaining(["read", "write", "permissions", "reconcile"])
      );
      expect(manifest.actions.length).toBeGreaterThan(0);
      expect(PROVIDER_CAPABILITY_STATUS[provider].live).toBe("BLOCKED_EXTERNAL");
    }
    expect(PROVIDER_CAPABILITY_STATUS["confluence-cloud"].limitations.join(" ")).toContain(
      "Data Center"
    );
  });

  it("validates selected sources, rules, estimates, and unavailable sources", () => {
    const available = [
      {
        id: "drive-1",
        kind: "drive" as const,
        name: "Product",
        estimatedObjects: 42,
        selectable: true
      },
      {
        id: "drive-2",
        kind: "drive" as const,
        name: "Restricted",
        estimatedObjects: 8,
        selectable: false
      }
    ];
    expect(
      validateSourceSelection(available, {
        mode: "selected",
        sourceIds: ["drive-1"],
        include: ["Docs/**"],
        exclude: ["**/Draft*"]
      }).estimatedObjects
    ).toBe(42);
    expect(
      sourceSelected("Docs/Launch.md", {
        mode: "all",
        sourceIds: [],
        include: ["Docs/*"],
        exclude: ["**/Draft*"]
      })
    ).toBe(true);
    expect(
      sourceSelected("Docs/Draft plan", {
        mode: "all",
        sourceIds: [],
        include: ["Docs/*"],
        exclude: ["Docs/Draft*"]
      })
    ).toBe(false);
    expect(() =>
      validateSourceSelection(available, {
        mode: "selected",
        sourceIds: ["drive-2"],
        include: [],
        exclude: []
      })
    ).toThrow("SOURCE_SELECTION_UNAVAILABLE");
  });

  it("preserves Google Docs structure and hides unauthorized comments", () => {
    const result = extractGoogleDocument({
      id: "doc-1",
      revision: "7",
      url: "https://docs.example/doc-1",
      elements: [
        { type: "heading", text: "Launch", index: 1, level: 2 },
        { type: "table", rows: [["Owner", "Maya"]], index: 2 },
        { type: "comment", text: "private", index: 3, authorized: false }
      ]
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.metadata).toEqual({ level: 2 });
    expect(result[1]?.coordinate.path).toBe("body/2");
  });

  it("extracts exact Sheets coordinates, policy formulas, and skips hidden/protected sheets", () => {
    const result = extractGoogleSheet({
      id: "sheet-1",
      revision: "3",
      url: "https://sheets.example/sheet-1",
      includeFormulas: true,
      sheets: [
        { name: "Plan", rows: [[{ value: "2", formula: "=1+1" }]] },
        { name: "Hidden", hidden: true, rows: [[{ value: "secret" }]] }
      ]
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.coordinate).toMatchObject({ sheet: "Plan", range: "A1" });
    expect(result[0]?.metadata).toEqual({ formula: "=1+1" });
    expect(() =>
      extractGoogleSheet({
        id: "x",
        revision: "1",
        url: "https://sheets.example/x",
        includeFormulas: false,
        maxCells: 0,
        sheets: [{ name: "A", rows: [[{ value: "x" }]] }]
      })
    ).toThrow("SHEET_SIZE_LIMIT");
  });

  it("walks Notion hierarchy and retains block-native citations", () => {
    const result = extractNotionPage({
      id: "page-1",
      version: "2026-07-31",
      url: "https://notion.example/page-1",
      properties: { Status: "Ready" },
      blocks: [
        {
          id: "h1",
          type: "heading",
          text: "Plan",
          children: [{ id: "p1", type: "paragraph", text: "Ship" }]
        }
      ]
    });
    expect(result.map((item) => item.coordinate.blockId)).toEqual(["h1", "p1"]);
    expect(result[1]?.coordinate.path).toContain("children/p1");
  });

  it("sanitizes Confluence active content while preserving useful text and labels", () => {
    const html =
      '<h1 onclick="steal()">Runbook</h1><script>bad()</script><p>Safe &amp; useful</p><iframe src="https://bad.example"></iframe>';
    expect(sanitizeProviderHtml(html)).not.toMatch(/script|onclick|iframe/iu);
    const result = extractConfluenceContent({
      id: "page-7",
      version: "12",
      url: "https://wiki.example/page-7",
      storageHtml: html,
      labels: ["ops"]
    });
    expect(result.fragment.text).toContain("Runbook");
    expect(result.fragment.text).toContain("Safe & useful");
    expect(result.fragment.metadata).toEqual({ labels: ["ops"] });
  });

  it("normalizes permission hashes independent of provider ordering", () => {
    const a = { subjectType: "user" as const, subjectId: "a", role: "viewer" as const };
    const b = {
      subjectType: "group" as const,
      subjectId: "b",
      role: "editor" as const,
      inheritedFrom: "drive"
    };
    expect(permissionHash([a, b])).toBe(permissionHash([b, a]));
  });

  it("prioritizes revocation and deletion ahead of ordinary content backlog", () => {
    const changes = prioritizeProviderChanges([
      {
        id: "c",
        sequence: 1,
        kind: "content",
        sourceId: "a",
        version: "1",
        observedAt: "2026-01-01T00:00:00Z"
      },
      {
        id: "p",
        sequence: 3,
        kind: "permission",
        sourceId: "a",
        version: "2",
        observedAt: "2026-01-01T00:00:01Z"
      },
      {
        id: "d",
        sequence: 2,
        kind: "delete",
        sourceId: "b",
        version: "2",
        observedAt: "2026-01-01T00:00:01Z"
      }
    ]);
    expect(changes.map((item) => item.id)).toEqual(["d", "p", "c"]);
  });

  it("binds writes to provider, target, content hash, approval, version, and idempotency", async () => {
    const provider = new RecordedKnowledgeProvider("google-workspace");
    const content = { values: [["Ready"]] };
    const input = {
      provider: "google-workspace" as const,
      connectionId: "connection",
      accountId: "account",
      action: "sheets.range.update" as const,
      target: { fileId: "sheet", range: "Plan!A1" },
      expectedVersion: "0",
      content,
      contentHash: await hash(content),
      idempotencyKey: "write-1",
      approvalId: "approval-1",
      risk: "high" as const
    };
    const first = provider.executeAction(input);
    const duplicate = provider.executeAction(input);
    expect(first.state).toBe("CONFIRMED");
    expect(duplicate).toEqual(first);
    expect(provider.visibleObject("sheet:Plan!A1")?.hash).toBe(input.contentHash);
  });

  it("returns conflicts instead of overwriting a changed provider version", async () => {
    const provider = new RecordedKnowledgeProvider("notion");
    const content = { title: "One" };
    const base = {
      provider: "notion" as const,
      connectionId: "c",
      accountId: "a",
      action: "notion.page.update" as const,
      target: { pageId: "page" },
      content,
      contentHash: await hash(content),
      approvalId: "approval",
      risk: "medium" as const
    };
    expect(
      provider.executeAction({ ...base, expectedVersion: "0", idempotencyKey: "one" }).state
    ).toBe("CONFIRMED");
    expect(
      provider.executeAction({ ...base, expectedVersion: "0", idempotencyKey: "two" }).state
    ).toBe("CONFLICT");
  });

  it("reconciles response-lost writes without repeating the provider mutation", async () => {
    const provider = new RecordedKnowledgeProvider("confluence-cloud");
    const content = { body: "Runbook" };
    const uncertain = provider.executeAction({
      provider: "confluence-cloud",
      connectionId: "c",
      accountId: "a",
      action: "confluence.page.create",
      target: { spaceId: "OPS", title: "Runbook" },
      expectedVersion: "0",
      content,
      contentHash: await hash(content),
      idempotencyKey: "lost",
      approvalId: "approval",
      risk: "medium",
      responseLost: true
    });
    expect(uncertain.state).toBe("UNCERTAIN");
    expect(provider.reconcileAction(uncertain)).toMatchObject({
      state: "CONFIRMED",
      providerVisibleHash: uncertain.providerVisibleHash ?? (await hash(content))
    });
  });

  it("certifies a deterministic recorded read/write/reconciliation row for each provider", () => {
    for (const provider of ["google-workspace", "notion", "confluence-cloud"] as const) {
      const result = certifyKnowledgeProvider(provider);
      expect(result).toMatchObject({
        engineeringStatus: "RECORDED",
        liveStatus: "BLOCKED_EXTERNAL",
        uncertainObserved: true,
        reconciled: true
      });
      expect(result.receipts).toHaveLength(result.actionCount);
      expect(result.receipts.every((receipt) => receipt.providerVisibleHash)).toBe(true);
    }
  });
});
