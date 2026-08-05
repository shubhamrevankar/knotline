/* eslint-disable knotline/no-hardcoded-user-visible-string -- Shared workspace navigation is being consolidated before catalog extraction. */
import {
  Activity,
  Bell,
  Blocks,
  Bot,
  Cable,
  ChevronDown,
  CircleHelp,
  Command,
  Gauge,
  LibraryBig,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  UsersRound
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { msg } from "./i18n.js";
import { fetchMeBootstrap, type MeBootstrap } from "./api.js";
import { WorkspaceSearch } from "./WorkspaceSearch.js";
import { KnotlineMark } from "./KnotlineLogo.js";

const collapsePreference = "knotline.workspace-sidebar-collapsed";
const WorkspaceShellContext = createContext(false);

const primaryNavigation = [
  { label: "Pulse", icon: Gauge, to: "/app", matches: (path: string) => path === "/app" },
  {
    label: "Workflows",
    icon: Blocks,
    to: "/app/workflows",
    matches: (path: string) => path.startsWith("/app/workflows")
  },
  {
    label: "Runs",
    icon: Activity,
    to: "/app/runs",
    matches: (path: string) => path.startsWith("/app/runs")
  },
  {
    label: "Agents",
    icon: Bot,
    to: "/app/agents",
    matches: (path: string) => path.startsWith("/app/agents")
  },
  {
    label: "People",
    icon: UsersRound,
    to: "/app/settings/members",
    matches: (path: string) => path.startsWith("/app/settings/members")
  },
  {
    label: "Connections",
    icon: Cable,
    to: "/app/connections",
    matches: (path: string) => path.startsWith("/app/connections")
  },
  {
    label: "Knowledge",
    icon: LibraryBig,
    to: "/app/knowledge/sources",
    matches: (path: string) => path.startsWith("/app/knowledge")
  }
] as const;

export function WorkspaceShell({
  children,
  connected = true,
  contentClassName = ""
}: {
  readonly children: ReactNode;
  readonly connected?: boolean;
  readonly contentClassName?: string;
}) {
  const nested = useContext(WorkspaceShellContext);
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [identity, setIdentity] = useState<MeBootstrap>();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return globalThis.localStorage.getItem(collapsePreference) === "true";
    } catch {
      return false;
    }
  });
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(collapsePreference, String(collapsed));
    } catch {
      // The shell remains usable when storage is unavailable.
    }
  }, [collapsed]);

  useEffect(() => {
    const loadIdentity = () =>
      void fetchMeBootstrap()
        .then(setIdentity)
        .catch(() => undefined);
    loadIdentity();
    globalThis.addEventListener("knotline:profile-updated", loadIdentity);
    return () => globalThis.removeEventListener("knotline:profile-updated", loadIdentity);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      menuButtonRef.current?.focus();
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      const commandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slashShortcut = event.key === "/" && !editing && !event.metaKey && !event.ctrlKey;
      if (!commandShortcut && !slashShortcut) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    globalThis.addEventListener("keydown", openSearch);
    return () => globalThis.removeEventListener("keydown", openSearch);
  }, []);

  const closeMobileSidebar = () => setSidebarOpen(false);
  const activeUtility = location.pathname.startsWith("/app/inbox")
    ? "inbox"
    : location.pathname.startsWith("/app/approvals")
      ? "approvals"
      : undefined;

  if (nested)
    return contentClassName ? <div className={contentClassName}>{children}</div> : <>{children}</>;

  return (
    <WorkspaceShellContext.Provider value>
      <div className={`app-shell app-shell--activation${collapsed ? " app-shell--collapsed" : ""}`}>
        <aside
          aria-label="Workspace navigation"
          className={sidebarOpen ? "sidebar sidebar--open" : "sidebar"}
          id="workspace-navigation"
        >
          <div className="brand">
            <Link aria-label="Knotline home" className="brand-home" to="/app/workflows">
              <KnotlineMark className="brand-mark" size={25} />
              <span className="sidebar-label">{msg("brand.name")}</span>
            </Link>
            <button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              className="sidebar-collapse"
              onClick={() => setCollapsed((current) => !current)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
            <button
              ref={closeButtonRef}
              aria-label="Close navigation"
              className="icon-button mobile-only"
              onClick={closeMobileSidebar}
              type="button"
            >
              ×
            </button>
          </div>

          <Link
            className="workspace-switcher"
            title={
              identity?.workspaces.find((item) => item.id === identity.activeWorkspaceId)?.name ??
              "Workspace"
            }
            to="/app/settings/workspace"
          >
            <span aria-hidden="true" className="workspace-avatar">
              {(identity?.workspaces.find((item) => item.id === identity.activeWorkspaceId)?.name ??
                "Workspace")[0]?.toUpperCase()}
            </span>
            <span className="sidebar-label">
              <strong>
                {identity?.workspaces.find((item) => item.id === identity.activeWorkspaceId)
                  ?.name ?? "Workspace"}
              </strong>
            </span>
            <ChevronDown className="sidebar-label" aria-hidden="true" size={15} />
          </Link>

          <nav className="nav-list" aria-label="Workspace">
            {primaryNavigation.map(({ label, icon: Icon, to, matches }) => {
              const active = matches(location.pathname);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "nav-item nav-item--active" : "nav-item"}
                  key={label}
                  onClick={closeMobileSidebar}
                  title={collapsed ? label : undefined}
                  to={to}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span className="sidebar-label">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-section">
            <span className="eyebrow sidebar-label">Saved views</span>
            <Link
              aria-current={activeUtility === "inbox" ? "page" : undefined}
              className={activeUtility === "inbox" ? "nav-item nav-item--active" : "nav-item"}
              title={collapsed ? "Needs attention" : undefined}
              to="/app/inbox"
            >
              <span aria-hidden="true" className="view-dot view-dot--lime" />
              <span className="sidebar-label">Needs attention</span>
              <b className="sidebar-label">4</b>
            </Link>
            <Link
              className="nav-item"
              title={collapsed ? "Running now" : undefined}
              to="/app/runs?status=running"
            >
              <span aria-hidden="true" className="view-dot view-dot--blue" />
              <span className="sidebar-label">Running now</span>
            </Link>
            <Link
              aria-current={activeUtility === "approvals" ? "page" : undefined}
              className={activeUtility === "approvals" ? "nav-item nav-item--active" : "nav-item"}
              title={collapsed ? "Approvals" : undefined}
              to="/app/approvals"
            >
              <span aria-hidden="true" className="view-dot view-dot--amber" />
              <span className="sidebar-label">Approvals</span>
            </Link>
          </div>

          <div className="sidebar-footer">
            <Link className="nav-item" title={collapsed ? "Help and docs" : undefined} to="/help">
              <CircleHelp aria-hidden="true" size={17} />
              <span className="sidebar-label">Help and docs</span>
            </Link>
            <Link
              className="nav-item"
              title={collapsed ? "Workspace settings" : undefined}
              to="/app/settings/workspace"
            >
              <Settings2 aria-hidden="true" size={17} />
              <span className="sidebar-label">Workspace settings</span>
            </Link>
            <Link
              className="profile"
              title={collapsed ? (identity?.user.displayName ?? "Profile") : undefined}
              to="/app/profile"
            >
              <span aria-hidden="true" className="profile-avatar">
                {(identity?.user.displayName ?? "User")
                  .split(/\s+/u)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </span>
              <span className="sidebar-label">
                <strong>{identity?.user.displayName ?? "Your profile"}</strong>
                <small>{identity?.user.email ?? "Account settings"}</small>
              </span>
              <ChevronDown className="sidebar-label" aria-hidden="true" size={14} />
            </Link>
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
            <button
              aria-haspopup="dialog"
              aria-label="Open workspace search"
              className="command-search"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search aria-hidden="true" size={16} />
              <span>Find anything…</span>
              <kbd>
                <Command aria-hidden="true" size={12} /> K
              </kbd>
            </button>
            <div className="top-actions">
              <span
                className={connected ? "connection connection--live" : "connection"}
                role="status"
              >
                <i aria-hidden="true" />
                {connected ? "Workspace connected" : "Connecting…"}
              </span>
              <Link aria-label="Notifications" className="icon-button" to="/app/notifications">
                <Bell aria-hidden="true" size={18} />
              </Link>
              <Link className="primary-button" to="/app/workflows/new">
                <Plus aria-hidden="true" size={16} /> New workflow
              </Link>
            </div>
          </header>
          <div className={contentClassName}>{children}</div>
        </main>

        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          <Link
            aria-current={location.pathname.startsWith("/app/workflows") ? "page" : undefined}
            to="/app/workflows"
          >
            <Blocks aria-hidden="true" size={18} /> Workflows
          </Link>
          <Link
            aria-current={location.pathname.startsWith("/app/runs") ? "page" : undefined}
            to="/app/runs"
          >
            <Activity aria-hidden="true" size={18} /> Runs
          </Link>
          <Link aria-current={activeUtility ? "page" : undefined} to="/app/inbox">
            <Bell aria-hidden="true" size={18} /> Inbox
          </Link>
        </nav>
        <WorkspaceSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </WorkspaceShellContext.Provider>
  );
}
