import { activityInfo } from "@temporalio/activity";
import { createPool, PostgresApprovalRepository, PostgresRuntimeRepository } from "@knotline/db";

import type { DurableRunInput } from "./workflows.js";

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? createPool(databaseUrl, { application_name: "knotline-runtime-worker" })
  : undefined;
const repository = pool ? new PostgresRuntimeRepository(pool) : undefined;
const approvals = pool ? new PostgresApprovalRepository(pool) : undefined;

export async function recordRunTransition(
  input: DurableRunInput & {
    readonly expected: "queued" | "running" | "paused" | "cancelling";
    readonly next:
      "running" | "paused" | "cancelling" | "cancelled" | "succeeded" | "policy_stopped";
    readonly expectedVersion: number;
  }
) {
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  return repository.transitionRun(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.expected,
    input.expectedVersion,
    1,
    input.next,
    `run.${input.next}`
  );
}

export async function consumeApproval(
  input: DurableRunInput & {
    readonly node: DurableRunInput["plan"][number];
    readonly operationId: string;
    readonly fencingToken: number;
  }
) {
  if (!approvals) throw new Error("DATABASE_URL_REQUIRED");
  return approvals.consumeForNode(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.node.key,
    input.operationId,
    input.fencingToken
  );
}

export async function expireApproval(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  if (!approvals) throw new Error("DATABASE_URL_REQUIRED");
  return approvals.expireForNode(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${activityInfo().activityId}`
    },
    input.runId,
    input.node.key
  );
}

export async function executeSyntheticTask(
  input: DurableRunInput & { readonly node: DurableRunInput["plan"][number] }
) {
  const info = activityInfo();
  if (
    input.node.kind === "integration_action" &&
    input.node.configuration.fixtureOutcome === "uncertain"
  )
    throw new Error("EXTERNAL_OPERATION_UNCERTAIN");
  const result = {
    nodeKey: input.node.key,
    attempt: info.attempt,
    queue: input.node.queue,
    output: input.node.configuration.fixtureOutput ?? {}
  };
  if (!repository) throw new Error("DATABASE_URL_REQUIRED");
  await repository.completeSyntheticTask(
    {
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      requestId: `activity-${info.activityId}`
    },
    input.runId,
    input.node.key,
    info.activityId,
    result.output
  );
  return result;
}

export async function closeActivityPool() {
  await pool?.end();
}
