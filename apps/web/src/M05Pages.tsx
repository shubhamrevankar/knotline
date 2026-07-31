import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { Building2, Check, ChevronRight, Shield, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  archiveWorkspace,
  cancelInvitation,
  createGroup,
  createRole,
  createSampleWorkspace,
  createWorkspace,
  fetchGroups,
  fetchInvitations,
  fetchMeBootstrap,
  fetchMembers,
  fetchOnboarding,
  fetchRoles,
  fetchWorkspaces,
  inviteMember,
  previewInvitation,
  removeSampleWorkspace,
  respondToInvitation,
  restoreWorkspace,
  saveOnboarding,
  switchWorkspace,
  transferOwnership,
  updateMember,
  updateWorkspace,
  type MeBootstrap,
  type OnboardingProgress,
  type WorkspaceGroup,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
  type WorkspaceSummary
} from "./api.js";
import { AuthGate } from "./AuthPages.js";
import { msg } from "./i18n.js";

function SettingsFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <AuthGate>
      <div className="settings-layout">
        <aside className="settings-nav" aria-label={msg("workspace.settings.nav")}>
          <Link to="/app/workflows">{msg("brand.name")}</Link>
          <Link to="/app/settings/workspace">{msg("workspace.settings.workspace")}</Link>
          <Link to="/app/settings/members">{msg("workspace.settings.members")}</Link>
          <Link to="/app/settings/roles">{msg("workspace.settings.roles")}</Link>
          <Link to="/app/onboarding">{msg("workspace.settings.onboarding")}</Link>
        </aside>
        <main className="settings-main">
          <header className="settings-heading">
            <div>
              <Badge tone="accent">{msg("workspace.badge")}</Badge>
              <h1>{title}</h1>
            </div>
            <Link to="/app/workflows">{msg("workspace.back")}</Link>
          </header>
          {children}
        </main>
      </div>
    </AuthGate>
  );
}

function useWorkspaceContext() {
  const [bootstrap, setBootstrap] = useState<MeBootstrap>();
  const [error, setError] = useState<string>();
  const reload = useCallback(
    () =>
      fetchMeBootstrap()
        .then(setBootstrap)
        .catch((reason: unknown) => setError(String(reason))),
    []
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { bootstrap, error, reload };
}

function Failure({ message }: { message: string }) {
  return (
    <ErrorState title={msg("workspace.error.heading")}>
      <p>{message}</p>
    </ErrorState>
  );
}

function formString(form: FormData, key: string, fallback = "") {
  const value = form.get(key);
  return typeof value === "string" ? value : fallback;
}

export function WorkspaceSettingsPage() {
  const { bootstrap, error, reload } = useWorkspaceContext();
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>();
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchWorkspaces()
      .then(setWorkspaces)
      .catch((reason: unknown) => setNotice(String(reason)));
  }, []);
  const active = workspaces?.find(({ id }) => id === bootstrap?.activeWorkspaceId);
  const canUpdate =
    bootstrap?.permissions?.includes("*") || bootstrap?.permissions?.includes("workspace.update");
  const refresh = async () => {
    setWorkspaces(await fetchWorkspaces());
    await reload();
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const workspace = await createWorkspace({
        name,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        locale: "en",
        region: "local"
      });
      await switchWorkspace(workspace.id);
      setName("");
      setNotice(msg("workspace.created"));
      await refresh();
    } catch (reason) {
      setNotice(String(reason));
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <SettingsFrame title={msg("workspace.heading")}>
        <Failure message={error} />
      </SettingsFrame>
    );
  if (!bootstrap || !workspaces)
    return (
      <SettingsFrame title={msg("workspace.heading")}>
        <Skeleton label={msg("workspace.loading")} />
      </SettingsFrame>
    );
  return (
    <SettingsFrame title={msg("workspace.heading")}>
      {notice ? (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      ) : null}
      <section className="workspace-grid" aria-label={msg("workspace.list.label")}>
        {workspaces.map((workspace) => (
          <Card
            key={workspace.id}
            className={workspace.id === active?.id ? "workspace-card active" : "workspace-card"}
          >
            <div className="row-between">
              <Building2 aria-hidden="true" />
              <Badge tone={workspace.state === "active" ? "success" : "warning"}>
                {workspace.state}
              </Badge>
            </div>
            <h2>{workspace.name}</h2>
            <p>{msg("workspace.card.meta", { role: workspace.role, region: workspace.region })}</p>
            {workspace.isSandbox ? <strong>{workspace.sandboxLabel}</strong> : null}
            <div className="action-row">
              {workspace.id !== active?.id && workspace.state === "active" ? (
                <Button onClick={() => void switchWorkspace(workspace.id).then(refresh)}>
                  {msg("workspace.switch")}
                </Button>
              ) : null}
              {workspace.id === active?.id && workspace.state === "active" ? (
                <Button
                  disabled={!canUpdate}
                  onClick={() => void archiveWorkspace(workspace.id).then(refresh)}
                >
                  {msg("workspace.archive")}
                </Button>
              ) : null}
              {workspace.state === "archived" ? (
                <Button onClick={() => void restoreWorkspace(workspace.id).then(refresh)}>
                  {msg("workspace.restore")}
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </section>
      {active ? (
        <Card className="settings-form-card">
          <h2>{msg("workspace.preferences")}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void updateWorkspace(active.id, {
                name: formString(form, "name"),
                timezone: formString(form, "timezone", "UTC"),
                locale: formString(form, "locale", "en"),
                region: formString(form, "region", "local")
              }).then(refresh);
            }}
          >
            <label>
              {msg("workspace.name")}
              <input name="name" defaultValue={active.name} disabled={!canUpdate} />
            </label>
            <label>
              {msg("workspace.timezone")}
              <input name="timezone" defaultValue={active.timezone} disabled={!canUpdate} />
            </label>
            <label>
              {msg("workspace.locale")}
              <input name="locale" defaultValue={active.locale} disabled={!canUpdate} />
            </label>
            <label>
              {msg("workspace.region")}
              <input name="region" defaultValue={active.region} disabled={!canUpdate} />
            </label>
            <Button tone="accent" type="submit" disabled={!canUpdate}>
              {msg("workspace.save")}
            </Button>
            {!canUpdate ? <p>{msg("workspace.permission.update")}</p> : null}
          </form>
        </Card>
      ) : null}
      <Card className="settings-form-card">
        <h2>{msg("workspace.create.heading")}</h2>
        <p>{msg("workspace.create.body")}</p>
        <form onSubmit={(event) => void create(event)}>
          <label>
            {msg("workspace.name")}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={160}
            />
          </label>
          <Button tone="accent" type="submit" disabled={busy}>
            {busy ? msg("workspace.creating") : msg("workspace.create")}
          </Button>
        </form>
      </Card>
    </SettingsFrame>
  );
}

export function MembersPage() {
  const { bootstrap, error } = useWorkspaceContext();
  const [members, setMembers] = useState<readonly WorkspaceMember[]>();
  const [invitations, setInvitations] = useState<readonly WorkspaceInvitation[]>();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [notice, setNotice] = useState("");
  const workspace = bootstrap?.activeWorkspaceId;
  const canManage =
    bootstrap?.permissions?.includes("*") || bootstrap?.permissions?.includes("member.update");
  const reload = async () => {
    if (!workspace) return;
    const [nextMembers, nextInvitations] = await Promise.all([
      fetchMembers(workspace),
      fetchInvitations(workspace)
    ]);
    setMembers(nextMembers);
    setInvitations(nextInvitations);
  };
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    Promise.all([fetchMembers(workspace), fetchInvitations(workspace)])
      .then(([nextMembers, nextInvitations]) => {
        if (active) {
          setMembers(nextMembers);
          setInvitations(nextInvitations);
        }
      })
      .catch((reason: unknown) => setNotice(String(reason)));
    return () => {
      active = false;
    };
  }, [workspace]);
  if (error)
    return (
      <SettingsFrame title={msg("members.heading")}>
        <Failure message={error} />
      </SettingsFrame>
    );
  if (!bootstrap || !workspace || !members || !invitations)
    return (
      <SettingsFrame title={msg("members.heading")}>
        <Skeleton label={msg("members.loading")} />
      </SettingsFrame>
    );
  return (
    <SettingsFrame title={msg("members.heading")}>
      {notice ? (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      ) : null}
      <Card className="settings-form-card">
        <h2>{msg("members.invite.heading")}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void inviteMember(workspace, email, role)
              .then(async () => {
                setEmail("");
                setNotice(msg("members.invite.sent"));
                await reload();
              })
              .catch((reason: unknown) => setNotice(String(reason)));
          }}
        >
          <label>
            {msg("members.email")}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {msg("members.role")}
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {["admin", "builder", "member", "approver", "billing", "auditor"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <Button tone="accent" type="submit" disabled={!canManage}>
            {msg("members.invite")}
          </Button>
        </form>
        {!canManage ? <p>{msg("members.permission.manage")}</p> : null}
      </Card>
      <div className="member-list" role="list" aria-label={msg("members.list.label")}>
        {members.map((member) => (
          <Card key={member.id} className="member-row">
            <div>
              <strong>{member.displayName}</strong>
              <span>{member.email}</span>
            </div>
            <Badge tone={member.state === "active" ? "success" : "warning"}>{member.state}</Badge>
            <label>
              {msg("members.role")}
              <select
                value={member.role}
                disabled={!canManage || member.role === "owner"}
                onChange={(event) =>
                  void updateMember(workspace, member.id, { role: event.target.value }).then(reload)
                }
              >
                {["owner", "admin", "builder", "member", "approver", "billing", "auditor"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  )
                )}
              </select>
            </label>
            <div className="action-row">
              {member.role !== "owner" ? (
                <Button
                  disabled={!canManage}
                  onClick={() =>
                    void updateMember(workspace, member.id, {
                      state: member.state === "suspended" ? "active" : "suspended"
                    }).then(reload)
                  }
                >
                  {member.state === "suspended" ? msg("members.restore") : msg("members.suspend")}
                </Button>
              ) : null}
              {member.role !== "owner" && bootstrap.role === "owner" ? (
                <Button onClick={() => void transferOwnership(workspace, member.id).then(reload)}>
                  {msg("members.transfer")}
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      <section>
        <h2>{msg("members.pending")}</h2>
        {invitations
          .filter(({ state }) => state === "pending")
          .map((invitation) => (
            <Card key={invitation.id} className="invitation-row">
              <span>{invitation.email}</span>
              <Badge tone="warning">{invitation.role}</Badge>
              <Button
                disabled={!canManage}
                onClick={() => void cancelInvitation(invitation.id).then(reload)}
              >
                {msg("members.cancel")}
              </Button>
            </Card>
          ))}
      </section>
    </SettingsFrame>
  );
}

export function RolesPage() {
  const { bootstrap, error } = useWorkspaceContext();
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>();
  const [groups, setGroups] = useState<readonly WorkspaceGroup[]>();
  const [name, setName] = useState("");
  const workspace = bootstrap?.activeWorkspaceId;
  const canManage =
    bootstrap?.permissions?.includes("*") || bootstrap?.permissions?.includes("role.manage");
  const reload = async () => {
    if (!workspace) return;
    const [nextRoles, nextGroups] = await Promise.all([
      fetchRoles(workspace),
      fetchGroups(workspace)
    ]);
    setRoles(nextRoles);
    setGroups(nextGroups);
  };
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    Promise.all([fetchRoles(workspace), fetchGroups(workspace)])
      .then(([nextRoles, nextGroups]) => {
        if (active) {
          setRoles(nextRoles);
          setGroups(nextGroups);
        }
      })
      .catch(() => {
        if (active) {
          setRoles([]);
          setGroups([]);
        }
      });
    return () => {
      active = false;
    };
  }, [workspace]);
  if (error)
    return (
      <SettingsFrame title={msg("roles.heading")}>
        <Failure message={error} />
      </SettingsFrame>
    );
  if (!bootstrap || !workspace || !roles || !groups)
    return (
      <SettingsFrame title={msg("roles.heading")}>
        <Skeleton label={msg("roles.loading")} />
      </SettingsFrame>
    );
  return (
    <SettingsFrame title={msg("roles.heading")}>
      <section className="role-grid" aria-label={msg("roles.list.label")}>
        {roles.map((role) => (
          <Card key={role.id}>
            <div className="row-between">
              <Shield aria-hidden="true" />
              <Badge tone={role.system ? "neutral" : "accent"}>
                {role.system ? msg("roles.system") : msg("roles.custom")}
              </Badge>
            </div>
            <h2>{role.name}</h2>
            <p>{role.description}</p>
            <small>{msg("roles.permission.count", { count: role.permissions.length })}</small>
          </Card>
        ))}
      </section>
      <Card className="settings-form-card">
        <h2>{msg("roles.create.heading")}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createRole(workspace, {
              name,
              description: msg("roles.create.description"),
              permissions: ["workspace.read", "workflow.read"]
            }).then(async () => {
              setName("");
              await reload();
            });
          }}
        >
          <label>
            {msg("roles.name")}
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <Button tone="accent" type="submit" disabled={!canManage}>
            {msg("roles.create")}
          </Button>
        </form>
      </Card>
      <Card className="settings-form-card">
        <h2>{msg("groups.heading")}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void createGroup(workspace, formString(form, "groupName"), []).then(reload);
            event.currentTarget.reset();
          }}
        >
          <label>
            {msg("groups.name")}
            <input name="groupName" required />
          </label>
          <Button type="submit" disabled={!canManage}>
            {msg("groups.create")}
          </Button>
        </form>
        <ul>
          {groups.map((group) => (
            <li key={group.id}>
              <Users aria-hidden="true" /> {group.name} ·{" "}
              {msg("groups.member.count", { count: group.memberIds.length })}
            </li>
          ))}
        </ul>
        <p>{msg("groups.scim.foundation")}</p>
      </Card>
    </SettingsFrame>
  );
}

const onboardingSteps = [
  "role_use_case",
  "optional_connection",
  "workflow_source",
  "teammate_invite",
  "readiness",
  "first_real_run"
] as const;

const onboardingStepTitles = {
  role_use_case: msg("onboarding.step.roleusecase"),
  optional_connection: msg("onboarding.step.optionalconnection"),
  workflow_source: msg("onboarding.step.workflowsource"),
  teammate_invite: msg("onboarding.step.teammateinvite"),
  readiness: msg("onboarding.step.readiness"),
  first_real_run: msg("onboarding.step.firstrealrun")
} as const;

const onboardingStepBodies = {
  role_use_case: msg("onboarding.body.roleusecase"),
  optional_connection: msg("onboarding.body.optionalconnection"),
  workflow_source: msg("onboarding.body.workflowsource"),
  teammate_invite: msg("onboarding.body.teammateinvite"),
  readiness: msg("onboarding.body.readiness"),
  first_real_run: msg("onboarding.body.firstrealrun")
} as const;

export function OnboardingPage() {
  const [progress, setProgress] = useState<OnboardingProgress>();
  const [sampleId, setSampleId] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    fetchOnboarding()
      .then(setProgress)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);
  const currentStep =
    progress && onboardingSteps.includes(progress.currentStep as (typeof onboardingSteps)[number])
      ? (progress.currentStep as (typeof onboardingSteps)[number])
      : onboardingSteps[0];
  const stepIndex = onboardingSteps.indexOf(currentStep);
  const advance = async (skip: boolean) => {
    if (!progress) return;
    const current = onboardingSteps[Math.max(stepIndex, 0)] ?? onboardingSteps[0];
    const next =
      onboardingSteps[Math.min(stepIndex + 1, onboardingSteps.length - 1)] ??
      onboardingSteps.at(-1)!;
    const saved = await saveOnboarding({
      ...progress,
      currentStep: next,
      completedSteps: skip
        ? progress.completedSteps
        : [...new Set([...progress.completedSteps, current])],
      skippedSteps: skip
        ? [...new Set([...progress.skippedSteps, current])]
        : progress.skippedSteps,
      profile:
        stepIndex === 0
          ? {
              ...progress.profile,
              role: "operations",
              useCase: "customer-onboarding",
              teamSize: "2-10"
            }
          : progress.profile
    });
    setProgress(saved);
  };
  return (
    <SettingsFrame title={msg("onboarding.heading")}>
      {error ? (
        <Failure message={error} />
      ) : !progress ? (
        <Skeleton label={msg("onboarding.loading")} />
      ) : (
        <div className="onboarding-layout">
          <ol className="onboarding-steps">
            {onboardingSteps.map((step, index) => (
              <li
                key={step}
                className={
                  index === stepIndex
                    ? "current"
                    : progress.completedSteps.includes(step)
                      ? "complete"
                      : ""
                }
              >
                <span>
                  {progress.completedSteps.includes(step) ? (
                    <Check aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                {onboardingStepTitles[step]}
              </li>
            ))}
          </ol>
          <Card className="onboarding-card">
            <Badge tone="accent">
              {msg("onboarding.progress", {
                current: stepIndex + 1,
                total: onboardingSteps.length
              })}
            </Badge>
            <h2>{onboardingStepTitles[currentStep]}</h2>
            <p>{onboardingStepBodies[currentStep]}</p>
            {currentStep === "readiness" ? (
              <div className="readiness-list">
                <p>
                  <Check aria-hidden="true" /> {msg("onboarding.ready.workspace")}
                </p>
                <p>
                  <Check aria-hidden="true" /> {msg("onboarding.ready.profile")}
                </p>
              </div>
            ) : null}
            {currentStep === "first_real_run" ? (
              <div className="dependency-callout">
                <strong>{msg("onboarding.run.unavailable")}</strong>
                <p>{msg("onboarding.run.dependencies")}</p>
              </div>
            ) : null}
            <div className="action-row">
              <Button
                onClick={() => void advance(true)}
                disabled={currentStep === "first_real_run"}
              >
                {msg("onboarding.skip")}
              </Button>
              <Button
                tone="accent"
                onClick={() => void advance(false)}
                disabled={currentStep === "first_real_run"}
              >
                {msg("onboarding.continue")}
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </Card>
          <Card className="sample-card">
            <h2>{msg("onboarding.sample.heading")}</h2>
            <p>{msg("onboarding.sample.body")}</p>
            {sampleId ? (
              <Button
                onClick={() =>
                  void removeSampleWorkspace(sampleId).then(() => setSampleId(undefined))
                }
              >
                {msg("onboarding.sample.remove")}
              </Button>
            ) : (
              <Button
                onClick={() => void createSampleWorkspace().then(({ id }) => setSampleId(id))}
              >
                {msg("onboarding.sample.create")}
              </Button>
            )}
          </Card>
        </div>
      )}
    </SettingsFrame>
  );
}

function consumeInvitationToken() {
  const token = new URLSearchParams(globalThis.location.hash.slice(1)).get("token") ?? "";
  globalThis.history.replaceState({}, "", globalThis.location.pathname);
  return token;
}

export function InvitationAcceptPage() {
  return (
    <AuthGate>
      <InvitationAcceptContent />
    </AuthGate>
  );
}

function InvitationAcceptContent() {
  const navigate = useNavigate();
  const [token] = useState(consumeInvitationToken);
  const [invitation, setInvitation] = useState<WorkspaceInvitation>();
  const [error, setError] = useState(() => (token ? "" : msg("invitation.invalid")));
  useEffect(() => {
    if (token)
      previewInvitation(token)
        .then(setInvitation)
        .catch((reason: unknown) => setError(String(reason)));
  }, [token]);
  const respond = (response: "accept" | "decline") =>
    respondToInvitation(token, response)
      .then(() =>
        navigate(response === "accept" ? "/app/onboarding" : "/app/workflows", { replace: true })
      )
      .catch((reason: unknown) => setError(String(reason)));
  return (
    <main className="invitation-page">
      <Card className="invitation-card">
        <Badge tone="accent">{msg("invitation.badge")}</Badge>
        <h1>{msg("invitation.heading")}</h1>
        {error ? (
          <Failure message={error} />
        ) : !invitation ? (
          <Skeleton label={msg("invitation.loading")} />
        ) : (
          <>
            <p>
              {msg("invitation.body", {
                workspace: invitation.workspaceName,
                role: invitation.role
              })}
            </p>
            <p>{msg("invitation.email", { email: invitation.email })}</p>
            <div className="action-row">
              <Button onClick={() => void respond("decline")}>{msg("invitation.decline")}</Button>
              <Button tone="accent" onClick={() => void respond("accept")}>
                {msg("invitation.accept")}
              </Button>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
