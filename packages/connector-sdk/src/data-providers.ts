import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ConnectorManifest } from "@knotline/contracts";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type DataProvider =
  | "microsoft-365"
  | "google-mail-calendar"
  | "salesforce"
  | "hubspot"
  | "s3-compatible"
  | "csv-import"
  | "generic-rest"
  | "signed-webhook";

const manifest = (
  value: Omit<
    ConnectorManifest,
    "version" | "authMethods" | "permissionFidelity" | "regions" | "rateLimits"
  > &
    Partial<Pick<ConnectorManifest, "authMethods" | "permissionFidelity">>
): ConnectorManifest => ({
  ...value,
  version: "1.0.0",
  authMethods: value.authMethods ?? ["oauth2"],
  permissionFidelity: value.permissionFidelity ?? "exact",
  regions: ["us", "eu", "in"],
  rateLimits: { concurrency: 4, requestsPerMinute: 180 }
});

export const DATA_PROVIDER_MANIFESTS: Readonly<Record<DataProvider, ConnectorManifest>> = {
  "microsoft-365": manifest({
    key: "microsoft-365",
    displayName: "Microsoft 365",
    provider: "microsoft",
    capabilities: [
      "discover",
      "read",
      "write",
      "webhook",
      "poll",
      "permissions",
      "delete",
      "reconcile"
    ],
    requiredScopes: ["User.Read"],
    optionalScopes: [
      "Files.Read.All",
      "Sites.Read.All",
      "Mail.Read",
      "Mail.Send",
      "Calendars.ReadWrite"
    ],
    objectTypes: [
      "tenant",
      "drive",
      "site",
      "library",
      "file",
      "mailbox",
      "message",
      "thread",
      "calendar",
      "event"
    ],
    triggers: ["drive.delta", "mail.received", "calendar.event.changed"],
    actions: ["mail.send", "event.create", "event.update", "file.create"],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    }
  }),
  "google-mail-calendar": manifest({
    key: "google-mail-calendar",
    displayName: "Gmail and Google Calendar",
    provider: "google",
    capabilities: [
      "discover",
      "read",
      "write",
      "webhook",
      "poll",
      "permissions",
      "delete",
      "reconcile"
    ],
    requiredScopes: ["openid", "email"],
    optionalScopes: ["gmail.readonly", "gmail.send", "calendar.readonly", "calendar.events"],
    objectTypes: ["mailbox", "thread", "message", "calendar", "event", "recurrence"],
    triggers: ["gmail.history.changed", "calendar.event.changed"],
    actions: ["mail.send", "event.create", "event.update", "event.delete"],
    webhookMode: "connection",
    oauth: {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token"
    }
  }),
  salesforce: manifest({
    key: "salesforce-crm",
    displayName: "Salesforce",
    provider: "salesforce",
    capabilities: [
      "discover",
      "read",
      "write",
      "webhook",
      "poll",
      "permissions",
      "delete",
      "reconcile"
    ],
    requiredScopes: ["api", "id"],
    optionalScopes: ["refresh_token", "offline_access"],
    objectTypes: ["organization", "object", "field", "record", "change-event"],
    triggers: ["record.changed", "platform.event"],
    actions: ["record.create", "record.update"],
    webhookMode: "connection",
    oauth: {
      authorizationEndpoint: "https://login.salesforce.com/services/oauth2/authorize",
      tokenEndpoint: "https://login.salesforce.com/services/oauth2/token"
    }
  }),
  hubspot: manifest({
    key: "hubspot-crm",
    displayName: "HubSpot",
    provider: "hubspot",
    capabilities: [
      "discover",
      "read",
      "write",
      "webhook",
      "poll",
      "permissions",
      "delete",
      "reconcile"
    ],
    requiredScopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write"
    ],
    optionalScopes: ["crm.schemas.contacts.read"],
    objectTypes: ["account", "schema", "object", "association", "owner", "timeline"],
    triggers: ["crm.object.changed"],
    actions: ["object.create", "object.update", "association.create"],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://app.hubspot.com/oauth/authorize",
      tokenEndpoint: "https://api.hubapi.com/oauth/v3/token"
    }
  }),
  "s3-compatible": manifest({
    key: "s3-compatible",
    displayName: "S3-compatible storage",
    provider: "s3",
    authMethods: ["api_key"],
    capabilities: ["discover", "read", "write", "poll", "permissions", "delete", "reconcile"],
    requiredScopes: ["bucket:restricted"],
    optionalScopes: ["object:write"],
    objectTypes: ["bucket", "prefix", "object", "version", "delete-marker"],
    triggers: ["object.created", "object.removed"],
    actions: ["object.put", "object.copy", "object.delete"],
    webhookMode: "connection"
  }),
  "csv-import": manifest({
    key: "csv-import",
    displayName: "CSV import",
    provider: "local-file",
    authMethods: ["custom"],
    capabilities: ["discover", "read", "write", "delete", "reconcile"],
    requiredScopes: [],
    optionalScopes: [],
    objectTypes: ["import", "mapping", "row", "error", "batch"],
    triggers: ["import.completed"],
    actions: ["batch.import", "batch.rollback"],
    webhookMode: "connection"
  }),
  "generic-rest": manifest({
    key: "generic-rest",
    displayName: "REST API builder",
    provider: "generic",
    authMethods: ["api_key", "oauth2", "custom"],
    capabilities: ["discover", "read", "write", "poll", "reconcile"],
    requiredScopes: [],
    optionalScopes: [],
    objectTypes: ["specification", "operation", "schema", "request", "response"],
    triggers: ["poll.result.changed"],
    actions: ["operation.execute"],
    webhookMode: "connection"
  }),
  "signed-webhook": manifest({
    key: "signed-webhook",
    displayName: "Signed webhooks",
    provider: "generic",
    authMethods: ["api_key"],
    permissionFidelity: "unsupported",
    capabilities: ["read", "write", "webhook", "reconcile"],
    requiredScopes: [],
    optionalScopes: [],
    objectTypes: ["endpoint", "schema", "delivery", "receipt", "dead-letter"],
    triggers: ["payload.received"],
    actions: ["delivery.send", "delivery.redeliver"],
    webhookMode: "connection"
  })
};
export const DATA_PROVIDER_EXTERNAL_GATES: Readonly<Record<DataProvider, string>> = {
  "microsoft-365": "EXT-008",
  "google-mail-calendar": "EXT-007",
  salesforce: "EXT-013",
  hubspot: "EXT-013",
  "s3-compatible": "EXT-025",
  "csv-import": "LOCAL-CERTIFICATION",
  "generic-rest": "LOCAL-CERTIFICATION",
  "signed-webhook": "LOCAL-CERTIFICATION"
};

const forbiddenHosts = /(^|\.)(localhost|local|internal|corp|home|arpa)$/iu;
export function validateExternalEndpoint(raw: string, allowedOrigins: readonly string[]) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("ENDPOINT_HTTPS_REQUIRED");
  const host = url.hostname.toLowerCase();
  if (
    forbiddenHosts.test(host) ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^(10|127|169\.254|192\.168)\./u.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./u.test(host)
  )
    throw new Error("ENDPOINT_PRIVATE_NETWORK");
  if (!allowedOrigins.includes(url.origin)) throw new Error("ENDPOINT_NOT_ALLOWED");
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

export function restrictObjectPath(value: string, allowedPrefix: string) {
  const normalized = value
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .reduce<string[]>((parts, segment) => {
      if (segment === "..") parts.pop();
      else parts.push(segment);
      return parts;
    }, [])
    .join("/");
  const prefix = allowedPrefix.replace(/^\/+|\/+$/gu, "");
  if (normalized !== prefix && !normalized.startsWith(`${prefix}/`))
    throw new Error("OBJECT_PREFIX_ESCAPE");
  return normalized;
}

export function validateS3Policy(input: {
  endpoint: string;
  allowedOrigins: readonly string[];
  bucket: string;
  allowedBuckets: readonly string[];
  key: string;
  prefix: string;
  encrypted: boolean;
  versionId?: string;
}) {
  validateExternalEndpoint(input.endpoint, input.allowedOrigins);
  if (!input.allowedBuckets.includes(input.bucket)) throw new Error("BUCKET_NOT_ALLOWED");
  if (!input.encrypted) throw new Error("SERVER_SIDE_ENCRYPTION_REQUIRED");
  return {
    ...input,
    key: restrictObjectPath(input.key, input.prefix),
    immutableIdentity: `${input.bucket}/${input.key}@${input.versionId ?? "latest"}`
  };
}

const permittedSoql = /^[\w\s,.*()'=<>:-]+$/u;
export function buildBoundedSoql(
  input: { object: string; fields: readonly string[]; where?: string; limit?: number },
  allowedObjects: readonly string[],
  allowedFields: readonly string[]
) {
  if (
    !allowedObjects.includes(input.object) ||
    input.fields.some((field) => !allowedFields.includes(field))
  )
    throw new Error("CRM_FIELD_NOT_ALLOWED");
  if (
    input.where &&
    (!permittedSoql.test(input.where) || /\b(?:select|from|union|with)\b/iu.test(input.where))
  )
    throw new Error("CRM_FILTER_UNSAFE");
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 2000);
  return `SELECT ${input.fields.join(",")} FROM ${input.object}${input.where ? ` WHERE ${input.where}` : ""} LIMIT ${limit}`;
}

export interface SharedResourceGrant {
  resourceId: string;
  principalId: string;
  permission: "read" | "write";
  delegated: boolean;
  inheritedFrom?: string;
}
export function authorizeSharedResource(
  grants: readonly SharedResourceGrant[],
  input: { resourceId: string; principalId: string; write?: boolean }
) {
  const grant = grants.find(
    (row) =>
      row.resourceId === input.resourceId &&
      row.principalId === input.principalId &&
      (!input.write || row.permission === "write")
  );
  if (!grant) throw new Error("SHARED_RESOURCE_NOT_GRANTED");
  return grant;
}

export function advanceSyncToken(input: {
  current?: string;
  received?: string;
  reset?: boolean;
  provider: DataProvider;
}) {
  if (input.reset)
    return {
      token: undefined,
      mode: "bounded-rescan" as const,
      reason: `${input.provider}:token-reset`
    };
  if (!input.received) throw new Error("SYNC_TOKEN_MISSING");
  return { token: input.received, mode: "incremental" as const };
}

export const neutralizeCsvCell = (value: string) =>
  /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
export function inferCsvType(values: readonly string[]) {
  const nonempty = values.filter(Boolean);
  if (nonempty.every((value) => /^-?\d+(?:\.\d+)?$/u.test(value))) return "number";
  if (nonempty.every((value) => /^(true|false)$/iu.test(value))) return "boolean";
  if (nonempty.every((value) => !Number.isNaN(Date.parse(value)) && /[-T:/]/u.test(value)))
    return "datetime";
  return "string";
}
export class CsvImportBatch {
  readonly rows = new Map<string, Record<string, unknown>>();
  readonly errors: { row: number; code: string }[] = [];
  checkpoint = 0;
  apply(
    input: readonly Record<string, string>[],
    key: string,
    types: Readonly<Record<string, string>>
  ) {
    for (const [offset, row] of input.entries()) {
      const id = row[key];
      if (!id) {
        this.errors.push({ row: this.checkpoint + offset + 1, code: "UPSERT_KEY_MISSING" });
        continue;
      }
      const converted: Record<string, unknown> = {};
      let invalid = false;
      for (const [field, value] of Object.entries(row)) {
        const safe = neutralizeCsvCell(value);
        if (types[field] === "number" && Number.isNaN(Number(value))) {
          invalid = true;
          break;
        }
        converted[field] = types[field] === "number" ? Number(value) : safe;
      }
      if (invalid) {
        this.errors.push({ row: this.checkpoint + offset + 1, code: "TYPE_ERROR" });
        continue;
      }
      this.rows.set(id, converted);
    }
    this.checkpoint += input.length;
    return { checkpoint: this.checkpoint, imported: this.rows.size, errors: this.errors.length };
  }
  rollback() {
    const deleted = this.rows.size;
    this.rows.clear();
    return { deleted, state: "ROLLED_BACK" as const };
  }
}

export interface RestOperation {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  idempotent: boolean;
  risk: "low" | "medium" | "high";
  maxBytes: number;
}
export function importRestOperations(
  spec: { servers: readonly { url: string }[]; operations: readonly RestOperation[] },
  allowedOrigins: readonly string[]
) {
  const origins = spec.servers.map(
    ({ url }) => validateExternalEndpoint(url, allowedOrigins).origin
  );
  const ids = new Set<string>();
  for (const operation of spec.operations) {
    if (ids.has(operation.id)) throw new Error("OPENAPI_OPERATION_DUPLICATE");
    ids.add(operation.id);
    if (operation.maxBytes > 10_000_000) throw new Error("RESPONSE_LIMIT_TOO_LARGE");
    if (!operation.path.startsWith("/") || operation.path.includes(".."))
      throw new Error("OPENAPI_PATH_UNSAFE");
    if (!operation.idempotent && operation.risk !== "high")
      throw new Error("NON_IDEMPOTENT_RISK_REQUIRED");
  }
  return { origins, operations: spec.operations };
}

export class SignedWebhookVerifier {
  readonly #seen = new Set<string>();
  constructor(private readonly now = () => Date.now()) {}
  verify(
    input: {
      raw: Buffer;
      timestamp: number;
      signature: string;
      deliveryId: string;
      schemaVersion: string;
    },
    secrets: readonly Buffer[]
  ) {
    if (Math.abs(this.now() / 1000 - input.timestamp) > 300) throw new Error("WEBHOOK_STALE");
    if (!/^v\d+$/u.test(input.schemaVersion)) throw new Error("WEBHOOK_SCHEMA_UNSUPPORTED");
    const valid = secrets.some((secret) => {
      const expected = createHmac("sha256", secret)
        .update(`${input.timestamp}.`)
        .update(input.raw)
        .digest("hex");
      const a = Buffer.from(expected),
        b = Buffer.from(input.signature);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!valid) throw new Error("WEBHOOK_SIGNATURE_INVALID");
    if (this.#seen.has(input.deliveryId)) throw new Error("WEBHOOK_REPLAY");
    this.#seen.add(input.deliveryId);
    return {
      receiptHash: digest({
        deliveryId: input.deliveryId,
        body: digest(input.raw.toString("base64"))
      }),
      schemaVersion: input.schemaVersion
    };
  }
}

export function certifyDataProvider(provider: DataProvider) {
  const manifest = DATA_PROVIDER_MANIFESTS[provider];
  return {
    provider,
    engineeringStatus: "RECORDED" as const,
    liveStatus: "BLOCKED_EXTERNAL" as const,
    externalGate: DATA_PROVIDER_EXTERNAL_GATES[provider],
    objects: manifest.objectTypes.length,
    actions: manifest.actions.length,
    incrementalSync: !["csv-import", "generic-rest", "signed-webhook"].includes(provider),
    fixtureDigest: digest(manifest)
  };
}
