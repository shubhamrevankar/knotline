import { describe, expect, it } from "vitest";
import type { UploadCompletion } from "@knotline/contracts";

import {
  evaluateScan,
  extractTextFixture,
  safeDownloadFilename,
  selectPreview
} from "./processing.js";

const completion: UploadCompletion = {
  parts: [{ partNumber: 1, sizeBytes: 10, checksum: `sha256:${"a".repeat(64)}`, etag: "etag" }],
  checksum: `sha256:${"b".repeat(64)}`,
  detectedMediaType: "application/pdf",
  scannerAttestation: `hmac-sha256:${"c".repeat(64)}`,
  scan: {
    result: "clean",
    engine: "fixture",
    engineVersion: "1",
    signatures: [],
    archiveDepth: 0,
    expandedBytes: 10,
    passwordProtected: false,
    activeContent: false
  }
};

describe("document processing policy", () => {
  it("accepts clean matching content and selects safe/derived previews", () => {
    expect(
      evaluateScan("application/pdf", 10, completion, {
        maximumArchiveDepth: 3,
        maximumExpansionRatio: 20,
        allowPasswordProtected: false
      })
    ).toEqual({ accepted: true, reasons: [] });
    expect(selectPreview("application/pdf").mode).toBe("direct-sanitized");
    expect(
      selectPreview("application/vnd.openxmlformats-officedocument.wordprocessingml.document").mode
    ).toBe("derived-pdf");
    expect(selectPreview("image/tiff").mode).toBe("derived-png");
  });

  it("quarantines mismatch, bombs, passwords, active content, and malicious scans", () => {
    const result = evaluateScan(
      "text/plain",
      1,
      {
        ...completion,
        detectedMediaType: "text/html",
        scan: {
          ...completion.scan,
          result: "malicious",
          archiveDepth: 9,
          expandedBytes: 999,
          passwordProtected: true,
          activeContent: true
        }
      },
      { maximumArchiveDepth: 3, maximumExpansionRatio: 20, allowPasswordProtected: false }
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons).toEqual([
      "SCANNER_REJECTED",
      "MEDIA_TYPE_MISMATCH",
      "ARCHIVE_DEPTH",
      "ARCHIVE_EXPANSION",
      "PASSWORD_PROTECTED",
      "ACTIVE_CONTENT"
    ]);
  });

  it("extracts coordinate-preserving sections and rejects corrupt fixtures", () => {
    expect(extractTextFixture("application/pdf", "first\fsecond")).toMatchObject([
      { coordinate: { kind: "page", index: 0 } },
      { coordinate: { kind: "page", index: 1 } }
    ]);
    expect(extractTextFixture("text/csv", "a,b")[0]?.coordinate.kind).toBe("sheet");
    expect(() => extractTextFixture("text/plain", "bad\u0000data")).toThrow("DOCUMENT_CORRUPT");
  });

  it.each([
    ["text/markdown", "section"],
    ["text/html", "section"],
    ["message/rfc822", "section"],
    ["image/png", "section"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "section"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "slide"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sheet"]
  ] as const)("extracts %s fixtures with %s coordinates", (mediaType, coordinateKind) => {
    const sections = extractTextFixture(mediaType, "heading\fbody");
    expect(sections).toHaveLength(2);
    expect(sections[0]?.coordinate.kind).toBe(coordinateKind);
    expect(sections.every(({ contentHash }) => /^sha256:[a-f0-9]{64}$/u.test(contentHash))).toBe(
      true
    );
  });

  it("normalizes unsafe download names and fails preview closed", () => {
    expect(safeDownloadFilename("../report\u0000.pdf")).toBe(".._report_.pdf");
    expect(selectPreview("application/x-unknown").mode).toBe("unavailable");
  });
});
