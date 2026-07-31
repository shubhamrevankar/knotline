import { setTimeout as delay } from "node:timers/promises";

import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";

import * as activities from "../../apps/worker/src/activities.js";
import type { WorkflowDefinition } from "../../packages/contracts/src/index.js";
import {
  createPool,
  migrate,
  PostgresRuntimeRepository,
  PostgresVersionedWorkflowRepository,
  seedSyntheticTenants,
  SEED
} from "../../packages/db/src/index.js";

const adminUrl = process.env.DB_MIGRATION_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) throw new Error("DB_MIGRATION_URL and DATABASE_URL are required");
await migrate(adminUrl);
const admin = createPool(adminUrl, { max: 2 });
await seedSyntheticTenants(admin);
await admin.end();

const pool = createPool(runtimeUrl, { max: 8 });
const context = {
  workspaceId: SEED.workspaceA,
  principalId: SEED.userA,
  requestId: "m10-temporal-smoke"
};
const definitions = new PostgresVersionedWorkflowRepository(pool);
const runtime = new PostgresRuntimeRepository(pool);
const definition: WorkflowDefinition = {
  schemaVersion: 1,
  name: "Restart-safe smoke",
  description: "Temporal execution smoke",
  inputSchema: {},
  outputSchema: {},
  nodes: [
    {
      key: "start",
      kind: "trigger",
      name: "Start",
      description: "",
      position: { x: 0, y: 0 },
      configuration: {}
    },
    {
      key: "wait",
      kind: "delay",
      name: "Wait",
      description: "",
      position: { x: 1, y: 0 },
      configuration: { delayMs: 500 }
    },
    {
      key: "finish",
      kind: "transform",
      name: "Finish",
      description: "",
      position: { x: 2, y: 0 },
      configuration: { fixtureOutput: { ok: true } }
    }
  ],
  edges: [
    { key: "start_wait", source: "start", target: "wait" },
    { key: "wait_finish", source: "wait", target: "finish" }
  ]
};
const workflowId = await definitions.import(context, definition);
const draft = await definitions.getDraft(context, workflowId);
if (!draft) throw new Error("Temporal smoke draft missing");
const published = await definitions.publish(context, workflowId, draft.revision, "Temporal smoke");
if (!published || published === "conflict" || !published.published)
  throw new Error("Temporal smoke publish failed");
const run = await runtime.startRun(context, workflowId, {
  input: {},
  idempotencyKey: "temporal-smoke-idempotency-0001",
  maximumQuantity: "10",
  policyVersion: "default-v1"
});

const address = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const connection = await Connection.connect({ address });
const nativeConnection = await NativeConnection.connect({ address });
const client = new Client({ connection });
const worker = await Worker.create({
  connection: nativeConnection,
  taskQueue: "knotline-system-v1",
  workflowsPath: new URL("../../apps/worker/src/workflows.ts", import.meta.url).pathname,
  activities
});
try {
  await worker.runUntil(async () => {
    const handle = await client.workflow.start("durableWorkflowRun", {
      taskQueue: "knotline-system-v1",
      workflowId: run.temporalWorkflowId,
      args: [
        {
          workspaceId: context.workspaceId,
          principalId: context.principalId,
          runId: run.id,
          plan: run.plan ?? []
        }
      ]
    });
    await runtime.markStartDispatched(context, run.id);
    await delay(100);
    await handle.signal("pause");
    let paused = await runtime.run(context, run.id);
    for (let attempt = 0; attempt < 40 && paused?.state !== "paused"; attempt += 1) {
      await delay(100);
      paused = await runtime.run(context, run.id);
    }
    if (paused?.state !== "paused")
      throw new Error(`Expected paused run, received ${String(paused?.state)}`);
    await handle.signal("resume");
    const result = (await handle.result()) as { state: string; completed: string[] };
    if (result.state !== "succeeded" || result.completed.length !== 3)
      throw new Error("Temporal workflow did not finish deterministically");
  });
  const projection = await runtime.run(context, run.id);
  if (
    projection?.state !== "succeeded" ||
    projection.events.length < 10 ||
    projection.tasks.some((task) => task.state !== "succeeded")
  )
    throw new Error("Durable Temporal state/event projection failed");
  process.stdout.write("M10 Temporal pause/resume/restart-safe smoke passed.\n");
} finally {
  await activities.closeActivityPool();
  await connection.close();
  await nativeConnection.close();
  await pool.end();
}
