/* eslint-disable knotline/no-hardcoded-user-visible-string, react-hooks/set-state-in-effect -- Setup-guide copy moves into the full locale catalog at M33; route loaders synchronize persisted onboarding state. */
import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Bot,
  Check,
  ChevronRight,
  Circle,
  Cable,
  FileUp,
  Mail,
  Rocket,
  Sparkles
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import {
  createSampleWorkspace,
  fetchConnections,
  fetchInvitations,
  fetchMeBootstrap,
  fetchMembers,
  fetchOnboarding,
  fetchRoles,
  fetchWorkflows,
  inviteMember,
  removeSampleWorkspace,
  saveOnboarding,
  type MeBootstrap,
  type OnboardingProgress,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole
} from "./api.js";
import { AuthGate } from "./AuthPages.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import "./M05Pages.css";

const steps = [
  {
    key: "role_use_case",
    short: "Your goals",
    title: "Tell us what success looks like",
    body: "A few details let Knotline tailor starting points and recommendations to your team."
  },
  {
    key: "optional_connection",
    short: "Connections",
    title: "Bring your tools into the flow",
    body: "Connect a system now, or continue without one. You can always add connections later."
  },
  {
    key: "workflow_source",
    short: "First workflow",
    title: "Choose how you want to begin",
    body: "Describe a workflow with AI, start from a proven template, or bring an existing process."
  },
  {
    key: "teammate_invite",
    short: "Invite people",
    title: "Set up your first collaborator",
    body: "Invite someone now with the right role, or continue on your own."
  },
  {
    key: "readiness",
    short: "Readiness",
    title: "Your workspace is ready",
    body: "Review the foundation before you start building real operational work."
  },
  {
    key: "first_real_run",
    short: "Launch",
    title: "Build your first real workflow",
    body: "Everything is connected to the real product. Your next step opens the production workflow builder."
  }
] as const;
type StepKey = (typeof steps)[number]["key"];

const profileString = (profile: Readonly<Record<string, unknown>>, key: string, fallback = "") =>
  typeof profile[key] === "string" ? profile[key] : fallback;
const readableError = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Something went wrong. Try again.";

function GuideFrame({ children }: { readonly children: ReactNode }) {
  return (
    <AuthGate>
      <WorkspaceShell contentClassName="access-shell-content">
        <main className="access-page onboarding-page">
          <header className="access-heading">
            <div>
              <span className="access-eyebrow">Guided setup</span>
              <h1>Set up your workspace</h1>
              <p>
                Configure the essentials, invite your team, and move directly into your first real
                workflow.
              </p>
            </div>
            <Link className="access-back-link" to="/app/workflows">
              Exit setup
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

export function OnboardingPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<OnboardingProgress>();
  const [bootstrap, setBootstrap] = useState<MeBootstrap>();
  const [members, setMembers] = useState<readonly WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<readonly WorkspaceInvitation[]>([]);
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>([]);
  const [connectionCount, setConnectionCount] = useState(0);
  const [workflowCount, setWorkflowCount] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sampleId, setSampleId] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextProgress, nextBootstrap] = await Promise.all([
        fetchOnboarding(),
        fetchMeBootstrap()
      ]);
      setProgress(nextProgress);
      setBootstrap(nextBootstrap);
      setError("");
      if (!nextBootstrap.activeWorkspaceId) return;
      const workspace = nextBootstrap.activeWorkspaceId;
      const results = await Promise.allSettled([
        fetchMembers(workspace),
        fetchInvitations(workspace),
        fetchRoles(workspace),
        fetchConnections(workspace),
        fetchWorkflows(workspace)
      ]);
      const [memberResult, invitationResult, roleResult, connectionResult, workflowResult] =
        results;
      if (memberResult.status === "fulfilled") setMembers(memberResult.value);
      if (invitationResult.status === "fulfilled") setInvitations(invitationResult.value);
      if (roleResult.status === "fulfilled") setRoles(roleResult.value);
      if (connectionResult.status === "fulfilled" && Array.isArray(connectionResult.value))
        setConnectionCount(connectionResult.value.length);
      if (workflowResult.status === "fulfilled" && Array.isArray(workflowResult.value))
        setWorkflowCount(workflowResult.value.length);
    } catch (reason) {
      setError(readableError(reason));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const currentKey = steps.some(({ key }) => key === progress?.currentStep)
    ? (progress!.currentStep as StepKey)
    : steps[0].key;
  const currentIndex = steps.findIndex(({ key }) => key === currentKey);
  const current = steps[currentIndex] ?? steps[0];
  const [role, setRole] = useState("");
  const [useCase, setUseCase] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [goal, setGoal] = useState("");
  const [connectionPlan, setConnectionPlan] = useState("");
  const [workflowSource, setWorkflowSource] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  useEffect(() => {
    if (!progress) return;
    setRole(profileString(progress.profile, "role", "operations"));
    setUseCase(profileString(progress.profile, "useCase", "customer-operations"));
    setTeamSize(profileString(progress.profile, "teamSize", "2-10"));
    setGoal(profileString(progress.profile, "goal"));
    setConnectionPlan(profileString(progress.profile, "connectionPlan", "later"));
    setWorkflowSource(profileString(progress.profile, "workflowSource", "describe"));
  }, [progress]);

  const save = async (
    options: {
      readonly next?: StepKey;
      readonly skip?: boolean;
      readonly complete?: boolean;
      readonly recordCurrent?: boolean;
      readonly profile?: Readonly<Record<string, unknown>>;
    } = {}
  ) => {
    if (!progress) return false;
    setBusy(true);
    setNotice("");
    try {
      const recordCurrent = options.recordCurrent ?? true;
      const completed =
        !recordCurrent || options.skip
          ? progress.completedSteps
          : [...new Set([...progress.completedSteps, currentKey])];
      const skipped = !recordCurrent
        ? progress.skippedSteps
        : options.skip
          ? [...new Set([...progress.skippedSteps, currentKey])]
          : progress.skippedSteps.filter((key) => key !== currentKey);
      const saved = await saveOnboarding(
        {
          ...progress,
          currentStep: options.next ?? currentKey,
          completedSteps: completed,
          skippedSteps: skipped,
          profile: { ...progress.profile, ...options.profile }
        },
        options.complete ?? false
      );
      setProgress(saved);
      return true;
    } catch (reason) {
      const message = readableError(reason);
      setError(message);
      if (/another device|revision/iu.test(message)) await load();
      return false;
    } finally {
      setBusy(false);
    }
  };
  const next = steps[Math.min(currentIndex + 1, steps.length - 1)]?.key ?? currentKey;
  const back = steps[Math.max(currentIndex - 1, 0)]?.key ?? currentKey;
  const completeCurrent = (extra: Readonly<Record<string, unknown>> = {}) =>
    save({ next, profile: extra });
  const roleChoices = roles.filter(({ key }) => key !== "owner");
  const readiness = useMemo(
    () => [
      {
        label: "Workspace created",
        detail:
          bootstrap?.workspaces.find(({ id }) => id === bootstrap.activeWorkspaceId)?.name ??
          "Active workspace",
        ready: Boolean(bootstrap?.activeWorkspaceId)
      },
      {
        label: "Goals captured",
        detail: role && useCase ? `${role} · ${useCase}` : "Add your role and use case",
        ready: Boolean(role && useCase)
      },
      {
        label: "Connection plan chosen",
        detail: connectionCount
          ? `${connectionCount} connected system${connectionCount === 1 ? "" : "s"}`
          : connectionPlan === "later"
            ? "Continuing without a connection"
            : "Connection can be added next",
        ready: Boolean(connectionCount || connectionPlan)
      },
      {
        label: "Workflow starting point",
        detail: workflowCount
          ? `${workflowCount} workflow${workflowCount === 1 ? "" : "s"} already available`
          : workflowSource
            ? `Starting with ${workflowSource}`
            : "Choose a starting point",
        ready: Boolean(workflowCount || workflowSource)
      },
      {
        label: "Team access",
        detail:
          members.length > 1
            ? `${members.length} active members`
            : invitations.some(({ state }) => state === "pending")
              ? "Invitation pending"
              : "Starting solo is fine",
        ready: true
      }
    ],
    [
      bootstrap,
      connectionCount,
      connectionPlan,
      invitations,
      members.length,
      role,
      useCase,
      workflowCount,
      workflowSource
    ]
  );

  if (error && !progress)
    return (
      <GuideFrame>
        <ErrorState title="Setup guide is unavailable">
          <p>{error}</p>
          <Button onClick={() => void load()}>Try again</Button>
        </ErrorState>
      </GuideFrame>
    );
  if (!progress || !bootstrap)
    return (
      <GuideFrame>
        <Skeleton label="Loading your setup guide" />
      </GuideFrame>
    );
  return (
    <GuideFrame>
      {notice ? (
        <p className="access-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="access-notice is-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-progress-header">
        <div>
          <strong>
            {progress.completedAt
              ? "Setup complete"
              : `Step ${currentIndex + 1} of ${steps.length}`}
          </strong>
          <span>
            {Math.round((new Set(progress.completedSteps).size / steps.length) * 100)}% complete
          </span>
        </div>
        <div
          className="onboarding-progress-track"
          aria-label={`${Math.round((new Set(progress.completedSteps).size / steps.length) * 100)}% complete`}
        >
          <span
            style={{
              width: `${Math.max(4, Math.round((new Set(progress.completedSteps).size / steps.length) * 100))}%`
            }}
          />
        </div>
      </div>
      <div className="onboarding-workspace-layout">
        <aside className="onboarding-rail" aria-label="Setup steps">
          <ol>
            {steps.map((step, index) => {
              const done = progress.completedSteps.includes(step.key);
              const skipped = progress.skippedSteps.includes(step.key);
              return (
                <li key={step.key}>
                  <button
                    type="button"
                    aria-current={step.key === currentKey ? "step" : undefined}
                    disabled={index > currentIndex && !done && !progress.completedAt}
                    onClick={() => void save({ next: step.key, recordCurrent: false })}
                  >
                    <span>{done ? <Check aria-hidden="true" /> : skipped ? "–" : index + 1}</span>
                    <div>
                      <strong>{step.short}</strong>
                      <small>
                        {done
                          ? "Complete"
                          : skipped
                            ? "Skipped"
                            : step.key === currentKey
                              ? "In progress"
                              : "Not started"}
                      </small>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        <section className="onboarding-stage">
          <Card className="onboarding-main-card">
            <Badge tone="accent">{current.short}</Badge>
            <h2>{current.title}</h2>
            <p className="onboarding-lede">{current.body}</p>
            {currentKey === "role_use_case" ? (
              <div className="onboarding-form-grid">
                <label>
                  Your role
                  <select
                    aria-label="Your role"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                  >
                    <option value="operations">Operations</option>
                    <option value="support">Customer support</option>
                    <option value="go-to-market">Go-to-market</option>
                    <option value="product">Product</option>
                    <option value="engineering">Engineering & IT</option>
                    <option value="finance">Finance</option>
                    <option value="people">People & HR</option>
                  </select>
                </label>
                <label>
                  Primary use case
                  <select
                    aria-label="Primary use case"
                    value={useCase}
                    onChange={(event) => setUseCase(event.target.value)}
                  >
                    <option value="customer-operations">Customer operations</option>
                    <option value="incident-response">Incident response</option>
                    <option value="approvals">Approvals & governance</option>
                    <option value="revenue-operations">Revenue operations</option>
                    <option value="employee-operations">Employee operations</option>
                    <option value="custom">Something else</option>
                  </select>
                </label>
                <label>
                  Team size
                  <select
                    aria-label="Team size"
                    value={teamSize}
                    onChange={(event) => setTeamSize(event.target.value)}
                  >
                    <option value="1">Just me</option>
                    <option value="2-10">2–10</option>
                    <option value="11-50">11–50</option>
                    <option value="51-200">51–200</option>
                    <option value="201+">201+</option>
                  </select>
                </label>
                <label className="is-wide">
                  What would you like to improve?
                  <textarea
                    aria-label="Setup goal"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="For example: coordinate customer incidents without losing context between teams."
                  />
                </label>
              </div>
            ) : null}
            {currentKey === "optional_connection" ? (
              <ChoiceGrid
                value={connectionPlan}
                onChange={setConnectionPlan}
                choices={[
                  {
                    key: "now",
                    icon: <Cable />,
                    title: "Connect a system now",
                    body: "Set up Slack, Google Drive, Microsoft, Salesforce, or another provider.",
                    link: "/app/connections",
                    linkLabel: "Browse connections"
                  },
                  {
                    key: "later",
                    icon: <ChevronRight />,
                    title: "Continue without one",
                    body: "Build and test with manual input. Add a production connection whenever you are ready."
                  }
                ]}
              />
            ) : null}
            {currentKey === "workflow_source" ? (
              <ChoiceGrid
                value={workflowSource}
                onChange={setWorkflowSource}
                choices={[
                  {
                    key: "describe",
                    icon: <Sparkles />,
                    title: "Describe it with AI",
                    body: "Explain the outcome in plain language and review the generated workflow.",
                    link: "/app/workflows/new",
                    linkLabel: "Open AI builder"
                  },
                  {
                    key: "template",
                    icon: <Blocks />,
                    title: "Start from a template",
                    body: "Use a proven structure and adapt it to your operating model.",
                    link: "/templates",
                    linkLabel: "Browse templates"
                  },
                  {
                    key: "import",
                    icon: <FileUp />,
                    title: "Bring an existing process",
                    body: "Start in the visual builder and model the process your team already runs.",
                    link: "/app/workflows/new",
                    linkLabel: "Open workflow builder"
                  }
                ]}
              />
            ) : null}
            {currentKey === "teammate_invite" ? (
              <div className="onboarding-invite">
                <div className="onboarding-form-grid">
                  <label className="is-wide">
                    Teammate email
                    <input
                      aria-label="Teammate email"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="teammate@company.com"
                    />
                  </label>
                  <label>
                    Role
                    <select
                      aria-label="Teammate role"
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                    >
                      {roleChoices.map((candidate) => (
                        <option key={candidate.id} value={candidate.key}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p>
                  <Mail aria-hidden="true" /> Secure invitation links expire after seven days. You
                  can resend or cancel them from People.
                </p>
              </div>
            ) : null}
            {currentKey === "readiness" ? (
              <div className="onboarding-readiness">
                {readiness.map((item) => (
                  <div key={item.label}>
                    <span className={item.ready ? "is-ready" : ""}>
                      {item.ready ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {currentKey === "first_real_run" ? (
              <div className="onboarding-launch">
                <span>
                  <Rocket aria-hidden="true" />
                </span>
                <div>
                  <h3>You are ready to build</h3>
                  <p>
                    Your setup is saved. The workflow builder will generate, validate, test, and
                    publish a real workflow—there is no preview-only path.
                  </p>
                  <ul>
                    <li>
                      <Check /> Generate from your operating goal
                    </li>
                    <li>
                      <Check /> Edit visually with all node types
                    </li>
                    <li>
                      <Check /> Test safely, publish, and run
                    </li>
                  </ul>
                </div>
              </div>
            ) : null}
            <footer className="onboarding-actions">
              <div>
                {currentIndex > 0 ? (
                  <Button
                    disabled={busy}
                    onClick={() => void save({ next: back, recordCurrent: false })}
                  >
                    <ArrowLeft aria-hidden="true" /> Back
                  </Button>
                ) : (
                  <Link to="/app/workflows">Exit setup</Link>
                )}
              </div>
              <div>
                {currentKey !== "readiness" && currentKey !== "first_real_run" ? (
                  <Button disabled={busy} onClick={() => void save({ next, skip: true })}>
                    Skip for now
                  </Button>
                ) : null}
                {currentKey === "role_use_case" ? (
                  <Button
                    tone="accent"
                    disabled={busy || !role || !useCase}
                    onClick={() => void completeCurrent({ role, useCase, teamSize, goal })}
                  >
                    Save and continue <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
                {currentKey === "optional_connection" ? (
                  <Button
                    tone="accent"
                    disabled={busy || !connectionPlan}
                    onClick={() => void completeCurrent({ connectionPlan })}
                  >
                    Continue <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
                {currentKey === "workflow_source" ? (
                  <Button
                    tone="accent"
                    disabled={busy || !workflowSource}
                    onClick={() => void completeCurrent({ workflowSource })}
                  >
                    Continue <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
                {currentKey === "teammate_invite" ? (
                  <Button
                    tone="accent"
                    disabled={busy}
                    onClick={() => {
                      if (!inviteEmail) {
                        void save({ next, skip: true });
                        return;
                      }
                      const customRole = roleChoices.find(({ key }) => key === inviteRole);
                      void inviteMember(
                        progress.workspaceId,
                        inviteEmail,
                        customRole?.system === false ? "custom" : inviteRole,
                        customRole?.system === false ? customRole.id : undefined
                      )
                        .then(() => {
                          setNotice(`Invitation sent to ${inviteEmail}.`);
                          return completeCurrent({ invitedTeammate: true });
                        })
                        .catch((reason) => setError(readableError(reason)));
                    }}
                  >
                    {" "}
                    {inviteEmail ? "Send invite and continue" : "Continue solo"}{" "}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
                {currentKey === "readiness" ? (
                  <Button
                    tone="accent"
                    disabled={busy || readiness.some(({ ready }) => !ready)}
                    onClick={() => void completeCurrent()}
                  >
                    Everything looks good <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
                {currentKey === "first_real_run" ? (
                  <Button
                    tone="accent"
                    disabled={busy}
                    onClick={() =>
                      void save({ complete: true }).then((saved) => {
                        if (saved) navigate("/app/workflows/new");
                      })
                    }
                  >
                    <Rocket aria-hidden="true" /> Create my first workflow
                  </Button>
                ) : null}
              </div>
            </footer>
          </Card>
          <Card className="onboarding-side-card">
            <div className="onboarding-side-icon">
              <Bot aria-hidden="true" />
            </div>
            <div>
              <h3>Want a realistic starting point?</h3>
              <p>
                Create clearly labeled sample workflow data, explore it freely, then remove it in
                one click.
              </p>
            </div>
            {sampleId ? (
              <Button
                onClick={() =>
                  void removeSampleWorkspace(sampleId).then(() => {
                    setSampleId("");
                    setNotice("Sample workflow removed.");
                  })
                }
              >
                Remove sample data
              </Button>
            ) : (
              <Button
                onClick={() =>
                  void createSampleWorkspace().then(({ id }) => {
                    setSampleId(id);
                    setWorkflowCount((count) => count + 1);
                    setNotice("Sample workflow created and clearly labeled.");
                  })
                }
              >
                Create sample workflow
              </Button>
            )}
          </Card>
        </section>
      </div>
    </GuideFrame>
  );
}

function ChoiceGrid({
  value,
  onChange,
  choices
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly choices: readonly {
    readonly key: string;
    readonly icon: ReactNode;
    readonly title: string;
    readonly body: string;
    readonly link?: string;
    readonly linkLabel?: string;
  }[];
}) {
  return (
    <div className="onboarding-choice-grid">
      {choices.map((choice) => (
        <article key={choice.key} className={value === choice.key ? "is-selected" : ""}>
          <button
            type="button"
            aria-pressed={value === choice.key}
            onClick={() => onChange(choice.key)}
          >
            <span className="onboarding-choice-icon">{choice.icon}</span>
            <span>
              <strong>{choice.title}</strong>
              <small>{choice.body}</small>
            </span>
            <span className="onboarding-choice-check">
              {value === choice.key ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
            </span>
          </button>
          {choice.link ? (
            <Link to={choice.link}>
              {choice.linkLabel} <ChevronRight aria-hidden="true" />
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}
