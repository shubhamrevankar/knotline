/* eslint-disable knotline/no-hardcoded-user-visible-string, react-hooks/set-state-in-effect -- Workspace administration copy moves into the full locale catalog at M33; loaders synchronize route state with the API. */
import { AlertDialog, Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  Building2,
  Clock3,
  Mail,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Shield,
  Trash2,
  UserRoundCheck,
  Users,
  UserX
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import {
  archiveWorkspace,
  cancelInvitation,
  createGroup,
  createRole,
  createWorkspace,
  deleteGroup,
  deleteRole,
  fetchGroups,
  fetchInvitations,
  fetchMeBootstrap,
  fetchMembers,
  fetchRoles,
  fetchWorkspaces,
  inviteMember,
  removeMember,
  resendInvitation,
  restoreWorkspace,
  saveGroup,
  switchWorkspace,
  transferOwnership,
  updateMember,
  updateRole,
  updateWorkspace,
  type MeBootstrap,
  type WorkspaceGroup,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
  type WorkspaceSummary
} from "./api.js";
import { AuthGate } from "./AuthPages.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import "./M05Pages.css";

const permissionCatalog = [
  "workspace.read",
  "workspace.update",
  "workspace.archive",
  "workspace.delete",
  "member.read",
  "member.invite",
  "member.update",
  "member.remove",
  "ownership.transfer",
  "role.read",
  "role.manage",
  "group.read",
  "group.manage",
  "workflow.read",
  "workflow.create",
  "workflow.manage",
  "billing.read",
  "billing.manage",
  "audit.read"
] as const;

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong. Try again.";
}

function formValue(form: FormData, key: string, fallback = "") {
  const value = form.get(key);
  return typeof value === "string" ? value : fallback;
}

function AdminFrame({
  children,
  title,
  description
}: {
  readonly children: ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <AuthGate>
      <WorkspaceShell contentClassName="access-shell-content">
        <main className="access-page">
          <header className="access-heading">
            <div>
              <span className="access-eyebrow">Workspace administration</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <Link className="access-back-link" to="/app/workflows">
              Back to workflows
            </Link>
          </header>
          <nav className="access-tabs" aria-label="Workspace settings">
            <NavLink to="/app/settings/workspace">Workspace</NavLink>
            <NavLink to="/app/settings/members">People</NavLink>
            <NavLink to="/app/settings/roles">Roles & groups</NavLink>
            <NavLink to="/app/onboarding">Setup guide</NavLink>
          </nav>
          {children}
        </main>
      </WorkspaceShell>
    </AuthGate>
  );
}

function useAccessContext() {
  const [bootstrap, setBootstrap] = useState<MeBootstrap>();
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setBootstrap(await fetchMeBootstrap());
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const has = useCallback(
    (permission: string) =>
      Boolean(
        bootstrap?.permissions?.includes("*") || bootstrap?.permissions?.includes(permission)
      ),
    [bootstrap]
  );
  return { bootstrap, error, reload, has };
}

function Loading({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <AdminFrame title={title} description={description}>
      <Skeleton label="Loading workspace access" />
    </AdminFrame>
  );
}

function Failure({
  title,
  description,
  message
}: {
  readonly title: string;
  readonly description: string;
  readonly message: string;
}) {
  return (
    <AdminFrame title={title} description={description}>
      <ErrorState title="Workspace access is unavailable">
        <p>{message}</p>
      </ErrorState>
    </AdminFrame>
  );
}

function Notice({ children }: { readonly children: string }) {
  return (
    <p className="access-notice" role="status">
      {children}
    </p>
  );
}

export function WorkspaceSettingsPage() {
  const title = "Workspace settings";
  const description =
    "Control workspace identity, regional defaults, context switching, and lifecycle.";
  const { bootstrap, error, reload: reloadContext, has } = useAccessContext();
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>();
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<WorkspaceSummary>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setWorkspaces(await fetchWorkspaces());
      await reloadContext();
    } catch (reason) {
      setNotice(errorMessage(reason));
    }
  }, [reloadContext]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <Failure title={title} description={description} message={error} />;
  if (!bootstrap || !workspaces) return <Loading title={title} description={description} />;
  const active = workspaces.find(({ id }) => id === bootstrap.activeWorkspaceId);
  const replacement = workspaces.find(({ id, state }) => id !== active?.id && state === "active");
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const workspace = await createWorkspace({
        name: formValue(form, "name"),
        timezone: formValue(form, "timezone", "UTC"),
        locale: formValue(form, "locale", "en"),
        region: formValue(form, "region", "local")
      });
      await switchWorkspace(workspace.id);
      setCreateOpen(false);
      setNotice("Workspace created and selected.");
      await load();
    } catch (reason) {
      setNotice(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminFrame title={title} description={description}>
      {notice ? <Notice>{notice}</Notice> : null}
      <section className="access-summary-grid" aria-label="Workspace summary">
        <Card>
          <Building2 aria-hidden="true" />
          <span>Current workspace</span>
          <strong>{active?.name ?? "—"}</strong>
        </Card>
        <Card>
          <UserRoundCheck aria-hidden="true" />
          <span>Your access</span>
          <strong>{bootstrap.role ?? "Member"}</strong>
        </Card>
        <Card>
          <Shield aria-hidden="true" />
          <span>Data region</span>
          <strong>{active?.region ?? "—"}</strong>
        </Card>
      </section>
      <div className="access-section-heading">
        <div>
          <h2>Your workspaces</h2>
          <p>Switch context without mixing data, permissions, or cached results.</p>
        </div>
        <Button tone="accent" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" /> New workspace
        </Button>
      </div>
      <section className="access-card-grid" aria-label="Your workspaces">
        {workspaces.map((workspace) => (
          <Card
            key={workspace.id}
            className={`access-workspace-card${workspace.id === active?.id ? " is-active" : ""}`}
          >
            <div className="access-card-topline">
              <span className="access-icon">
                <Building2 aria-hidden="true" />
              </span>
              <Badge tone={workspace.state === "active" ? "success" : "warning"}>
                {workspace.state}
              </Badge>
            </div>
            <div>
              <h3>{workspace.name}</h3>
              <p>
                {workspace.role} · {workspace.region} · {workspace.timezone}
              </p>
              {workspace.isSandbox ? (
                <strong className="access-sandbox">{workspace.sandboxLabel}</strong>
              ) : null}
            </div>
            <div className="access-row-actions">
              {workspace.id !== active?.id && workspace.state === "active" ? (
                <Button
                  size="sm"
                  onClick={() =>
                    void switchWorkspace(workspace.id)
                      .then(load)
                      .then(() => setNotice(`Switched to ${workspace.name}.`))
                      .catch((reason) => setNotice(errorMessage(reason)))
                  }
                >
                  Switch workspace
                </Button>
              ) : null}
              {workspace.id === active?.id && workspace.state === "active" ? (
                <Button
                  size="sm"
                  disabled={!has("workspace.archive") || !replacement}
                  title={
                    !replacement ? "Create another workspace before archiving this one." : undefined
                  }
                  onClick={() => setArchiveTarget(workspace)}
                >
                  Archive
                </Button>
              ) : null}
              {workspace.state === "archived" ? (
                <Button
                  size="sm"
                  onClick={() =>
                    void switchWorkspace(workspace.id)
                      .then(() => restoreWorkspace(workspace.id))
                      .then(load)
                      .then(() => setNotice("Workspace restored."))
                      .catch((reason) => setNotice(errorMessage(reason)))
                  }
                >
                  Restore
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </section>
      {active ? (
        <>
          <Card className="access-panel">
            <div className="access-section-heading">
              <div>
                <h2>Workspace preferences</h2>
                <p>Used for schedules, dates, language, and regional processing.</p>
              </div>
            </div>
            <form
              className="access-form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void updateWorkspace(active.id, {
                  name: formValue(form, "name"),
                  timezone: formValue(form, "timezone", "UTC"),
                  locale: formValue(form, "locale", "en"),
                  region: formValue(form, "region", "local")
                })
                  .then(load)
                  .then(() => setNotice("Workspace preferences saved."))
                  .catch((reason) => setNotice(errorMessage(reason)));
              }}
            >
              <label>
                Workspace name
                <input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={active.name}
                  disabled={!has("workspace.update")}
                />
              </label>
              <label>
                Timezone
                <input
                  name="timezone"
                  required
                  defaultValue={active.timezone}
                  disabled={!has("workspace.update")}
                  list="workspace-timezones"
                />
                <datalist id="workspace-timezones">
                  <option value="UTC" />
                  <option value="Asia/Kolkata" />
                  <option value="America/New_York" />
                  <option value="Europe/London" />
                </datalist>
              </label>
              <label>
                Locale
                <select
                  name="locale"
                  defaultValue={active.locale}
                  disabled={!has("workspace.update")}
                >
                  <option value="en">English</option>
                  <option value="en-IN">English (India)</option>
                  <option value="en-GB">English (UK)</option>
                </select>
              </label>
              <label>
                Region
                <input
                  name="region"
                  required
                  defaultValue={active.region}
                  disabled={!has("workspace.update")}
                />
              </label>
              <Button tone="accent" type="submit" disabled={!has("workspace.update")}>
                Save preferences
              </Button>
            </form>
          </Card>
          <Card className="access-panel access-danger-zone">
            <div>
              <h2>Data export & workspace deletion</h2>
              <p>
                Exports and deletion requests use the governed data lifecycle, including legal-hold
                checks and durable job status.
              </p>
            </div>
            <Link className="access-danger-link" to="/app/settings/data">
              Open data controls
            </Link>
          </Card>
        </>
      ) : null}
      <AlertDialog
        open={createOpen}
        onDismiss={() => setCreateOpen(false)}
        title="Create a workspace"
      >
        <p>
          Start with isolated members, workflows, policies, and data. You can change these defaults
          later.
        </p>
        <form className="access-dialog-form" onSubmit={(event) => void create(event)}>
          <label>
            Workspace name
            <input name="name" required maxLength={160} />
          </label>
          <label>
            Timezone
            <input
              name="timezone"
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
              required
            />
          </label>
          <label>
            Locale
            <select name="locale" defaultValue="en">
              <option value="en">English</option>
              <option value="en-IN">English (India)</option>
            </select>
          </label>
          <label>
            Region
            <input name="region" defaultValue="local" required />
          </label>
          <div className="access-dialog-actions">
            <Button type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button tone="accent" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </div>
        </form>
      </AlertDialog>
      <AlertDialog
        open={Boolean(archiveTarget)}
        onDismiss={() => setArchiveTarget(undefined)}
        title="Archive workspace?"
      >
        <p>
          Members will no longer be able to enter <strong>{archiveTarget?.name}</strong>. Its data
          stays preserved and can be restored later.
        </p>
        <div className="access-dialog-actions">
          <Button onClick={() => setArchiveTarget(undefined)}>Keep active</Button>
          <Button
            tone="danger"
            disabled={!replacement}
            onClick={() => {
              if (!archiveTarget || !replacement) return;
              void archiveWorkspace(archiveTarget.id)
                .then(() => switchWorkspace(replacement.id))
                .then(load)
                .then(() => {
                  setArchiveTarget(undefined);
                  setNotice("Workspace archived.");
                })
                .catch((reason) => setNotice(errorMessage(reason)));
            }}
          >
            Archive workspace
          </Button>
        </div>
      </AlertDialog>
    </AdminFrame>
  );
}

type MemberAction = {
  readonly kind: "suspend" | "restore" | "remove" | "transfer";
  readonly member: WorkspaceMember;
};

export function MembersPage() {
  const title = "People";
  const description =
    "Invite teammates, control access, and preserve clear ownership across your workspace.";
  const { bootstrap, error, has } = useAccessContext();
  const workspace = bootstrap?.activeWorkspaceId;
  const [members, setMembers] = useState<readonly WorkspaceMember[]>();
  const [invitations, setInvitations] = useState<readonly WorkspaceInvitation[]>();
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<MemberAction>();
  const [assigneeId, setAssigneeId] = useState("");
  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [nextMembers, nextInvitations, nextRoles] = await Promise.all([
        fetchMembers(workspace),
        fetchInvitations(workspace),
        fetchRoles(workspace)
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
      setRoles(nextRoles);
    } catch (reason) {
      setNotice(errorMessage(reason));
    }
  }, [workspace]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <Failure title={title} description={description} message={error} />;
  if (!bootstrap || !workspace || !members || !invitations)
    return <Loading title={title} description={description} />;
  const pending = invitations.filter(({ state }) => state === "pending");
  const roleOptions = roles.filter(({ key }) => key !== "owner");
  const visible = members.filter(
    (member) =>
      `${member.displayName} ${member.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (status === "all" || member.state === status)
  );
  const optionsForMember = (member: WorkspaceMember) =>
    member.role === "owner"
      ? [{ id: "owner", key: "owner", name: "Owner", system: true }]
      : roleOptions;
  return (
    <AdminFrame title={title} description={description}>
      {notice ? <Notice>{notice}</Notice> : null}
      <section className="access-summary-grid" aria-label="People summary">
        <Card>
          <UserRoundCheck aria-hidden="true" />
          <span>Active members</span>
          <strong>{members.filter(({ state }) => state === "active").length}</strong>
        </Card>
        <Card>
          <Mail aria-hidden="true" />
          <span>Pending invitations</span>
          <strong>{pending.length}</strong>
        </Card>
        <Card>
          <Shield aria-hidden="true" />
          <span>Custom roles</span>
          <strong>{roles.filter(({ system }) => !system).length}</strong>
        </Card>
      </section>
      <Card className="access-panel access-invite-panel">
        <div>
          <h2>Invite people</h2>
          <p>
            Give each teammate the least access they need. Secure links expire after seven days.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const customRoleId = role.startsWith("custom:") ? role.slice(7) : undefined;
            void inviteMember(workspace, email, customRoleId ? "custom" : role, customRoleId)
              .then(load)
              .then(() => {
                setEmail("");
                setNotice(`Invitation sent to ${email}.`);
              })
              .catch((reason) => setNotice(errorMessage(reason)));
          }}
        >
          <label>
            Work email
            <input
              aria-label="Work email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
          </label>
          <label>
            Role
            <select
              aria-label="Invitation role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {roleOptions.map((candidate) => (
                <option
                  key={candidate.id}
                  value={candidate.system ? candidate.key : `custom:${candidate.id}`}
                >
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <Button tone="accent" type="submit" disabled={!has("member.invite")}>
            Send invitation
          </Button>
        </form>
        {!has("member.invite") ? (
          <p className="access-help">You need the member.invite permission to send invitations.</p>
        ) : null}
      </Card>
      <div className="access-section-heading">
        <div>
          <h2>Members</h2>
          <p>Search people, update roles, and manage access safely.</p>
        </div>
      </div>
      <div className="access-toolbar">
        <label className="access-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
          />
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="removed">Removed</option>
          </select>
        </label>
      </div>
      <div className="access-table" role="list" aria-label="Workspace members">
        {visible.map((member) => (
          <article key={member.id} className="access-person-row" role="listitem">
            <span className="access-avatar" aria-hidden="true">
              {member.displayName
                .split(/\s+/u)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="access-person-identity">
              <strong>
                {member.displayName}
                {member.userId === bootstrap.user.id ? " (you)" : ""}
              </strong>
              <span>{member.email}</span>
            </div>
            <Badge tone={member.state === "active" ? "success" : "warning"}>{member.state}</Badge>
            <label className="access-role-select">
              <span>Role</span>
              <select
                aria-label={`Role for ${member.displayName}`}
                value={
                  member.role === "custom" ? `custom:${member.customRoleId ?? ""}` : member.role
                }
                disabled={
                  !has("member.update") || member.role === "owner" || member.state === "removed"
                }
                onChange={(event) => {
                  const value = event.target.value;
                  const customRoleId = value.startsWith("custom:") ? value.slice(7) : undefined;
                  void updateMember(workspace, member.id, {
                    role: customRoleId ? "custom" : value,
                    ...(customRoleId ? { customRoleId } : {})
                  })
                    .then(load)
                    .then(() => setNotice(`${member.displayName}'s role was updated.`))
                    .catch((reason) => setNotice(errorMessage(reason)));
                }}
              >
                {optionsForMember(member).map((candidate) => (
                  <option
                    key={candidate.id}
                    value={candidate.system ? candidate.key : `custom:${candidate.id}`}
                  >
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="access-row-actions">
              {member.role !== "owner" && member.state !== "removed" ? (
                <Button
                  size="sm"
                  disabled={!has("member.update")}
                  onClick={() =>
                    setAction({
                      kind: member.state === "suspended" ? "restore" : "suspend",
                      member
                    })
                  }
                >
                  {member.state === "suspended" ? (
                    <RotateCw aria-hidden="true" />
                  ) : (
                    <UserX aria-hidden="true" />
                  )}
                  {member.state === "suspended" ? "Restore" : "Suspend"}
                </Button>
              ) : null}
              {member.role !== "owner" && member.state !== "removed" ? (
                <Button
                  size="sm"
                  disabled={!has("member.remove")}
                  onClick={() => {
                    setAssigneeId(
                      members.find(
                        (candidate) => candidate.id !== member.id && candidate.state === "active"
                      )?.id ?? ""
                    );
                    setAction({ kind: "remove", member });
                  }}
                >
                  <Trash2 aria-hidden="true" /> Remove
                </Button>
              ) : null}
              {member.role !== "owner" &&
              member.state === "active" &&
              bootstrap.role === "owner" ? (
                <Button size="sm" onClick={() => setAction({ kind: "transfer", member })}>
                  Transfer ownership
                </Button>
              ) : null}
            </div>
          </article>
        ))}
        {!visible.length ? (
          <div className="access-empty">
            <Users aria-hidden="true" />
            <strong>No members match</strong>
            <span>Change the search or status filter.</span>
          </div>
        ) : null}
      </div>
      <div className="access-section-heading">
        <div>
          <h2>Pending invitations</h2>
          <p>Renew expiring links or revoke invitations immediately.</p>
        </div>
      </div>
      <div className="access-table">
        {pending.map((invitation) => (
          <article key={invitation.id} className="access-invitation-row">
            <span className="access-icon">
              <Mail aria-hidden="true" />
            </span>
            <div>
              <strong>{invitation.email}</strong>
              <span>
                Invited as{" "}
                {invitation.customRoleId
                  ? (roles.find(({ id }) => id === invitation.customRoleId)?.name ?? "custom role")
                  : invitation.role}
              </span>
            </div>
            <span className="access-expiry">
              <Clock3 aria-hidden="true" /> Expires{" "}
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                new Date(invitation.expiresAt)
              )}
            </span>
            <div className="access-row-actions">
              <Button
                size="sm"
                disabled={!has("member.invite")}
                onClick={() =>
                  void resendInvitation(invitation.id)
                    .then(load)
                    .then(() => setNotice(`A new invitation was sent to ${invitation.email}.`))
                    .catch((reason) => setNotice(errorMessage(reason)))
                }
              >
                <RotateCw aria-hidden="true" /> Resend
              </Button>
              <Button
                size="sm"
                disabled={!has("member.invite")}
                onClick={() =>
                  void cancelInvitation(invitation.id)
                    .then(load)
                    .then(() => setNotice("Invitation cancelled."))
                    .catch((reason) => setNotice(errorMessage(reason)))
                }
              >
                Cancel
              </Button>
            </div>
          </article>
        ))}
        {!pending.length ? (
          <div className="access-empty">
            <Mail aria-hidden="true" />
            <strong>No pending invitations</strong>
            <span>New invitations appear here until accepted or expired.</span>
          </div>
        ) : null}
      </div>
      <AlertDialog
        open={Boolean(action)}
        onDismiss={() => setAction(undefined)}
        title={
          action?.kind === "transfer"
            ? "Transfer workspace ownership?"
            : action?.kind === "remove"
              ? "Remove member?"
              : action?.kind === "suspend"
                ? "Suspend member?"
                : "Restore member?"
        }
      >
        <p>
          {action?.kind === "transfer"
            ? `${action.member.displayName} will become owner. You will become an administrator.`
            : action?.kind === "remove"
              ? `${action.member.displayName} will lose access and active sessions will be revoked.`
              : action?.kind === "suspend"
                ? `${action.member.displayName} will be signed out until restored.`
                : `${action?.member.displayName ?? "This member"} will regain access.`}
        </p>
        {action?.kind === "remove" ? (
          <label className="access-dialog-field">
            Reassign owned content
            <select
              aria-label="Reassign owned content"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              {members
                .filter(
                  (candidate) => candidate.id !== action.member.id && candidate.state === "active"
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <div className="access-dialog-actions">
          <Button onClick={() => setAction(undefined)}>Cancel</Button>
          <Button
            tone={action?.kind === "restore" ? "accent" : "danger"}
            disabled={action?.kind === "remove" && !assigneeId}
            onClick={() => {
              if (!action) return;
              const operation =
                action.kind === "transfer"
                  ? transferOwnership(workspace, action.member.id)
                  : action.kind === "remove"
                    ? removeMember(workspace, action.member.id, assigneeId)
                    : updateMember(workspace, action.member.id, {
                        state: action.kind === "restore" ? "active" : "suspended"
                      });
              void operation
                .then(load)
                .then(() => {
                  setNotice(
                    action.kind === "transfer"
                      ? "Workspace ownership transferred."
                      : action.kind === "remove"
                        ? "Member removed and content reassigned."
                        : action.kind === "restore"
                          ? "Member restored."
                          : "Member suspended."
                  );
                  setAction(undefined);
                })
                .catch((reason) => setNotice(errorMessage(reason)));
            }}
          >
            {action?.kind === "transfer"
              ? "Transfer ownership"
              : action?.kind === "remove"
                ? "Remove member"
                : action?.kind === "suspend"
                  ? "Suspend member"
                  : "Restore member"}
          </Button>
        </div>
      </AlertDialog>
    </AdminFrame>
  );
}

type RoleEditor = {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
};
type GroupEditor = {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly memberIds: readonly string[];
};

export function RolesPage() {
  const title = "Roles & groups";
  const description = "Make access understandable with explicit permissions and reusable groups.";
  const { bootstrap, error, has } = useAccessContext();
  const workspace = bootstrap?.activeWorkspaceId;
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>();
  const [groups, setGroups] = useState<readonly WorkspaceGroup[]>();
  const [members, setMembers] = useState<readonly WorkspaceMember[]>([]);
  const [notice, setNotice] = useState("");
  const [roleEditor, setRoleEditor] = useState<RoleEditor>();
  const [groupEditor, setGroupEditor] = useState<GroupEditor>();
  const [deleteTarget, setDeleteTarget] = useState<{
    readonly kind: "role" | "group";
    readonly id: string;
    readonly name: string;
  }>();
  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [nextRoles, nextGroups, nextMembers] = await Promise.all([
        fetchRoles(workspace),
        fetchGroups(workspace),
        fetchMembers(workspace)
      ]);
      setRoles(nextRoles);
      setGroups(nextGroups);
      setMembers(nextMembers);
    } catch (reason) {
      setNotice(errorMessage(reason));
    }
  }, [workspace]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <Failure title={title} description={description} message={error} />;
  if (!bootstrap || !workspace || !roles || !groups)
    return <Loading title={title} description={description} />;
  const canRoles = has("role.manage");
  const canGroups = has("group.manage");
  return (
    <AdminFrame title={title} description={description}>
      {notice ? <Notice>{notice}</Notice> : null}
      <div className="access-section-heading">
        <div>
          <h2>Roles & permissions</h2>
          <p>Built-in roles follow safe defaults. Custom roles grant only selected capabilities.</p>
        </div>
        <Button
          tone="accent"
          disabled={!canRoles}
          onClick={() =>
            setRoleEditor({
              name: "",
              description: "",
              permissions: ["workspace.read", "workflow.read"]
            })
          }
        >
          <Plus aria-hidden="true" /> New custom role
        </Button>
      </div>
      <section className="access-card-grid access-role-grid" aria-label="Workspace roles">
        {roles.map((role) => (
          <Card key={role.id} className="access-role-card">
            <div className="access-card-topline">
              <span className="access-icon">
                <Shield aria-hidden="true" />
              </span>
              <Badge tone={role.system ? "neutral" : "accent"}>
                {role.system ? "Built in" : "Custom"}
              </Badge>
            </div>
            <div>
              <h3>{role.name}</h3>
              <p>{role.description}</p>
            </div>
            <div className="access-permission-preview">
              {role.permissions.slice(0, 4).map((permission) => (
                <span key={permission}>{permission}</span>
              ))}
              {role.permissions.length > 4 ? (
                <span>+{role.permissions.length - 4} more</span>
              ) : null}
            </div>
            {!role.system ? (
              <div className="access-row-actions">
                <Button
                  size="sm"
                  disabled={!canRoles}
                  onClick={() =>
                    setRoleEditor({
                      id: role.id,
                      name: role.name,
                      description: role.description,
                      permissions: [...role.permissions]
                    })
                  }
                >
                  <Pencil aria-hidden="true" /> Edit
                </Button>
                <Button
                  size="sm"
                  disabled={!canRoles}
                  onClick={() => setDeleteTarget({ kind: "role", id: role.id, name: role.name })}
                >
                  <Trash2 aria-hidden="true" /> Delete
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
      </section>
      <div className="access-section-heading">
        <div>
          <h2>Groups</h2>
          <p>Organize people for assignments, approvals, and identity-provider synchronization.</p>
        </div>
        <Button
          tone="accent"
          disabled={!canGroups}
          onClick={() => setGroupEditor({ name: "", description: "", memberIds: [] })}
        >
          <Plus aria-hidden="true" /> New group
        </Button>
      </div>
      <div className="access-table">
        {groups.map((group) => (
          <article key={group.id} className="access-group-row">
            <span className="access-icon">
              <Users aria-hidden="true" />
            </span>
            <div>
              <strong>{group.name}</strong>
              <span>{group.description || "No description"}</span>
            </div>
            <Badge tone={group.source === "scim" ? "accent" : "neutral"}>
              {group.source === "scim" ? "Identity provider" : "Manual"}
            </Badge>
            <span>
              {group.memberIds.length} {group.memberIds.length === 1 ? "member" : "members"}
            </span>
            <div className="access-row-actions">
              <Button
                size="sm"
                disabled={!canGroups || group.source === "scim"}
                title={
                  group.source === "scim"
                    ? "Manage this group in your identity provider."
                    : undefined
                }
                onClick={() =>
                  setGroupEditor({
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    memberIds: [...group.memberIds]
                  })
                }
              >
                <Pencil aria-hidden="true" /> Edit
              </Button>
              <Button
                size="sm"
                disabled={!canGroups || group.source === "scim"}
                onClick={() => setDeleteTarget({ kind: "group", id: group.id, name: group.name })}
              >
                <Trash2 aria-hidden="true" /> Delete
              </Button>
            </div>
          </article>
        ))}
        {!groups.length ? (
          <div className="access-empty">
            <Users aria-hidden="true" />
            <strong>No groups yet</strong>
            <span>Create one to route work and approvals to a team.</span>
          </div>
        ) : null}
      </div>
      <AlertDialog
        open={Boolean(roleEditor)}
        onDismiss={() => setRoleEditor(undefined)}
        title={roleEditor?.id ? "Edit custom role" : "Create custom role"}
      >
        {roleEditor ? (
          <form
            className="access-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              const operation = roleEditor.id
                ? updateRole(roleEditor.id, roleEditor)
                : createRole(workspace, roleEditor);
              void operation
                .then(load)
                .then(() => {
                  setRoleEditor(undefined);
                  setNotice(roleEditor.id ? "Custom role updated." : "Custom role created.");
                })
                .catch((reason) => setNotice(errorMessage(reason)));
            }}
          >
            <label>
              Role name
              <input
                aria-label="Role name"
                required
                maxLength={80}
                value={roleEditor.name}
                onChange={(event) => setRoleEditor({ ...roleEditor, name: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                aria-label="Role description"
                maxLength={500}
                value={roleEditor.description}
                onChange={(event) =>
                  setRoleEditor({ ...roleEditor, description: event.target.value })
                }
              />
            </label>
            <fieldset className="access-permission-fieldset">
              <legend>Permissions</legend>
              {permissionCatalog.map((permission) => (
                <label key={permission}>
                  <input
                    aria-label={permission}
                    type="checkbox"
                    checked={roleEditor.permissions.includes(permission)}
                    onChange={(event) =>
                      setRoleEditor({
                        ...roleEditor,
                        permissions: event.target.checked
                          ? [...roleEditor.permissions, permission]
                          : roleEditor.permissions.filter((candidate) => candidate !== permission)
                      })
                    }
                  />
                  <span>
                    <strong>{permission}</strong>
                    <small>{permissionDescription(permission)}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="access-dialog-actions">
              <Button type="button" onClick={() => setRoleEditor(undefined)}>
                Cancel
              </Button>
              <Button tone="accent" type="submit" disabled={!roleEditor.permissions.length}>
                {roleEditor.id ? "Save role" : "Create role"}
              </Button>
            </div>
          </form>
        ) : null}
      </AlertDialog>
      <AlertDialog
        open={Boolean(groupEditor)}
        onDismiss={() => setGroupEditor(undefined)}
        title={groupEditor?.id ? "Edit group" : "Create group"}
      >
        {groupEditor ? (
          <form
            className="access-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              const operation = groupEditor.id
                ? saveGroup(groupEditor.id, groupEditor)
                : createGroup(workspace, groupEditor);
              void operation
                .then(load)
                .then(() => {
                  setGroupEditor(undefined);
                  setNotice(groupEditor.id ? "Group updated." : "Group created.");
                })
                .catch((reason) => setNotice(errorMessage(reason)));
            }}
          >
            <label>
              Group name
              <input
                aria-label="Group name"
                required
                maxLength={120}
                value={groupEditor.name}
                onChange={(event) => setGroupEditor({ ...groupEditor, name: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                aria-label="Group description"
                maxLength={500}
                value={groupEditor.description}
                onChange={(event) =>
                  setGroupEditor({ ...groupEditor, description: event.target.value })
                }
              />
            </label>
            <fieldset className="access-member-fieldset">
              <legend>Members</legend>
              {members
                .filter(({ state }) => state === "active")
                .map((member) => (
                  <label key={member.id}>
                    <input
                      aria-label={`Add ${member.displayName} to group`}
                      type="checkbox"
                      checked={groupEditor.memberIds.includes(member.userId)}
                      onChange={(event) =>
                        setGroupEditor({
                          ...groupEditor,
                          memberIds: event.target.checked
                            ? [...groupEditor.memberIds, member.userId]
                            : groupEditor.memberIds.filter(
                                (candidate) => candidate !== member.userId
                              )
                        })
                      }
                    />
                    <span>
                      <strong>{member.displayName}</strong>
                      <small>{member.email}</small>
                    </span>
                  </label>
                ))}
            </fieldset>
            <div className="access-dialog-actions">
              <Button type="button" onClick={() => setGroupEditor(undefined)}>
                Cancel
              </Button>
              <Button tone="accent" type="submit">
                {groupEditor.id ? "Save group" : "Create group"}
              </Button>
            </div>
          </form>
        ) : null}
      </AlertDialog>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onDismiss={() => setDeleteTarget(undefined)}
        title={`Delete ${deleteTarget?.kind ?? "item"}?`}
      >
        <p>
          <strong>{deleteTarget?.name}</strong> will be permanently removed. Members keep their
          workspace access.
        </p>
        <div className="access-dialog-actions">
          <Button onClick={() => setDeleteTarget(undefined)}>Cancel</Button>
          <Button
            tone="danger"
            onClick={() => {
              if (!deleteTarget) return;
              const operation =
                deleteTarget.kind === "role"
                  ? deleteRole(deleteTarget.id)
                  : deleteGroup(deleteTarget.id);
              void operation
                .then(load)
                .then(() => {
                  setNotice(`${deleteTarget.kind === "role" ? "Role" : "Group"} deleted.`);
                  setDeleteTarget(undefined);
                })
                .catch((reason) => setNotice(errorMessage(reason)));
            }}
          >
            Delete {deleteTarget?.kind}
          </Button>
        </div>
      </AlertDialog>
    </AdminFrame>
  );
}

function permissionDescription(permission: string) {
  const [resource, action] = permission.split(".");
  const verb =
    action === "read"
      ? "View"
      : action === "manage"
        ? "Create, change, and delete"
        : action?.replace(/_/gu, " ");
  return `${verb} ${resource?.replace(/_/gu, " ")}.`;
}
