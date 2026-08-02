import {
  Activity,
  ArrowUpRight,
  Bell,
  Blocks,
  Bot,
  Cable,
  ChevronDown,
  CircleHelp,
  Command,
  Gauge,
  Library,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UsersRound
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Workflow, WorkflowSummary } from "@knotline/contracts";
import { createVersionedWorkflow, fetchWorkflow, fetchWorkflows, startWorkflowRun } from "./api";
import { i18n, msg } from "./i18n.js";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { GuidedWorkflowCreate } from "./GuidedWorkflowCreate.js";

const nav = [
  { label: msg("customer.nav.pulse"), icon: Gauge, to: "/app" },
  { label: msg("customer.nav.workflows"), icon: Blocks, to: "/app/workflows", active: true },
  { label: msg("customer.nav.runs"), icon: Activity, to: "/app/runs" },
  { label: msg("customer.nav.agents"), icon: Bot, to: "/app/agents" },
  { label: msg("customer.nav.people"), icon: UsersRound, to: "/app/settings/members" },
  { label: msg("customer.nav.connections"), icon: Cable, to: "/app/connections" }
];

function StatusPill({ status }: { status: WorkflowSummary["status"] }) {
  const label = {
    active: msg("customer.status.active"),
    archived: msg("customer.status.archived"),
    draft: msg("customer.status.draft"),
    paused: msg("customer.status.paused")
  }[status];
  return <span className={`workflow-status workflow-status--${status}`}>{label}</span>;
}

export function App() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [connected, setConnected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [runError, setRunError] = useState("");
  const [startingRun, setStartingRun] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchWorkflows()
      .then((items) => {
        setWorkflows(items);
        setConnected(true);
        setSelectedId((current) => current || items[0]?.id || "");
      })
      .catch(() => {
        setWorkflows([]);
        setWorkflow(null);
        setConnected(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchWorkflow(selectedId)
      .then((selected) => {
        setWorkflow(selected);
        setConnected(true);
      })
      .catch(() => {
        setWorkflow(null);
        setConnected(false);
      });
  }, [selectedId]);

  useEffect(() => {
    if (!sidebarOpen) return;

    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  const closeSidebar = () => {
    setSidebarOpen(false);
    menuButtonRef.current?.focus();
  };

  const createWorkflow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get("name");
    const description = form.get("description");
    if (typeof name !== "string" || typeof description !== "string") return;
    try {
      const created = await createVersionedWorkflow(name, description);
      const items = await fetchWorkflows();
      setWorkflows(items);
      setSelectedId(created.id);
      setCreating(false);
      setCreateError("");
    } catch (reason) {
      setCreateError(String(reason));
    }
  };

  const runWorkflow = async () => {
    if (!workflow || startingRun) return;
    setStartingRun(true);
    setRunError("");
    try {
      const run = await startWorkflowRun(workflow.id, {
        launchName: "Knotline governed operations launch",
        audience: "Operations, product, and customer teams",
        objective: "Produce an evidence-backed launch brief with explicit leadership approval"
      });
      void navigate(`/app/runs/${run.id}`);
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : "The run could not be started.");
    } finally {
      setStartingRun(false);
    }
  };

  return (
    <div className="app-shell">
      <aside
        aria-label={msg("customer.nav.label")}
        className={sidebarOpen ? "sidebar sidebar--open" : "sidebar"}
        id="workspace-navigation"
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{msg("brand.name")}</span>
          <button
            ref={closeButtonRef}
            aria-label={msg("customer.nav.close")}
            className="icon-button mobile-only"
            onClick={closeSidebar}
            type="button"
          >
            ×
          </button>
        </div>

        <Link className="workspace-switcher" to="/app/settings/workspace">
          <span aria-hidden="true" className="workspace-avatar">
            N
          </span>
          <span>
            <strong>{msg("customer.workspace.name")}</strong>
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </Link>

        <nav className="nav-list" aria-label={msg("customer.nav.main")}>
          {nav.map(({ label, icon: Icon, to, active }) => (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? "nav-item nav-item--active" : "nav-item"}
              key={label}
              onClick={closeSidebar}
              to={to}
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-section">
          <span className="eyebrow">{msg("customer.saved.heading")}</span>
          <Link className="nav-item" to="/app/inbox">
            <span aria-hidden="true" className="view-dot view-dot--lime" />
            {msg("customer.saved.attention")}
            <b>4</b>
          </Link>
          <Link className="nav-item" to="/app/runs?status=running">
            <span aria-hidden="true" className="view-dot view-dot--blue" />
            {msg("customer.saved.running")}
          </Link>
        </div>

        <div className="sidebar-footer">
          <Link className="nav-item" to="/help">
            <CircleHelp aria-hidden="true" size={17} />
            {msg("customer.help")}
          </Link>
          <Link className="nav-item" to="/app/settings/workspace">
            <Settings2 aria-hidden="true" size={17} />
            {msg("customer.settings")}
          </Link>
          <Link className="profile" to="/app/profile/sessions">
            <span aria-hidden="true" className="profile-avatar">
              {msg("customer.user.initials")}
            </span>
            <span>
              <strong>{msg("customer.user.name")}</strong>
              <small>{msg("customer.user.handle")}</small>
            </span>
            <ChevronDown aria-hidden="true" size={14} />
          </Link>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            aria-controls="workspace-navigation"
            aria-expanded={sidebarOpen}
            aria-label={msg("customer.nav.open")}
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" size={19} />
          </button>
          <Link aria-label={msg("customer.search")} className="command-search" to="/app/search">
            <Search aria-hidden="true" size={16} />
            <span>{msg("customer.search")}</span>
            <kbd>
              <Command aria-hidden="true" size={12} /> K
            </kbd>
          </Link>
          <div className="top-actions">
            <span
              aria-live="polite"
              className={connected ? "connection connection--live" : "connection"}
              role="status"
            >
              <i aria-hidden="true" />
              {connected ? msg("customer.connection.api") : msg("customer.connection.fallback")}
            </span>
            <Link
              aria-label={msg("customer.notifications")}
              className="icon-button"
              to="/app/notifications"
            >
              <Bell aria-hidden="true" size={18} />
            </Link>
            <button className="primary-button" onClick={() => setCreating(true)} type="button">
              <Plus aria-hidden="true" size={16} />
              {msg("customer.workflow.new")}
            </button>
          </div>
        </header>

        <div className="demo-banner" role="status">
          <strong>{msg("customer.demo.label")}</strong>
          <span>{msg("customer.demo.body")}</span>
          <Link to="/app/runs">{msg("run.list.heading")}</Link>
          <Link to="/app/inbox">{msg("customer.saved.attention")}</Link>
          <Link to="/app/agents">{msg("customer.nav.agents")}</Link>
          <Link to="/app/connections">{msg("customer.nav.connections")}</Link>
        </div>

        <section aria-labelledby="workflows-heading" className="page">
          {creating ? (
            <aside className="workflow-create-panel" aria-labelledby="workflow-create-heading">
              <div className="row-between">
                <h2 id="workflow-create-heading">{msg("workflow.create.heading")}</h2>
                <button
                  className="icon-button"
                  aria-label={msg("workflow.create.close")}
                  onClick={() => setCreating(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              <form onSubmit={(event) => void createWorkflow(event)}>
                <label>
                  {msg("workflow.create.name")}
                  <input name="name" required maxLength={120} />
                </label>
                <label>
                  {msg("workflow.create.description")}
                  <textarea name="description" maxLength={500} />
                </label>
                <button className="primary-button" type="submit">
                  {msg("workflow.create.submit")}
                </button>
              </form>
              <GuidedWorkflowCreate
                onCreated={(workflowId) => {
                  void fetchWorkflows().then(setWorkflows);
                  setSelectedId(workflowId);
                  setCreating(false);
                }}
              />
              <Link to="/app/workflows/new">{msg("generation.full.page")}</Link>
              {createError ? <p role="alert">{createError}</p> : null}
            </aside>
          ) : null}
          <div className="page-heading">
            <div>
              <span className="section-index">{msg("customer.section.operations")}</span>
              <h1 id="workflows-heading">{msg("customer.workflow.heading")}</h1>
              <p>{msg("customer.workflow.tagline")}</p>
            </div>
            <Link className="secondary-button" to="/app/templates">
              <Library aria-hidden="true" size={16} />
              {msg("customer.workflow.patterns")}
            </Link>
          </div>

          <div aria-label={msg("customer.metrics.label")} className="metric-strip" role="group">
            <article>
              <span>{msg("customer.metrics.runs")}</span>
              <strong>{i18n.number(21)}</strong>
              <small>{msg("customer.metrics.runsdetail")}</small>
            </article>
            <article>
              <span>{msg("customer.metrics.waiting")}</span>
              <strong>{i18n.number(4, { minimumIntegerDigits: 2 })}</strong>
              <small>{msg("customer.metrics.waitingdetail")}</small>
            </article>
            <article>
              <span>{msg("customer.metrics.agent")}</span>
              <strong>{i18n.number(0.962, { style: "percent", maximumFractionDigits: 1 })}</strong>
              <small>{msg("customer.metrics.agentdetail")}</small>
            </article>
            <article className="metric-highlight">
              <Sparkles aria-hidden="true" size={17} />
              <span>{msg("customer.metrics.time")}</span>
              <strong>{msg("customer.metrics.hours", { count: i18n.number(38) })}</strong>
            </article>
          </div>

          <div className="workspace-grid">
            <section aria-labelledby="workflow-library-heading" className="workflow-list-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{msg("customer.library.heading")}</span>
                  <strong id="workflow-library-heading">
                    {msg("customer.library.count", { count: workflows.length })}
                  </strong>
                </div>
                <Link
                  aria-label={msg("customer.library.settings")}
                  className="icon-button"
                  to="/app/templates"
                >
                  <Settings2 aria-hidden="true" size={16} />
                </Link>
              </div>
              <div
                aria-label={msg("customer.library.group")}
                className="workflow-list"
                role="group"
              >
                {workflows.map((item) => (
                  <button
                    aria-pressed={item.id === selectedId}
                    key={item.id}
                    className={
                      item.id === selectedId
                        ? "workflow-card workflow-card--active"
                        : "workflow-card"
                    }
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <span className="workflow-card-top">
                      <StatusPill status={item.status} />
                      <small>v{item.version}</small>
                    </span>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    <span className="workflow-meta">
                      <span>{msg("customer.workflow.steps", { count: item.nodeCount })}</span>
                      <span>{msg("customer.workflow.runs", { count: item.activeRuns })}</span>
                      <ArrowUpRight aria-hidden="true" size={15} />
                    </span>
                  </button>
                ))}
                {!connected && workflows.length === 0 ? (
                  <p role="status">{msg("app.loading.workspace")}</p>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="selected-workflow-heading" className="canvas-panel">
              {workflow ? (
                <>
                  <div className="canvas-header">
                    <div>
                      <span className="eyebrow">
                        {msg("customer.map.version", { version: workflow.version })}
                      </span>
                      <h2 id="selected-workflow-heading">{workflow.name}</h2>
                    </div>
                    <div className="canvas-actions">
                      <Link className="secondary-button" to={`/app/workflows/${workflow.id}`}>
                        {msg("customer.map.edit")}
                      </Link>
                      <button
                        className="run-button"
                        disabled={startingRun}
                        onClick={() => void runWorkflow()}
                        type="button"
                      >
                        <span aria-hidden="true" />
                        {startingRun ? "Starting…" : msg("customer.map.run")}
                      </button>
                    </div>
                    {runError && <p className="workflow-run-error">{runError}</p>}
                  </div>
                  <WorkflowCanvas workflow={workflow} />
                </>
              ) : (
                <div className="canvas-header">
                  <h2 id="selected-workflow-heading">{msg("app.loading.workspace")}</h2>
                </div>
              )}
              <div aria-label={msg("customer.map.legend")} className="canvas-legend" role="group">
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--running" />
                  {msg("customer.map.running")}
                </span>
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--waiting" />
                  {msg("customer.map.waiting")}
                </span>
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--complete" />
                  {msg("customer.map.complete")}
                </span>
              </div>
            </section>
          </div>
        </section>
      </main>
      <nav className="mobile-bottom-nav" aria-label={msg("customer.nav.mobile")}>
        <Link to="/app/workflows" aria-current="page">
          <Blocks aria-hidden="true" size={18} />
          {msg("customer.nav.workflows")}
        </Link>
        <Link to="/app/runs">
          <Activity aria-hidden="true" size={18} />
          {msg("customer.nav.runs")}
        </Link>
        <Link to="/app/workflows/new">
          <Plus aria-hidden="true" size={18} />
          {msg("customer.workflow.new")}
        </Link>
      </nav>
    </div>
  );
}
