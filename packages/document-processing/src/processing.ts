import { createHash } from "node:crypto";

import type { DocumentCoordinate, UploadCompletion } from "@knotline/contracts";

const ACTIVE_MEDIA = new Set(["image/svg+xml", "text/html", "application/xhtml+xml"]);
const SAFE_PREVIEW_MEDIA = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv"
]);
const OFFICE_MEDIA = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

export interface ScanPolicy {
  readonly maximumArchiveDepth: number;
  readonly maximumExpansionRatio: number;
  readonly allowPasswordProtected: boolean;
}

export function evaluateScan(
  declaredMediaType: string,
  sizeBytes: number,
  completion: UploadCompletion,
  policy: ScanPolicy
) {
  const reasons: string[] = [];
  if (completion.scan.result !== "clean") reasons.push("SCANNER_REJECTED");
  if (completion.detectedMediaType !== declaredMediaType) reasons.push("MEDIA_TYPE_MISMATCH");
  if (completion.scan.archiveDepth > policy.maximumArchiveDepth) reasons.push("ARCHIVE_DEPTH");
  if (completion.scan.expandedBytes > sizeBytes * policy.maximumExpansionRatio)
    reasons.push("ARCHIVE_EXPANSION");
  if (completion.scan.passwordProtected && !policy.allowPasswordProtected)
    reasons.push("PASSWORD_PROTECTED");
  if (completion.scan.activeContent || ACTIVE_MEDIA.has(completion.detectedMediaType))
    reasons.push("ACTIVE_CONTENT");
  return { accepted: reasons.length === 0, reasons };
}

export function selectPreview(mediaType: string) {
  if (SAFE_PREVIEW_MEDIA.has(mediaType)) return { mode: "direct-sanitized" as const, mediaType };
  if (OFFICE_MEDIA.has(mediaType))
    return { mode: "derived-pdf" as const, mediaType: "application/pdf" };
  if (mediaType.startsWith("image/"))
    return { mode: "derived-png" as const, mediaType: "image/png" };
  return { mode: "unavailable" as const, mediaType: "text/plain" };
}

export interface ExtractedSection {
  readonly text: string;
  readonly coordinate: DocumentCoordinate;
  readonly contentHash: string;
}

export function extractTextFixture(
  mediaType: string,
  content: string
): readonly ExtractedSection[] {
  if (content.includes("\u0000")) throw new Error("DOCUMENT_CORRUPT");
  const kind: DocumentCoordinate["kind"] =
    mediaType.includes("spreadsheet") || mediaType === "text/csv"
      ? "sheet"
      : mediaType.includes("presentation")
        ? "slide"
        : mediaType === "application/pdf"
          ? "page"
          : "section";
  return content
    .split(/\f|\n#{1,6}\s/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      text,
      coordinate: { kind, index },
      contentHash: `sha256:${createHash("sha256").update(text).digest("hex")}`
    }));
}

export function safeDownloadFilename(filename: string) {
  const normalized = [...filename.normalize("NFKC").replace(/[\\/]/gu, "_")]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? "_" : character;
    })
    .join("")
    .trim();
  return (normalized || "download").slice(0, 180);
}
