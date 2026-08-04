import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

type ResolveHostname = (
  hostname: string,
  options: { readonly all: true; readonly verbatim: true }
) => Promise<readonly { readonly address: string; readonly family: number }[]>;

export interface LiveHttpRequest {
  readonly endpoint: string;
  readonly method: "POST" | "PUT" | "PATCH";
  readonly authorization?: string;
  readonly timeoutMs: number;
  readonly operationId: string;
  readonly body: unknown;
}

export interface LiveHttpResult {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
  readonly durationMs: number;
}

const privateIpv4 = (address: string) => {
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
};

const privateIp = (address: string) => {
  if (isIP(address) === 4) return privateIpv4(address);
  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
};

export async function assertSafeLiveHttpEndpoint(
  raw: string,
  resolve: ResolveHostname = lookup
): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("ENDPOINT_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("ENDPOINT_CREDENTIALS_FORBIDDEN");
  if (!["", "443"].includes(url.port)) throw new Error("ENDPOINT_PORT_FORBIDDEN");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  )
    throw new Error("ENDPOINT_PRIVATE_NETWORK");
  const addresses = await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address)))
    throw new Error("ENDPOINT_PRIVATE_NETWORK");
  url.hash = "";
  return url;
}

const readBoundedBody = async (response: Response, maxBytes = 64 * 1024): Promise<unknown> => {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("CONNECTOR_RESPONSE_TOO_LARGE");
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("CONNECTOR_RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(joined);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text: text.slice(0, 4000) };
  }
};

export async function executeLiveHttpRequest(
  input: LiveHttpRequest,
  dependencies: {
    readonly fetch?: typeof globalThis.fetch;
    readonly resolve?: ResolveHostname;
    readonly now?: () => number;
  } = {}
): Promise<LiveHttpResult> {
  const endpoint = await assertSafeLiveHttpEndpoint(input.endpoint, dependencies.resolve);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const now = dependencies.now ?? Date.now;
  const started = now();
  try {
    const response = await (dependencies.fetch ?? globalThis.fetch)(endpoint, {
      method: input.method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain;q=0.8",
        "user-agent": "Knotline-Connector/1.0",
        "idempotency-key": input.operationId,
        "x-knotline-operation-id": input.operationId,
        ...(input.authorization ? { authorization: input.authorization } : {})
      },
      body: JSON.stringify(input.body)
    });
    if (response.status >= 300 && response.status < 400)
      throw new Error("CONNECTOR_REDIRECT_FORBIDDEN");
    const body = await readBoundedBody(response);
    return { status: response.status, ok: response.ok, body, durationMs: now() - started };
  } finally {
    clearTimeout(timer);
  }
}
