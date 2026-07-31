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
import { demoWorkflow, demoWorkflows } from "./demo";
import { WorkflowCanvas } from "./WorkflowCanvas";

const nav = [
  { label: "Pulse", icon: Gauge },
  { label: "Workflows", icon: Blocks, active: true },
  { label: "Runs", icon: Activity, badge: "21" },
  { label: "Agents", icon: Bot },
  { label: "People", icon: UsersRound },
  { label: "Connections", icon: Cable }
];

function StatusPill({ status }: { status: WorkflowSummary["status"] }) {
  return <span className={`workflow-status workflow-status--${status}`}>{status}</span>;
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>(demoWorkflows);
  const [workflow, setWorkflow] = useState<Workflow>(demoWorkflow);
  const [selectedId, setSelectedId] = useState(demoWorkflow.id);
  const [connected, setConnected] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    Promise.all([fetchWorkflows(), fetchWorkflow(selectedId)])
      .then(([items, selected]) => {
        setWorkflows(items);
        setWorkflow(selected);
        setConnected(true);
      })
      .catch(() => setConnected(false));
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
        aria-label="Workspace navigation"
        className={sidebarOpen ? "sidebar sidebar--open" : "sidebar"}
        id="workspace-navigation"
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Knotline</span>
          <button
            ref={closeButtonRef}
            aria-label="Close navigation"
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
            <strong>Northstar Studio</strong>
            <small>DEMO team workspace</small>
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>

        <nav className="nav-list" aria-label="Main navigation">
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
          <span className="eyebrow">Saved views</span>
          <button className="nav-item" type="button">
            <span aria-hidden="true" className="view-dot view-dot--lime" />
            Needs attention
            <b>4</b>
          </button>
          <button className="nav-item" type="button">
            <span aria-hidden="true" className="view-dot view-dot--blue" />
            Running today
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item" type="button">
            <CircleHelp aria-hidden="true" size={17} />
            Help & docs
          </button>
          <button className="nav-item" type="button">
            <Settings2 aria-hidden="true" size={17} />
            Workspace settings
          </button>
          <div className="profile">
            <span aria-hidden="true" className="profile-avatar">
              MC
            </span>
            <span>
              <strong>Maya Chen</strong>
              <small>maya@northstar</small>
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
            aria-label="Open navigation"
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" size={19} />
          </button>
          <button aria-label="Find anything" className="command-search" type="button">
            <Search aria-hidden="true" size={16} />
            <span>Find anything…</span>
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
              {connected ? "Demo API" : "Demo fallback"}
            </span>
            <button aria-label="Notifications" className="icon-button" type="button">
              <Bell aria-hidden="true" size={18} />
            </button>
            <button className="primary-button" type="button">
              <Plus aria-hidden="true" size={16} />
              New workflow
            </button>
          </div>
        </header>

        <div aria-label="Demo environment" className="demo-banner" role="note">
          <strong>DEMO</strong>
          <span>
            Sample workspace, identity, workflows, runs, and metrics. No production activity.
          </span>
        </div>

        <section aria-labelledby="workflows-heading" className="page">
          <div className="page-heading">
            <div>
              <span className="section-index">02 / OPERATIONS</span>
              <h1 id="workflows-heading">Workflows</h1>
              <p>Design the path. Assign the judgment. Keep every run legible.</p>
            </div>
            <button className="secondary-button" type="button">
              <Library aria-hidden="true" size={16} />
              Browse patterns
            </button>
          </div>

          <div aria-label="Demo activity metrics" className="metric-strip" role="group">
            <article>
              <span>Runs in motion</span>
              <strong>21</strong>
              <small>↑ 14% this week</small>
            </article>
            <article>
              <span>Waiting on people</span>
              <strong>04</strong>
              <small>2 due today</small>
            </article>
            <article>
              <span>Agent success</span>
              <strong>96.2%</strong>
              <small>last 30 days</small>
            </article>
            <article className="metric-highlight">
              <Sparkles aria-hidden="true" size={17} />
              <span>Time returned</span>
              <strong>38h</strong>
            </article>
          </div>

          <div className="workspace-grid">
            <section aria-labelledby="workflow-library-heading" className="workflow-list-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Library</span>
                  <strong id="workflow-library-heading">{workflows.length} workflows</strong>
                </div>
                <button
                  aria-label="Workflow library settings"
                  className="icon-button"
                  type="button"
                >
                  <Settings2 aria-hidden="true" size={16} />
                </button>
              </div>
              <div aria-label="Demo workflows" className="workflow-list" role="group">
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
                      <span>{item.nodeCount} steps</span>
                      <span>{item.activeRuns} active runs</span>
                      <ArrowUpRight aria-hidden="true" size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="selected-workflow-heading" className="canvas-panel">
              <div className="canvas-header">
                <div>
                  <span className="eyebrow">Demo map / v{workflow.version}</span>
                  <h2 id="selected-workflow-heading">{workflow.name}</h2>
                </div>
                <div className="canvas-actions">
                  <button className="secondary-button" type="button">
                    Edit map
                  </button>
                  <button className="run-button" type="button">
                    <span aria-hidden="true" />
                    Run workflow
                  </button>
                </div>
              </div>
              <WorkflowCanvas workflow={workflow} />
              <div aria-label="Workflow status legend" className="canvas-legend" role="group">
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--running" />
                  In motion
                </span>
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--waiting" />
                  Waiting
                </span>
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--complete" />
                  Complete
                </span>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
