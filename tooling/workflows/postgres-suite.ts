import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { WorkflowDefinition } from "../../packages/contracts/src/index.js";
import { buildApp } from "../../apps/api/src/app.js";
import type { AuthService } from "../../apps/api/src/auth.js";
import { WorkflowGenerationService } from "../../apps/api/src/workflow-generation.js";
import {
  contentHash,
  createPool,
  migrate,
  PostgresCollaborationRepository,
  PostgresRuntimeRepository,
  PostgresHumanTaskRepository,
  PostgresTaskAdministrationRepository,
  PostgresVersionedWorkflowRepository,
  PostgresWorkflowGenerationRepository,
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
  const generationRepository = new PostgresWorkflowGenerationRepository(pool);
  const collaborationRepository = new PostgresCollaborationRepository(pool);
  const runtimeRepository = new PostgresRuntimeRepository(pool);
  const humanTaskRepository = new PostgresHumanTaskRepository(pool);
  const taskAdministration = new PostgresTaskAdministrationRepository(pool);
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

  const durableRun = await runtimeRepository.startRun(contextA, workflowId, {
    input: { incidentId: "fixture-1" },
    idempotencyKey: "runtime-start-fixture-0001",
    maximumQuantity: "10",
    policyVersion: "default-v1"
  });
  const duplicateRun = await runtimeRepository.startRun(contextA, workflowId, {
    input: { incidentId: "fixture-1" },
    idempotencyKey: "runtime-start-fixture-0001",
    maximumQuantity: "10",
    policyVersion: "default-v1"
  });
  assert(duplicateRun.id === durableRun.id, "Idempotent run start created a duplicate");
  assert(durableRun.plan?.length === 3, "Published workflow did not compile into durable tasks");
  const taskRows = await humanTaskRepository.list(contextA, { view: "all" });
  const triageTask = taskRows.find((task) => task.node_key === "triage");
  assert(typeof triageTask?.id === "string", "Human task projection was not created");
  assert(
    (await humanTaskRepository.list(contextB, { view: "all" })).length === 0,
    "Human task inbox crossed a tenant boundary"
  );
  await withTenantTransaction(pool, contextA, (client) =>
    client.query(
      "UPDATE task_runs SET state='ready',state_version=state_version+1 WHERE workspace_id=$1 AND id=$2",
      [contextA.workspaceId, triageTask.id]
    )
  );
  const claim = await humanTaskRepository.claim(contextA, triageTask.id, {
    expectedVersion: 1,
    idempotencyKey: "human-task-claim-fixture-0001"
  });
  assert(claim.assignmentVersion === 2, "Atomic task claim did not advance its fence");
  const savedDraft = await humanTaskRepository.saveDraft(contextA, triageTask.id, {
    schemaVersion: 1,
    expectedVersion: 0,
    values: { response: "Investigated" }
  });
  assert(savedDraft.version === 1, "Human task draft was not versioned");
  const submitted = await humanTaskRepository.submit(contextA, triageTask.id, {
    schemaVersion: 1,
    expectedVersion: 3,
    idempotencyKey: "human-task-submit-fixture-0001",
    values: { response: "Proceed" }
  });
  const repeatedSubmission = await humanTaskRepository.submit(contextA, triageTask.id, {
    schemaVersion: 1,
    expectedVersion: 3,
    idempotencyKey: "human-task-submit-fixture-0001",
    values: { response: "Proceed" }
  });
  assert(submitted.id === repeatedSubmission.id, "Task submission was not idempotent");
  const queue = await taskAdministration.createQueue(contextA, {
    name: "Renewal operations",
    routingMode: "least_loaded",
    capacity: 100,
    fallbackOwnerId: SEED.userA
  });
  assert(typeof queue.id === "string", "Task queue was not created");
  await taskAdministration.putQueueMember(contextA, String(queue.id), SEED.userA, {
    principalType: "user",
    skills: ["renewals"],
    capacity: 20
  });
  const policy = await taskAdministration.publishRoutingPolicy(contextA, String(queue.id), {
    version: 1,
    rules: [{ field: "category", operator: "equals", value: "renewal", skill: "renewals" }]
  });
  const simulation = await taskAdministration.simulateRouting(contextA, String(queue.id), {
    category: "renewal"
  });
  assert(
    policy.version === 1 && simulation.selectedPrincipalId === SEED.userA,
    "Task routing was not deterministic"
  );
  assert(
    (await taskAdministration.listQueues(contextB)).length === 0,
    "Task queues crossed a tenant boundary"
  );

  const taskTemplate = await taskAdministration.createTemplate(contextA, {
    name: "Renewal decision",
    formSchema: {
      schemaVersion: 1,
      title: "Decision",
      fields: [
        {
          key: "decision",
          label: "Decision",
          type: "choice",
          required: true,
          options: [{ value: "approve", label: "Approve" }]
        }
      ]
    },
    outputSchema: { type: "object" },
    defaults: { decision: "approve" }
  });
  const templatePublication = await taskAdministration.publishTemplate(
    contextA,
    String(taskTemplate.id)
  );
  const templatePreview = await taskAdministration.previewTemplate(
    contextA,
    String(taskTemplate.id)
  );
  assert(
    templatePublication.version === 1 && templatePreview.sideEffects === false,
    "Task template preview or publication failed"
  );

  const cleanChecksum = `sha256:${"a".repeat(64)}`;
  const upload = await taskAdministration.createUpload(contextA, triageTask.id, {
    purpose: "task_attachment",
    mediaType: "application/pdf",
    sizeBytes: 128,
    checksum: cleanChecksum,
    idempotencyKey: "task-upload-fixture-clean-0001"
  });
  const completedUpload = await taskAdministration.completeUpload(
    contextA,
    String(upload.upload_id),
    {
      checksum: cleanChecksum,
      sizeBytes: 128,
      malwareResult: "clean"
    }
  );
  const download = await taskAdministration.download(contextA, String(completedUpload.artifactId));
  assert(download.expiresInSeconds === 60, "Clean task artifact was not reauthorized for download");
  const maliciousChecksum = `sha256:${"b".repeat(64)}`;
  const maliciousUpload = await taskAdministration.createUpload(contextA, triageTask.id, {
    purpose: "task_attachment",
    mediaType: "text/plain",
    sizeBytes: 64,
    checksum: maliciousChecksum,
    idempotencyKey: "task-upload-fixture-malware-0001"
  });
  const quarantined = await taskAdministration.completeUpload(
    contextA,
    String(maliciousUpload.upload_id),
    {
      checksum: maliciousChecksum,
      sizeBytes: 64,
      malwareResult: "quarantined"
    }
  );
  const blockedDownload = await Promise.allSettled([
    taskAdministration.download(contextA, String(quarantined.artifactId))
  ]);
  assert(blockedDownload[0]?.status === "rejected", "Quarantined artifact became downloadable");
  await runtimeRepository.transitionRun(
    contextA,
    durableRun.id,
    "queued",
    1,
    1,
    "running",
    "run.running"
  );
  const staleFence = await Promise.allSettled([
    runtimeRepository.transitionRun(
      contextA,
      durableRun.id,
      "running",
      1,
      1,
      "succeeded",
      "run.succeeded"
    )
  ]);
  assert(staleFence[0]?.status === "rejected", "Stale state version committed a transition");
  await runtimeRepository.transitionRun(
    contextA,
    durableRun.id,
    "running",
    2,
    1,
    "succeeded",
    "run.succeeded"
  );
  const durableProjection = await runtimeRepository.run(contextA, durableRun.id);
  assert(
    durableProjection?.state === "succeeded" && durableProjection.events.length === 5,
    "Durable ordered history was incomplete"
  );
  const admissionSettlement = await withTenantTransaction(pool, contextA, async (client) => {
    const reservation = await client.query<{ state: string; used_units: string }>(
      "SELECT state,used_units FROM admission_reservations WHERE workspace_id=$1 AND id=$2",
      [contextA.workspaceId, durableRun.reservationId]
    );
    const entries = await client.query<{ entry_type: string }>(
      "SELECT entry_type FROM admission_ledger_entries WHERE workspace_id=$1 AND reservation_id=$2 ORDER BY occurred_at",
      [contextA.workspaceId, durableRun.reservationId]
    );
    return {
      reservation: reservation.rows[0],
      entries: entries.rows.map((entry) => entry.entry_type)
    };
  });
  assert(
    admissionSettlement.reservation?.state === "finalized" &&
      admissionSettlement.reservation.used_units === "10" &&
      admissionSettlement.entries.join(",") === "reserve,finalize",
    "Terminal run did not settle its immutable admission reservation"
  );
  assert(
    (await runtimeRepository.run(contextB, durableRun.id)) === undefined,
    "Runtime RLS exposed a run across tenants"
  );

  const app = await buildApp({
    environment: "ci",
    logLevel: false,
    webOrigin: "http://localhost:5173",
    repository: new PostgresWorkflowRepository(pool),
    workflowDefinitions: repository,
    workflowGeneration: new WorkflowGenerationService(undefined, generationRepository),
    collaboration: collaborationRepository,
    runtime: runtimeRepository,
    humanTasks: humanTaskRepository,
    taskAdministration,
    runStarter: {
      start: () => Promise.resolve(),
      signal: () => Promise.resolve(),
      completeTask: () => Promise.resolve()
    },
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
    const generationResponse = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${SEED.workspaceA}/workflow-generations`,
      payload: {
        prompt: "Collect a request, require owner approval, and notify the requester.",
        fixture: "standard"
      }
    });
    assert(generationResponse.statusCode === 202, "Workflow generation did not queue");
    const generationId = generationResponse.json<{ data: { id: string } }>().data.id;
    await delay(20);
    const persistedGeneration = await generationRepository.get(contextA, generationId);
    assert(persistedGeneration?.lifecycle === "SUCCEEDED", "Generation lifecycle was not durable");
    assert(
      (await generationRepository.get(contextB, generationId)) === undefined,
      "Generation resource crossed tenant RLS"
    );
    const dryRunResponse = await app.inject({
      method: "POST",
      url: "/v1/workflow-dry-runs",
      payload: {
        definition: persistedGeneration.result?.definition,
        fixture: {
          input: {},
          humanSubmissions: {},
          agentOutputs: {},
          connectorOutputs: {},
          permissions: ["workflow.run"],
          entitlements: ["workflows"],
          healthyConnections: [],
          budgetMinor: 100,
          timezone: "UTC"
        }
      }
    });
    assert(
      dryRunResponse.statusCode === 200 &&
        dryRunResponse.json<{ data: { externalWrites: number } }>().data.externalWrites === 0,
      "Dry run did not prove zero external writes"
    );
    const acceptanceResponse = await app.inject({
      method: "POST",
      url: `/v1/workflow-generations/${generationId}/acceptances`,
      payload: { publish: true }
    });
    assert(
      acceptanceResponse.statusCode === 201,
      "Generated workflow was not accepted and published"
    );
    const commentResponse = await app.inject({
      method: "POST",
      url: `/v1/resources/workflow/${workflowId}/comments`,
      payload: {
        body: "**Review** <script>alert(1)</script>",
        mentionedUserIds: [SEED.userA],
        attachmentRefs: ["artifact_review_12345678"]
      }
    });
    assert(commentResponse.statusCode === 201, "Authorized workflow comment failed");
    const commentId = commentResponse.json<{ id: string }>().id;
    const threadResponse = await app.inject({
      method: "GET",
      url: `/v1/resources/workflow/${workflowId}/thread`
    });
    const threadBody = threadResponse.json<{
      data: { comments: { renderedHtml: string }[]; activity: unknown[] };
    }>().data;
    assert(
      threadResponse.statusCode === 200 &&
        threadBody.comments[0]?.renderedHtml.includes("&lt;script&gt;") &&
        !threadBody.comments[0]?.renderedHtml.includes("<script>"),
      "Comment sanitizer did not neutralize raw HTML"
    );
    assert(threadBody.activity.length === 1, "Product activity was not recorded separately");
    const unauthorizedMention = await app.inject({
      method: "POST",
      url: `/v1/resources/workflow/${workflowId}/comments`,
      payload: { body: "Hidden mention", mentionedUserIds: [SEED.userB], attachmentRefs: [] }
    });
    assert(
      unauthorizedMention.statusCode === 403,
      "Cross-tenant mention was disclosed or accepted"
    );
    const reactionResponse = await app.inject({
      method: "POST",
      url: `/v1/comments/${commentId}/reactions`,
      payload: { reaction: "thumbs_up" }
    });
    assert(reactionResponse.statusCode === 204, "Comment reaction failed");
    const followResponse = await app.inject({
      method: "POST",
      url: `/v1/workflows/${workflowId}/follows`
    });
    assert(followResponse.statusCode === 204, "Workflow follow failed");
    const editResponse = await app.inject({
      method: "PATCH",
      url: `/v1/comments/${commentId}`,
      payload: { body: "Edited review" }
    });
    assert(editResponse.statusCode === 200, "Comment edit policy rejected the author");
    const runStartResponse = await app.inject({
      method: "POST",
      url: `/v1/workflows/${workflowId}/runs`,
      payload: {
        input: { incidentId: "fixture-2" },
        idempotencyKey: "runtime-api-fixture-0002",
        maximumQuantity: "10",
        policyVersion: "default-v1"
      }
    });
    assert(runStartResponse.statusCode === 202, "Durable run start API failed");
    const runtimeId = runStartResponse.json<{ data: { id: string } }>().data.id;
    const runResponse = await app.inject({ method: "GET", url: `/v1/runs/${runtimeId}` });
    assert(runResponse.statusCode === 200, "Durable run projection API failed");
    const runListResponse = await app.inject({
      method: "GET",
      url: `/v1/workflows/${workflowId}/runs?limit=10`
    });
    assert(
      runListResponse.statusCode === 200 &&
        runListResponse.json<{ data: { id: string }[] }>().data.some((run) => run.id === runtimeId),
      "Authorized run list did not include the new run"
    );
    const streamResponse = await app.inject({
      method: "GET",
      url: `/v1/runs/${runtimeId}/stream`,
      headers: { "last-event-id": "0" }
    });
    assert(
      streamResponse.statusCode === 200 &&
        streamResponse.headers["content-type"]?.startsWith("text/event-stream") === true &&
        streamResponse.body.includes("event: run-event") &&
        streamResponse.body.includes("event: heartbeat"),
      "Resumable run event stream did not emit an event and heartbeat"
    );
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
    generation: { durable: true, tenantIsolated: true, dryRunExternalWrites: 0, published: true },
    collaboration: {
      comments: true,
      sanitized: true,
      mentionsTenantScoped: true,
      reactions: true,
      follows: true,
      activityAuditSeparated: true
    },
    runtime: {
      idempotentStart: true,
      staleFenceRejected: true,
      orderedEvents: true,
      tenantIsolated: true,
      api: true
    },
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
