/* eslint-disable knotline/no-hardcoded-user-visible-string -- M12 task fixture copy is isolated in this lazy prototype surface pending server-authored form labels. */
import { Badge, Button, Card } from "@knotline/ui";
import { CheckCircle2, Clock3, FileUp, Inbox, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import "./M12Pages.css";

const tasks = [
  {
    id: "task-284",
    title: "Review renewal exception",
    workflow: "Customer renewal",
    priority: "Urgent",
    due: "Due in 38 min",
    owner: "You",
    state: "Open"
  },
  {
    id: "task-283",
    title: "Confirm security evidence",
    workflow: "Vendor onboarding",
    priority: "High",
    due: "Due today, 16:30",
    owner: "Trust queue",
    state: "Unassigned"
  },
  {
    id: "task-281",
    title: "Complete account handoff",
    workflow: "New customer launch",
    priority: "Normal",
    due: "Tomorrow",
    owner: "You",
    state: "Draft saved"
  }
] as const;

function TaskShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="task-shell">
      <aside aria-label="Task navigation">
        <Link className="task-brand" to="/app/workflows">
          Knotline
        </Link>
        <Link to="/app/inbox" aria-current="page">
          <Inbox aria-hidden="true" />
          Inbox
        </Link>
        <Link to="/app/tasks">
          <CheckCircle2 aria-hidden="true" />
          Tasks
        </Link>
        <Link to="/app/runs">
          <Clock3 aria-hidden="true" />
          Runs
        </Link>
      </aside>
      <main>{children}</main>
    </div>
  );
}

export function TaskInboxPage() {
  const [search, setSearch] = useSearchParams();
  const query = search.get("query") ?? "";
  const view = search.get("view") ?? "mine";
  const visible = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query.toLowerCase()) &&
          (view !== "unassigned" || task.state === "Unassigned")
      ),
    [query, view]
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
          <Badge tone="accent">Live workspace</Badge>
          <h1>Inbox</h1>
          <p>Tasks, approvals, mentions, and exceptions that need your attention.</p>
        </div>
        <Button>New saved view</Button>
      </header>
      <nav className="task-tabs" aria-label="Inbox views">
        {(
          [
            ["mine", "My work"],
            ["unassigned", "Unassigned"],
            ["watched", "Watching"],
            ["completed", "Completed"]
          ] as const
        ).map(([key, label]) => (
          <button key={key} aria-pressed={view === key} onClick={() => update("view", key)}>
            {label}
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
        <label>
          <span>Priority</span>
          <select>
            <option>All priorities</option>
            <option>Urgent</option>
            <option>High</option>
          </select>
        </label>
        <label>
          <span>Due</span>
          <select>
            <option>Any time</option>
            <option>Overdue</option>
            <option>Today</option>
          </select>
        </label>
      </section>
      <ul className="task-list">
        {visible.map((task) => (
          <li key={task.id}>
            <Link to={`/app/tasks/${task.id}`}>
              <span className={`task-priority task-priority--${task.priority.toLowerCase()}`} />
              <div>
                <strong>{task.title}</strong>
                <small>
                  {task.workflow} · {task.id}
                </small>
              </div>
              <Badge tone={task.priority === "Urgent" ? "danger" : "warning"}>
                {task.priority}
              </Badge>
              <span>{task.owner}</span>
              <span>{task.due}</span>
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 && (
        <Card>
          <h2>No matching tasks</h2>
          <p>Clear a filter or choose another saved view.</p>
        </Card>
      )}
    </TaskShell>
  );
}

function Field({
  label,
  children,
  help
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly help?: string;
}) {
  return (
    <label className="human-field">
      <span>{label}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}

export function TaskDetailPage() {
  const { taskRunId = "task-284" } = useParams();
  const [claimed, setClaimed] = useState(true);
  const [saved, setSaved] = useState("All changes saved");
  const [submitted, setSubmitted] = useState(false);
  const changed = () => {
    setSaved("Saving draft…");
    globalThis.setTimeout(() => setSaved("All changes saved"), 250);
  };
  if (submitted)
    return (
      <TaskShell>
        <section className="task-complete">
          <CheckCircle2 aria-hidden="true" />
          <h1>Task submitted</h1>
          <p>The immutable response was recorded and the workflow has resumed.</p>
          <Link to="/app/inbox">Return to inbox</Link>
        </section>
      </TaskShell>
    );
  return (
    <TaskShell>
      <header className="task-detail-header">
        <div>
          <Link to="/app/inbox">← Inbox</Link>
          <h1>Review renewal exception</h1>
          <p>Customer renewal · {taskRunId}</p>
        </div>
        <div>
          <Badge tone="danger">Urgent</Badge>
          <span>Due in 38 min</span>
        </div>
      </header>
      <div className="task-detail-grid">
        <form
          className="task-form"
          onChange={changed}
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <div className="task-form-status">
            <strong>Decision form</strong>
            <span aria-live="polite">{saved}</span>
          </div>
          <Field label="Recommendation">
            <select required defaultValue="">
              <option value="" disabled>
                Select a decision
              </option>
              <option>Approve exception</option>
              <option>Request changes</option>
              <option>Reject exception</option>
            </select>
          </Field>
          <Field label="Risk score" help="Use a value from 0 to 100.">
            <input required type="number" min="0" max="100" defaultValue="32" />
          </Field>
          <Field label="Customer impact">
            <textarea
              required
              rows={4}
              defaultValue="Renewal is blocked while the exception is reviewed."
            />
          </Field>
          <Field label="Review completed at">
            <input type="datetime-local" />
          </Field>
          <Field label="Policy checks">
            <div className="check-grid">
              <label>
                <input type="checkbox" />
                Identity verified
              </label>
              <label>
                <input type="checkbox" />
                Evidence reviewed
              </label>
            </div>
          </Field>
          <Field label="Reviewers">
            <input type="search" placeholder="Find a person or group" />
          </Field>
          <Field
            label="Supporting evidence"
            help="Files are scanned before anyone can download them."
          >
            <button className="upload-zone" type="button">
              <FileUp aria-hidden="true" />
              Upload files (25 MB maximum)
            </button>
          </Field>
          <Field label="Reference URL">
            <input type="url" placeholder="https://" />
          </Field>
          <Field label="Additional JSON">
            <textarea rows={3} defaultValue={'{\n  "source": "renewal"\n}'} />
          </Field>
          <footer>
            <span>Submission creates an immutable revision.</span>
            <Button tone="accent" type="submit" disabled={!claimed}>
              Submit decision
            </Button>
          </footer>
        </form>
        <aside className="task-context">
          <Card>
            <h2>Assignment</h2>
            <dl>
              <div>
                <dt>Assignee</dt>
                <dd>{claimed ? "Maya Chen" : "Unassigned"}</dd>
              </div>
              <div>
                <dt>Queue</dt>
                <dd>Renewal operations</dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>2 business hours</dd>
              </div>
            </dl>
            {!claimed && <Button onClick={() => setClaimed(true)}>Claim task</Button>}
            <Button onClick={() => setClaimed(false)}>
              <Users aria-hidden="true" />
              Delegate
            </Button>
          </Card>
          <Card>
            <h2>Workflow context</h2>
            <p>
              The customer requested a non-standard renewal term. Two automated checks passed;
              commercial policy needs a human decision.
            </p>
            <Link to="/app/runs/run-1042">Open run room</Link>
          </Card>
          <Card>
            <h2>History</h2>
            <ol>
              <li>
                <strong>Assigned to you</strong>
                <small>Today, 10:42</small>
              </li>
              <li>
                <strong>Task created</strong>
                <small>Today, 10:41</small>
              </li>
            </ol>
          </Card>
          <Card>
            <h2>Conversation</h2>
            <textarea
              aria-label="Add a comment"
              rows={3}
              placeholder="Add context for collaborators"
            />
            <Button>Add comment</Button>
          </Card>
        </aside>
      </div>
    </TaskShell>
  );
}
