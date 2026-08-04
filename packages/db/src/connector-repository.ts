import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  authorizationStartSchema,
  connectorSyncRequestSchema,
  createConnectionSchema
} from "@knotline/contracts";
import {
  OAuthTransactionStore,
  reconcileScopes,
  validateManifest,
  validateSourceSelection,
  type ProviderSource
} from "@knotline/connector-sdk";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { createId } from "./values.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const connectorId = z.string().uuid();

const liveHttpConfigurationSchema = z
  .object({
    endpoint: z.url(),
    method: z.enum(["POST", "PUT", "PATCH"]),
    authorization: z.string().trim().max(4096).optional(),
    timeoutMs: z.number().int().min(1000).max(30000).default(10000)
  })
  .strict();

const encryptCredential = (value: string, key: Buffer) => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64");
};

const decryptCredential = (value: string, key: Buffer) => {
  const encrypted = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString(
    "utf8"
  );
};

export interface LiveHttpConnectionConfiguration {
  readonly connectionId: string;
  readonly connectorKey: "generic-rest" | "signed-webhook";
  readonly endpoint: string;
  readonly method: "POST" | "PUT" | "PATCH";
  readonly authorization?: string;
  readonly timeoutMs: number;
}

const recordedSources = (connectorKey: string): readonly ProviderSource[] =>
  connectorKey === "google-workspace-knowledge"
    ? [
        {
          id: "drive-personal",
          kind: "drive",
          name: "My Drive",
          estimatedObjects: 128,
          selectable: true
        },
        {
          id: "drive-shared-product",
          kind: "drive",
          name: "Product shared drive",
          estimatedObjects: 642,
          selectable: true
        },
        {
          id: "folder-archive",
          kind: "folder",
          name: "Unsupported exports",
          estimatedObjects: 11,
          selectable: false,
          limitation: "Contains files that cannot be exported through the recorded contract."
        }
      ]
    : connectorKey === "notion-knowledge"
      ? [
          {
            id: "notion-page-product",
            kind: "page",
            name: "Product home",
            estimatedObjects: 86,
            selectable: true
          },
          {
            id: "notion-db-roadmap",
            kind: "database",
            name: "Roadmap",
            estimatedObjects: 214,
            selectable: true
          }
        ]
      : connectorKey === "confluence-cloud-knowledge"
        ? [
            {
              id: "confluence-space-ops",
              kind: "space",
              name: "Operations",
              estimatedObjects: 330,
              selectable: true
            },
            {
              id: "confluence-page-restricted",
              kind: "page",
              name: "Restricted root",
              estimatedObjects: 17,
              selectable: false,
              limitation: "The recorded account cannot prove child-page visibility."
            }
          ]
        : [];

export interface ConnectorRepository {
  catalog(
    context: TenantContext,
    connectorKey?: string
  ): Promise<readonly Record<string, unknown>[]>;
  connections(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  create(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  get(context: TenantContext, connectionId: string): Promise<Record<string, unknown> | undefined>;
  patch(
    context: TenantContext,
    connectionId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  startAuthorization(
    context: TenantContext,
    connectionId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  authorization(
    context: TenantContext,
    authorizationId: string
  ): Promise<Record<string, unknown> | undefined>;
  activate(
    context: TenantContext,
    connectionId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  sync(
    context: TenantContext,
    connectionId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  syncs(
    context: TenantContext,
    connectionId: string,
    syncId?: string
  ): Promise<readonly Record<string, unknown>[]>;
  transition(
    context: TenantContext,
    connectionId: string,
    action: string
  ): Promise<Record<string, unknown>>;
  remove(context: TenantContext, connectionId: string): Promise<Record<string, unknown>>;
  sourceSurface(context: TenantContext, connectionId: string): Promise<Record<string, unknown>>;
  updateSourceSelection(
    context: TenantContext,
    connectionId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  configureHttp(
    context: TenantContext,
    connectionId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  httpConfiguration(
    context: TenantContext,
    connectionId: string
  ): Promise<LiveHttpConnectionConfiguration | undefined>;
  recordHttpReceipt(
    context: TenantContext,
    input: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>;
  httpReceipts(
    context: TenantContext,
    connectionId: string
  ): Promise<readonly Record<string, unknown>[]>;
}

export class PostgresConnectorRepository implements ConnectorRepository {
  readonly #oauth: OAuthTransactionStore;
  readonly #credentialKey: Buffer;
  constructor(
    private readonly pool: Pool,
    signingKey: Buffer
  ) {
    this.#oauth = new OAuthTransactionStore(signingKey);
    if (signingKey.byteLength !== 32) throw new Error("CONNECTOR_KEY_MUST_BE_32_BYTES");
    this.#credentialKey = signingKey;
  }

  async catalog(context: TenantContext, connectorKey?: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT manifest.id,manifest.connector_key "key",manifest.semantic_version "version",manifest.manifest,manifest.state,manifest.rollout_percent "rolloutPercent",
                    CASE WHEN certification.id IS NULL THEN NULL ELSE jsonb_build_object('engineeringStatus',certification.engineering_status,'liveStatus',certification.live_status,'externalGate',certification.external_gate,'limitations',certification.limitations,'certifiedAt',certification.certified_at) END certification
             FROM connector_manifest_versions manifest
             LEFT JOIN provider_connector_certifications certification ON certification.workspace_id=manifest.workspace_id AND certification.connector_key=manifest.connector_key AND certification.manifest_version=manifest.semantic_version
             WHERE manifest.workspace_id=$1 AND manifest.state IN ('staged','active') AND ($2::text IS NULL OR manifest.connector_key=$2)
             ORDER BY manifest.connector_key,manifest.semantic_version DESC`,
            [context.workspaceId, connectorKey ?? null]
          )
        ).rows
    );
  }
  async connections(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,connector_key "connectorKey",display_name "displayName",state,external_account_label "accountLabel",granted_scopes "grantedScopes",requested_scopes "requestedScopes",permission_fidelity "permissionFidelity",last_success_at "lastSuccessAt",freshness_lag_seconds "freshnessLagSeconds",next_retry_at "nextRetryAt",current_operation "currentOperation",object_count "objectCount",error_count "errorCount",error_summary "errorSummary",runtime_configuration->>'endpoint' "endpoint",health_checked_at "healthCheckedAt",health_latency_ms "healthLatencyMs",updated_at "updatedAt" FROM connections WHERE workspace_id=$1 AND state<>'deleted' ORDER BY updated_at DESC,id`,
            [context.workspaceId]
          )
        ).rows
    );
  }
  async create(context: TenantContext, input: unknown) {
    const value = createConnectionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const selected = await client.query<{ id: string; manifest: unknown }>(
        `SELECT id,manifest FROM connector_manifest_versions WHERE workspace_id=$1 AND connector_key=$2 AND semantic_version=$3 AND state IN ('staged','active')`,
        [context.workspaceId, value.connectorKey, value.manifestVersion]
      );
      if (!selected.rows[0])
        throw new HumanTaskAuthorizationError("CONNECTOR_VERSION_NOT_AVAILABLE");
      const manifest = validateManifest(selected.rows[0].manifest);
      if (!manifest.authMethods.includes(value.authMethod))
        throw new HumanTaskConflictError("AUTH_METHOD_NOT_ALLOWED");
      if (!manifest.regions.includes(value.region))
        throw new HumanTaskConflictError("CONNECTOR_REGION_UNAVAILABLE");
      reconcileScopes(manifest, value.requestedScopes, value.requestedScopes);
      const id = createId();
      await client.query(
        `INSERT INTO connections(workspace_id,id,connector_manifest_id,connector_key,display_name,auth_method,state,region,requested_scopes,permission_fidelity,created_by) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10)`,
        [
          context.workspaceId,
          id,
          selected.rows[0].id,
          value.connectorKey,
          value.displayName,
          value.authMethod,
          value.region,
          value.requestedScopes,
          manifest.permissionFidelity,
          context.principalId
        ]
      );
      return { id, ...value, state: "draft", permissionFidelity: manifest.permissionFidelity };
    });
  }
  async get(context: TenantContext, connectionId: string) {
    connectorId.parse(connectionId);
    return withTenantTransaction(this.pool, context, async (client) => {
      const connection = (
        await client.query<Record<string, unknown>>(
          `SELECT id,connector_key "connectorKey",display_name "displayName",state,auth_method "authMethod",external_account_id "accountId",external_account_label "accountLabel",granted_scopes "grantedScopes",requested_scopes "requestedScopes",permission_fidelity "permissionFidelity",last_success_at "lastSuccessAt",freshness_lag_seconds "freshnessLagSeconds",next_retry_at "nextRetryAt",current_operation "currentOperation",object_count "objectCount",error_count "errorCount",error_summary "errorSummary",runtime_configuration->>'endpoint' "endpoint",runtime_configuration->>'method' "method",encrypted_credential IS NOT NULL "authorizationConfigured",health_checked_at "healthCheckedAt",health_latency_ms "healthLatencyMs",updated_at "updatedAt" FROM connections WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, connectionId]
        )
      ).rows[0];
      if (!connection) return undefined;
      const runs = (
        await client.query<Record<string, unknown>>(
          `SELECT id,mode,state,processed_count "processedCount",error_kind "errorKind",started_at "startedAt",completed_at "completedAt" FROM connection_sync_runs WHERE workspace_id=$1 AND connection_id=$2 ORDER BY created_at DESC LIMIT 20`,
          [context.workspaceId, connectionId]
        )
      ).rows;
      const receipts = (
        await client.query<Record<string, unknown>>(
          `SELECT id,run_id "runId",node_key "nodeKey",operation_id "operationId",request_method "requestMethod",response_status "responseStatus",response_excerpt "responseExcerpt",duration_ms "durationMs",state,error_code "errorCode",created_at "createdAt" FROM connection_action_receipts WHERE workspace_id=$1 AND connection_id=$2 ORDER BY created_at DESC LIMIT 50`,
          [context.workspaceId, connectionId]
        )
      ).rows;
      return { ...connection, runs, receipts };
    });
  }
  async patch(context: TenantContext, connectionId: string, input: unknown) {
    const value = z
      .object({
        displayName: z.string().trim().min(1).max(120).optional(),
        requestedScopes: z.array(z.string()).max(100).optional()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE connections SET display_name=COALESCE($3,display_name),requested_scopes=COALESCE($4,requested_scopes),state=CASE WHEN $4::text[] IS NOT NULL AND NOT ($4::text[] <@ granted_scopes) THEN 'reauthorization_required' ELSE state END,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state NOT IN ('deleting','deleted') RETURNING id,state,display_name "displayName",requested_scopes "requestedScopes"`,
        [
          context.workspaceId,
          connectorId.parse(connectionId),
          value.displayName ?? null,
          value.requestedScopes ?? null
        ]
      );
      if (!result.rows[0]) throw new HumanTaskAuthorizationError("CONNECTION_NOT_FOUND");
      return result.rows[0];
    });
  }
  async startAuthorization(context: TenantContext, connectionId: string, input: unknown) {
    const value = authorizationStartSchema.parse(input);
    connectorId.parse(connectionId);
    return withTenantTransaction(this.pool, context, async (client) => {
      const row = (
        await client.query<{
          connector_key: string;
          connector_manifest_id: string;
          manifest: unknown;
        }>(
          `SELECT connection.connector_key,connection.connector_manifest_id,manifest.manifest FROM connections connection JOIN connector_manifest_versions manifest ON manifest.workspace_id=connection.workspace_id AND manifest.id=connection.connector_manifest_id WHERE connection.workspace_id=$1 AND connection.id=$2 AND connection.state IN ('draft','active','degraded','reauthorization_required') FOR UPDATE`,
          [context.workspaceId, connectionId]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("CONNECTION_NOT_AUTHORIZABLE");
      const manifest = validateManifest(row.manifest);
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const started = this.#oauth.start({
        workspaceId: context.workspaceId,
        userId: context.principalId,
        sessionId: value.sessionId,
        browserNonce: value.browserNonce,
        connectionId,
        connectorKey: manifest.key,
        manifestVersion: manifest.version,
        provider: manifest.provider,
        clientApplicationId: "local-fixture-app",
        configVersion: "local-v1",
        redirectUri: "http://127.0.0.1:4100/callbacks/v1/connections/oauth/fixture",
        requestedScopes: value.requestedScopes,
        returnTarget: value.returnTarget,
        expiresAt
      });
      await client.query(
        `INSERT INTO connection_authorization_transactions(workspace_id,id,connection_id,user_id,session_id,browser_nonce_hash,state_hash,verifier_hash,connector_manifest_id,provider,client_application_id,config_version,redirect_uri,requested_scopes,return_target,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          context.workspaceId,
          started.binding.id,
          connectionId,
          context.principalId,
          value.sessionId,
          sha(value.browserNonce),
          sha(started.state),
          sha(started.verifier),
          row.connector_manifest_id,
          manifest.provider,
          "local-fixture-app",
          "local-v1",
          started.binding.redirectUri,
          value.requestedScopes,
          value.returnTarget,
          expiresAt
        ]
      );
      await client.query(
        `UPDATE connections SET state='authorizing',current_operation='authorization',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, connectionId]
      );
      return {
        authorizationId: started.binding.id,
        authorizationUrl: `${manifest.oauth?.authorizationEndpoint}?response_type=code&state=${encodeURIComponent(started.state)}&code_challenge=${started.challenge}&code_challenge_method=S256&connection_id=${connectionId}`,
        expiresAt
      };
    });
  }
  async authorization(context: TenantContext, authorizationId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,connection_id "connectionId",provider,requested_scopes "requestedScopes",return_target "returnTarget",expires_at "expiresAt",consumed_at "consumedAt",created_at "createdAt" FROM connection_authorization_transactions WHERE workspace_id=$1 AND id=$2`,
            [context.workspaceId, connectorId.parse(authorizationId)]
          )
        ).rows[0]
    );
  }
  async activate(context: TenantContext, connectionId: string, input: unknown) {
    const value = z
      .object({
        state: z.string().min(20),
        grantedScopes: z.array(z.string()),
        accountId: z.string().min(1),
        accountLabel: z.string().min(1),
        credentialReference: z.string().startsWith("credential://")
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const transaction = await client.query(
        `UPDATE connection_authorization_transactions SET consumed_at=clock_timestamp() WHERE workspace_id=$1 AND connection_id=$2 AND state_hash=$3 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,
        [context.workspaceId, connectorId.parse(connectionId), sha(value.state)]
      );
      if (transaction.rowCount !== 1)
        throw new HumanTaskAuthorizationError("OAUTH_STATE_INVALID_OR_REPLAYED");
      const row = (
        await client.query<{ manifest: unknown; requested_scopes: string[] }>(
          `SELECT manifest.manifest,connection.requested_scopes FROM connections connection JOIN connector_manifest_versions manifest ON manifest.workspace_id=connection.workspace_id AND manifest.id=connection.connector_manifest_id WHERE connection.workspace_id=$1 AND connection.id=$2 AND connection.state='authorizing' FOR UPDATE`,
          [context.workspaceId, connectionId]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("CONNECTION_NOT_AUTHORIZING");
      const manifest = validateManifest(row.manifest);
      const scopes = reconcileScopes(manifest, row.requested_scopes, value.grantedScopes);
      const nextState = scopes.reauthorizationRequired ? "reauthorization_required" : "active";
      await client.query(
        `UPDATE connections SET state=$3,granted_scopes=$4,external_account_id=$5,external_account_label=$6,credential_reference=$7,current_operation=NULL,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [
          context.workspaceId,
          connectionId,
          nextState,
          scopes.grantedScopes,
          value.accountId,
          value.accountLabel,
          value.credentialReference
        ]
      );
      await client.query(
        `INSERT INTO connection_scope_snapshots(workspace_id,id,connection_id,requested_scopes,granted_scopes,missing_required_scopes,manifest_version) VALUES($1,$2,$3,$4,$5,$6,'current')`,
        [
          context.workspaceId,
          createId(),
          connectionId,
          row.requested_scopes,
          scopes.grantedScopes,
          scopes.missingRequired
        ]
      );
      for (const source of recordedSources(manifest.key))
        await client.query(
          `INSERT INTO provider_source_inventory(workspace_id,connection_id,external_source_id,source_kind,display_name,parent_external_id,estimated_objects,selectable,limitation,provider_version,permission_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT(workspace_id,connection_id,external_source_id) DO UPDATE SET display_name=EXCLUDED.display_name,estimated_objects=EXCLUDED.estimated_objects,selectable=EXCLUDED.selectable,limitation=EXCLUDED.limitation,provider_version=EXCLUDED.provider_version,permission_hash=EXCLUDED.permission_hash,deleted_at=NULL,discovered_at=clock_timestamp()`,
          [
            context.workspaceId,
            connectionId,
            source.id,
            source.kind,
            source.name,
            source.parentId ?? null,
            source.estimatedObjects,
            source.selectable,
            source.limitation ?? null,
            manifest.version,
            sha(`${manifest.key}:${source.id}:recorded-permissions`)
          ]
        );
      return { connectionId, state: nextState, accountLabel: value.accountLabel, ...scopes };
    });
  }
  async sync(context: TenantContext, connectionId: string, input: unknown) {
    const value = connectorSyncRequestSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const active = await client.query(
        `SELECT 1 FROM connections WHERE workspace_id=$1 AND id=$2 AND state IN ('active','degraded') FOR UPDATE`,
        [context.workspaceId, connectorId.parse(connectionId)]
      );
      if (!active.rowCount) throw new HumanTaskAuthorizationError("CONNECTION_NOT_SYNCABLE");
      const id = createId();
      await client.query(
        `INSERT INTO connection_sync_runs(workspace_id,id,connection_id,mode,state,object_types) VALUES($1,$2,$3,$4,'queued',$5)`,
        [context.workspaceId, id, connectionId, value.mode, value.objectTypes ?? []]
      );
      await client.query(
        `UPDATE connections SET current_operation=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, connectionId, `sync:${value.mode}`]
      );
      return { id, connectionId, ...value, state: "queued" };
    });
  }
  async syncs(context: TenantContext, connectionId: string, syncId?: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,connection_id "connectionId",mode,state,object_types "objectTypes",processed_count "processedCount",deleted_count "deletedCount",permission_change_count "permissionChangeCount",attempt,error_kind "errorKind",error_detail "errorDetail",started_at "startedAt",completed_at "completedAt",created_at "createdAt" FROM connection_sync_runs WHERE workspace_id=$1 AND connection_id=$2 AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC`,
            [
              context.workspaceId,
              connectorId.parse(connectionId),
              syncId ? connectorId.parse(syncId) : null
            ]
          )
        ).rows
    );
  }
  async transition(context: TenantContext, connectionId: string, action: string) {
    const states: Record<string, string> = {
      pause: "disabled",
      resume: "active",
      reauthorize: "reauthorization_required",
      reconcile: "active"
    };
    const state = states[action];
    if (!state) throw new HumanTaskConflictError("INVALID_CONNECTION_ACTION");
    return withTenantTransaction(this.pool, context, async (client) => {
      const row = (
        await client.query<Record<string, unknown>>(
          `UPDATE connections SET state=$3,current_operation=$4,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state NOT IN ('deleting','deleted') RETURNING id,state,current_operation "currentOperation"`,
          [
            context.workspaceId,
            connectorId.parse(connectionId),
            state,
            action === "reconcile" ? "reconciliation" : null
          ]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("CONNECTION_NOT_FOUND");
      if (action === "reconcile")
        await client.query(
          `INSERT INTO connector_reconciliations(workspace_id,id,connection_id,state) VALUES($1,$2,$3,'queued')`,
          [context.workspaceId, createId(), connectionId]
        );
      return row;
    });
  }
  async remove(context: TenantContext, connectionId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const row = (
        await client.query<Record<string, unknown>>(
          `UPDATE connections SET state='deleting',credential_reference=NULL,encrypted_credential=NULL,current_operation='revoke_and_delete',deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state<>'deleted' RETURNING id,state,deleted_at "deletionStartedAt"`,
          [context.workspaceId, connectorId.parse(connectionId)]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("CONNECTION_NOT_FOUND");
      return { ...row, activityStopped: true, retentionDeletionQueued: true };
    });
  }

  async sourceSurface(context: TenantContext, connectionId: string) {
    connectorId.parse(connectionId);
    return withTenantTransaction(this.pool, context, async (client) => {
      const connection = (
        await client.query<{ connector_key: string }>(
          `SELECT connector_key FROM connections WHERE workspace_id=$1 AND id=$2 AND state<>'deleted'`,
          [context.workspaceId, connectionId]
        )
      ).rows[0];
      if (!connection) throw new HumanTaskAuthorizationError("CONNECTION_NOT_FOUND");
      const sources = (
        await client.query<Record<string, unknown>>(
          `SELECT external_source_id "id",source_kind "kind",display_name "name",parent_external_id "parentId",estimated_objects "estimatedObjects",selectable,limitation,provider_version "providerVersion" FROM provider_source_inventory WHERE workspace_id=$1 AND connection_id=$2 AND deleted_at IS NULL ORDER BY source_kind,display_name`,
          [context.workspaceId, connectionId]
        )
      ).rows;
      const selection = (
        await client.query<Record<string, unknown>>(
          `SELECT mode,source_ids "sourceIds",include_rules "include",exclude_rules "exclude",estimated_objects "estimatedObjects",revision,updated_at "updatedAt" FROM connection_source_selections WHERE workspace_id=$1 AND connection_id=$2`,
          [context.workspaceId, connectionId]
        )
      ).rows[0] ?? {
        mode: "all",
        sourceIds: [],
        include: [],
        exclude: [],
        estimatedObjects: sources.reduce(
          (total, source) => total + Number(source.estimatedObjects ?? 0),
          0
        ),
        revision: 0
      };
      const certification = (
        await client.query<Record<string, unknown>>(
          `SELECT engineering_status "engineeringStatus",live_status "liveStatus",external_gate "externalGate",capabilities,limitations,certified_at "certifiedAt" FROM provider_connector_certifications WHERE workspace_id=$1 AND connector_key=$2 ORDER BY certified_at DESC LIMIT 1`,
          [context.workspaceId, connection.connector_key]
        )
      ).rows[0];
      return { sources, selection, certification, connectorKey: connection.connector_key };
    });
  }

  async updateSourceSelection(context: TenantContext, connectionId: string, input: unknown) {
    const value = z
      .object({
        mode: z.enum(["all", "selected"]),
        sourceIds: z.array(z.string().min(1)).max(500),
        include: z.array(z.string().max(300)).max(100),
        exclude: z.array(z.string().max(300)).max(100),
        expectedRevision: z.number().int().nonnegative()
      })
      .strict()
      .parse(input);
    connectorId.parse(connectionId);
    return withTenantTransaction(this.pool, context, async (client) => {
      const rows = (
        await client.query<{
          id: string;
          kind: ProviderSource["kind"];
          name: string;
          estimatedObjects: number;
          selectable: boolean;
          limitation?: string;
        }>(
          `SELECT external_source_id id,source_kind kind,display_name name,estimated_objects "estimatedObjects",selectable,limitation FROM provider_source_inventory WHERE workspace_id=$1 AND connection_id=$2 AND deleted_at IS NULL`,
          [context.workspaceId, connectionId]
        )
      ).rows;
      const selection = validateSourceSelection(rows, value);
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO connection_source_selections(workspace_id,connection_id,mode,source_ids,include_rules,exclude_rules,estimated_objects,revision,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,1,$8)
         ON CONFLICT(workspace_id,connection_id) DO UPDATE SET mode=EXCLUDED.mode,source_ids=EXCLUDED.source_ids,include_rules=EXCLUDED.include_rules,exclude_rules=EXCLUDED.exclude_rules,estimated_objects=EXCLUDED.estimated_objects,revision=connection_source_selections.revision+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()
         WHERE connection_source_selections.revision=$9
         RETURNING mode,source_ids "sourceIds",include_rules "include",exclude_rules "exclude",estimated_objects "estimatedObjects",revision,updated_at "updatedAt"`,
        [
          context.workspaceId,
          connectionId,
          selection.mode,
          selection.sourceIds,
          selection.include,
          selection.exclude,
          selection.estimatedObjects,
          context.principalId,
          value.expectedRevision
        ]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("SOURCE_SELECTION_REVISION_CONFLICT");
      return result.rows[0];
    });
  }

  async configureHttp(context: TenantContext, connectionId: string, input: unknown) {
    const value = liveHttpConfigurationSchema.parse(input);
    const endpoint = new URL(value.endpoint);
    endpoint.username = "";
    endpoint.password = "";
    endpoint.hash = "";
    return withTenantTransaction(this.pool, context, async (client) => {
      const credential = value.authorization
        ? encryptCredential(value.authorization, this.#credentialKey)
        : null;
      const row = (
        await client.query<Record<string, unknown>>(
          `UPDATE connections
           SET runtime_configuration=jsonb_build_object('endpoint',$3::text,'method',$4::text,'timeoutMs',$5::integer),
               encrypted_credential=$6,credential_reference=CASE WHEN $6::text IS NULL THEN NULL ELSE 'credential://connections/'||id::text END,
               state='draft',external_account_label=$7,current_operation='connection_test',updated_at=clock_timestamp()
           WHERE workspace_id=$1 AND id=$2 AND connector_key IN ('generic-rest','signed-webhook') AND state NOT IN ('deleting','deleted')
           RETURNING id,connector_key "connectorKey",display_name "displayName",state,runtime_configuration->>'endpoint' endpoint,runtime_configuration->>'method' method,encrypted_credential IS NOT NULL "authorizationConfigured"`,
          [
            context.workspaceId,
            connectorId.parse(connectionId),
            endpoint.toString(),
            value.method,
            value.timeoutMs,
            credential,
            endpoint.host
          ]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("HTTP_CONNECTION_NOT_FOUND");
      return row;
    });
  }

  async httpConfiguration(context: TenantContext, connectionId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const row = (
        await client.query<{
          id: string;
          connector_key: "generic-rest" | "signed-webhook";
          runtime_configuration: { endpoint?: string; method?: string; timeoutMs?: number };
          encrypted_credential?: string;
        }>(
          `SELECT id,connector_key,runtime_configuration,encrypted_credential FROM connections WHERE workspace_id=$1 AND id=$2 AND connector_key IN ('generic-rest','signed-webhook') AND state NOT IN ('deleting','deleted')`,
          [context.workspaceId, connectorId.parse(connectionId)]
        )
      ).rows[0];
      if (!row?.runtime_configuration.endpoint) return undefined;
      return {
        connectionId: row.id,
        connectorKey: row.connector_key,
        endpoint: row.runtime_configuration.endpoint,
        method: (row.runtime_configuration.method ?? "POST") as "POST" | "PUT" | "PATCH",
        timeoutMs: Number(row.runtime_configuration.timeoutMs ?? 10000),
        ...(row.encrypted_credential
          ? { authorization: decryptCredential(row.encrypted_credential, this.#credentialKey) }
          : {})
      };
    });
  }

  async recordHttpReceipt(context: TenantContext, input: Readonly<Record<string, unknown>>) {
    const value = z
      .object({
        connectionId: z.string().uuid(),
        runId: z.string().uuid().optional(),
        nodeKey: z.string().min(1).max(200).optional(),
        operationId: z.string().min(1).max(300),
        requestMethod: z.string().min(1).max(12),
        requestUrlHash: z.string().length(64),
        requestBodyHash: z.string().length(64),
        responseStatus: z.number().int().min(100).max(599).optional(),
        responseBodyHash: z.string().length(64).optional(),
        responseExcerpt: z.unknown().optional(),
        durationMs: z.number().int().nonnegative(),
        state: z.enum(["succeeded", "failed", "uncertain"]),
        errorCode: z.string().max(200).optional()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      const row = (
        await client.query<Record<string, unknown>>(
          `INSERT INTO connection_action_receipts(workspace_id,id,connection_id,run_id,node_key,operation_id,request_method,request_url_hash,request_body_hash,response_status,response_body_hash,response_excerpt,duration_ms,state,error_code)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT(workspace_id,connection_id,operation_id) DO NOTHING
           RETURNING id,connection_id "connectionId",run_id "runId",node_key "nodeKey",operation_id "operationId",response_status "responseStatus",response_excerpt "responseExcerpt",duration_ms "durationMs",state,error_code "errorCode",created_at "createdAt"`,
          [
            context.workspaceId,
            id,
            value.connectionId,
            value.runId ?? null,
            value.nodeKey ?? null,
            value.operationId,
            value.requestMethod,
            value.requestUrlHash,
            value.requestBodyHash,
            value.responseStatus ?? null,
            value.responseBodyHash ?? null,
            value.responseExcerpt ?? null,
            value.durationMs,
            value.state,
            value.errorCode ?? null
          ]
        )
      ).rows[0];
      if (value.operationId.startsWith("connection-test:"))
        await client.query(
          `UPDATE connections SET state=$3,last_success_at=CASE WHEN $3='active' THEN clock_timestamp() ELSE last_success_at END,health_checked_at=clock_timestamp(),health_latency_ms=$4,current_operation=NULL,error_count=CASE WHEN $3='active' THEN 0 ELSE error_count+1 END,error_summary=CASE WHEN $3='active' THEN NULL ELSE jsonb_build_object('code',$5::text) END,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
          [
            context.workspaceId,
            value.connectionId,
            value.state === "succeeded" ? "active" : "degraded",
            value.durationMs,
            value.errorCode ?? null
          ]
        );
      return row ?? { duplicate: true, operationId: value.operationId };
    });
  }

  async httpReceipts(context: TenantContext, connectionId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,run_id "runId",node_key "nodeKey",operation_id "operationId",request_method "requestMethod",response_status "responseStatus",response_excerpt "responseExcerpt",duration_ms "durationMs",state,error_code "errorCode",created_at "createdAt" FROM connection_action_receipts WHERE workspace_id=$1 AND connection_id=$2 ORDER BY created_at DESC LIMIT 50`,
            [context.workspaceId, connectorId.parse(connectionId)]
          )
        ).rows
    );
  }
}
