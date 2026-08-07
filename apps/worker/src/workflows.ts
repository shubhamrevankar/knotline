import { condition, defineSignal, proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import { evaluateRuntimeExpression, type RuntimePlanNode } from "@knotline/contracts";

import type * as activities from "./activities.js";

const pauseSignal = defineSignal("pause");
const resumeSignal = defineSignal("resume");
const cancelSignal = defineSignal("cancel");
const completeHumanTaskSignal = defineSignal<[string]>("completeHumanTask");
const completeApprovalSignal = defineSignal<[string, string, string?]>("completeApproval");
const {
  recordRunTransition,
  executeSyntheticTask,
  executeConnectorTask,
  executeGovernedAgent,
  recordTaskFailure,
  consumeApproval,
  expireApproval,
  activateTask,
  skipTask,
  readTaskOutput
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3, initialInterval: "1 second" }
});

export interface DurableRunInput {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly runId: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly plan: readonly RuntimePlanNode[];
}

type RoutedTaskState = "pending" | "succeeded" | "failed" | "skipped";

const taskTerminal = (state: RoutedTaskState | undefined) =>
  state === "succeeded" || state === "failed" || state === "skipped";

export function approvedTaskOutput(output: unknown) {
  return output && typeof output === "object"
    ? { ...output, outcome: "approve", approved: true }
    : { value: output, outcome: "approve", approved: true };
}

export function runtimeEdgeSelected(
  edge: RuntimePlanNode["incoming"][number],
  sourceState: RoutedTaskState,
  input: Readonly<Record<string, unknown>>,
  outputs: Readonly<Record<string, { readonly output: unknown }>>,
  iteration = 0
) {
  if (sourceState === "skipped" || sourceState === "pending") return false;
  const pathType = edge.pathType ?? "default";
  if (sourceState === "failed" && pathType !== "failure") return false;
  if (sourceState === "succeeded" && pathType === "failure") return false;
  const sourceOutput = outputs[edge.source]?.output;
  const sourceIteration =
    sourceOutput && typeof sourceOutput === "object" && "iteration" in sourceOutput
      ? Number((sourceOutput as Record<string, unknown>).iteration)
      : iteration;
  return edge.condition
    ? evaluateRuntimeExpression(edge.condition, {
        input,
        nodes: outputs,
        sourceOutput,
        iteration: sourceIteration
      })
    : true;
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
  const states = new Map<string, RoutedTaskState>(
    input.plan.map(({ key }) => [key, "pending"] as const)
  );
  const outputs = new Map<string, unknown>();
  const completedHumanTasks = new Set<string>();
  const approvalResults = new Map<
    string,
    { readonly operationId: string; readonly outcome: string }
  >();
  let policyStopped = false;
  setHandler(completeHumanTaskSignal, (nodeKey) => {
    completedHumanTasks.add(nodeKey);
  });
  setHandler(completeApprovalSignal, (nodeKey, operationId, outcome = "approve") => {
    approvalResults.set(nodeKey, { operationId, outcome });
  });
  let activeNodeKey: string | undefined;
  try {
    execution: while ([...states.values()].some((state) => state === "pending") && !cancelled) {
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
      const outputScope = Object.fromEntries(
        [...outputs.entries()].map(([key, output]) => [key, { output }])
      );
      const settled = input.plan.filter(
        (node) =>
          states.get(node.key) === "pending" &&
          node.dependencies.every((key) => taskTerminal(states.get(key)))
      );
      if (settled.length === 0) throw new Error("RUNTIME_GRAPH_STALLED");
      const ready: RuntimePlanNode[] = [];
      for (const node of settled) {
        const selected =
          node.incoming.length === 0 ||
          node.incoming.some((edge) =>
            runtimeEdgeSelected(
              edge,
              states.get(edge.source) ?? "pending",
              input.input ?? {},
              outputScope,
              Number(outputs.get(node.key) ?? 0)
            )
          );
        if (selected) ready.push(node);
        else {
          await skipTask({
            ...input,
            nodeKey: node.key,
            reason: "No incoming workflow path was selected."
          });
          states.set(node.key, "skipped");
          outputs.set(node.key, { skipped: true, reason: "PATH_NOT_SELECTED" });
        }
      }
      for (const node of ready) {
        activeNodeKey = node.key;
        await activateTask({ ...input, nodeKey: node.key });
        let output: unknown = {};
        try {
          if (node.kind === "human") {
            await condition(() => completedHumanTasks.has(node.key) || paused || cancelled);
            if (cancelled) break;
            if (paused) continue execution;
            output = await readTaskOutput({ ...input, nodeKey: node.key });
          } else if (node.kind === "approval") {
            const authorized = await condition(
              () => approvalResults.has(node.key) || paused || cancelled,
              node.timeoutMs
            );
            if (cancelled) break;
            if (paused) continue execution;
            if (!authorized) {
              await expireApproval({ ...input, node });
              states.set(node.key, "failed");
              outputs.set(node.key, { outcome: "expired", errorCode: "APPROVAL_EXPIRED" });
              activeNodeKey = undefined;
              if (!node.outgoing.some(({ pathType }) => pathType === "failure")) {
                policyStopped = true;
                break;
              }
              continue;
            }
            const approval = approvalResults.get(node.key)!;
            if (approval.outcome === "approve") {
              await consumeApproval({
                ...input,
                node,
                operationId: approval.operationId,
                fencingToken: 1
              });
              const result = await executeSyntheticTask({ ...input, node });
              output = approvedTaskOutput(result.output);
            } else {
              await recordTaskFailure({
                ...input,
                nodeKey: node.key,
                errorCode: `APPROVAL_${approval.outcome.toUpperCase()}`
              });
              states.set(node.key, "failed");
              outputs.set(node.key, { outcome: approval.outcome });
              activeNodeKey = undefined;
              continue;
            }
          } else if (node.kind === "delay") {
            await sleep(Math.min(Number(node.configuration.delayMs ?? 1), 86_400_000));
            output = (await executeSyntheticTask({ ...input, node })).output;
          } else if (node.kind === "agent")
            output = (await executeGovernedAgent({ ...input, node })).output ?? {};
          else if (node.kind === "integration_action")
            output = (await executeConnectorTask({ ...input, node })).output;
          else output = (await executeSyntheticTask({ ...input, node })).output;
          states.set(node.key, "succeeded");
          outputs.set(node.key, output);
          activeNodeKey = undefined;
        } catch (cause) {
          const errorCode = cause instanceof Error ? cause.message : "STEP_EXECUTION_FAILED";
          await recordTaskFailure({ ...input, nodeKey: node.key, errorCode });
          states.set(node.key, "failed");
          outputs.set(node.key, { errorCode });
          activeNodeKey = undefined;
          if (!node.outgoing.some(({ pathType }) => pathType === "failure")) throw cause;
        }
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
      return {
        state: "cancelled",
        completed: [...states].filter(([, state]) => state === "succeeded").map(([key]) => key)
      };
    }
    if (policyStopped) {
      await recordRunTransition({
        ...input,
        expected: currentState,
        next: "policy_stopped",
        expectedVersion: stateVersion++
      });
      return {
        state: "policy_stopped",
        completed: [...states].filter(([, state]) => state === "succeeded").map(([key]) => key)
      };
    }
    const terminals = input.plan
      .filter(
        (node) =>
          states.get(node.key) === "succeeded" &&
          node.outgoing.length === 0 &&
          !node.outgoing.some((edge) =>
            runtimeEdgeSelected(
              edge,
              states.get(node.key)!,
              input.input ?? {},
              Object.fromEntries([...outputs].map(([key, output]) => [key, { output }]))
            )
          )
      )
      .map((node) => ({ nodeKey: node.key, output: outputs.get(node.key) }));
    if (terminals.length !== 1)
      throw new Error(`RUNTIME_TERMINAL_OUTCOME_INVALID:${terminals.length}`);
    await recordRunTransition({
      ...input,
      expected: currentState,
      next: "succeeded",
      expectedVersion: stateVersion++,
      output: {
        outcome: terminals[0]?.output,
        terminalNodeKey: terminals[0]?.nodeKey,
        completedNodes: [...states]
          .filter(([, state]) => state === "succeeded")
          .map(([key]) => key),
        skippedNodes: [...states].filter(([, state]) => state === "skipped").map(([key]) => key)
      }
    });
    return {
      state: "succeeded",
      completed: [...states].filter(([, state]) => state === "succeeded").map(([key]) => key),
      skipped: [...states].filter(([, state]) => state === "skipped").map(([key]) => key),
      terminals
    };
  } catch (cause) {
    if (activeNodeKey && states.get(activeNodeKey) === "pending")
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
