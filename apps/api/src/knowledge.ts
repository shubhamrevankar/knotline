import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { FileRepository, RetrievalRepository, TenantContext } from "@knotline/db";
import { convert } from "html-to-text";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_WEBSITE_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const SECTION_CHARACTERS = 60_000;

const checksum = (value: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export interface KnowledgeObjectStore {
  ensureReady(): Promise<void>;
  put(key: string, body: Uint8Array, mediaType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  close(): void;
}

export class S3KnowledgeObjectStore implements KnowledgeObjectStore {
  readonly #client: S3Client;
  readonly #serverSideEncryption: "AES256" | undefined;

  constructor(
    private readonly bucket: string,
    input: {
      readonly endpoint?: string;
      readonly region: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly serverSideEncryption?: "AES256";
    }
  ) {
    this.#client = new S3Client({
      region: input.region,
      ...(input.endpoint ? { endpoint: input.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey
      }
    });
    this.#serverSideEncryption = input.serverSideEncryption;
  }

  async ensureReady() {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.#client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Uint8Array, mediaType: string) {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mediaType,
        ...(this.#serverSideEncryption ? { ServerSideEncryption: this.#serverSideEncryption } : {})
      })
    );
  }

  async get(key: string) {
    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error("KNOWLEDGE_OBJECT_NOT_FOUND");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  close() {
    this.#client.destroy();
  }
}

type ExtractedSection = {
  readonly text: string;
  readonly coordinate: { readonly kind: "section"; readonly index: number; readonly label: string };
  readonly tags: readonly string[];
};

const normalizeText = (value: string) =>
  value
    .replaceAll("\u0000", "")
    .replaceAll(/\r\n?/gu, "\n")
    .replaceAll(/[\t ]+\n/gu, "\n")
    .replaceAll(/\n{4,}/gu, "\n\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS);

const sectionize = (value: string): readonly ExtractedSection[] => {
  const text = normalizeText(value);
  if (!text) throw new Error("KNOWLEDGE_SOURCE_EMPTY");
  const sections: ExtractedSection[] = [];
  for (let offset = 0; offset < text.length; offset += SECTION_CHARACTERS) {
    const index = sections.length;
    sections.push({
      text: text.slice(offset, offset + SECTION_CHARACTERS),
      coordinate: { kind: "section", index, label: `Section ${String(index + 1)}` },
      tags: []
    });
  }
  return sections;
};

export async function extractKnowledgeDocument(body: Buffer, filename: string, mediaType: string) {
  if (body.byteLength > MAX_FILE_BYTES) throw new Error("KNOWLEDGE_FILE_TOO_LARGE");
  const normalizedType = mediaType.split(";", 1)[0]?.trim().toLowerCase();
  let text: string;
  if (normalizedType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(body) });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (
    normalizedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  ) {
    text = (await mammoth.extractRawText({ buffer: body })).value;
  } else if (
    normalizedType === "text/html" ||
    normalizedType === "application/xhtml+xml" ||
    filename.toLowerCase().endsWith(".html")
  ) {
    text = convert(body.toString("utf8"), {
      wordwrap: false,
      selectors: [
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" }
      ]
    });
  } else if (
    normalizedType?.startsWith("text/") ||
    [".txt", ".md", ".markdown", ".csv"].some((extension) =>
      filename.toLowerCase().endsWith(extension)
    )
  ) {
    text = body.toString("utf8");
  } else {
    throw new Error("KNOWLEDGE_FILE_TYPE_UNSUPPORTED");
  }
  const sections = sectionize(text);
  return { text: sections.map((section) => section.text).join("\n\n"), sections };
}

const privateIpv4 = (address: string) => {
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && Number(parts[1]) >= 16 && Number(parts[1]) <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
};

const assertPublicWebsite = async (raw: string) => {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("WEBSITE_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("WEBSITE_CREDENTIALS_FORBIDDEN");
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await lookup(url.hostname, { all: true });
  if (
    addresses.some(({ address, family }) =>
      family === 4
        ? privateIpv4(address)
        : address === "::1" ||
          address.startsWith("fc") ||
          address.startsWith("fd") ||
          address.startsWith("fe80:")
    )
  )
    throw new Error("WEBSITE_PRIVATE_NETWORK_FORBIDDEN");
  return url;
};

export async function fetchWebsiteSnapshot(raw: string) {
  let url = await assertPublicWebsite(raw);
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "KnotlineKnowledgeBot/1.0" },
      signal: AbortSignal.timeout(15_000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("WEBSITE_REDIRECT_INVALID");
      url = await assertPublicWebsite(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`WEBSITE_FETCH_FAILED_${String(response.status)}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_WEBSITE_BYTES) throw new Error("WEBSITE_TOO_LARGE");
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > MAX_WEBSITE_BYTES) throw new Error("WEBSITE_TOO_LARGE");
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0] ?? "text/html";
    if (!mediaType.startsWith("text/html") && !mediaType.startsWith("text/plain"))
      throw new Error("WEBSITE_CONTENT_TYPE_UNSUPPORTED");
    const html = body.toString("utf8");
    const title = /<title[^>]*>([\s\S]*?)<\/title>/iu
      .exec(html)?.[1]
      ?.replaceAll(/\s+/gu, " ")
      .trim();
    const text = mediaType.startsWith("text/html")
      ? convert(html, {
          wordwrap: false,
          selectors: [
            { selector: "script", format: "skip" },
            { selector: "style", format: "skip" },
            { selector: "nav", format: "skip" }
          ]
        })
      : html;
    return {
      url: url.toString(),
      title: title || url.hostname,
      text: normalizeText(`${title ? `${title}\n\n` : ""}Source: ${url.toString()}\n\n${text}`)
    };
  }
  throw new Error("WEBSITE_REDIRECT_LIMIT");
}

export class KnowledgeIngestionService {
  constructor(
    private readonly files: FileRepository,
    private readonly retrieval: RetrievalRepository,
    private readonly objects: KnowledgeObjectStore
  ) {}

  async ingestUpload(context: TenantContext, uploadId: string, body: Buffer) {
    const session = await this.files.inspectUpload(context, uploadId);
    if (body.byteLength !== session.expectedSize || checksum(body) !== session.expectedChecksum)
      throw new Error("UPLOAD_INTEGRITY_MISMATCH");
    const extracted = await extractKnowledgeDocument(body, session.filename, session.mediaType);
    const etag = checksum(body).slice("sha256:".length);
    const completed = await this.files.completeTrustedUpload(context, uploadId, {
      sizeBytes: body.byteLength,
      checksum: session.expectedChecksum,
      detectedMediaType: session.mediaType,
      etag
    });
    const sourceObjectKey = `private/${context.workspaceId}/${completed.fileId}/${String(completed.version)}`;
    const normalizedObjectKey = `derived/${context.workspaceId}/${completed.fileId}/${String(completed.version)}/normalized.txt`;
    await this.objects.put(sourceObjectKey, body, session.mediaType);
    await this.objects.put(
      normalizedObjectKey,
      Buffer.from(extracted.text),
      "text/plain; charset=utf-8"
    );
    if (!completed.jobId) throw new Error("DOCUMENT_PROCESSING_JOB_MISSING");
    await this.files.completeProcessing(context, completed.jobId, {
      state: "ready",
      language: "en",
      sections: extracted.sections.map((section) => ({
        textHash: checksum(section.text),
        coordinate: section.coordinate
      })),
      warnings: [],
      derivedArtifact: {
        kind: "normalized_text",
        objectKey: normalizedObjectKey,
        mediaType: "text/plain; charset=utf-8",
        checksum: checksum(extracted.text),
        sanitized: true
      }
    });
    const now = new Date();
    const indexed = await this.retrieval.indexDocument(context, completed.fileId, {
      version: completed.version,
      title: session.filename,
      sourceType: session.sourceType,
      sourceChecksum: session.expectedChecksum,
      parserVersion: "safe-document-v2",
      chunkerVersion: "deterministic-v1",
      embedderVersion: "deterministic-embedding-v1",
      classification: session.classification,
      acl: {
        epoch: Date.now(),
        providerRevision: `workspace:${context.workspaceId}:${String(Date.now())}`,
        complete: true,
        subjects: [context.principalId],
        groups: [],
        observedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 240_000).toISOString()
      },
      sections: extracted.sections
    });
    return { ...completed, ...indexed, state: "ready", characters: extracted.text.length };
  }

  async ingestWebsite(
    context: TenantContext,
    input: { readonly url: string; readonly title?: string }
  ) {
    const snapshot = await fetchWebsiteSnapshot(input.url);
    const title = input.title?.trim() || snapshot.title;
    const body = Buffer.from(snapshot.text);
    const upload = await this.files.createUpload(context, {
      filename: `${title.replaceAll(/[^a-zA-Z0-9._-]+/gu, "-").slice(0, 90) || "website"}.txt`,
      purpose: "knowledge_source",
      mediaType: "text/plain",
      sizeBytes: body.byteLength,
      checksum: checksum(body),
      classification: "internal",
      partCount: 1,
      idempotencyKey: `website-${checksum(snapshot.url).slice(7, 47)}-${checksum(body).slice(7, 47)}`
    });
    const uploadId = String(upload.upload_id ?? upload.uploadId);
    return { ...(await this.ingestUpload(context, uploadId, body)), url: snapshot.url, title };
  }

  async preview(context: TenantContext, fileId: string) {
    const file = await this.files.get(context, fileId);
    if (!file) throw new Error("FILE_NOT_FOUND");
    const artifacts = Array.isArray(file.derived_artifacts) ? file.derived_artifacts : [];
    const normalized = artifacts.find(
      (artifact) =>
        artifact &&
        typeof artifact === "object" &&
        (artifact as Record<string, unknown>).kind === "normalized_text"
    ) as Record<string, unknown> | undefined;
    if (!normalized || typeof normalized.object_key !== "string")
      throw new Error("FILE_PREVIEW_NOT_READY");
    const text = (await this.objects.get(normalized.object_key)).toString("utf8");
    return {
      fileId,
      filename: file.filename,
      text: text.slice(0, 50_000),
      truncated: text.length > 50_000
    };
  }

  async deleteObjects(context: TenantContext, fileId: string) {
    const file = await this.files.get(context, fileId);
    if (!file) return;
    const versions = Array.isArray(file.versions) ? file.versions : [];
    const artifacts = Array.isArray(file.derived_artifacts) ? file.derived_artifacts : [];
    const keys = [...versions, ...artifacts].flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const key = (item as Record<string, unknown>).object_key;
      return typeof key === "string" ? [key] : [];
    });
    await Promise.all(keys.map((key) => this.objects.delete(key)));
  }
}
