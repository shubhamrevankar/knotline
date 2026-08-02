/* eslint-disable knotline/no-hardcoded-user-visible-string -- This operational surface now renders server-authored run data; localization follows the verified vertical journey. */
import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  Activity,
  ArrowLeft,
  Download,
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
  fetchWorkflows,
  signalRuntimeRun,
  type RuntimeEventView,
  type RuntimeRunView,
  type RuntimeTaskView
} from "./api.js";
import { msg } from "./i18n.js";
import "./M11Pages.css";

const terminalStates = new Set(["cancelled", "succeeded", "failed", "policy_stopped"]);

const stateTone = (state: string): "accent" | "danger" | "success" | "warning" => {
  if (["failed", "cancelled", "policy_stopped"].includes(state)) return "danger";
  if (state === "succeeded") return "success";
  if (["paused", "waiting", "queued"].includes(state)) return "warning";
  return "accent";
};

const stateLabel = (state: string) => state.replaceAll("_", " ");

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
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
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
      setWorkflowName(
        workflows.find(({ id }) => id === current.workflow_id)?.name ?? "Workflow run"
      );
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
    try {
      await signalRuntimeRun(runId, action);
      await refresh();
    } finally {
      setBusy(false);
    }
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
            <Button disabled={busy} onClick={() => void signal("pause")}>
              <Pause aria-hidden="true" /> Pause
            </Button>
          ) : run.state === "paused" ? (
            <Button disabled={busy} onClick={() => void signal("resume")}>
              <Play aria-hidden="true" /> Resume
            </Button>
          ) : null}
          {!terminalStates.has(run.state) && (
            <Button disabled={busy} onClick={() => void signal("cancel")}>
              <StopCircle aria-hidden="true" /> Cancel
            </Button>
          )}
        </div>
      </header>
      <section className="run-metrics" aria-label={msg("run.summary")}>
        <Card>
          <span>Elapsed</span>
          <strong>{duration(run)}</strong>
        </Card>
        <Card>
          <span>Tasks</span>
          <strong>{String(run.tasks?.length ?? 0)}</strong>
        </Card>
        <Card>
          <span>Workflow</span>
          <strong>v{run.workflow_version}</strong>
        </Card>
        <Card>
          <span>Connection</span>
          <strong className="run-connected">Live database</strong>
        </Card>
      </section>
      {view === "task" ? (
        <TaskInspector task={run.tasks?.find(({ id }) => id === taskRunId)} />
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
            <RunExecution mode={mode} run={run} />
          )}
        </>
      )}
    </RunShell>
  );
}

function RunExecution({
  mode,
  run
}: {
  readonly mode: "outline" | "graph";
  readonly run: RuntimeRunView;
}) {
  const approvals = new Map(
    (run.events ?? [])
      .filter(({ event_type }) => event_type === "approval.requested")
      .map(({ payload }) => [String(payload.nodeKey), String(payload.approvalId)])
  );
  return (
    <section className={`run-execution run-execution--${mode}`} aria-label="Run execution">
      <div>
        {(run.tasks ?? []).map((task, index) => {
          const approvalId = approvals.get(task.node_key);
          const target =
            task.node_kind === "human"
              ? `/app/tasks/${task.id}`
              : approvalId
                ? `/app/approvals/${approvalId}`
                : `/app/runs/${run.id}/tasks/${task.id}`;
          return (
            <Link key={task.id} to={target} className={`run-node run-node--${task.state}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{task.node_key.replaceAll("_", " ")}</strong>
                <small>
                  {stateLabel(task.state)} · {task.node_kind}
                </small>
              </div>
            </Link>
          );
        })}
      </div>
      <aside>
        <h2>Next action</h2>
        <p>
          {run.tasks?.some(({ node_kind, state }) => node_kind === "approval" && state === "ready")
            ? "Leadership approval is ready. Open the approval node to decide."
            : run.tasks?.some(({ node_kind, state }) => node_kind === "human" && state === "ready")
              ? "The final publication task is ready for human submission."
              : terminalStates.has(run.state)
                ? "The durable run has reached a terminal state."
                : "The worker is advancing dependency-ready tasks."}
        </p>
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
            <p>{JSON.stringify(event.payload)}</p>
            <small>
              {event.actor_type} · {new Date(event.occurred_at).toLocaleString()}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TaskInspector({ task }: { readonly task: RuntimeTaskView | undefined }) {
  if (!task)
    return (
      <ErrorState title="Task not found">
        <p>This task is not part of the current run projection.</p>
      </ErrorState>
    );
  return (
    <section className="task-inspector">
      <header>
        <div>
          <Badge tone={stateTone(task.state)}>{stateLabel(task.state)}</Badge>
          <h2>{task.node_key.replaceAll("_", " ")}</h2>
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
