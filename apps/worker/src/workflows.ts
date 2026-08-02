import { condition, defineSignal, proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type { RuntimePlanNode } from "@knotline/contracts";

import type * as activities from "./activities.js";

const pauseSignal = defineSignal("pause");
const resumeSignal = defineSignal("resume");
const cancelSignal = defineSignal("cancel");
const completeHumanTaskSignal = defineSignal<[string]>("completeHumanTask");
const completeApprovalSignal = defineSignal<[string, string]>("completeApproval");
const {
  recordRunTransition,
  executeSyntheticTask,
  executeGovernedAgent,
  recordTaskFailure,
  consumeApproval,
  expireApproval
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3, initialInterval: "1 second" }
});

export interface DurableRunInput {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly runId: string;
  readonly plan: readonly RuntimePlanNode[];
}

export async function durableWorkflowRun(input: DurableRunInput) {
  let paused = false;
  let cancelled = false;
  let stateVersion = 1;
  let currentState: "running" | "paused" = "running";
  setHandler(pauseSignal, () => {
    paused = true;
  });
  setHandler(resumeSignal, () => {
    paused = false;
  });
  setHandler(cancelSignal, () => {
    cancelled = true;
    paused = false;
  });
  await recordRunTransition({
    ...input,
    expected: "queued",
    next: "running",
    expectedVersion: stateVersion++
  });
  const complete = new Set<string>();
  const completedHumanTasks = new Set<string>();
  const approvedOperations = new Map<string, string>();
  let policyStopped = false;
  setHandler(completeHumanTaskSignal, (nodeKey) => {
    completedHumanTasks.add(nodeKey);
  });
  setHandler(completeApprovalSignal, (nodeKey, operationId) => {
    approvedOperations.set(nodeKey, operationId);
  });
  let activeNodeKey: string | undefined;
  try {
    execution: while (complete.size < input.plan.length && !cancelled) {
      if (paused && currentState === "running") {
        await recordRunTransition({
          ...input,
          expected: "running",
          next: "paused",
          expectedVersion: stateVersion++
        });
        currentState = "paused";
      }
      await condition(() => !paused || cancelled);
      if (!cancelled && currentState === "paused") {
        await recordRunTransition({
          ...input,
          expected: "paused",
          next: "running",
          expectedVersion: stateVersion++
        });
        currentState = "running";
      }
      const ready = input.plan.filter(
        (node) => !complete.has(node.key) && node.dependencies.every((key) => complete.has(key))
      );
      if (ready.length === 0) throw new Error("RUNTIME_GRAPH_STALLED");
      for (const node of ready) {
        activeNodeKey = node.key;
        if (node.kind === "human") {
          await condition(() => completedHumanTasks.has(node.key) || paused || cancelled);
          if (cancelled) break;
          if (paused) continue execution;
        } else if (node.kind === "approval") {
          const authorized = await condition(
            () => approvedOperations.has(node.key) || paused || cancelled,
            node.timeoutMs
          );
          if (cancelled) break;
          if (paused) continue execution;
          if (!authorized) {
            await expireApproval({ ...input, node });
            policyStopped = true;
            break;
          }
          await consumeApproval({
            ...input,
            node,
            operationId: approvedOperations.get(node.key)!,
            fencingToken: 1
          });
          await executeSyntheticTask({ ...input, node });
        } else if (node.kind === "delay") {
          await sleep(Math.min(Number(node.configuration.delayMs ?? 1), 86_400_000));
          await executeSyntheticTask({ ...input, node });
        } else if (node.kind === "agent") await executeGovernedAgent({ ...input, node });
        else await executeSyntheticTask({ ...input, node });
        complete.add(node.key);
        activeNodeKey = undefined;
      }
      if (policyStopped) break;
    }
    if (cancelled) {
      await recordRunTransition({
        ...input,
        expected: currentState,
        next: "cancelling",
        expectedVersion: stateVersion++
      });
      await recordRunTransition({
        ...input,
        expected: "cancelling",
        next: "cancelled",
        expectedVersion: stateVersion++
      });
      return { state: "cancelled", completed: [...complete] };
    }
    if (policyStopped) {
      await recordRunTransition({
        ...input,
        expected: currentState,
        next: "policy_stopped",
        expectedVersion: stateVersion++
      });
      return { state: "policy_stopped", completed: [...complete] };
    }
    await recordRunTransition({
      ...input,
      expected: currentState,
      next: "succeeded",
      expectedVersion: stateVersion++
    });
    return { state: "succeeded", completed: [...complete] };
  } catch (cause) {
    if (activeNodeKey)
      await recordTaskFailure({
        ...input,
        nodeKey: activeNodeKey,
        errorCode: "STEP_EXECUTION_FAILED"
      });
    await recordRunTransition({
      ...input,
      expected: currentState,
      next: "failed",
      expectedVersion: stateVersion++
    });
    throw cause;
  }
}
