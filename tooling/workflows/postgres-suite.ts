import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { WorkflowDefinition } from "../../packages/contracts/src/index.js";
import { buildApp } from "../../apps/api/src/app.js";
import type { AuthService } from "../../apps/api/src/auth.js";
import {
  contentHash,
  createPool,
  migrate,
  PostgresVersionedWorkflowRepository,
  PostgresWorkflowRepository,
  seedSyntheticTenants,
  SEED,
  withTenantTransaction
} from "../../packages/db/src/index.js";

const IMAGE =
  "pgvector/pgvector:0.8.1-pg17-trixie@sha256:137f044b0efe3d57f39b972b9b53641b1f2045b99d879e298bbf514a25787dcf";
const containerName = `knotline-m06-workflows-${process.pid}-${Date.now()}`;
const password = "local-only-m06-workflow-password";
type DatabasePool = ReturnType<typeof createPool>;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function docker(...args: string[]) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

async function startPostgres() {
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_DB=knotline",
    "--env",
    "POSTGRES_USER=knotline_local",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    IMAGE
  );
  let port = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    port = docker("port", containerName, "5432/tcp").match(/:(\d+)$/u)?.[1] ?? "";
    if (port) break;
    await delay(100);
  }
  assert(port, "PostgreSQL did not publish a local port");
  const adminUrl = `postgresql://knotline_local:${password}@127.0.0.1:${port}/knotline`;
  const pool = createPool(adminUrl, { max: 20 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return { adminUrl, pool };
    } catch {
      await delay(250);
    }
  }
  throw new Error("PostgreSQL did not become ready");
}

const definition = (name = "Incident response"): WorkflowDefinition => ({
  schemaVersion: 1,
  name,
  description: "Coordinate {{team}} response",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  nodes: [
    {
      key: "start",
      kind: "trigger",
      name: "Incident opened",
      description: "",
      position: { x: 0, y: 0 },
      configuration: { triggerType: "event" }
    },
    {
      key: "triage",
      kind: "human",
      name: "Triage",
      description: "",
      position: { x: 240, y: 0 },
      configuration: { assignment: "owner" }
    },
    {
      key: "approval",
      kind: "approval",
      name: "Approve response",
      description: "",
      position: { x: 480, y: 0 },
      configuration: { policy: "workspace_owner" }
    }
  ],
  edges: [
    { key: "start_triage", source: "start", target: "triage" },
    { key: "triage_approval", source: "triage", target: "approval" }
  ]
});

async function runSuite(pool: DatabasePool) {
  const repository = new PostgresVersionedWorkflowRepository(pool);
  const contextA = { workspaceId: SEED.workspaceA, principalId: SEED.userA, requestId: "m06-a" };
  const contextB = { workspaceId: SEED.workspaceB, principalId: SEED.userB, requestId: "m06-b" };
  const workflowId = await repository.import(contextA, definition());
  const draft = await repository.getDraft(contextA, workflowId);
  assert(
    draft?.revision === 1 && draft.definition.nodes.length === 3,
    "Imported draft was incomplete"
  );
  assert(draft.contentHash === contentHash(draft.definition), "Canonical content hash drifted");

  const [first, second] = await Promise.all([
    repository.saveDraft(contextA, workflowId, draft.revision, {
      ...draft.definition,
      description: "First concurrent save"
    }),
    repository.saveDraft(contextA, workflowId, draft.revision, {
      ...draft.definition,
      description: "Second concurrent save"
    })
  ]);
  assert(
    [first, second].filter((value) => value === "conflict").length === 1,
    "Concurrent draft edits did not produce exactly one conflict"
  );
  const current = await repository.getDraft(contextA, workflowId);
  assert(current?.revision === 2, "Draft revision did not advance once");

  const invalidDefinition: WorkflowDefinition = {
    ...current.definition,
    nodes: current.definition.nodes.filter(({ kind }) => kind !== "trigger")
  };
  const invalidSave = await repository.saveDraft(
    contextA,
    workflowId,
    current.revision,
    invalidDefinition
  );
  assert(invalidSave && invalidSave !== "conflict", "Invalid draft should remain editable");
  const invalidFindings = await repository.validateDraft(contextA, workflowId);
  assert(
    invalidFindings?.some(({ code }) => code === "WF_TRIGGER_REQUIRED"),
    "Invalid graph finding was missing"
  );
  const blocked = await repository.publish(
    contextA,
    workflowId,
    invalidSave.revision,
    "Must not publish"
  );
  assert(blocked && blocked !== "conflict" && !blocked.published, "Invalid graph was published");

  const repaired = await repository.saveDraft(
    contextA,
    workflowId,
    invalidSave.revision,
    definition()
  );
  assert(repaired && repaired !== "conflict", "Valid repair was not saved");
  const published = await repository.publish(
    contextA,
    workflowId,
    repaired.revision,
    "Initial verified release"
  );
  assert(
    published &&
      published !== "conflict" &&
      published.published &&
      published.publishedVersion === 1,
    "Valid workflow was not published"
  );

  const immutable = await Promise.allSettled([
    withTenantTransaction(pool, contextA, (client) =>
      client.query(
        "UPDATE workflow_versions SET definition='{}'::jsonb WHERE workspace_id=$1 AND workflow_id=$2 AND version=1",
        [contextA.workspaceId, workflowId]
      )
    )
  ]);
  assert(immutable[0]?.status === "rejected", "Published version was mutable");
  const publishedVersion = await repository.version(contextA, workflowId, 1);
  assert(
    publishedVersion?.contentHash === published.contentHash &&
      contentHash(publishedVersion.definition) === published.contentHash,
    "Published bytes or hash changed"
  );

  const nextDraft = await repository.getDraft(contextA, workflowId);
  assert(nextDraft?.version === 2, "Publishing did not create the next editable draft");
  const changed = await repository.saveDraft(contextA, workflowId, nextDraft.revision, {
    ...nextDraft.definition,
    name: "Incident response v2",
    nodes: [
      ...nextDraft.definition.nodes,
      {
        key: "notify",
        kind: "human",
        name: "Notify stakeholders",
        description: "",
        position: { x: 720, y: 0 },
        configuration: {}
      }
    ],
    edges: [
      ...nextDraft.definition.edges,
      { key: "approval_notify", source: "approval", target: "notify" }
    ]
  });
  assert(changed && changed !== "conflict", "Second draft was not saved");
  const diff = (await repository.diff(contextA, workflowId, 1, 2)) as {
    addedNodes?: readonly string[];
  };
  assert(diff.addedNodes?.includes("notify"), "Version diff omitted the added node");
  const restored = await repository.restore(contextA, workflowId, 1);
  assert(
    restored?.version === 3 && restored.definition.name === definition().name,
    "Version restore did not create a new draft"
  );

  const exported = await repository.export(contextA, workflowId, 1);
  const importedId = await repository.import(contextA, exported);
  const imported = await repository.getDraft(contextA, importedId);
  assert(
    imported?.contentHash === published.contentHash,
    "Import/export round trip changed content"
  );

  const folderId = await repository.createFolder(contextA, "Operations");
  const tagId = await repository.createTag(contextA, "Critical", "rose");
  assert(
    (await repository.folders(contextA)).some(({ id }) => id === folderId) &&
      (await repository.tags(contextA)).some(({ id }) => id === tagId),
    "Folder or tag persistence failed"
  );
  const template = await repository.createTemplate(contextA, importedId, {
    name: "Incident response template",
    description: "Reusable response",
    variables: [{ key: "team", required: true }]
  });
  assert(template, "Workspace template creation failed");
  const missingVariable = await Promise.allSettled([
    repository.instantiateTemplate(contextA, template.id, {})
  ]);
  assert(missingVariable[0]?.status === "rejected", "Required template variable was ignored");
  const instantiatedId = await repository.instantiateTemplate(contextA, template.id, {
    team: "Platform"
  });
  assert(instantiatedId, "Template instantiation failed");

  const crossTenant = await repository.getDraft(contextB, workflowId);
  assert(!crossTenant, "RLS exposed a workflow draft across tenants");
  const auditCount = await withTenantTransaction(pool, contextA, async (client) =>
    Number(
      (
        await client.query<{ count: string }>(
          "SELECT count(*) FROM audit_events WHERE workspace_id=$1 AND resource_id=$2",
          [contextA.workspaceId, workflowId]
        )
      ).rows[0]?.count ?? 0
    )
  );
  assert(auditCount >= 5, "Workflow lifecycle audit evidence was incomplete");

  const app = await buildApp({
    environment: "ci",
    logLevel: false,
    webOrigin: "http://localhost:5173",
    repository: new PostgresWorkflowRepository(pool),
    workflowDefinitions: repository,
    auth: {
      authenticate: () =>
        Promise.resolve({
          identity: {
            sessionId: "30000000-0000-4000-8000-000000000001",
            familyId: "30000000-0000-4000-8000-000000000002",
            user: {
              id: SEED.userA,
              email: "maya@northstar.example",
              displayName: "Maya Chen",
              status: "active",
              locale: "en",
              timezone: "UTC"
            },
            activeWorkspaceId: SEED.workspaceA,
            issuedAt: new Date(0).toISOString(),
            lastUsedAt: new Date(0).toISOString(),
            idleExpiresAt: new Date(86_400_000).toISOString(),
            absoluteExpiresAt: new Date(86_400_000).toISOString(),
            deviceSummary: "M06 API suite"
          },
          csrfToken: "m06-csrf"
        }),
      verifyMutation: () => undefined
    } as unknown as AuthService
  });
  try {
    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${SEED.workspaceA}/workflows`
    });
    assert(listResponse.statusCode === 200, "Versioned workflow list API failed");
    const draftResponse = await app.inject({
      method: "GET",
      url: `/v1/workflows/${workflowId}/draft`
    });
    assert(draftResponse.statusCode === 200, "Workflow draft API failed");
    const staleResponse = await app.inject({
      method: "PUT",
      url: `/v1/workflows/${workflowId}/draft`,
      headers: { "if-match": '"stale"', origin: "http://localhost:5173" },
      payload: restored.definition
    });
    assert(staleResponse.statusCode === 412, "Draft API ignored a stale ETag");
    const versionResponse = await app.inject({
      method: "GET",
      url: `/v1/workflows/${workflowId}/versions/1`
    });
    assert(versionResponse.statusCode === 200, "Immutable version API failed");
  } finally {
    await app.close();
  }

  return {
    draft: { import: true, optimisticConflict: true, atomicRevision: true },
    validation: { stableFindings: true, invalidPublishBlocked: true },
    publication: { immutable: true, hashStable: true, nextDraft: true },
    versions: {
      list: (await repository.versions(contextA, workflowId)).length,
      diff: true,
      restore: true
    },
    portability: { exportImportRoundTrip: true },
    organization: { folders: true, tags: true },
    templates: { variables: true, instantiate: true },
    isolation: { rls: true },
    api: { list: true, draft: true, etagConflict: true, version: true },
    auditEvents: auditCount
  };
}

let adminPool: DatabasePool | undefined;
let runtimePool: DatabasePool | undefined;
try {
  const started = await startPostgres();
  adminPool = started.pool;
  await migrate(started.adminUrl);
  await seedSyntheticTenants(adminPool);
  await adminPool.query(
    "ALTER ROLE knotline_runtime LOGIN PASSWORD 'local-only-m06-runtime-password'"
  );
  const runtimeUrl = new URL(started.adminUrl);
  runtimeUrl.username = "knotline_runtime";
  runtimeUrl.password = "local-only-m06-runtime-password";
  runtimePool = createPool(runtimeUrl.toString(), { max: 20 });
  const result = await runSuite(runtimePool);
  const directory = resolve("artifacts/security/M06");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "versioned-workflows.json"),
    `${JSON.stringify({ schemaVersion: 1, image: IMAGE, result }, null, 2)}\n`
  );
  process.stdout.write("M06 versioned workflow suite passed.\n");
} catch (error) {
  const logs = spawnSync("docker", ["logs", "--tail", "200", containerName], { encoding: "utf8" });
  process.stderr.write(logs.stdout ?? "");
  process.stderr.write(logs.stderr ?? "");
  throw error;
} finally {
  await runtimePool?.end();
  await adminPool?.end();
  spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
}
