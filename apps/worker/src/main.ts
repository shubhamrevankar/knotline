import { NativeConnection, Worker } from "@temporalio/worker";

import * as activities from "./activities.js";

const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233"
});
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "knotline-system-v1",
  workflowsPath: new URL("./workflows.js", import.meta.url).pathname,
  activities,
  maxConcurrentActivityTaskExecutions: 20,
  maxConcurrentWorkflowTaskExecutions: 50,
  identity: process.env.WORKER_IDENTITY ?? "knotline-local-worker"
});
await worker.run();
