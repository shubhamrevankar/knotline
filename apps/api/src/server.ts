import { createHash } from "node:crypto";
import { loadConfig } from "@knotline/config";
import {
  PostgresAuthRepository,
  PostgresCollaborationRepository,
  PostgresWorkspaceRepository,
  PostgresVersionedWorkflowRepository,
  PostgresWorkflowGenerationRepository,
  PostgresRuntimeRepository,
  PostgresHumanTaskRepository,
  PostgresTaskAdministrationRepository,
  PostgresApprovalRepository,
  PostgresAgentRepository,
  PostgresModelRepository,
  PostgresToolRepository,
  PostgresMemoryRepository,
  PostgresEvaluationRepository,
  PostgresFileRepository,
  PostgresRetrievalRepository,
  PostgresKnowledgeGraphRepository,
  PostgresConnectorRepository,
  PostgresTriggerRepository,
  PostgresNotificationRepository,
  PostgresAnalyticsRepository,
  PostgresBillingRepository,
  PostgresDeveloperRepository,
  PostgresGovernanceRepository,
  PostgresEnterpriseRepository,
  PostgresSupportRepository,
  createPool,
  migrate,
  PostgresWorkflowRepository,
  withTenantTransaction,
  seedSyntheticTenants
} from "@knotline/db";
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { buildApp } from "./app.js";
import {
  AuthService,
  type AuthMailer,
  CaptureAuthMailer,
  LocalOidcClient,
  RemoteGoogleOidcClient,
  ResendAuthMailer,
  SesAuthMailer
} from "./auth.js";
import {
  CaptureInvitationMailer,
  type InvitationMailer,
  ResendInvitationMailer,
  SesInvitationMailer,
  WorkspaceService
} from "./workspace.js";
import {
  GatewayWorkflowGenerationWorker,
  WorkflowGenerationService
} from "./workflow-generation.js";
import { KnowledgeIngestionService, S3KnowledgeObjectStore } from "./knowledge.js";

const environment = loadConfig(process.env);
if (environment.environment === "local") {
  const migrationUrl = process.env.DB_MIGRATION_URL;
  if (!migrationUrl) throw new Error("DB_MIGRATION_URL is required in local mode");
  await migrate(migrationUrl);
  const migrationPool = createPool(migrationUrl, { max: 1 });
  try {
    await seedSyntheticTenants(migrationPool);
  } finally {
    await migrationPool.end();
  }
}
const pool = createPool(environment.databaseUrl.href);
const repository = new PostgresWorkflowRepository(pool, (observation) => {
  process.stdout.write(`${JSON.stringify({ event: "database.query", ...observation })}\n`);
});
const authRepository = new PostgresAuthRepository(pool);
const workspaceRepository = new PostgresWorkspaceRepository(pool);
const workflowDefinitions = new PostgresVersionedWorkflowRepository(pool);
const gatewayUrl = process.env.MODEL_GATEWAY_URL;
const gatewayWorker = gatewayUrl
  ? new GatewayWorkflowGenerationWorker(
      gatewayUrl,
      process.env.MODEL_GATEWAY_INTERNAL_TOKEN ?? "",
      globalThis.fetch,
      (context, prompt) =>
        withTenantTransaction(pool, context, async (client) => {
          const [workspace, agents, connections, roles, knowledge] = await Promise.all([
            client.query<{ name: string; description: string | null }>(
              `SELECT name,description FROM workspaces WHERE id=$1`,
              [context.workspaceId]
            ),
            client.query<{
              id: string;
              version: number;
              name: string;
              description: string;
              purpose: string;
              tags: string[];
              tools: string[];
              output_schema: Record<string, unknown>;
            }>(
              `SELECT agent.id,version.version,agent.name,agent.description,
                      version.definition->>'purpose' purpose,
                      coalesce(ARRAY(SELECT jsonb_array_elements_text(version.definition->'tags')),'{}') tags,
                      coalesce(ARRAY(SELECT tool->>'toolKey' FROM jsonb_array_elements(version.definition->'tools') tool),'{}') tools,
                      version.definition->'outputSchema' output_schema
                 FROM agent_definitions agent
                 JOIN agent_versions version ON version.workspace_id=agent.workspace_id
                                            AND version.agent_id=agent.id
                                            AND version.version=agent.current_version
                WHERE agent.workspace_id=$1 AND agent.state='active'
                ORDER BY agent.name LIMIT 50`,
              [context.workspaceId]
            ),
            client.query<{
              id: string;
              name: string;
              provider: string;
              state: string;
              scopes: string[];
              actions: string[];
            }>(
              `SELECT connection.id,connection.display_name name,
                      manifest.manifest->>'provider' provider,connection.state,
                      connection.granted_scopes scopes,
                      coalesce(ARRAY(SELECT jsonb_array_elements_text(manifest.manifest->'actions')),'{}') actions
                 FROM connections connection
                 JOIN connector_manifest_versions manifest
                   ON manifest.workspace_id=connection.workspace_id
                  AND manifest.id=connection.connector_manifest_id
                WHERE connection.workspace_id=$1
                  AND connection.state IN ('active','degraded')
                ORDER BY connection.display_name LIMIT 50`,
              [context.workspaceId]
            ),
            client.query<{ key: string }>(
              `SELECT role_key key FROM workspace_roles WHERE workspace_id=$1 ORDER BY role_key LIMIT 50`,
              [context.workspaceId]
            ),
            client.query<{
              source_id: string;
              title: string;
              classification: "public" | "internal" | "confidential" | "restricted";
              snippet: string;
            }>(
              `SELECT source.id source_id,source.title,source.classification,
                      left(string_agg(chunk.text_content,E'\n\n' ORDER BY chunk.rank DESC,chunk.ordinal),4000) snippet
                 FROM knowledge_sources source
                 JOIN knowledge_acl_projections acl
                   ON acl.workspace_id=source.workspace_id AND acl.source_id=source.id
                  AND acl.authoritative AND acl.complete
                 JOIN LATERAL (
                   SELECT candidate.text_content,candidate.ordinal,
                          ts_rank(candidate.search_vector,plainto_tsquery('simple',$3)) rank
                     FROM knowledge_chunks candidate
                    WHERE candidate.workspace_id=source.workspace_id AND candidate.source_id=source.id
                    ORDER BY (candidate.search_vector @@ plainto_tsquery('simple',$3)) DESC,
                             rank DESC,candidate.ordinal
                    LIMIT 3
                 ) chunk ON true
                WHERE source.workspace_id=$1 AND source.state='ready'
                  AND EXISTS(
                    SELECT 1 FROM knowledge_acl_members member
                     WHERE member.workspace_id=acl.workspace_id AND member.source_id=acl.source_id
                       AND member.epoch=acl.epoch AND member.subject_kind='user' AND member.subject_id=$2
                  )
                GROUP BY source.id,source.title,source.classification,source.indexed_at
                ORDER BY max(chunk.rank) DESC,source.indexed_at DESC
                LIMIT 12`,
              [context.workspaceId, context.principalId, prompt]
            )
          ]);
          const workspaceRow = workspace.rows[0];
          return {
            workspace: {
              name: workspaceRow?.name ?? "Current workspace",
              ...(workspaceRow?.description ? { description: workspaceRow.description } : {})
            },
            agents: agents.rows.map((agent) => ({
              id: agent.id,
              version: agent.version,
              name: agent.name,
              description: agent.description,
              purpose: agent.purpose,
              tags: agent.tags,
              tools: agent.tools,
              outputSchema: agent.output_schema
            })),
            connections: connections.rows.map((connection) => ({
              id: connection.id,
              name: connection.name,
              provider: connection.provider,
              state: connection.state,
              scopes: connection.scopes,
              actions: connection.actions
            })),
            knowledge: knowledge.rows.map((source) => ({
              sourceId: source.source_id,
              title: source.title,
              classification: source.classification,
              snippet: source.snippet
            })),
            roles: roles.rows.map(({ key }) => key)
          };
        })
    )
  : undefined;
if (gatewayUrl && !process.env.MODEL_GATEWAY_INTERNAL_TOKEN)
  throw new Error("MODEL_GATEWAY_INTERNAL_TOKEN is required when MODEL_GATEWAY_URL is configured");
const workflowGeneration = new WorkflowGenerationService(
  gatewayWorker,
  new PostgresWorkflowGenerationRepository(pool)
);
const governance = new PostgresGovernanceRepository(pool);
const enterprise = new PostgresEnterpriseRepository(pool);
const support = new PostgresSupportRepository(pool);
const collaboration = new PostgresCollaborationRepository(pool);
const runtime = new PostgresRuntimeRepository(pool);
const humanTasks = new PostgresHumanTaskRepository(pool);
const taskAdministration = new PostgresTaskAdministrationRepository(pool);
const approvals = new PostgresApprovalRepository(pool);
const agents = new PostgresAgentRepository(pool);
const models = new PostgresModelRepository(pool);
const tools = new PostgresToolRepository(pool);
const memory = new PostgresMemoryRepository(pool);
if (
  environment.environment !== "local" &&
  environment.environment !== "ci" &&
  !process.env.EVALUATION_FIXTURE_KEY
)
  throw new Error("EVALUATION_FIXTURE_KEY is required outside local mode");
const evaluationKey = process.env.EVALUATION_FIXTURE_KEY
  ? Buffer.from(process.env.EVALUATION_FIXTURE_KEY, "base64")
  : createHash("sha256").update("knotline-local-evaluation-fixtures").digest();
const evaluations = new PostgresEvaluationRepository(pool, evaluationKey);
if (environment.environment !== "local" && !process.env.FILE_SCANNER_ATTESTATION_KEY)
  throw new Error("FILE_SCANNER_ATTESTATION_KEY is required outside local mode");
const scannerAttestationKey = process.env.FILE_SCANNER_ATTESTATION_KEY
  ? Buffer.from(process.env.FILE_SCANNER_ATTESTATION_KEY, "base64")
  : createHash("sha256").update("knotline-local-file-scanner-attestation").digest();
const files = new PostgresFileRepository(pool, scannerAttestationKey);
if (environment.environment !== "local" && !process.env.AUTHORIZATION_PROOF_SIGNING_KEY)
  throw new Error("AUTHORIZATION_PROOF_SIGNING_KEY is required outside local mode");
const authorizationProofKey = process.env.AUTHORIZATION_PROOF_SIGNING_KEY
  ? Buffer.from(process.env.AUTHORIZATION_PROOF_SIGNING_KEY, "base64")
  : createHash("sha256").update("knotline-local-authorization-proofs").digest();
const retrieval = new PostgresRetrievalRepository(pool, authorizationProofKey);
const resolveLocalReference = (value: string | undefined, fallback: string) => {
  const resolved = value ?? fallback;
  return resolved.startsWith("local-only:") ? resolved.slice("local-only:".length) : resolved;
};
const knowledgeObjects = new S3KnowledgeObjectStore(
  process.env.S3_KNOWLEDGE_BUCKET ?? "knotline-knowledge",
  {
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: resolveLocalReference(process.env.S3_ACCESS_KEY_REFERENCE, "knotline-local"),
    secretAccessKey: resolveLocalReference(
      process.env.S3_SECRET_KEY_REFERENCE,
      "local-only-minio-password"
    ),
    ...(["local", "ci"].includes(environment.environment)
      ? {}
      : { serverSideEncryption: "AES256" as const })
  }
);
await knowledgeObjects.ensureReady();
const knowledgeIngestion = new KnowledgeIngestionService(files, retrieval, knowledgeObjects);
const knowledgeGraph = new PostgresKnowledgeGraphRepository(pool);
if (
  environment.environment !== "local" &&
  environment.environment !== "ci" &&
  !process.env.CONNECTOR_STATE_SIGNING_KEY
)
  throw new Error("CONNECTOR_STATE_SIGNING_KEY is required outside local mode");
const connectorStateKey = process.env.CONNECTOR_STATE_SIGNING_KEY
  ? Buffer.from(process.env.CONNECTOR_STATE_SIGNING_KEY, "base64")
  : createHash("sha256").update("knotline-local-connector-state").digest();
const connectorOAuthApplications = {
  ...(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET
    ? {
        slack: {
          clientId: process.env.SLACK_CLIENT_ID,
          clientSecret: process.env.SLACK_CLIENT_SECRET,
          redirectUri: `${environment.api.publicOrigin.origin}/callbacks/v1/connections/oauth/slack`
        }
      }
    : {}),
  ...(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET
    ? {
        hubspot: {
          clientId: process.env.HUBSPOT_CLIENT_ID,
          clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
          redirectUri: `${environment.api.publicOrigin.origin}/callbacks/v1/connections/oauth/hubspot`
        }
      }
    : {})
};
const connectors = new PostgresConnectorRepository(pool, connectorStateKey, {
  apiOrigin: environment.api.publicOrigin.origin,
  applications: connectorOAuthApplications
});
const triggers = new PostgresTriggerRepository(pool);
const notifications = new PostgresNotificationRepository(pool);
const analytics = new PostgresAnalyticsRepository(pool);
const billing = new PostgresBillingRepository(pool);
const developer = new PostgresDeveloperRepository(pool);
const temporalConnection = await Connection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233"
});
const temporalClient = new Client({
  connection: temporalConnection,
  namespace: process.env.TEMPORAL_NAMESPACE ?? "default"
});
const runStarter = {
  async start(input: {
    readonly workspaceId: string;
    readonly principalId: string;
    readonly runId: string;
    readonly temporalWorkflowId: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly plan: readonly unknown[];
  }) {
    try {
      await temporalClient.workflow.start("durableWorkflowRun", {
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "knotline-system-v1",
        workflowId: input.temporalWorkflowId,
        args: [
          {
            workspaceId: input.workspaceId,
            principalId: input.principalId,
            runId: input.runId,
            input: input.input,
            plan: input.plan
          }
        ]
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
  },
  async signal(temporalWorkflowId: string, signal: "pause" | "resume" | "cancel") {
    await temporalClient.workflow.getHandle(temporalWorkflowId).signal(signal);
  },
  async completeTask(temporalWorkflowId: string, nodeKey: string) {
    await temporalClient.workflow
      .getHandle(temporalWorkflowId)
      .signal("completeHumanTask", nodeKey);
  },
  async completeApproval(
    temporalWorkflowId: string,
    nodeKey: string,
    operationId: string,
    outcome = "approve"
  ) {
    await temporalClient.workflow
      .getHandle(temporalWorkflowId)
      .signal("completeApproval", nodeKey, operationId, outcome);
  }
};
const modelRuntime = async () => {
  const provider: "openai" | "recorded" =
    process.env.MODEL_GATEWAY_PROVIDER === "openai" ? "openai" : "recorded";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  let reachable = false;
  let errorCode: string | undefined;
  try {
    const response = await fetch(
      `${process.env.MODEL_GATEWAY_URL ?? "http://127.0.0.1:4200"}/healthz`,
      { signal: controller.signal }
    );
    reachable = response.ok;
    if (!response.ok) errorCode = `HTTP_${String(response.status)}`;
  } catch (cause) {
    errorCode = cause instanceof Error ? cause.name : "MODEL_GATEWAY_UNREACHABLE";
  } finally {
    clearTimeout(timer);
  }
  return {
    reachable,
    provider,
    keyConfigured: provider === "openai" && reachable,
    disabled: process.env.MODEL_GATEWAY_DISABLED === "true",
    mappings: [
      { role: "fast", model: process.env.OPENAI_FAST_MODEL ?? "gpt-5.6-luna" },
      { role: "balanced", model: process.env.OPENAI_BALANCED_MODEL ?? "gpt-5.6-terra" },
      { role: "quality", model: process.env.OPENAI_QUALITY_MODEL ?? "gpt-5.6-sol" },
      { role: "judge", model: process.env.OPENAI_JUDGE_MODEL ?? "gpt-5.6-sol" }
    ],
    ...(errorCode ? { errorCode } : {})
  };
};
const isLocal = environment.environment === "local" || environment.environment === "ci";
const emailProvider = isLocal
  ? "capture"
  : (process.env.KNOTLINE_EMAIL_PROVIDER ?? "ses").toLowerCase();
const emailEnabled = emailProvider !== "disabled";
const googleIssuer = isLocal
  ? `${environment.api.publicOrigin.origin}/__local/oidc`
  : (process.env.GOOGLE_OIDC_ISSUER ?? "https://accounts.google.com");
const googleClientId = isLocal
  ? "knotline-local-client"
  : (process.env.GOOGLE_OIDC_CLIENT_ID ?? "");
if (!googleClientId) throw new Error("GOOGLE_OIDC_CLIENT_ID is required outside local mode");
if (!isLocal && !process.env.GOOGLE_OIDC_CLIENT_SECRET) {
  throw new Error("GOOGLE_OIDC_CLIENT_SECRET is required outside local mode");
}
if (!isLocal && (process.env.AUTH_TRANSACTION_ENCRYPTION_KEY?.length ?? 0) < 32) {
  throw new Error(
    "AUTH_TRANSACTION_ENCRYPTION_KEY must be at least 32 characters outside local mode"
  );
}
if (!isLocal && emailProvider === "ses" && !process.env.AWS_SES_REGION) {
  throw new Error("AWS_SES_REGION is required outside local mode");
}
if (!isLocal && emailEnabled && !process.env.AUTH_EMAIL_FROM) {
  throw new Error("AUTH_EMAIL_FROM is required outside local mode");
}
if (!isLocal && emailProvider === "resend" && !process.env.RESEND_API_KEY)
  throw new Error("RESEND_API_KEY is required when KNOTLINE_EMAIL_PROVIDER=resend");
if (!new Set(["capture", "ses", "resend", "disabled"]).has(emailProvider))
  throw new Error("KNOTLINE_EMAIL_PROVIDER must be ses, resend, or disabled");
if (!isLocal && !process.env.KNOTLINE_TRUSTED_PROXY) {
  throw new Error("KNOTLINE_TRUSTED_PROXY is required outside local mode");
}
const googleAuthorizationEndpoint = isLocal
  ? `${environment.api.publicOrigin.origin}/__local/oidc/authorize`
  : (process.env.GOOGLE_OIDC_AUTHORIZATION_ENDPOINT ??
    "https://accounts.google.com/o/oauth2/v2/auth");
const captureMailer = isLocal ? new CaptureAuthMailer() : undefined;
const captureInvitationMailer = isLocal ? new CaptureInvitationMailer() : undefined;
const disabledAuthMailer: AuthMailer = {
  deliverMagicLink: () => Promise.reject(new Error("EMAIL_AUTH_DISABLED"))
};
const mailer = captureMailer
  ? captureMailer
  : emailProvider === "resend"
    ? new ResendAuthMailer(
        process.env.RESEND_API_KEY ?? "",
        process.env.AUTH_EMAIL_FROM ?? "signin@localhost.invalid"
      )
    : emailProvider === "ses"
      ? new SesAuthMailer(
          process.env.AWS_SES_REGION ?? "us-east-1",
          process.env.AUTH_EMAIL_FROM ?? "signin@localhost.invalid"
        )
      : disabledAuthMailer;
const oidc = isLocal
  ? new LocalOidcClient(googleIssuer, googleClientId)
  : new RemoteGoogleOidcClient(
      googleIssuer,
      googleClientId,
      process.env.GOOGLE_OIDC_TOKEN_ENDPOINT ?? "https://oauth2.googleapis.com/token",
      process.env.GOOGLE_OIDC_JWKS_URI ?? "https://www.googleapis.com/oauth2/v3/certs",
      process.env.GOOGLE_OIDC_CLIENT_SECRET
    );
const auth = new AuthService(authRepository, mailer, oidc, {
  environment: environment.environment,
  apiOrigin: environment.api.publicOrigin.origin,
  webOrigin: environment.api.webOrigin.origin,
  encryptionKey:
    process.env.AUTH_TRANSACTION_ENCRYPTION_KEY ?? "local-only-knotline-auth-encryption-key",
  google: {
    issuer: googleIssuer,
    clientId: googleClientId,
    authorizationEndpoint: googleAuthorizationEndpoint
  }
});
const disabledInvitationMailer: InvitationMailer = {
  deliverInvitation: () => Promise.reject(new Error("INVITATION_EMAIL_DISABLED"))
};
const invitationMailer = captureInvitationMailer
  ? captureInvitationMailer
  : emailProvider === "resend"
    ? new ResendInvitationMailer(
        process.env.RESEND_API_KEY ?? "",
        process.env.AUTH_EMAIL_FROM ?? "signin@localhost.invalid"
      )
    : emailProvider === "ses"
      ? new SesInvitationMailer(
          process.env.AWS_SES_REGION ?? "us-east-1",
          process.env.AUTH_EMAIL_FROM ?? "signin@localhost.invalid"
        )
      : disabledInvitationMailer;
const workspace = new WorkspaceService(
  workspaceRepository,
  invitationMailer,
  environment.api.webOrigin.origin
);

const app = await buildApp({
  environment: environment.environment,
  logLevel: environment.logLevel,
  webOrigin: environment.api.webOrigin.origin,
  repository,
  auth,
  workspace,
  workflowDefinitions,
  workflowGeneration,
  collaboration,
  runtime,
  humanTasks,
  taskAdministration,
  approvals,
  agents,
  models,
  tools,
  memory,
  evaluations,
  files,
  retrieval,
  knowledgeIngestion,
  knowledgeGraph,
  connectors,
  connectorOAuthApplications,
  triggers,
  notifications,
  analytics,
  billing,
  developer,
  governance,
  enterprise,
  support,
  runStarter,
  modelRuntime,
  authCapabilities: { google: true, email: emailEnabled, invitations: emailEnabled },
  ...(captureMailer ? { captureMailer } : {}),
  ...(captureInvitationMailer ? { captureInvitationMailer } : {}),
  ...(process.env.KNOTLINE_TRUSTED_PROXY
    ? { trustedProxy: process.env.KNOTLINE_TRUSTED_PROXY }
    : {}),
  mutationsDisabled: process.env.KNOTLINE_MUTATIONS_DISABLED === "true"
});

app.addHook("onClose", async () => {
  await temporalConnection.close();
  knowledgeObjects.close();
  await pool.end();
});

await app.listen({ host: "0.0.0.0", port: environment.api.port });
