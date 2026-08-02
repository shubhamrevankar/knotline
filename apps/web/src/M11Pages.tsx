/* eslint-disable knotline/no-hardcoded-user-visible-string -- This operational surface now renders server-authored run data; localization follows the verified vertical journey. */
import type { NodeStatus, Workflow } from "@knotline/contracts";
import { AlertDialog, Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  ListTree,
  Pause,
  Play,
  Search,
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
  return (
    <div className="run-shell">
      <aside aria-label={msg("run.nav.label")}>
        <Link className="run-brand" to="/app/workflows">
          {msg("brand.name")}
        </Link>
        <Link to="/app/runs" aria-current="page">
          <Activity aria-hidden="true" />
          {msg("run.nav.runs")}
        </Link>
        <Link to="/app/workflows">
          <ListTree aria-hidden="true" />
          {msg("customer.nav.workflows")}
        </Link>
        <Link to="/app/approvals">Approvals</Link>
        <Link to="/app/inbox">Human work</Link>
      </aside>
      <main>{children}</main>
    </div>
  );
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
      <header className="run-page-header">
        <div>
          <Badge tone="accent">Persisted execution</Badge>
          <h1>{msg("run.list.heading")}</h1>
          <p>Every row is an admitted database run controlled by the durable worker.</p>
        </div>
        <Button onClick={exportCsv} disabled={!visible.length}>
          <Download aria-hidden="true" /> {msg("run.export")}
        </Button>
      </header>
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
  const waitingTask = run.tasks?.find(
    ({ node_kind, state }) => ["approval", "human"].includes(node_kind) && state === "ready"
  );
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
      <Link className="run-back" to="/app/runs">
        <ArrowLeft aria-hidden="true" /> {msg("run.back")}
      </Link>
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
      {signalError ? <p className="run-signal-error" role="alert">{signalError}</p> : null}
      <section className={`run-now run-now--${run.state}`} aria-label="Current run status">
        <div className="run-now-icon" aria-hidden="true">
          {run.state === "succeeded" ? <CheckCircle2 /> : <Activity />}
        </div>
        <div>
          <span>{terminalStates.has(run.state) ? "Run result" : "Now"}</span>
          <strong>
            {run.state === "succeeded"
              ? "Workflow completed successfully"
              : waitingTask
                ? `${waitingTask.node_kind === "approval" ? "Approval" : "Human input"} required to continue`
                : run.state === "paused"
                  ? "Execution is paused"
                  : "Execution is progressing automatically"}
          </strong>
          <p>
            {terminalStates.has(run.state)
              ? `${completed} of ${total} steps completed in ${duration(run)}.`
              : `${completed} of ${total} steps complete. This page updates automatically.`}
          </p>
        </div>
        {waitingTask ? (
          <Link to={waitingTask.node_kind === "human" ? `/app/tasks/${waitingTask.id}` : `/app/approvals`}>
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
          <strong>{completed} / {total}</strong>
        </Card>
        <Card>
          <span>Workflow</span>
          <strong>v{run.workflow_version}</strong>
        </Card>
        <Card>
          <span>Execution</span>
          <strong className="run-connected">Live updates</strong>
        </Card>
      </section>
      <details className="run-input-summary">
        <summary>Run input <span>Immutable</span></summary>
        <pre>{JSON.stringify(run.input ?? {}, null, 2)}</pre>
      </details>
      {view === "task" ? (
        <TaskInspector
          task={run.tasks?.find(({ id }) => id === taskRunId)}
          title={workflow?.nodes.find(({ id }) => id === run.tasks?.find(({ id: taskId }) => taskId === taskRunId)?.node_key)?.title}
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
            <input value={controlReason} maxLength={500} onChange={(event) => setControlReason(event.currentTarget.value)} />
          </label>
          <div>
            <Button disabled={busy} onClick={() => setPendingSignal(undefined)}>Keep run unchanged</Button>
            <Button disabled={busy || !controlReason.trim()} onClick={() => pendingSignal && void signal(pendingSignal)}>
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
          <div className="run-live-graph"><WorkflowCanvas workflow={workflow} /></div>
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
              <span>{task.state === "succeeded" ? <CheckCircle2 aria-hidden="true" /> : index + 1}</span>
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
          {run.tasks?.some(({ node_kind, state }) => node_kind === "approval" && state === "ready")
            ? "Leadership approval is ready. Open the approval node to decide."
            : run.tasks?.some(({ node_kind, state }) => node_kind === "human" && state === "ready")
              ? "The final publication task is ready for human submission."
              : terminalStates.has(run.state)
                ? "Review any step to inspect its recorded input, output, timing, and execution state."
                : "Ready steps advance automatically. This view refreshes as the durable worker records progress."}
        </p>
        <Link to={`/app/runs/${run.id}/timeline`}>Open full audit timeline <ExternalLink aria-hidden="true" /></Link>
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
      <Link className="run-back" to={`/app/runs/${runId}`}><ArrowLeft aria-hidden="true" /> Back to run</Link>
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
        </Card>
      </div>
    </section>
  );
}
