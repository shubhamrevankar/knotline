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
import { useEffect, useState } from "react";
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

  useEffect(() => {
    Promise.all([fetchWorkflows(), fetchWorkflow(selectedId)])
      .then(([items, selected]) => {
        setWorkflows(items);
        setWorkflow(selected);
        setConnected(true);
      })
      .catch(() => setConnected(false));
  }, [selectedId]);

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar sidebar--open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Knotline</span>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)}>
            ×
          </button>
        </div>

        <button className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span>
            <strong>Northstar Studio</strong>
            <small>Team workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>

        <nav className="nav-list" aria-label="Main navigation">
          {nav.map(({ label, icon: Icon, active, badge }) => (
            <button className={active ? "nav-item nav-item--active" : "nav-item"} key={label}>
              <Icon size={17} />
              <span>{label}</span>
              {badge && <b>{badge}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <span className="eyebrow">Saved views</span>
          <button className="nav-item">
            <span className="view-dot view-dot--lime" />
            Needs attention
            <b>4</b>
          </button>
          <button className="nav-item">
            <span className="view-dot view-dot--blue" />
            Running today
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item"><CircleHelp size={17} />Help & docs</button>
          <button className="nav-item"><Settings2 size={17} />Workspace settings</button>
          <div className="profile">
            <span className="profile-avatar">MC</span>
            <span><strong>Maya Chen</strong><small>maya@northstar</small></span>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)}>
            <Menu size={19} />
          </button>
          <button className="command-search">
            <Search size={16} />
            <span>Find anything…</span>
            <kbd><Command size={12} /> K</kbd>
          </button>
          <div className="top-actions">
            <span className={connected ? "connection connection--live" : "connection"}>
              <i />{connected ? "API live" : "Demo data"}
            </span>
            <button className="icon-button"><Bell size={18} /></button>
            <button className="primary-button"><Plus size={16} />New workflow</button>
          </div>
        </header>

        <section className="page">
          <div className="page-heading">
            <div>
              <span className="section-index">02 / OPERATIONS</span>
              <h1>Workflows</h1>
              <p>Design the path. Assign the judgment. Keep every run legible.</p>
            </div>
            <button className="secondary-button"><Library size={16} />Browse patterns</button>
          </div>

          <div className="metric-strip">
            <article><span>Runs in motion</span><strong>21</strong><small>↑ 14% this week</small></article>
            <article><span>Waiting on people</span><strong>04</strong><small>2 due today</small></article>
            <article><span>Agent success</span><strong>96.2%</strong><small>last 30 days</small></article>
            <article className="metric-highlight"><Sparkles size={17} /><span>Time returned</span><strong>38h</strong></article>
          </div>

          <div className="workspace-grid">
            <section className="workflow-list-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">Library</span><strong>{workflows.length} workflows</strong></div>
                <button className="icon-button"><Settings2 size={16} /></button>
              </div>
              <div className="workflow-list">
                {workflows.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === selectedId ? "workflow-card workflow-card--active" : "workflow-card"}
                    onClick={() => setSelectedId(item.id)}
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
                      <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="canvas-panel">
              <div className="canvas-header">
                <div>
                  <span className="eyebrow">Live map / v{workflow.version}</span>
                  <h2>{workflow.name}</h2>
                </div>
                <div className="canvas-actions">
                  <button className="secondary-button">Edit map</button>
                  <button className="run-button"><span />Run workflow</button>
                </div>
              </div>
              <WorkflowCanvas workflow={workflow} />
              <div className="canvas-legend">
                <span><i className="legend-dot legend-dot--running" />In motion</span>
                <span><i className="legend-dot legend-dot--waiting" />Waiting</span>
                <span><i className="legend-dot legend-dot--complete" />Complete</span>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
