import { z } from "zod";

export type LiveProvider = "slack" | "hubspot";

export interface ProviderOAuthApplication {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export const providerCredentialSchema = z
  .object({
    provider: z.enum(["slack", "hubspot"]),
    accessToken: z.string().min(1).max(4096),
    refreshToken: z.string().min(1).max(4096).optional(),
    expiresAt: z.string().datetime().optional(),
    tokenType: z.string().min(1).max(40).default("bearer"),
    scopes: z.array(z.string()).max(100).default([]),
    accountId: z.string().min(1).max(300),
    accountLabel: z.string().min(1).max(300)
  })
  .strict();

export type ProviderCredential = z.infer<typeof providerCredentialSchema>;

export interface ProviderSyncObject {
  readonly objectType: "channel" | "contact" | "company";
  readonly externalId: string;
  readonly externalVersion: string;
  readonly label?: string;
  readonly payloadReference: string;
}

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  const text = (await response.text()).slice(0, 64 * 1024);
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };
  } catch {
    return { text: text.slice(0, 4000) };
  }
};

const providerError = (provider: LiveProvider, body: Record<string, unknown>, status: number) => {
  const detail =
    typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : `HTTP_${String(status)}`;
  return new Error(`${provider.toUpperCase()}_${detail.replaceAll(/[^a-z0-9_]+/giu, "_")}`);
};

export function providerAuthorizationUrl(input: {
  readonly provider: LiveProvider;
  readonly application: Pick<ProviderOAuthApplication, "clientId" | "redirectUri">;
  readonly state: string;
  readonly scopes: readonly string[];
}): string {
  const url = new URL(
    input.provider === "slack"
      ? "https://slack.com/oauth/v2/authorize"
      : "https://app.hubspot.com/oauth/authorize"
  );
  url.searchParams.set("client_id", input.application.clientId);
  url.searchParams.set("redirect_uri", input.application.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scopes.join(input.provider === "slack" ? "," : " "));
  return url.toString();
}

export async function exchangeProviderCode(
  provider: LiveProvider,
  application: ProviderOAuthApplication,
  code: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<ProviderCredential> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: application.clientId,
    client_secret: application.clientSecret,
    redirect_uri: application.redirectUri,
    code
  });
  const response = await fetcher(
    provider === "slack"
      ? "https://slack.com/api/oauth.v2.access"
      : "https://api.hubapi.com/oauth/v3/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form
    }
  );
  const body = await readJson(response);
  if (!response.ok || (provider === "slack" && body.ok !== true))
    throw providerError(provider, body, response.status);
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new Error("PROVIDER_TOKEN_MISSING");
  if (provider === "slack") {
    const team = body.team as { id?: unknown; name?: unknown } | undefined;
    const scopes = typeof body.scope === "string" ? body.scope.split(",").filter(Boolean) : [];
    return providerCredentialSchema.parse({
      provider,
      accessToken,
      ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
      ...(typeof body.expires_in === "number"
        ? { expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString() }
        : {}),
      tokenType: typeof body.token_type === "string" ? body.token_type : "bot",
      scopes,
      accountId: typeof team?.id === "string" ? team.id : "slack-workspace",
      accountLabel: typeof team?.name === "string" ? team.name : "Slack workspace"
    });
  }
  const expiresIn = Number(body.expires_in ?? 1800);
  const hubId =
    typeof body.hub_id === "string" || typeof body.hub_id === "number"
      ? String(body.hub_id)
      : "account";
  return providerCredentialSchema.parse({
    provider,
    accessToken,
    ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
    expiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString(),
    tokenType: typeof body.token_type === "string" ? body.token_type : "bearer",
    scopes: Array.isArray(body.scopes)
      ? body.scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    accountId: hubId,
    accountLabel: `HubSpot ${hubId}`
  });
}

export async function refreshProviderCredential(
  credentialInput: ProviderCredential,
  application: ProviderOAuthApplication,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<ProviderCredential> {
  const credential = providerCredentialSchema.parse(credentialInput);
  if (!credential.expiresAt || new Date(credential.expiresAt).getTime() > Date.now() + 60_000)
    return credential;
  if (!credential.refreshToken) throw new Error("PROVIDER_REAUTHORIZATION_REQUIRED");
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: application.clientId
  });
  form.set("client_secret", application.clientSecret);
  form.set("refresh_token", credential.refreshToken);
  if (credential.provider === "hubspot") form.set("redirect_uri", application.redirectUri);
  const response = await fetcher(
    credential.provider === "slack"
      ? "https://slack.com/api/oauth.v2.access"
      : "https://api.hubapi.com/oauth/v3/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form
    }
  );
  const body = await readJson(response);
  if (!response.ok || (credential.provider === "slack" && body.ok !== true))
    throw providerError(credential.provider, body, response.status);
  if (typeof body.access_token !== "string") throw new Error("PROVIDER_TOKEN_MISSING");
  return providerCredentialSchema.parse({
    ...credential,
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : credential.refreshToken,
    expiresAt: new Date(
      Date.now() + Math.max(60, Number(body.expires_in ?? 1800)) * 1000
    ).toISOString()
  });
}

export async function testProviderCredential(
  credentialInput: ProviderCredential,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<{
  readonly accountId: string;
  readonly accountLabel: string;
  readonly detail: unknown;
}> {
  const credential = providerCredentialSchema.parse(credentialInput);
  const response = await fetcher(
    credential.provider === "slack"
      ? "https://slack.com/api/auth.test"
      : "https://api.hubapi.com/crm/objects/2026-03/contacts?limit=1",
    {
      method: "GET",
      headers: { authorization: `Bearer ${credential.accessToken}`, accept: "application/json" }
    }
  );
  const body = await readJson(response);
  if (!response.ok || (credential.provider === "slack" && body.ok !== true))
    throw providerError(credential.provider, body, response.status);
  return credential.provider === "slack"
    ? {
        accountId: typeof body.team_id === "string" ? body.team_id : credential.accountId,
        accountLabel: typeof body.team === "string" ? body.team : credential.accountLabel,
        detail: { teamId: body.team_id, team: body.team, userId: body.user_id, botId: body.bot_id }
      }
    : {
        accountId: credential.accountId,
        accountLabel: credential.accountLabel,
        detail: { reachable: true }
      };
}

export async function fetchProviderObjects(
  credentialInput: ProviderCredential,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<readonly ProviderSyncObject[]> {
  const credential = providerCredentialSchema.parse(credentialInput);
  const objects: ProviderSyncObject[] = [];
  if (credential.provider === "slack") {
    let cursor = "";
    for (let page = 0; page < 20; page += 1) {
      const url = new URL("https://slack.com/api/conversations.list");
      url.searchParams.set("types", "public_channel");
      url.searchParams.set("exclude_archived", "true");
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetcher(url, {
        method: "GET",
        headers: { authorization: `Bearer ${credential.accessToken}`, accept: "application/json" }
      });
      const body = await readJson(response);
      if (!response.ok || body.ok !== true) throw providerError("slack", body, response.status);
      const channels = Array.isArray(body.channels) ? body.channels : [];
      for (const value of channels) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const channel = value as Record<string, unknown>;
        if (typeof channel.id !== "string" || !channel.id) continue;
        const version = channel.updated ?? channel.created;
        objects.push({
          objectType: "channel",
          externalId: channel.id,
          externalVersion:
            typeof version === "string" || typeof version === "number"
              ? String(version)
              : "current",
          ...(typeof channel.name === "string" ? { label: channel.name } : {}),
          payloadReference: `slack://channel/${encodeURIComponent(channel.id)}`
        });
      }
      const metadata = body.response_metadata as Record<string, unknown> | undefined;
      cursor = typeof metadata?.next_cursor === "string" ? metadata.next_cursor : "";
      if (!cursor || objects.length >= 4_000) break;
    }
    return objects;
  }

  for (const objectType of ["contacts", "companies"] as const) {
    let after = "";
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(`https://api.hubapi.com/crm/objects/2026-03/${objectType}`);
      url.searchParams.set("limit", "100");
      url.searchParams.set(
        "properties",
        objectType === "contacts" ? "firstname,lastname,email" : "name,domain"
      );
      if (after) url.searchParams.set("after", after);
      const response = await fetcher(url, {
        method: "GET",
        headers: { authorization: `Bearer ${credential.accessToken}`, accept: "application/json" }
      });
      const body = await readJson(response);
      if (!response.ok) throw providerError("hubspot", body, response.status);
      const results = Array.isArray(body.results) ? body.results : [];
      for (const value of results) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const record = value as Record<string, unknown>;
        if (typeof record.id !== "string" || !record.id) continue;
        const properties =
          record.properties &&
          typeof record.properties === "object" &&
          !Array.isArray(record.properties)
            ? (record.properties as Record<string, unknown>)
            : {};
        const label =
          objectType === "contacts"
            ? [properties.firstname, properties.lastname]
                .filter((part): part is string => typeof part === "string" && Boolean(part))
                .join(" ") || (typeof properties.email === "string" ? properties.email : undefined)
            : typeof properties.name === "string"
              ? properties.name
              : typeof properties.domain === "string"
                ? properties.domain
                : undefined;
        objects.push({
          objectType: objectType === "contacts" ? "contact" : "company",
          externalId: record.id,
          externalVersion:
            typeof record.updatedAt === "string"
              ? record.updatedAt
              : typeof record.createdAt === "string"
                ? record.createdAt
                : "current",
          ...(label ? { label } : {}),
          payloadReference: `hubspot://${objectType}/${encodeURIComponent(record.id)}`
        });
      }
      const paging = body.paging as Record<string, unknown> | undefined;
      const next = paging?.next as Record<string, unknown> | undefined;
      after = typeof next?.after === "string" ? next.after : "";
      if (!after || objects.length >= 4_000) break;
    }
  }
  return objects;
}

const providerActionSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("slack"),
    action: z.enum(["message.post", "message.update", "message.delete"]),
    payload: z.record(z.string(), z.unknown())
  }),
  z.object({
    provider: z.literal("hubspot"),
    action: z.enum(["object.create", "object.update", "association.create"]),
    payload: z.record(z.string(), z.unknown())
  })
]);

export async function executeProviderAction(
  credentialInput: ProviderCredential,
  actionInput: unknown,
  operationId: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<{ readonly status: number; readonly body: unknown }> {
  const credential = providerCredentialSchema.parse(credentialInput);
  const input = providerActionSchema.parse(actionInput);
  if (credential.provider !== input.provider) throw new Error("PROVIDER_CONNECTION_MISMATCH");
  let url: string;
  let method: "POST" | "PATCH" | "PUT" = "POST";
  let payload = input.payload;
  if (input.provider === "slack") {
    const method = {
      "message.post": "chat.postMessage",
      "message.update": "chat.update",
      "message.delete": "chat.delete"
    }[input.action];
    url = `https://slack.com/api/${method}`;
  } else {
    const objectType = typeof payload.objectType === "string" ? payload.objectType : "contacts";
    const supportedObjectTypes = new Set(["contacts", "companies"]);
    if (!supportedObjectTypes.has(objectType)) throw new Error("HUBSPOT_OBJECT_TYPE_INVALID");
    const recordId = payload.recordId;
    if (input.action === "association.create") {
      const fromObjectType = payload.fromObjectType;
      const fromRecordId = payload.fromRecordId;
      const toObjectType = payload.toObjectType;
      const toRecordId = payload.toRecordId;
      if (
        typeof fromObjectType !== "string" ||
        typeof fromRecordId !== "string" ||
        typeof toObjectType !== "string" ||
        typeof toRecordId !== "string"
      )
        throw new Error("HUBSPOT_ASSOCIATION_CONFIGURATION_REQUIRED");
      for (const type of [fromObjectType, toObjectType])
        if (!supportedObjectTypes.has(type)) throw new Error("HUBSPOT_OBJECT_TYPE_INVALID");
      method = "PUT";
      url = `https://api.hubapi.com/crm/v4/objects/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(fromRecordId)}/associations/default/${encodeURIComponent(toObjectType)}/${encodeURIComponent(toRecordId)}`;
      payload = {};
    } else if (input.action === "object.update") {
      if (typeof recordId !== "string" || !recordId) throw new Error("HUBSPOT_RECORD_ID_REQUIRED");
      method = "PATCH";
      url = `https://api.hubapi.com/crm/objects/2026-03/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`;
    } else {
      url = `https://api.hubapi.com/crm/objects/2026-03/${encodeURIComponent(objectType)}`;
    }
    payload = { properties: payload.properties ?? {} };
  }
  const response = await fetcher(url, {
    method,
    headers: {
      authorization: `Bearer ${credential.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
      "x-knotline-operation-id": operationId
    },
    body: JSON.stringify(payload)
  });
  const body = await readJson(response);
  if (!response.ok || (input.provider === "slack" && body.ok !== true))
    throw providerError(input.provider, body, response.status);
  return { status: response.status, body };
}
