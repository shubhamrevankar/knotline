/* eslint-disable knotline/no-hardcoded-user-visible-string -- This operational surface now renders server-authored task data; localization follows the verified vertical journey. */
import type { HumanForm, HumanFormField } from "@knotline/contracts";
import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { CheckCircle2, Clock3, Search, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { claimHumanTask, fetchHumanTask, fetchHumanTasks, submitHumanTask } from "./api.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import "./M12Pages.css";

type TaskView = Readonly<Record<string, unknown>>;

function TaskShell({ children }: { readonly children: React.ReactNode }) {
  return <WorkspaceShell contentClassName="task-shell-content">{children}</WorkspaceShell>;
}

const label = (value: unknown) =>
  (typeof value === "string" || typeof value === "number" ? String(value) : "").replaceAll(
    "_",
    " "
  );

const taskForm = (task: TaskView) => task.form_schema as HumanForm | undefined;

const fieldPlaceholder = (field: HumanFormField) => {
  if (field.key === "owner") return "e.g. Maya Chen — Customer Operations Lead";
  if (field.key === "response_target")
    return "e.g. Initial response in 30 minutes; recovery plan in 2 hours";
  if (field.key === "customer_context")
    return "Describe the customer, impact, urgency, confirmed facts, and unknowns…";
  if (field.type === "rich_text") return `Enter ${field.label.toLowerCase()}…`;
  return undefined;
};

function FormControl({ field }: { readonly field: HumanFormField }) {
  const helpId = field.help ? `task-field-${field.key}-help` : undefined;
  const common = {
    id: `task-field-${field.key}`,
    name: field.key,
    required: field.required,
    minLength: field.minLength,
    disabled: field.readOnly,
    "aria-describedby": helpId
  };
  if (field.type === "boolean")
    return (
      <label className="human-field human-field--boolean" htmlFor={common.id}>
        <input {...common} type="checkbox" />
        <span>{field.label}</span>
        {field.help ? <small id={helpId}>{field.help}</small> : null}
      </label>
    );
  return (
    <label className="human-field" htmlFor={common.id}>
      <span>
        {field.label}
        {field.required ? <em>Required</em> : null}
      </span>
      {field.type === "rich_text" || field.type === "json" ? (
        <textarea
          {...common}
          rows={field.type === "json" ? 10 : 6}
          placeholder={fieldPlaceholder(field)}
        />
      ) : field.type === "choice" || field.type === "multiselect" ? (
        <select
          {...common}
          multiple={field.type === "multiselect"}
          defaultValue={field.type === "multiselect" ? [] : ""}
        >
          {field.type === "choice" ? <option value="">Select an option</option> : null}
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          placeholder={fieldPlaceholder(field)}
          type={
            field.type === "number"
              ? "number"
              : field.type === "date_time"
                ? "datetime-local"
                : field.type === "url"
                  ? "url"
                  : field.type === "file"
                    ? "file"
                    : "text"
          }
        />
      )}
      {field.help ? <small id={helpId}>{field.help}</small> : null}
    </label>
  );
}

function submissionValues(
  form: HTMLFormElement,
  fields: readonly HumanFormField[]
): Readonly<Record<string, unknown>> {
  const data = new FormData(form);
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "boolean") values[field.key] = data.has(field.key);
    else if (field.type === "multiselect") values[field.key] = data.getAll(field.key).map(String);
    else {
      const value = data.get(field.key);
      values[field.key] =
        field.type === "number"
          ? value === ""
            ? undefined
            : Number(value)
          : typeof value === "string"
            ? value
            : (value?.name ?? "");
    }
  }
  return values;
}

export function TaskInboxPage() {
  const [search, setSearch] = useSearchParams();
  const [tasks, setTasks] = useState<readonly TaskView[]>();
  const [error, setError] = useState<Error>();
  const query = search.get("query") ?? "";
  const view = search.get("view") ?? "all";
  useEffect(() => {
    void fetchHumanTasks(view)
      .then(setTasks)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause : new Error("Unable to load human work."))
      );
  }, [view]);
  const visible = useMemo(
    () =>
      (tasks ?? []).filter((task) =>
        label(task.node_key).toLowerCase().includes(query.toLowerCase())
      ),
    [query, tasks]
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearch(next, { replace: true });
  };
  return (
    <TaskShell>
      <header className="task-page-header">
        <div>
          <Badge tone="accent">Persisted workspace queue</Badge>
          <h1>Inbox</h1>
          <p>Human tasks generated by durable workflow runs.</p>
        </div>
      </header>
      <nav className="task-tabs" aria-label="Inbox views">
        {(
          [
            ["all", "All work"],
            ["mine", "My work"],
            ["unassigned", "Unassigned"],
            ["completed", "Completed"]
          ] as const
        ).map(([key, text]) => (
          <button key={key} aria-pressed={view === key} onClick={() => update("view", key)}>
            {text}
          </button>
        ))}
      </nav>
      <section className="task-filters" aria-label="Task filters">
        <label>
          <span>Search tasks</span>
          <div>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => update("query", event.currentTarget.value)} />
          </div>
        </label>
      </section>
      {error ? (
        <ErrorState title="Inbox unavailable">
          <p>{error.message}</p>
        </ErrorState>
      ) : !tasks ? (
        <Skeleton label="Loading human tasks" />
      ) : visible.length === 0 ? (
        <Card>
          <h2>No human work in this view</h2>
          <p>
            Start the launch workflow; its final publication step will appear here after approval.
          </p>
          <Link to="/app/workflows">Open workflows</Link>
        </Card>
      ) : (
        <ul className="task-list">
          {visible.map((task) => (
            <li key={String(task.id)}>
              <Link to={`/app/tasks/${String(task.id)}`}>
                <span
                  className={`task-priority task-priority--${label(task.priority) || "normal"}`}
                />
                <div>
                  <strong>{label(task.node_key)}</strong>
                  <small>Run {String(task.run_id)}</small>
                </div>
                <Badge
                  tone={
                    task.state === "ready"
                      ? "warning"
                      : task.state === "succeeded"
                        ? "success"
                        : "neutral"
                  }
                >
                  {label(task.state)}
                </Badge>
                <span>{label(task.priority)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </TaskShell>
  );
}

export function TaskDetailPage() {
  const { taskRunId = "" } = useParams();
  const [task, setTask] = useState<TaskView>();
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async (reportError: boolean) => {
      try {
        const next = await fetchHumanTask(taskRunId);
        if (active) {
          setTask(next);
          setError(undefined);
        }
      } catch (cause) {
        if (active && reportError)
          setError(cause instanceof Error ? cause : new Error("Unable to load task."));
      }
    };
    void refresh(true);
    const timer = globalThis.setInterval(() => void refresh(false), 1500);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
    };
  }, [taskRunId]);
  const claim = async () => {
    if (!task) return;
    setBusy(true);
    setError(undefined);
    try {
      await claimHumanTask(taskRunId, Number(task.assignment_version));
      setTask(await fetchHumanTask(taskRunId));
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("The task could not be claimed."));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task) return;
    const form = taskForm(task);
    if (!form) return;
    setBusy(true);
    setError(undefined);
    try {
      await submitHumanTask(
        taskRunId,
        Number(task.state_version),
        submissionValues(event.currentTarget, form.fields),
        Number(task.form_schema_version)
      );
      setSubmitted(true);
      setTask(await fetchHumanTask(taskRunId));
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("The task could not be submitted."));
    } finally {
      setBusy(false);
    }
  };
  if (error && !task)
    return (
      <TaskShell>
        <ErrorState title="Task unavailable">
          <p>{error.message}</p>
        </ErrorState>
      </TaskShell>
    );
  if (!task)
    return (
      <TaskShell>
        <Skeleton label="Loading human task" />
      </TaskShell>
    );
  if (submitted || task.state === "succeeded")
    return (
      <TaskShell>
        <section className="task-complete">
          <CheckCircle2 aria-hidden="true" />
          <h1>Task submitted</h1>
          <p>The immutable response was recorded and the durable workflow resumed.</p>
          <Link to={`/app/runs/${String(task.run_id)}`}>Return to the live run</Link>
        </section>
      </TaskShell>
    );
  const ready = ["ready", "running", "waiting"].includes(String(task.state));
  const waitingForPrerequisites = task.state === "pending";
  const canClaim = task.can_claim === true && ready;
  const canSubmit = task.can_submit === true && ready;
  const form = taskForm(task);
  return (
    <TaskShell>
      <header className="task-detail-header">
        <div>
          <Link to="/app/inbox">← Inbox</Link>
          <h1>{label(task.node_key)}</h1>
          <p>
            Run {String(task.run_id)} · task {taskRunId}
          </p>
        </div>
        <div>
          <Badge tone={ready ? "warning" : "neutral"}>{label(task.state)}</Badge>
        </div>
      </header>
      {error ? (
        <div className="task-inline-error" role="alert">
          <strong>That action did not complete.</strong> {error.message}
        </div>
      ) : null}
      <div className="task-detail-grid">
        {canClaim ? (
          <section className="task-claim-card">
            <UserRoundCheck aria-hidden="true" />
            <div>
              <span className="task-eyebrow">Available for review</span>
              <h2>Claim this task to begin</h2>
              <p>
                Claiming prevents duplicate work and makes you the accountable reviewer. You can
                inspect the workflow run before deciding.
              </p>
            </div>
            <Button tone="accent" type="button" disabled={busy} onClick={() => void claim()}>
              {busy ? "Claiming…" : "Claim and start review"}
            </Button>
          </section>
        ) : canSubmit && form ? (
          <form className="task-form" onSubmit={(event) => void submit(event)}>
            <div className="task-form-status">
              <div>
                <span className="task-eyebrow">Review form</span>
                <strong>{form.title}</strong>
              </div>
              <span>Submission is immutable.</span>
            </div>
            <p className="task-form-intro">
              Use confirmed information from the run. If a fact is unknown, say so instead of
              guessing.
            </p>
            {form.fields.map((field) => (
              <FormControl key={field.key} field={field} />
            ))}
            <footer>
              <span>Your response is recorded in the run audit trail.</span>
              <Button tone="accent" type="submit" disabled={busy || !ready}>
                {busy ? "Submitting…" : "Submit review"}
              </Button>
            </footer>
          </form>
        ) : waitingForPrerequisites ? (
          <section className="task-claim-card task-claim-card--waiting" aria-live="polite">
            <Clock3 aria-hidden="true" />
            <div>
              <span className="task-eyebrow">Waiting in this run</span>
              <h2>Earlier steps must finish first</h2>
              <p>
                This task is not available yet. It will become claimable automatically when its
                prerequisite steps complete; you can keep this page open.
              </p>
            </div>
            <Link to={`/app/runs/${String(task.run_id)}`}>Follow live run progress</Link>
          </section>
        ) : (
          <section className="task-claim-card task-claim-card--locked">
            <UserRoundCheck aria-hidden="true" />
            <div>
              <span className="task-eyebrow">Assigned review</span>
              <h2>This task belongs to another reviewer</h2>
              <p>
                You can inspect its run and progress, but only the current assignee can submit it.
              </p>
            </div>
            <Link to="/app/inbox?view=mine">Open my work</Link>
          </section>
        )}
        <aside className="task-context">
          <Card>
            <h2>Workflow context</h2>
            <p>
              Review the preceding execution, evidence, and outputs before submitting your decision.
            </p>
            <Link to={`/app/runs/${String(task.run_id)}`}>Open run room</Link>
          </Card>
          <Card>
            <h2>Evidence available to this task</h2>
            <p>
              Use these immutable workflow inputs and prerequisite outputs when completing the form.
            </p>
            <pre>{JSON.stringify(task.input ?? {}, null, 2)}</pre>
          </Card>
          <Card>
            <h2>Assignment</h2>
            <p>Priority: {label(task.priority)}</p>
            <p>
              Status:{" "}
              {waitingForPrerequisites
                ? "Waiting for prerequisites"
                : canSubmit
                  ? "Assigned to you"
                  : canClaim
                    ? "Available to claim"
                    : "Assigned to another reviewer"}
            </p>
            <p>State version: {String(task.state_version)}</p>
          </Card>
        </aside>
      </div>
    </TaskShell>
  );
}
