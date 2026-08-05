/* eslint-disable knotline/no-hardcoded-user-visible-string -- This operational surface now renders server-authored run data; localization follows the verified vertical journey. */
import type { NodeStatus, Workflow } from "@knotline/contracts";
import { AlertDialog, Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  Activity,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  ListTree,
  Pause,
  Play,
  RotateCcw,
  Search,
  Share2,
  StopCircle
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  fetchAllWorkflowRuns,
  fetchRuntimeRun,
  fetchWorkflowVersion,
  fetchWorkflows,
  signalRuntimeRun,
  type RuntimeEventView,
  type RuntimeRunView,
  type RuntimeTaskView
} from "./api.js";
import { msg } from "./i18n.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import { WorkspacePageHeader } from "./WorkspacePageHeader.js";
import { WorkflowCanvas } from "./WorkflowCanvas.js";
import "./M11Pages.css";

const terminalStates = new Set(["cancelled", "succeeded", "failed", "policy_stopped"]);

const stateTone = (state: string): "accent" | "danger" | "success" | "warning" => {
  if (["failed", "cancelled", "policy_stopped"].includes(state)) return "danger";
  if (state === "succeeded") return "success";
  if (["paused", "waiting", "queued"].includes(state)) return "warning";
  return "accent";
};

const stateLabel = (state: string) => state.replaceAll("_", " ");

const nodeStatus = (state: string | undefined): NodeStatus => {
  if (state === "succeeded") return "complete";
  if (state === "failed" || state === "cancelled") return "failed";
  if (state === "running") return "running";
  if (state === "ready" || state === "waiting") return "waiting";
  return "queued";
};

const duration = (run: RuntimeRunView) => {
  const start = Date.parse(run.started_at ?? run.created_at);
  const end = run.finished_at ? Date.parse(run.finished_at) : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return seconds < 60
    ? `${String(seconds)}s`
    : `${String(Math.floor(seconds / 60))}m ${String(seconds % 60)}s`;
};

function RunShell({ children }: { readonly children: ReactNode }) {
  return <WorkspaceShell contentClassName="run-workspace-content">{children}</WorkspaceShell>;
}

export function RunsPage() {
  const [search, setSearch] = useSearchParams();
  const [runs, setRuns] = useState<readonly RuntimeRunView[]>();
  const [error, setError] = useState<Error>();
  const query = search.get("query") ?? "";
  const status = search.get("status") ?? "all";
  useEffect(() => {
    void fetchAllWorkflowRuns()
      .then(setRuns)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause : new Error("Unable to load durable runs."))
      );
  }, []);
  const visible = useMemo(
    () =>
      (runs ?? []).filter(
        (run) =>
          (status === "all" || run.state === status) &&
          (run.workflowName ?? run.workflow_id).toLowerCase().includes(query.toLowerCase())
      ),
    [query, runs, status]
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setSearch(next, { replace: true });
  };
  const exportCsv = () => {
    const body = [
      "Run,Workflow,Status,Started",
      ...visible.map((run) =>
        [run.id, run.workflowName ?? run.workflow_id, run.state, run.created_at].join(",")
      )
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    link.download = "knotline-runs.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <RunShell>
      <WorkspacePageHeader
        actions={
          <Button onClick={exportCsv} disabled={!visible.length}>
            <Download aria-hidden="true" /> {msg("run.export")}
          </Button>
        }
        className="run-page-header"
        description="Follow live work, resolve anything blocked, and inspect every decision."
        eyebrow="03 / Execution"
        title={msg("run.list.heading")}
      />
      {runs ? (
        <section className="run-list-metrics" aria-label="Run summary">
          <article>
            <span>Total runs</span>
            <strong>{runs.length}</strong>
            <small>Across this workspace</small>
          </article>
          <article>
            <span>In progress</span>
            <strong>{runs.filter(({ state }) => state === "running").length}</strong>
            <small>Advancing automatically</small>
          </article>
          <article>
            <span>Needs attention</span>
            <strong>
              {runs.filter(({ state }) => ["failed", "policy_stopped"].includes(state)).length}
            </strong>
            <small>Review or follow up</small>
          </article>
          <article>
            <span>Completed</span>
            <strong>{runs.filter(({ state }) => state === "succeeded").length}</strong>
            <small>Successful outcomes</small>
          </article>
        </section>
      ) : null}
      <section className="run-filters" aria-label={msg("run.filters.label")}>
        <label>
          <span>{msg("run.search")}</span>
          <div>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => update("query", event.currentTarget.value)} />
          </div>
        </label>
        <label>
          <span>{msg("run.status")}</span>
          <select value={status} onChange={(event) => update("status", event.currentTarget.value)}>
            <option value="all">All states</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="policy_stopped">Policy stopped</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </section>
      {error ? (
        <ErrorState title="Runs unavailable">
          <p>{error.message}</p>
        </ErrorState>
      ) : !runs ? (
        <Skeleton label="Loading persisted runs" />
      ) : visible.length === 0 ? (
        <Card>
          <h2>No runs yet</h2>
          <p>Start the launch workflow from the workflow library.</p>
          <Link to="/app/workflows">Open workflows</Link>
        </Card>
      ) : (
        <div className="run-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Version</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link to={`/app/runs/${run.id}`}>
                      <strong>{run.workflowName ?? "Workflow run"}</strong>
                      <small>{run.id}</small>
                    </Link>
                  </td>
                  <td>
                    <Badge tone={stateTone(run.state)}>{stateLabel(run.state)}</Badge>
                  </td>
                  <td>{duration(run)}</td>
                  <td>v{run.workflow_version}</td>
                  <td>{new Date(run.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RunShell>
  );
}

export function RunRoomPage({ view = "room" }: { readonly view?: "room" | "timeline" | "task" }) {
  const { runId = "", taskRunId } = useParams();
  const [run, setRun] = useState<RuntimeRunView>();
  const [workflowName, setWorkflowName] = useState("Workflow run");
  const [workflow, setWorkflow] = useState<Workflow>();
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [signalError, setSignalError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingSignal, setPendingSignal] = useState<"pause" | "resume" | "cancel">();
  const [controlReason, setControlReason] = useState("");
  const [mode, setMode] = useState<"outline" | "graph" | "timeline">(
    view === "timeline" ? "timeline" : "outline"
  );
  const refresh = async () => {
    const next = await fetchRuntimeRun(runId);
    setRun(next);
    return next;
  };
  useEffect(() => {
    const load = async () => {
      const [current, workflows] = await Promise.all([fetchRuntimeRun(runId), fetchWorkflows()]);
      setRun(current);
      const legacy = workflows.find(({ id }) => id === current.workflow_id);
      setWorkflowName(legacy?.name ?? "Workflow run");
      const version = await fetchWorkflowVersion(current.workflow_id, current.workflow_version);
      const tasks = new Map((current.tasks ?? []).map((task) => [task.node_key, task]));
      setWorkflow({
        id: current.workflow_id,
        teamId: legacy?.teamId ?? "workspace",
        name: version.definition.name,
        description: version.definition.description,
        status: "active",
        version: current.workflow_version,
        updatedAt: current.updated_at,
        nodes: version.definition.nodes.map((item) => ({
          id: item.key,
          title: item.name,
          description: item.description,
          kind: item.kind,
          owner:
            typeof item.configuration.owner === "string" ? item.configuration.owner : "Workflow",
          status: nodeStatus(tasks.get(item.key)?.state),
          x: item.position.x,
          y: item.position.y
        })),
        edges: version.definition.edges.map((edge) => ({
          id: edge.key,
          source: edge.source,
          target: edge.target
        }))
      });
    };
    void load().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause : new Error("Unable to load run."))
    );
    const timer = globalThis.setInterval(
      () =>
        void fetchRuntimeRun(runId)
          .then(setRun)
          .catch(() => undefined),
      1000
    );
    return () => globalThis.clearInterval(timer);
  }, [runId]);
  const signal = async (action: "pause" | "resume" | "cancel") => {
    setBusy(true);
    setSignalError("");
    try {
      await signalRuntimeRun(runId, action, controlReason.trim());
      await refresh();
      setPendingSignal(undefined);
    } catch (cause) {
      setSignalError(cause instanceof Error ? cause.message : `Unable to ${action} this run.`);
    } finally {
      setBusy(false);
    }
  };
  const requestSignal = (action: "pause" | "resume" | "cancel") => {
    setControlReason(`Operator requested ${action} from the run room.`);
    setPendingSignal(action);
  };
  const copyRunLink = async () => {
    try {
      await navigator.clipboard.writeText(globalThis.location.href);
      setCopied(true);
      setSignalError("");
      globalThis.setTimeout(() => setCopied(false), 1800);
    } catch {
      setSignalError("The link could not be copied. Copy it directly from the address bar.");
    }
  };
  const exportRun = () => {
    if (!run) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" })
    );
    link.download = `run-${run.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  if (error)
    return (
      <RunShell>
        <ErrorState title="Run unavailable">
          <p>{error.message}</p>
        </ErrorState>
      </RunShell>
    );
  if (!run)
    return (
      <RunShell>
        <Skeleton label="Loading durable run" />
      </RunShell>
    );
  const completed = run.tasks?.filter(({ state }) => state === "succeeded").length ?? 0;
  const total = run.tasks?.length ?? 0;
  const waitingTask = terminalStates.has(run.state)
    ? undefined
    : run.tasks?.find(
        ({ node_kind, state }) => ["approval", "human"].includes(node_kind) && state === "ready"
      );
  const waitingApprovalValue =
    waitingTask?.node_kind === "approval"
      ? run.events?.find(
          ({ event_type, payload }) =>
            event_type === "approval.requested" && String(payload.nodeKey) === waitingTask.node_key
        )?.payload.approvalId
      : undefined;
  const waitingApprovalId =
    typeof waitingApprovalValue === "string" ? waitingApprovalValue : undefined;
  const failedTask = run.tasks?.find(({ state }) => state === "failed");
  const activeTask =
    run.tasks?.find(({ state }) => state === "running") ??
    run.tasks?.find(({ state }) => state === "ready");
  const focusTask = failedTask ?? waitingTask ?? activeTask;
  const focusNode = workflow?.nodes.find(({ id }) => id === focusTask?.node_key);
  const taskFailure = run.events?.find(
    ({ event_type, payload }) =>
      event_type === "task.failed" && String(payload.nodeKey) === failedTask?.node_key
  );
  const failureCode =
    typeof taskFailure?.payload.errorCode === "string"
      ? taskFailure.payload.errorCode
      : "No later steps were started.";
  const liveWorkflow = workflow
    ? {
        ...workflow,
        nodes: workflow.nodes.map((item) => ({
          ...item,
          status: nodeStatus(run.tasks?.find(({ node_key }) => node_key === item.id)?.state)
        }))
      }
    : undefined;
  return (
    <RunShell>
      <nav className="run-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/app/workflows">Workflows</Link>
        <ChevronRight aria-hidden="true" />
        <Link to={`/app/workflows/${run.workflow_id}`}>{workflowName}</Link>
        <ChevronRight aria-hidden="true" />
        <Link to="/app/runs">Runs</Link>
        <ChevronRight aria-hidden="true" />
        <span>{run.id.slice(0, 8)}</span>
      </nav>
      <header className="run-room-header">
        <div>
          <Badge tone={stateTone(run.state)}>{stateLabel(run.state)}</Badge>
          <h1>{workflowName}</h1>
          <p>
            {run.id} · published version {run.workflow_version} · started{" "}
            {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
        <div className="run-actions">
          <Button onClick={() => void copyRunLink()}>
            {copied ? <CheckCircle2 aria-hidden="true" /> : <Share2 aria-hidden="true" />}{" "}
            {copied ? "Copied" : "Share"}
          </Button>
          <Button onClick={exportRun}>
            <Download aria-hidden="true" /> Export
          </Button>
          {run.state === "running" ? (
            <Button disabled={busy} onClick={() => requestSignal("pause")}>
              <Pause aria-hidden="true" /> Pause
            </Button>
          ) : run.state === "paused" ? (
            <Button disabled={busy} onClick={() => requestSignal("resume")}>
              <Play aria-hidden="true" /> Resume
            </Button>
          ) : null}
          {!terminalStates.has(run.state) && (
            <Button disabled={busy} onClick={() => requestSignal("cancel")}>
              <StopCircle aria-hidden="true" /> Cancel
            </Button>
          )}
        </div>
      </header>
      {signalError ? (
        <p className="run-signal-error" role="alert">
          {signalError}
        </p>
      ) : null}
      <section className={`run-now run-now--${run.state}`} aria-label="Current run status">
        <div className="run-now-icon" aria-hidden="true">
          {run.state === "succeeded" ? <CheckCircle2 /> : <Activity />}
        </div>
        <div>
          <span>{terminalStates.has(run.state) ? "Run result" : "Now"}</span>
          <strong>
            {run.state === "failed"
              ? `Execution stopped at ${focusNode?.title ?? failedTask?.node_key.replaceAll("_", " ") ?? "a workflow step"}`
              : run.state === "policy_stopped"
                ? "Execution stopped because an approval policy was not satisfied"
                : run.state === "succeeded"
                  ? "Workflow completed successfully"
                  : waitingTask
                    ? `${waitingTask.node_kind === "approval" ? "Approval" : "Human input"} required to continue`
                    : run.state === "paused"
                      ? "Execution is paused"
                      : "Execution is progressing automatically"}
          </strong>
          <p>
            {run.state === "failed"
              ? `The step could not complete after its configured retries. ${failureCode}`
              : run.state === "policy_stopped"
                ? `${completed} of ${total} steps completed. The required approval expired or could not be authorized; no later actions were started.`
                : terminalStates.has(run.state)
                  ? `${completed} of ${total} steps completed in ${duration(run)}.`
                  : focusNode
                    ? `${focusNode.title} · ${completed} of ${total} steps complete. This page updates automatically.`
                    : `${completed} of ${total} steps complete. This page updates automatically.`}
          </p>
        </div>
        {failedTask ? (
          <Link to={`/app/runs/${run.id}/tasks/${failedTask.id}`}>
            Inspect failure <ChevronRight aria-hidden="true" />
          </Link>
        ) : waitingTask ? (
          <Link
            to={
              waitingTask.node_kind === "human"
                ? `/app/tasks/${waitingTask.id}`
                : waitingApprovalId
                  ? `/app/approvals/${waitingApprovalId}`
                  : `/app/approvals`
            }
          >
            Review now <ChevronRight aria-hidden="true" />
          </Link>
        ) : null}
      </section>
      <section className="run-metrics" aria-label={msg("run.summary")}>
        <Card>
          <span>Elapsed</span>
          <strong>{duration(run)}</strong>
        </Card>
        <Card>
          <span>Progress</span>
          <strong>
            {completed} / {total}
          </strong>
        </Card>
        <Card>
          <span>Workflow</span>
          <strong>v{run.workflow_version}</strong>
        </Card>
        <Card>
          <span>Execution</span>
          <strong className="run-connected">Live updates</strong>
        </Card>
        <Card>
          <span>Started by</span>
          <strong title={run.created_by}>Workspace member</strong>
        </Card>
        <Card>
          <span>Last update</span>
          <strong>{new Date(run.updated_at).toLocaleTimeString()}</strong>
        </Card>
      </section>
      <section className="run-progress-detail" aria-label="Step status breakdown">
        <div>
          <span style={{ width: total ? `${String((completed / total) * 100)}%` : "0%" }} />
        </div>
        <p>
          <strong>{completed} complete</strong>
          <span>{run.tasks?.filter(({ state }) => state === "running").length ?? 0} running</span>
          <span>{run.tasks?.filter(({ state }) => state === "ready").length ?? 0} ready</span>
          <span>{run.tasks?.filter(({ state }) => state === "pending").length ?? 0} upcoming</span>
          <span>{run.tasks?.filter(({ state }) => state === "failed").length ?? 0} failed</span>
        </p>
      </section>
      <section className="run-destinations" aria-label="Related destinations">
        <Link to={`/app/workflows/${run.workflow_id}`}>
          <RotateCcw aria-hidden="true" />
          <span>
            <strong>Run again</strong>
            <small>Review input and start a new run</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        <Link to={`/app/workflows/${run.workflow_id}`}>
          <ListTree aria-hidden="true" />
          <span>
            <strong>Workflow definition</strong>
            <small>See the published design</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        <Link to={`/app/workflows/${run.workflow_id}/versions`}>
          <Copy aria-hidden="true" />
          <span>
            <strong>Version {run.workflow_version}</strong>
            <small>Inspect immutable history</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        <Link to="/app/approvals">
          <CheckCircle2 aria-hidden="true" />
          <span>
            <strong>Approvals</strong>
            <small>Review pending decisions</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        <Link to="/app/inbox">
          <Bell aria-hidden="true" />
          <span>
            <strong>Human work</strong>
            <small>Open assigned tasks</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </section>
      <details className="run-input-summary">
        <summary>
          Run input <span>Immutable</span>
        </summary>
        <pre>{JSON.stringify(run.input ?? {}, null, 2)}</pre>
      </details>
      {view === "task" ? (
        <TaskInspector
          task={run.tasks?.find(({ id }) => id === taskRunId)}
          title={
            workflow?.nodes.find(
              ({ id }) => id === run.tasks?.find(({ id: taskId }) => taskId === taskRunId)?.node_key
            )?.title
          }
          runId={run.id}
        />
      ) : (
        <>
          <nav className="run-view-tabs" aria-label={msg("run.views")}>
            <button aria-pressed={mode === "outline"} onClick={() => setMode("outline")}>
              Outline
            </button>
            <button aria-pressed={mode === "graph"} onClick={() => setMode("graph")}>
              Graph
            </button>
            <button aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}>
              Timeline
            </button>
          </nav>
          {mode === "timeline" ? (
            <Timeline events={run.events ?? []} />
          ) : (
            <RunExecution mode={mode} run={run} workflow={liveWorkflow} />
          )}
        </>
      )}
      <AlertDialog
        open={pendingSignal !== undefined}
        title={`${pendingSignal === "cancel" ? "Cancel" : pendingSignal === "pause" ? "Pause" : "Resume"} this run?`}
        onDismiss={() => !busy && setPendingSignal(undefined)}
      >
        <div className="run-confirm-dialog">
          <p>
            {pendingSignal === "cancel"
              ? "No new steps will start. Work already completed remains in the audit history, and cancellation cannot be undone."
              : pendingSignal === "pause"
                ? "No new steps will start until someone resumes the run. Steps already executing may finish safely."
                : "The worker will continue from the last durable checkpoint."}
          </p>
          <label>
            Reason
            <input
              value={controlReason}
              maxLength={500}
              onChange={(event) => setControlReason(event.currentTarget.value)}
            />
          </label>
          <div>
            <Button disabled={busy} onClick={() => setPendingSignal(undefined)}>
              Keep run unchanged
            </Button>
            <Button
              disabled={busy || !controlReason.trim()}
              onClick={() => pendingSignal && void signal(pendingSignal)}
            >
              {busy ? "Applying…" : `Confirm ${pendingSignal ?? "action"}`}
            </Button>
          </div>
        </div>
      </AlertDialog>
    </RunShell>
  );
}

function RunExecution({
  mode,
  run,
  workflow
}: {
  readonly mode: "outline" | "graph";
  readonly run: RuntimeRunView;
  readonly workflow: Workflow | undefined;
}) {
  const approvals = new Map(
    (run.events ?? [])
      .filter(({ event_type }) => event_type === "approval.requested")
      .map(({ payload }) => [String(payload.nodeKey), String(payload.approvalId)])
  );
  return (
    <section className={`run-execution run-execution--${mode}`} aria-label="Run execution">
      <div className="run-execution-main">
        {mode === "graph" && workflow ? (
          <div className="run-live-graph">
            <WorkflowCanvas workflow={workflow} />
          </div>
        ) : (
          (run.tasks ?? []).map((task, index) => {
            const definitionNode = workflow?.nodes.find(({ id }) => id === task.node_key);
            const approvalId = approvals.get(task.node_key);
            const target =
              task.node_kind === "human"
                ? `/app/tasks/${task.id}`
                : approvalId
                  ? `/app/approvals/${approvalId}`
                  : `/app/runs/${run.id}/tasks/${task.id}`;
            return (
              <Link key={task.id} to={target} className={`run-node run-node--${task.state}`}>
                <span>
                  {task.state === "succeeded" ? <CheckCircle2 aria-hidden="true" /> : index + 1}
                </span>
                <div>
                  <strong>{definitionNode?.title ?? task.node_key.replaceAll("_", " ")}</strong>
                  {definitionNode?.description ? <p>{definitionNode.description}</p> : null}
                  <small>
                    {stateLabel(task.state)} · {task.node_kind}
                  </small>
                </div>
                <ChevronRight aria-hidden="true" />
              </Link>
            );
          })
        )}
      </div>
      <aside>
        <h2>What happens next</h2>
        <p>
          {terminalStates.has(run.state)
            ? "Review the stopped step and audit timeline, then correct the workflow policy before starting a new run."
            : run.tasks?.some(
                  ({ node_kind, state }) => node_kind === "approval" && state === "ready"
                )
              ? "Leadership approval is ready. Open the approval node to decide."
              : run.tasks?.some(
                    ({ node_kind, state }) => node_kind === "human" && state === "ready"
                  )
                ? "The final publication task is ready for human submission."
                : "Ready steps advance automatically. This view refreshes as the durable worker records progress."}
        </p>
        <Link to={`/app/runs/${run.id}/timeline`}>
          Open full audit timeline <ExternalLink aria-hidden="true" />
        </Link>
      </aside>
    </section>
  );
}

function Timeline({ events }: { readonly events: readonly RuntimeEventView[] }) {
  return (
    <ol className="run-timeline">
      {events.map((event) => (
        <li key={String(event.sequence)}>
          <span>{event.sequence}</span>
          <div>
            <strong>{event.event_type.replaceAll(".", " ")}</strong>
            <small>
              {event.actor_type} · {new Date(event.occurred_at).toLocaleString()}
            </small>
            {Object.keys(event.payload).length ? (
              <details>
                <summary>Event details</summary>
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TaskInspector({
  task,
  title,
  runId
}: {
  readonly task: RuntimeTaskView | undefined;
  readonly title: string | undefined;
  readonly runId: string;
}) {
  if (!task)
    return (
      <ErrorState title="Task not found">
        <p>This task is not part of the current run projection.</p>
      </ErrorState>
    );
  return (
    <section className="task-inspector">
      <Link className="run-back" to={`/app/runs/${runId}`}>
        <ArrowLeft aria-hidden="true" /> Back to run
      </Link>
      <header>
        <div>
          <Badge tone={stateTone(task.state)}>{stateLabel(task.state)}</Badge>
          <h2>{title ?? task.node_key.replaceAll("_", " ")}</h2>
          <p>
            {task.id} · {task.node_kind}
          </p>
        </div>
      </header>
      <div className="task-grid">
        <Card>
          <h3>Input</h3>
          <pre>{JSON.stringify(task.input ?? {}, null, 2)}</pre>
        </Card>
        <Card>
          <h3>Output</h3>
          <pre>{JSON.stringify(task.output ?? {}, null, 2)}</pre>
        </Card>
        <Card>
          <h3>Execution</h3>
          <p>Queue: {task.queue_class}</p>
          <p>State version: {String(task.state_version)}</p>
          <p>
            Started: {task.started_at ? new Date(task.started_at).toLocaleString() : "Not started"}
          </p>
          <p>
            Finished:{" "}
            {task.finished_at ? new Date(task.finished_at).toLocaleString() : "Not finished"}
          </p>
          <p>
            Duration:{" "}
            {task.started_at && task.finished_at
              ? `${String(Math.max(0, Math.round((Date.parse(task.finished_at) - Date.parse(task.started_at)) / 1000)))}s`
              : task.started_at
                ? "In progress"
                : "—"}
          </p>
        </Card>
      </div>
    </section>
  );
}
