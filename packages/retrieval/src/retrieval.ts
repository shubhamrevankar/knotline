import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { KnowledgeIndexRequest } from "@knotline/contracts";

export interface ChunkPolicy {
  readonly maximumCharacters: number;
  readonly overlapCharacters: number;
  readonly tableRowsPerChunk: number;
}

export interface RetrievalChunk {
  readonly ordinal: number;
  readonly text: string;
  readonly contentHash: string;
  readonly coordinate: KnowledgeIndexRequest["sections"][number]["coordinate"];
  readonly tags: readonly string[];
  readonly injectionSignals: readonly string[];
}

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export function normalizeQuery(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function scanPromptInjection(value: string) {
  const patterns: readonly [RegExp, string][] = [
    [/ignore\s+(?:all\s+)?previous\s+instructions/iu, "INSTRUCTION_OVERRIDE"],
    [/(?:system|developer)\s+prompt/iu, "PROMPT_EXTRACTION"],
    [/(?:exfiltrate|send|upload).{0,40}(?:secret|credential|token)/iu, "EXFILTRATION"],
    [/<\/?(?:script|iframe|object)\b/iu, "ACTIVE_MARKUP"]
  ];
  return patterns.filter(([pattern]) => pattern.test(value)).map(([, signal]) => signal);
}

export function chunkDocument(
  sections: KnowledgeIndexRequest["sections"],
  policy: ChunkPolicy
): readonly RetrievalChunk[] {
  if (policy.maximumCharacters < 64 || policy.overlapCharacters >= policy.maximumCharacters)
    throw new Error("CHUNK_POLICY_INVALID");
  const chunks: RetrievalChunk[] = [];
  for (const section of sections) {
    const text = section.text.normalize("NFKC").trim();
    if (!text) continue;
    const tableLike = section.coordinate.kind === "sheet";
    const pieces = tableLike
      ? Array.from(
          { length: Math.ceil(text.split("\n").length / policy.tableRowsPerChunk) },
          (_, index) =>
            text
              .split("\n")
              .slice(index * policy.tableRowsPerChunk, (index + 1) * policy.tableRowsPerChunk)
              .join("\n")
        )
      : splitWithOverlap(text, policy.maximumCharacters, policy.overlapCharacters);
    for (const piece of pieces.filter(Boolean))
      chunks.push({
        ordinal: chunks.length,
        text: piece,
        contentHash: hash(piece),
        coordinate: section.coordinate,
        tags: [...section.tags].sort(),
        injectionSignals: scanPromptInjection(piece)
      });
  }
  return chunks;
}

function splitWithOverlap(text: string, maximum: number, overlap: number) {
  const result: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maximum);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + maximum / 2) end = boundary;
    }
    result.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return result;
}

export function deterministicEmbedding(value: string, dimensions = 16) {
  const bytes = createHash("sha256").update(normalizeQuery(value)).digest();
  const vector = Array.from({ length: dimensions }, (_, index) => (bytes[index]! - 127.5) / 127.5);
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => Number((item / magnitude).toFixed(8)));
}

export function reciprocalRankFusion(
  keywordRanks: ReadonlyMap<string, number>,
  semanticRanks: ReadonlyMap<string, number>,
  constant = 60
) {
  const ids = new Set([...keywordRanks.keys(), ...semanticRanks.keys()]);
  return [...ids]
    .map((id) => ({
      id,
      keyword: keywordRanks.has(id) ? 1 / (constant + keywordRanks.get(id)!) : 0,
      semantic: semanticRanks.has(id) ? 1 / (constant + semanticRanks.get(id)!) : 0
    }))
    .map((item) => ({ ...item, score: item.keyword + item.semantic }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

export function packContext<T extends { text: string; sourceId: string }>(
  candidates: readonly T[],
  tokenLimit: number,
  perSourceLimit = 3
) {
  let tokens = 0;
  const counts = new Map<string, number>();
  return candidates.filter((candidate) => {
    const estimate = Math.ceil(candidate.text.length / 4);
    const sourceCount = counts.get(candidate.sourceId) ?? 0;
    if (tokens + estimate > tokenLimit || sourceCount >= perSourceLimit) return false;
    tokens += estimate;
    counts.set(candidate.sourceId, sourceCount + 1);
    return true;
  });
}

export interface AuthorizationProofPayload {
  readonly keyId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly groupHash: string;
  readonly resourceId: string;
  readonly aclEpoch: number;
  readonly aclHash: string;
  readonly deviceId?: string;
  readonly sessionId?: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

const base64 = (value: string) => Buffer.from(value).toString("base64url");
export function signAuthorizationProof(payload: AuthorizationProofPayload, key: Buffer) {
  if (key.byteLength < 32) throw new Error("AUTHORIZATION_PROOF_KEY_TOO_SHORT");
  const body = base64(JSON.stringify(payload));
  const signature = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAuthorizationProof(
  proof: string,
  keys: ReadonlyMap<string, Buffer>,
  expected: Pick<AuthorizationProofPayload, "workspaceId" | "subjectId" | "resourceId"> & {
    readonly deviceId?: string;
    readonly sessionId?: string;
    readonly minimumAclEpoch: number;
    readonly now: Date;
  }
) {
  const [body, signature, ...extra] = proof.split(".");
  if (!body || !signature || extra.length) throw new Error("AUTHORIZATION_PROOF_MALFORMED");
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as AuthorizationProofPayload;
  const key = keys.get(payload.keyId);
  if (!key) throw new Error("AUTHORIZATION_PROOF_KEY_RETIRED");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(createHmac("sha256", key).update(body).digest("base64url"));
  if (actual.byteLength !== wanted.byteLength || !timingSafeEqual(actual, wanted))
    throw new Error("AUTHORIZATION_PROOF_SIGNATURE");
  if (
    payload.workspaceId !== expected.workspaceId ||
    payload.subjectId !== expected.subjectId ||
    payload.resourceId !== expected.resourceId ||
    payload.deviceId !== expected.deviceId ||
    payload.sessionId !== expected.sessionId
  )
    throw new Error("AUTHORIZATION_PROOF_SUBSTITUTION");
  if (payload.aclEpoch < expected.minimumAclEpoch) throw new Error("AUTHORIZATION_PROOF_EPOCH");
  if (Date.parse(payload.expiresAt) <= expected.now.getTime())
    throw new Error("AUTHORIZATION_PROOF_EXPIRED");
  if (Date.parse(payload.expiresAt) - Date.parse(payload.issuedAt) > 300_000)
    throw new Error("AUTHORIZATION_PROOF_WINDOW");
  return payload;
}
