import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  connectorManifestSchema,
  type ConnectorErrorKind,
  type ConnectorManifest
} from "@knotline/contracts";

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const constantEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export interface AuthorizationBinding {
  id: string;
  workspaceId: string;
  userId: string;
  sessionId: string;
  browserNonce: string;
  connectionId: string;
  connectorKey: string;
  manifestVersion: string;
  provider: string;
  clientApplicationId: string;
  configVersion: string;
  redirectUri: string;
  requestedScopes: string[];
  returnTarget: string;
  expiresAt: string;
}
export interface AuthorizationStart {
  state: string;
  verifier: string;
  challenge: string;
  binding: AuthorizationBinding;
}

export class OAuthTransactionStore {
  readonly #transactions = new Map<
    string,
    { binding: AuthorizationBinding; verifierHash: string; consumed: boolean }
  >();
  constructor(
    private readonly signingKey: Buffer,
    private readonly now = () => new Date()
  ) {}
  start(binding: Omit<AuthorizationBinding, "id">): AuthorizationStart {
    if (!binding.returnTarget.startsWith("/app/") || binding.returnTarget.startsWith("//"))
      throw new Error("UNSAFE_RETURN_TARGET");
    if (new Date(binding.expiresAt) <= this.now()) throw new Error("AUTHORIZATION_EXPIRED");
    const id = cryptoId();
    const verifier = b64url(randomBytes(32));
    const durable = { ...binding, id };
    this.#transactions.set(id, { binding: durable, verifierHash: hash(verifier), consumed: false });
    const payload = b64url(
      JSON.stringify({ id, nonce: binding.browserNonce, exp: binding.expiresAt })
    );
    const signature = b64url(createHmac("sha256", this.signingKey).update(payload).digest());
    return {
      state: `${payload}.${signature}`,
      verifier,
      challenge: b64url(createHash("sha256").update(verifier).digest()),
      binding: durable
    };
  }
  consume(
    state: string,
    expected: Omit<AuthorizationBinding, "id" | "expiresAt" | "requestedScopes" | "returnTarget">,
    verifier: string
  ) {
    const [payload, signature] = state.split(".");
    if (
      !payload ||
      !signature ||
      !constantEqual(
        signature,
        b64url(createHmac("sha256", this.signingKey).update(payload).digest())
      )
    )
      throw new Error("INVALID_OAUTH_STATE");
    const locator = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      id: string;
      nonce: string;
      exp: string;
    };
    const record = this.#transactions.get(locator.id);
    if (!record || record.consumed) throw new Error("OAUTH_STATE_REPLAY");
    if (new Date(locator.exp) <= this.now()) throw new Error("AUTHORIZATION_EXPIRED");
    for (const key of Object.keys(expected) as (keyof typeof expected)[])
      if (record.binding[key] !== expected[key])
        throw new Error(`OAUTH_BINDING_MISMATCH:${String(key)}`);
    if (!constantEqual(record.verifierHash, hash(verifier))) throw new Error("PKCE_MISMATCH");
    record.consumed = true;
    return record.binding;
  }
}

export const cryptoId = () => randomBytes(16).toString("hex");
export const validateManifest = (manifest: unknown): ConnectorManifest =>
  connectorManifestSchema.parse(manifest);
export const reconcileScopes = (
  manifest: ConnectorManifest,
  requested: readonly string[],
  granted: readonly string[]
) => {
  const allowed = new Set([...manifest.requiredScopes, ...manifest.optionalScopes]);
  if (requested.some((scope) => !allowed.has(scope))) throw new Error("SCOPE_ESCALATION");
  const actual = [...new Set(granted)].sort();
  return {
    grantedScopes: actual,
    missingRequired: manifest.requiredScopes.filter((scope) => !actual.includes(scope)),
    reduced: requested.some((scope) => !actual.includes(scope)),
    reauthorizationRequired: manifest.requiredScopes.some((scope) => !actual.includes(scope))
  };
};

export interface WebhookEnvelope {
  endpointId: string;
  applicationId: string;
  environment: string;
  timestamp: number;
  rawBody: Buffer;
  signature: string;
}
export class WebhookReplayGuard {
  readonly #seen = new Set<string>();
  constructor(
    private readonly maxAgeSeconds = 300,
    private readonly now = () => Date.now()
  ) {}
  verify(input: WebhookEnvelope, secret: Buffer) {
    if (Math.abs(this.now() / 1000 - input.timestamp) > this.maxAgeSeconds)
      throw new Error("STALE_WEBHOOK");
    const expected = createHmac("sha256", secret)
      .update(`${input.timestamp}.`)
      .update(input.rawBody)
      .digest("hex");
    if (!constantEqual(expected, input.signature)) throw new Error("INVALID_WEBHOOK_SIGNATURE");
    const fingerprint = hash(`${input.endpointId}\0${input.timestamp}\0${input.signature}`);
    if (this.#seen.has(fingerprint)) throw new Error("WEBHOOK_REPLAY");
    this.#seen.add(fingerprint);
    return fingerprint;
  }
}

export interface InstallationBinding {
  workspaceId: string;
  connectionId: string;
  installationId: string;
  applicationId: string;
  environment: string;
  activeFrom: number;
  activeTo?: number;
  disabledAt?: number;
}
export function resolveHistoricalInstallation(
  bindings: readonly InstallationBinding[],
  input: { installationId: string; applicationId: string; environment: string; eventTime?: number }
) {
  const candidates = bindings.filter(
    (binding) =>
      binding.installationId === input.installationId &&
      binding.applicationId === input.applicationId &&
      binding.environment === input.environment &&
      input.eventTime !== undefined &&
      binding.activeFrom <= input.eventTime &&
      (binding.activeTo === undefined || input.eventTime < binding.activeTo) &&
      (binding.disabledAt === undefined || input.eventTime < binding.disabledAt)
  );
  if (candidates.length !== 1)
    throw new Error(
      input.eventTime === undefined ? "WEBHOOK_ORDER_AMBIGUOUS" : "WEBHOOK_BINDING_AMBIGUOUS"
    );
  return candidates[0]!;
}

export function assertNoCrossWorkspaceRebind(
  bindings: readonly InstallationBinding[],
  proposed: Pick<
    InstallationBinding,
    "workspaceId" | "installationId" | "applicationId" | "environment"
  >
) {
  const prior = bindings.find(
    (binding) =>
      binding.installationId === proposed.installationId &&
      binding.applicationId === proposed.applicationId &&
      binding.environment === proposed.environment
  );
  if (prior && prior.workspaceId !== proposed.workspaceId)
    throw new Error("CROSS_WORKSPACE_INSTALLATION_REASSIGNMENT");
}

export interface SyncObject {
  externalId: string;
  version: string;
  objectType: string;
  deleted?: boolean;
  permissionHash: string;
  payload: unknown;
}
export interface SyncPage {
  objects: SyncObject[];
  nextPage?: string;
  nextCursor?: string;
}
export class DurableSync {
  readonly objects = new Map<string, SyncObject>();
  readonly processedPages = new Set<string>();
  cursor?: string;
  sequence = 0;
  applyPage(pageId: string, page: SyncPage) {
    if (this.processedPages.has(pageId))
      return { duplicate: true, applied: 0, sequence: this.sequence };
    let applied = 0;
    for (const object of page.objects) {
      const key = `${object.objectType}\0${object.externalId}`;
      const previous = this.objects.get(key);
      if (
        !previous ||
        previous.version !== object.version ||
        previous.permissionHash !== object.permissionHash ||
        previous.deleted !== object.deleted
      ) {
        this.objects.set(key, object);
        applied += 1;
      }
    }
    this.processedPages.add(pageId);
    if (page.nextCursor !== undefined) this.cursor = page.nextCursor;
    this.sequence += 1;
    return {
      duplicate: false,
      applied,
      sequence: this.sequence,
      nextPage: page.nextPage,
      cursor: this.cursor
    };
  }
  reconcile(provider: readonly SyncObject[]) {
    const expected = new Set(provider.map((item) => `${item.objectType}\0${item.externalId}`));
    let repaired = 0;
    for (const item of provider) {
      const key = `${item.objectType}\0${item.externalId}`;
      if (this.objects.get(key)?.version !== item.version) {
        this.objects.set(key, item);
        repaired += 1;
      }
    }
    for (const [key, item] of this.objects)
      if (!expected.has(key) && !item.deleted) {
        this.objects.set(key, { ...item, deleted: true });
        repaired += 1;
      }
    return repaired;
  }
}

export const retryDelay = (attempt: number, retryAfterSeconds?: number, seed = 0) =>
  retryAfterSeconds !== undefined
    ? retryAfterSeconds * 1000
    : Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)) + (seed % 1000);
export const classifyProviderError = (status: number): ConnectorErrorKind =>
  status === 401
    ? "auth"
    : status === 403
      ? "permission"
      : status === 404
        ? "deleted_object"
        : status === 429
          ? "rate_limit"
          : status >= 500
            ? "outage"
            : "bug";
export const redactConnectorRecord = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) =>
      /token|secret|password|key|credential/iu.test(key) ? [key, "[REDACTED]"] : [key, item]
    )
  );

export function fairSchedule<T extends { workspaceId: string; connectionId: string }>(
  items: readonly T[],
  limit: number
) {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    const queue = queues.get(item.workspaceId) ?? [];
    queue.push(item);
    queues.set(item.workspaceId, queue);
  }
  const result: T[] = [];
  while (result.length < limit && [...queues.values()].some((queue) => queue.length))
    for (const workspaceId of [...queues.keys()].sort()) {
      const next = queues.get(workspaceId)?.shift();
      if (next && result.length < limit) result.push(next);
    }
  return result;
}

export const adaptivePollInterval = (
  changeRate: number,
  minimumMs = 60_000,
  maximumMs = 3_600_000,
  jitterSeed = 0
) => {
  const base = Math.max(minimumMs, Math.min(maximumMs, maximumMs / Math.max(1, changeRate * 10)));
  return Math.round(Math.min(maximumMs, base + (jitterSeed % Math.max(1, Math.round(base * 0.1)))));
};

export const stagedRolloutSelected = (
  workspaceId: string,
  connectorVersion: string,
  percentage: number
) =>
  Number.parseInt(hash(`${workspaceId}\0${connectorVersion}`).slice(0, 8), 16) % 100 < percentage;

export interface ConnectorAdapter {
  manifest: ConnectorManifest;
  discover(signal: AbortSignal): Promise<readonly string[]>;
  readPage(input: {
    objectType: string;
    cursor?: string;
    page?: string;
    signal: AbortSignal;
  }): Promise<SyncPage>;
  revoke?(): Promise<void>;
  injectAclRevocation?(externalId: string): Promise<{ observedAt: string }>;
}
export async function certifyConnector(adapter: ConnectorAdapter) {
  validateManifest(adapter.manifest);
  const controller = new AbortController();
  const types = await adapter.discover(controller.signal);
  if (!types.length) throw new Error("CERT_DISCOVERY_EMPTY");
  const first = await adapter.readPage({ objectType: types[0]!, signal: controller.signal });
  if (!first.objects.every((item) => item.externalId && item.version && item.permissionHash))
    throw new Error("CERT_OBJECT_IDENTITY_INVALID");
  if (adapter.manifest.capabilities.includes("permissions") && !adapter.injectAclRevocation)
    throw new Error("ACL-REVOKE-1_REQUIRED");
  return {
    certified: true,
    objectTypes: types,
    fixtureObjects: first.objects.length,
    aclRevoke: adapter.injectAclRevocation !== undefined
  };
}
