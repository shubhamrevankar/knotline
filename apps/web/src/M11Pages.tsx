import { Badge, Button, Card } from "@knotline/ui";
import {
  Activity,
  ArrowLeft,
  Download,
  GitCompare,
  ListTree,
  Pause,
  Play,
  RotateCcw,
  Search,
  StopCircle
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { msg } from "./i18n.js";
import "./M11Pages.css";

type RunState = "running" | "failed" | "succeeded" | "paused";
interface RunFixture {
  readonly id: string;
  readonly workflow: string;
  readonly state: RunState;
  readonly attention: string;
  readonly initiator: string;
  readonly duration: string;
  readonly usage: string;
  readonly started: string;
}

const runs: readonly RunFixture[] = [
  {
    id: "run-1042",
    workflow: "Customer escalation",
    state: "running",
    attention: "Watching",
    initiator: "Maya Chen",
    duration: "4m 12s",
    usage: "$0.18",
    started: "Today, 10:42"
  },
  {
    id: "run-1041",
    workflow: "Incident response",
    state: "failed",
    attention: "Needs action",
    initiator: "Pager webhook",
    duration: "2m 08s",
    usage: "$0.06",
    started: "Today, 10:31"
  },
  {
    id: "run-1040",
    workflow: "Weekly account review",
    state: "succeeded",
    attention: "None",
    initiator: "Schedule",
    duration: "8m 44s",
    usage: "$0.42",
    started: "Today, 09:00"
  },
  {
    id: "run-1039",
    workflow: "Contract review",
    state: "paused",
    attention: "Approval overdue",
    initiator: "Noah Williams",
    duration: "1h 22m",
    usage: "$0.11",
    started: "Today, 08:17"
  }
];

const timeline = [
  ["1", "Run admitted", "Exact usage reservation created", "System · 10:42:01"],
  ["2", "Trigger accepted", "Webhook signature and replay window verified", "Gateway · 10:42:02"],
  ["3", "Classify request", "Attempt 1 completed with governed output", "Worker · 10:42:04"],
  ["4", "Draft response", "Attempt 1 is running", "Agent runtime · 10:42:08"]
] as const;

const runStateLabel = (state: RunState) => {
  if (state === "failed") return msg("run.status.failed");
  if (state === "paused") return msg("run.status.paused");
  if (state === "succeeded") return msg("run.status.succeeded");
  return msg("run.status.running");
};

const taskStateLabel = (state: "pending" | "running" | "succeeded") => {
  if (state === "pending") return msg("run.task.pending");
  if (state === "succeeded") return msg("run.task.succeeded");
  return msg("run.task.running");
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
      </aside>
      <main>{children}</main>
    </div>
  );
}

export function RunsPage() {
  const [search, setSearch] = useSearchParams();
  const query = search.get("query") ?? "";
  const status = search.get("status") ?? "all";
  const visible = useMemo(
    () =>
      runs.filter(
        (run) =>
          (status === "all" || run.state === status) &&
          run.workflow.toLowerCase().includes(query.toLowerCase())
      ),
    [query, status]
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setSearch(next, { replace: true });
  };
  const exportCsv = () => {
    const safe = (value: string) => (/^[=+\-@]/u.test(value) ? `'${value}` : value);
    const body = [
      "Run,Workflow,Status,Started",
      ...visible.map((run) => [run.id, safe(run.workflow), run.state, run.started].join(","))
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
          <Badge tone="accent">{msg("run.live")}</Badge>
          <h1>{msg("run.list.heading")}</h1>
          <p>{msg("run.list.body")}</p>
        </div>
        <Button onClick={exportCsv}>
          <Download aria-hidden="true" />
          {msg("run.export")}
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
            <option value="all">{msg("run.status.all")}</option>
            <option value="running">{msg("run.status.running")}</option>
            <option value="failed">{msg("run.status.failed")}</option>
            <option value="paused">{msg("run.status.paused")}</option>
            <option value="succeeded">{msg("run.status.succeeded")}</option>
          </select>
        </label>
      </section>
      <div className="run-table-wrap">
        <table>
          <caption className="sr-only">{msg("run.list.caption")}</caption>
          <thead>
            <tr>
              <th>{msg("run.workflow")}</th>
              <th>{msg("run.status")}</th>
              <th>{msg("run.attention")}</th>
              <th>{msg("run.initiator")}</th>
              <th>{msg("run.duration")}</th>
              <th>{msg("run.usage")}</th>
              <th>{msg("run.started")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((run) => (
              <tr key={run.id}>
                <td>
                  <Link to={`/app/runs/${run.id}`}>
                    <strong>{run.workflow}</strong>
                    <small>{run.id}</small>
                  </Link>
                </td>
                <td>
                  <Badge
                    tone={
                      run.state === "failed"
                        ? "danger"
                        : run.state === "succeeded"
                          ? "success"
                          : "accent"
                    }
                  >
                    {runStateLabel(run.state)}
                  </Badge>
                </td>
                <td>{run.attention}</td>
                <td>{run.initiator}</td>
                <td>{run.duration}</td>
                <td>{run.usage}</td>
                <td>{run.started}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RunShell>
  );
}

export function RunRoomPage({ view = "room" }: { readonly view?: "room" | "timeline" | "task" }) {
  const { runId = "run-1042", taskRunId } = useParams();
  const selected = runs.find((run) => run.id === runId) ?? runs[0]!;
  const [state, setState] = useState<RunState>(selected.state);
  const [mode, setMode] = useState<"outline" | "graph" | "timeline">(
    view === "timeline" ? "timeline" : "outline"
  );
  return (
    <RunShell>
      <Link className="run-back" to="/app/runs">
        <ArrowLeft aria-hidden="true" />
        {msg("run.back")}
      </Link>
      <header className="run-room-header">
        <div>
          <Badge
            tone={state === "failed" ? "danger" : state === "succeeded" ? "success" : "accent"}
          >
            {runStateLabel(state)}
          </Badge>
          <h1>{selected.workflow}</h1>
          <p>
            {msg("run.header.metadata", {
              runId,
              initiator: selected.initiator,
              started: selected.started
            })}
          </p>
        </div>
        <div className="run-actions">
          {state === "running" ? (
            <Button onClick={() => setState("paused")}>
              <Pause aria-hidden="true" />
              {msg("run.pause")}
            </Button>
          ) : (
            <Button onClick={() => setState("running")}>
              <Play aria-hidden="true" />
              {msg("run.resume")}
            </Button>
          )}
          <Button onClick={() => setState("failed")}>
            <StopCircle aria-hidden="true" />
            {msg("run.cancel")}
          </Button>
          <Button>
            <RotateCcw aria-hidden="true" />
            {msg("run.retry")}
          </Button>
        </div>
      </header>
      <section className="run-metrics" aria-label={msg("run.summary")}>
        <Card>
          <span>{msg("run.elapsed")}</span>
          <strong>{selected.duration}</strong>
        </Card>
        <Card>
          <span>{msg("run.usage")}</span>
          <strong>{selected.usage}</strong>
        </Card>
        <Card>
          <span>{msg("run.environment")}</span>
          <strong>{msg("run.environment.sandbox")}</strong>
        </Card>
        <Card>
          <span>{msg("run.connection")}</span>
          <strong className="run-connected">{msg("run.connection.live")}</strong>
        </Card>
      </section>
      {view === "task" ? (
        <TaskInspector taskRunId={taskRunId ?? "task-draft"} />
      ) : (
        <>
          <nav className="run-view-tabs" aria-label={msg("run.views")}>
            <button aria-pressed={mode === "outline"} onClick={() => setMode("outline")}>
              {msg("run.view.outline")}
            </button>
            <button aria-pressed={mode === "graph"} onClick={() => setMode("graph")}>
              {msg("run.view.graph")}
            </button>
            <button aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}>
              {msg("run.view.timeline")}
            </button>
            <Link to={`/app/runs/${runId}/timeline`}>{msg("run.timeline.complete")}</Link>
          </nav>
          {mode === "timeline" ? <Timeline /> : <RunExecution mode={mode} runId={runId} />}
        </>
      )}
    </RunShell>
  );
}

function RunExecution({
  mode,
  runId
}: {
  readonly mode: "outline" | "graph";
  readonly runId: string;
}) {
  const tasks = [
    ["receive", "Receive request", "succeeded"],
    ["classify", "Classify request", "succeeded"],
    ["draft", "Draft response", "running"],
    ["approve", "Manager approval", "pending"]
  ] as const;
  return (
    <section className={`run-execution run-execution--${mode}`} aria-label={msg("run.execution")}>
      <div>
        {tasks.map(([id, label, state], index) => (
          <Link
            key={id}
            to={`/app/runs/${runId}/tasks/${id}`}
            className={`run-node run-node--${state}`}
          >
            <span>{index + 1}</span>
            <div>
              <strong>{label}</strong>
              <small>{taskStateLabel(state)}</small>
            </div>
          </Link>
        ))}
      </div>
      <aside>
        <h2>{msg("run.attention.heading")}</h2>
        <p>{msg("run.attention.body")}</p>
        <Button>
          <GitCompare aria-hidden="true" />
          {msg("run.compare")}
        </Button>
      </aside>
    </section>
  );
}

function Timeline() {
  return (
    <ol className="run-timeline">
      {timeline.map(([sequence, title, body, actor]) => (
        <li key={sequence}>
          <span>{sequence}</span>
          <div>
            <strong>{title}</strong>
            <p>{body}</p>
            <small>{actor}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TaskInspector({ taskRunId }: { readonly taskRunId: string }) {
  return (
    <section className="task-inspector">
      <header>
        <div>
          <Badge tone="accent">{msg("run.task.running")}</Badge>
          <h2>{msg("run.task.heading")}</h2>
          <p>
            {taskRunId} · {msg("run.task.attempt")}
          </p>
        </div>
        <Button>{msg("run.task.retry")}</Button>
      </header>
      <div className="task-grid">
        <Card>
          <h3>{msg("run.task.input")}</h3>
          <pre>{JSON.stringify({ priority: "high", channel: "email" }, null, 2)}</pre>
        </Card>
        <Card>
          <h3>{msg("run.task.output")}</h3>
          <pre>{JSON.stringify({ classification: "billing", confidence: 0.96 }, null, 2)}</pre>
        </Card>
        <Card>
          <h3>{msg("run.task.provenance")}</h3>
          <p>{msg("run.task.provenance.body")}</p>
        </Card>
        <Card>
          <h3>{msg("run.task.logs")}</h3>
          <p>{msg("run.task.logs.body")}</p>
        </Card>
      </div>
    </section>
  );
}
