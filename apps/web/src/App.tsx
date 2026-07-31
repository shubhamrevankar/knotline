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
import { useEffect, useRef, useState } from "react";
import type { Workflow, WorkflowSummary } from "@knotline/contracts";
import { fetchWorkflow, fetchWorkflows } from "./api";
import { i18n, msg } from "./i18n.js";
import { WorkflowCanvas } from "./WorkflowCanvas";

const nav = [
  { label: msg("customer.nav.pulse"), icon: Gauge },
  { label: msg("customer.nav.workflows"), icon: Blocks, active: true },
  { label: msg("customer.nav.runs"), icon: Activity, badge: "21" },
  { label: msg("customer.nav.agents"), icon: Bot },
  { label: msg("customer.nav.people"), icon: UsersRound },
  { label: msg("customer.nav.connections"), icon: Cable }
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [connected, setConnected] = useState(false);
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

        <button className="workspace-switcher" type="button">
          <span aria-hidden="true" className="workspace-avatar">
            N
          </span>
          <span>
            <strong>{msg("customer.workspace.name")}</strong>
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>

        <nav className="nav-list" aria-label={msg("customer.nav.main")}>
          {nav.map(({ label, icon: Icon, active, badge }) => (
            <button
              aria-current={active ? "page" : undefined}
              className={active ? "nav-item nav-item--active" : "nav-item"}
              key={label}
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
              {badge && <b>{badge}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <span className="eyebrow">{msg("customer.saved.heading")}</span>
          <button className="nav-item" type="button">
            <span aria-hidden="true" className="view-dot view-dot--lime" />
            {msg("customer.saved.attention")}
            <b>4</b>
          </button>
          <button className="nav-item" type="button">
            <span aria-hidden="true" className="view-dot view-dot--blue" />
            {msg("customer.saved.running")}
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item" type="button">
            <CircleHelp aria-hidden="true" size={17} />
            {msg("customer.help")}
          </button>
          <button className="nav-item" type="button">
            <Settings2 aria-hidden="true" size={17} />
            {msg("customer.settings")}
          </button>
          <div className="profile">
            <span aria-hidden="true" className="profile-avatar">
              {msg("customer.user.initials")}
            </span>
            <span>
              <strong>{msg("customer.user.name")}</strong>
              <small>{msg("customer.user.handle")}</small>
            </span>
            <ChevronDown aria-hidden="true" size={14} />
          </div>
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
          <button aria-label={msg("customer.search")} className="command-search" type="button">
            <Search aria-hidden="true" size={16} />
            <span>{msg("customer.search")}</span>
            <kbd>
              <Command aria-hidden="true" size={12} /> K
            </kbd>
          </button>
          <div className="top-actions">
            <span
              aria-live="polite"
              className={connected ? "connection connection--live" : "connection"}
              role="status"
            >
              <i aria-hidden="true" />
              {connected ? msg("customer.connection.api") : msg("customer.connection.fallback")}
            </span>
            <button
              aria-label={msg("customer.notifications")}
              className="icon-button"
              type="button"
            >
              <Bell aria-hidden="true" size={18} />
            </button>
            <button className="primary-button" type="button">
              <Plus aria-hidden="true" size={16} />
              {msg("customer.workflow.new")}
            </button>
          </div>
        </header>

        <section aria-labelledby="workflows-heading" className="page">
          <div className="page-heading">
            <div>
              <span className="section-index">{msg("customer.section.operations")}</span>
              <h1 id="workflows-heading">{msg("customer.workflow.heading")}</h1>
              <p>{msg("customer.workflow.tagline")}</p>
            </div>
            <button className="secondary-button" type="button">
              <Library aria-hidden="true" size={16} />
              {msg("customer.workflow.patterns")}
            </button>
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
                <button
                  aria-label={msg("customer.library.settings")}
                  className="icon-button"
                  type="button"
                >
                  <Settings2 aria-hidden="true" size={16} />
                </button>
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
                      <button className="secondary-button" type="button">
                        {msg("customer.map.edit")}
                      </button>
                      <button className="run-button" type="button">
                        <span aria-hidden="true" />
                        {msg("customer.map.run")}
                      </button>
                    </div>
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
        <button type="button" aria-current="page">
          <Blocks aria-hidden="true" size={18} />
          {msg("customer.nav.workflows")}
        </button>
        <button type="button">
          <Activity aria-hidden="true" size={18} />
          {msg("customer.nav.runs")}
        </button>
        <button type="button">
          <Plus aria-hidden="true" size={18} />
          {msg("customer.workflow.new")}
        </button>
      </nav>
    </div>
  );
}
