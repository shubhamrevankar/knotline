import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { createPool, PostgresRuntimeRepository } from "../../packages/db/src/index.js";

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const workspaceId = argument("--workspace");
const principalId = argument("--principal");
const confirm = process.argv.includes("--confirm");
if (!workspaceId || !principalId) throw new Error("--workspace and --principal are required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = createPool(process.env.DATABASE_URL, { application_name: "knotline-runtime-repair" });
const repository = new PostgresRuntimeRepository(pool);
const context = { workspaceId, principalId, requestId: `repair-${Date.now()}` };
try {
  const pending = await repository.pendingStarts(context);
  process.stdout.write(
    `${JSON.stringify({ mode: confirm ? "confirm" : "dry-run", pendingStarts: pending.map(({ runId, temporalWorkflowId }) => ({ runId, temporalWorkflowId })) }, null, 2)}\n`
  );
  if (confirm && pending.length > 0) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233"
    });
    try {
      const client = new Client({
        connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? "default"
      });
      for (const item of pending) {
        try {
          await client.workflow.start("durableWorkflowRun", {
            taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "knotline-system-v1",
            workflowId: item.temporalWorkflowId,
            args: [
              {
                workspaceId: item.workspaceId,
                principalId: item.principalId,
                runId: item.runId,
                plan: item.plan
              }
            ]
          });
        } catch (error) {
          if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
        }
        await repository.markStartDispatched(context, item.runId);
      }
    } finally {
      await connection.close();
    }
  }
} finally {
  await pool.end();
}
