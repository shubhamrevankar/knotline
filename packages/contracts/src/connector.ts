import { z } from "zod";

export const connectorKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/u);
export const connectorAuthMethodSchema = z.enum([
  "oauth2",
  "api_key",
  "service_account",
  "basic",
  "custom"
]);
export const connectorCapabilitySchema = z.enum([
  "discover",
  "read",
  "write",
  "webhook",
  "poll",
  "permissions",
  "delete",
  "reconcile"
]);
export const connectionStateSchema = z.enum([
  "draft",
  "authorizing",
  "active",
  "degraded",
  "reauthorization_required",
  "disabled",
  "revoked",
  "deleting",
  "deleted"
]);
export const connectorErrorKindSchema = z.enum([
  "auth",
  "scope",
  "rate_limit",
  "quota",
  "permission",
  "deleted_object",
  "unsupported_type",
  "outage",
  "bug"
]);
export const permissionFidelitySchema = z.enum(["exact", "conservative", "unsupported"]);

export const connectorManifestSchema = z
  .object({
    key: connectorKeySchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    displayName: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(100),
    authMethods: z.array(connectorAuthMethodSchema).min(1),
    capabilities: z.array(connectorCapabilitySchema).min(1),
    requiredScopes: z.array(z.string()).default([]),
    optionalScopes: z.array(z.string()).default([]),
    objectTypes: z.array(z.string()).min(1),
    triggers: z.array(z.string()).default([]),
    actions: z.array(z.string()).default([]),
    permissionFidelity: permissionFidelitySchema,
    webhookMode: z.enum(["none", "connection", "application"]),
    regions: z.array(z.string()).min(1),
    rateLimits: z.object({
      concurrency: z.number().int().positive(),
      requestsPerMinute: z.number().int().positive()
    }),
    oauth: z
      .object({ authorizationEndpoint: z.string().url(), tokenEndpoint: z.string().url() })
      .optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.authMethods.includes("oauth2") && !value.oauth)
      context.addIssue({ code: "custom", message: "OAuth endpoints are required" });
    if (value.webhookMode !== "none" && !value.capabilities.includes("webhook"))
      context.addIssue({ code: "custom", message: "Webhook mode requires webhook capability" });
  });

export const createConnectionSchema = z
  .object({
    connectorKey: connectorKeySchema,
    manifestVersion: z.string(),
    displayName: z.string().trim().min(1).max(120),
    requestedScopes: z.array(z.string()).max(100),
    region: z.string().min(1),
    authMethod: connectorAuthMethodSchema
  })
  .strict();

export const authorizationStartSchema = z
  .object({
    sessionId: z.string().uuid(),
    browserNonce: z.string().min(16).max(256),
    returnTarget: z.string().startsWith("/app/").max(500),
    requestedScopes: z.array(z.string()).max(100)
  })
  .strict();

export const connectorSyncRequestSchema = z
  .object({
    mode: z.enum(["discover", "backfill", "incremental", "rescan", "reconcile"]),
    objectTypes: z.array(z.string()).max(100).optional()
  })
  .strict();

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ConnectorErrorKind = z.infer<typeof connectorErrorKindSchema>;
