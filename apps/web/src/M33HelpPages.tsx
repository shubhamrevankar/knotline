/* eslint-disable knotline/no-hardcoded-user-visible-string -- Help content is an owned English catalog pending locale extraction. */
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  LifeBuoy,
  LockKeyhole,
  Mail,
  MessageSquare,
  PlayCircle,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Waypoints,
  Wrench
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  addSupportMessage,
  consentDiagnosticBundle,
  createDiagnosticBundle,
  createSupportTicket,
  fetchMeBootstrap,
  fetchSupportTicket,
  fetchSupportTickets,
  type DiagnosticBundle,
  type SupportTicket
} from "./api.js";
import { RequestFailure } from "./query/errors.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import "./M33HelpPages.css";

type HelpSection = Readonly<{
  title: string;
  body: string;
  steps?: readonly string[];
  note?: string;
}>;

type HelpArticle = Readonly<{
  slug: string;
  category: "Getting started" | "Workflows" | "Operations" | "Administration" | "Account";
  title: string;
  summary: string;
  minutes: number;
  updated: string;
  icon: typeof BookOpen;
  sections: readonly HelpSection[];
  productLink: { label: string; to: string };
}>;

const articles: readonly HelpArticle[] = [
  {
    slug: "getting-started",
    category: "Getting started",
    title: "Start using Knotline",
    summary: "Set up your workspace, create accountable work, and launch your first real run.",
    minutes: 6,
    updated: "August 2, 2026",
    icon: Sparkles,
    productLink: { label: "Open the setup guide", to: "/app/onboarding" },
    sections: [
      {
        title: "What you’ll accomplish",
        body: "You’ll confirm your personal settings, understand your workspace role, create or choose a workflow, and begin a controlled run with clear ownership."
      },
      {
        title: "Complete workspace setup",
        body: "Open the setup guide. Your progress is saved after every step, so you can leave and return safely.",
        steps: [
          "Confirm your role, primary use case, and setup goal.",
          "Connect a tool now or continue without one.",
          "Choose whether to describe, import, or start from a template.",
          "Invite collaborators or continue solo.",
          "Review readiness and open the real workflow builder."
        ]
      },
      {
        title: "Know the main surfaces",
        body: "Workflows define repeatable work. Runs show live execution. Tasks and approvals route human judgment. Agents perform governed reasoning. Connections provide authorized access to external systems."
      },
      {
        title: "Before your first production run",
        body: "Publish a version, check assignments and approval policies, validate every connection, and use controlled input data first.",
        note: "A published workflow is immutable. Future edits create a new draft and version."
      }
    ]
  },
  {
    slug: "workflows/build-and-publish",
    category: "Workflows",
    title: "Build and publish a workflow",
    summary:
      "Move from an idea to a validated, versioned workflow without losing control of complexity.",
    minutes: 9,
    updated: "August 2, 2026",
    icon: Waypoints,
    productLink: { label: "Create a workflow", to: "/app/workflows/new" },
    sections: [
      {
        title: "Choose a starting point",
        body: "Describe the outcome in plain language, select a template, import a definition, or begin with a blank canvas. Generated workflows remain drafts until you validate and publish them."
      },
      {
        title: "Design the flow",
        body: "Use the full-screen canvas to add triggers, transforms, agent work, human tasks, approvals, conditions, loops, and controlled effects.",
        steps: [
          "Add or select a step.",
          "Configure its real behavior in the inspector.",
          "Connect it to the correct preceding and following steps.",
          "Define failure and retry behavior.",
          "Test the step with safe data.",
          "Use the accessible outline to verify order and structure."
        ]
      },
      {
        title: "Validate before publishing",
        body: "Resolve every blocking validation finding. Review unreachable nodes, incomplete assignments, missing connections, invalid data contracts, and unsafe effects."
      },
      {
        title: "Publish a durable version",
        body: "Add a clear version note, publish, then use the version history to inspect exactly what changed. Existing runs stay pinned to the version that started them.",
        note: "Publishing never silently changes a run already in progress."
      }
    ]
  },
  {
    slug: "runs/operate-and-recover",
    category: "Operations",
    title: "Operate, review, and recover a run",
    summary:
      "Understand live progress, complete human work, and recover safely when execution stops.",
    minutes: 8,
    updated: "August 2, 2026",
    icon: PlayCircle,
    productLink: { label: "View runs", to: "/app/runs" },
    sections: [
      {
        title: "Read the run room",
        body: "The run header shows state, elapsed time, version, progress, initiator, and freshness. The timeline explains what happened in sequence; the graph shows where execution is now."
      },
      {
        title: "Complete human steps",
        body: "Open the assigned task or approval from the run. Required fields explain what information belongs there. Claim unassigned work before editing so two people do not act at once."
      },
      {
        title: "Investigate a stopped run",
        body: "Select the failed or waiting step, read its inputs, attempts, output, and error details, then follow the available recovery action.",
        steps: [
          "Confirm whether the dependency is healthy.",
          "Check authorization and connection scope.",
          "Correct input or configuration in a new workflow version when needed.",
          "Retry only when the effect is idempotent or the product marks it safe.",
          "Record the reason for manual intervention."
        ]
      },
      {
        title: "Navigate from the run",
        body: "Use direct links to the workflow version, related tasks, approvals, evidence, and audit history rather than searching for the same object elsewhere."
      }
    ]
  },
  {
    slug: "agents/create-and-govern",
    category: "Workflows",
    title: "Create and govern an agent",
    summary:
      "Define an agent’s purpose, tools, knowledge, safety boundaries, and published versions.",
    minutes: 8,
    updated: "August 2, 2026",
    icon: Bot,
    productLink: { label: "Manage agents", to: "/app/agents" },
    sections: [
      {
        title: "Create the draft",
        body: "Give the agent a specific purpose and instructions. Choose the model behavior, allowed tools, knowledge sources, memory policy, and output contract."
      },
      {
        title: "Keep authority explicit",
        body: "Tools determine what the agent can attempt; connection scopes and workflow policy determine what it can actually access. High-risk external effects should require approval."
      },
      {
        title: "Evaluate and publish",
        body: "Run representative evaluations, inspect failures, resolve blocking validation, then publish a version with a meaningful change note."
      },
      {
        title: "Update or retire safely",
        body: "Edits create a new draft. Disable an agent to prevent new use while preserving history. Archive only after checking dependent workflows."
      }
    ]
  },
  {
    slug: "connections/connect-and-diagnose",
    category: "Administration",
    title: "Connect and diagnose an integration",
    summary: "Authorize the right account and scopes, test health, and recover connections safely.",
    minutes: 7,
    updated: "August 2, 2026",
    icon: Boxes,
    productLink: { label: "Open connections", to: "/app/connections" },
    sections: [
      {
        title: "Choose the provider",
        body: "Review supported capabilities and requested scopes before starting authorization. Connect the account that owns the data or action you intend to use."
      },
      {
        title: "Authorize and verify",
        body: "Complete the provider flow, return to Knotline, confirm the account label and granted scopes, then run the available health or sync test."
      },
      {
        title: "Diagnose a problem",
        body: "Connection detail separates authorization, provider health, sync health, and product configuration. Follow the specific remediation instead of reconnecting by default."
      },
      {
        title: "Disable, reauthorize, or delete",
        body: "Disable to pause new use, reauthorize when credentials or scopes change, and delete only after reviewing workflow dependencies."
      }
    ]
  },
  {
    slug: "administration/people-and-access",
    category: "Administration",
    title: "Manage people, roles, and workspace access",
    summary:
      "Invite teammates, apply least privilege, and make sensitive access changes deliberately.",
    minutes: 7,
    updated: "August 2, 2026",
    icon: UsersRound,
    productLink: { label: "Manage people", to: "/app/settings/members" },
    sections: [
      {
        title: "Invite a teammate",
        body: "Enter the verified work email, choose the least-privileged suitable role, send the invitation, and track it until accepted or expired."
      },
      {
        title: "Roles and groups",
        body: "System roles cover common access patterns. Custom roles combine explicit permissions. Manual groups simplify assignment; synchronized groups remain governed by their identity source."
      },
      {
        title: "Suspend, remove, or transfer",
        body: "Suspension blocks access without erasing history. Removal ends membership. Ownership transfer is guarded because it changes ultimate workspace control."
      },
      {
        title: "Review access regularly",
        body: "Audit inactive members, pending invitations, custom roles, guest access, and bounded support grants on a recurring schedule."
      }
    ]
  },
  {
    slug: "account/profile-and-security",
    category: "Account",
    title: "Manage your profile and account security",
    summary: "Update your identity preferences, review devices, and control private saved context.",
    minutes: 5,
    updated: "August 2, 2026",
    icon: ShieldCheck,
    productLink: { label: "Open your profile", to: "/app/profile" },
    sections: [
      {
        title: "Profile and interface",
        body: "Update your display name and timezone. Choose motion, contrast, and density preferences for the current device. Your verified sign-in email remains controlled by your identity provider."
      },
      {
        title: "Review active sessions",
        body: "Sessions & security lists every active device, recent activity, and expiry. Revoke an unfamiliar device, sign out all others, or intentionally sign out the current device."
      },
      {
        title: "Notification delivery",
        body: "Set quiet hours and delivery cadence. Mandatory security notifications cannot be disabled."
      },
      {
        title: "Private memory",
        body: "Inspect provenance, correct saved context, change permitted scope, export your records, or delete a record from future use."
      }
    ]
  },
  {
    slug: "troubleshooting/common-issues",
    category: "Operations",
    title: "Troubleshoot common issues",
    summary:
      "Resolve sign-in, workflow, run, assignment, and connection problems with safe first checks.",
    minutes: 10,
    updated: "August 2, 2026",
    icon: Wrench,
    productLink: { label: "Open support", to: "/app/support" },
    sections: [
      {
        title: "You cannot sign in",
        body: "Request a new single-use link, use the same browser that requested it, and confirm it has not expired. For Google sign-in, choose the invited identity. A suspended account requires a workspace administrator."
      },
      {
        title: "A task or approval is unavailable",
        body: "Confirm you are in the correct workspace and identity, then check assignment eligibility. Claim unassigned work first. Completed, revoked, or version-stale work cannot be changed."
      },
      {
        title: "A run appears stuck",
        body: "Refresh the run’s live state, inspect the active step and attempts, and check whether it is waiting for a task, approval, scheduled time, retry, or external dependency."
      },
      {
        title: "A connection is unhealthy",
        body: "Open connection detail and separate provider outage, expired authorization, missing scope, rate limit, and sync configuration. Reauthorize only when the diagnosis calls for it."
      },
      {
        title: "When to open a case",
        body: "Open a tracked support case if the issue remains, affects consequential work, involves security or privacy, or needs diagnostic review. Include what you expected, what happened, timing, affected object, and a request ID when available.",
        note: "Never paste passwords, tokens, private keys, or customer secrets into a support message."
      }
    ]
  }
];

const categoryDescriptions = [
  { name: "Getting started", icon: Sparkles, body: "Set up and reach your first useful outcome." },
  { name: "Workflows", icon: Waypoints, body: "Design workflows and govern agents." },
  { name: "Operations", icon: PlayCircle, body: "Run work, review outcomes, and recover." },
  { name: "Administration", icon: Settings2, body: "Manage connections, people, and access." },
  { name: "Account", icon: ShieldCheck, body: "Control personal settings and security." }
] as const;

const normalizeHelpSlug = (slug?: string) => slug?.replace(/^\/+|\/+$/gu, "") || undefined;

function HelpSearch({ initial = "" }: { readonly initial?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initial);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length < 2) return [];
    return articles
      .filter((article) =>
        [
          article.title,
          article.summary,
          article.category,
          ...article.sections.flatMap((section) => [
            section.title,
            section.body,
            ...(section.steps ?? [])
          ])
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized)
      )
      .slice(0, 6);
  }, [query]);
  return (
    <div className="help-search-wrap">
      <form
        className="help-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (matches[0]) navigate(`/help/${matches[0].slug}`);
        }}
        role="search"
      >
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="help-search-input">
          Search help
        </label>
        <input
          autoComplete="off"
          id="help-search-input"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search workflows, runs, agents, access…"
          value={query}
        />
        <kbd>⌘ K</kbd>
      </form>
      {query.trim().length >= 2 ? (
        <div aria-live="polite" className="help-search-results">
          {matches.length ? (
            matches.map((article) => (
              <Link key={article.slug} to={`/help/${article.slug}`}>
                <article.icon aria-hidden="true" />
                <span>
                  <strong>{article.title}</strong>
                  <small>
                    {article.category} · {article.minutes} min
                  </small>
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
            ))
          ) : (
            <p>
              No guides match “{query.trim()}”. Try a task or error name, or open a support case.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function HelpCenterPage({ slug }: { readonly slug?: string }) {
  const normalizedSlug = normalizeHelpSlug(slug);
  const article = articles.find((item) => item.slug === normalizedSlug);
  if (normalizedSlug && !article) return <HelpNotFound />;
  if (article) return <HelpArticlePage article={article} />;
  return (
    <div className="help-center">
      <section className="help-hero">
        <div className="help-hero__eyebrow">
          <span aria-hidden="true" /> Knotline help center
        </div>
        <h1>How can we help?</h1>
        <p>
          Clear, practical guidance for building, operating, and troubleshooting accountable work.
        </p>
        <HelpSearch />
        <div className="help-hero__links">
          <span>Popular:</span>
          <Link to="/help/getting-started">Getting started</Link>
          <Link to="/help/workflows/build-and-publish">Publish a workflow</Link>
          <Link to="/help/troubleshooting/common-issues">Troubleshooting</Link>
        </div>
      </section>

      <section aria-labelledby="help-categories-heading" className="help-section">
        <div className="help-section__heading">
          <div>
            <span>Browse by topic</span>
            <h2 id="help-categories-heading">Find the right path quickly</h2>
          </div>
          <p>Every guide links directly to the product surface where the work happens.</p>
        </div>
        <div className="help-category-grid">
          {categoryDescriptions.map(({ name, icon: Icon, body }) => {
            const count = articles.filter((item) => item.category === name).length;
            return (
              <article className="help-category-card" key={name}>
                <span>
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h3>{name}</h3>
                  <p>{body}</p>
                  <small>
                    {count} {count === 1 ? "guide" : "guides"}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="featured-guides-heading"
        className="help-section help-section--soft"
      >
        <div className="help-section__heading">
          <div>
            <span>Featured guidance</span>
            <h2 id="featured-guides-heading">Start with the most common journeys</h2>
          </div>
        </div>
        <div className="help-article-grid">
          {articles.slice(0, 6).map((item) => (
            <HelpArticleCard article={item} key={item.slug} />
          ))}
        </div>
        <details className="help-all-guides">
          <summary>
            View all help guides <ChevronRight aria-hidden="true" />
          </summary>
          <div>
            {articles.slice(6).map((item) => (
              <HelpArticleCard article={item} key={item.slug} />
            ))}
          </div>
        </details>
      </section>

      <section className="help-support-band">
        <div className="help-support-band__status">
          <span>
            <i aria-hidden="true" /> All systems operational
          </span>
          <Link to="/status">
            View system status <ExternalLink aria-hidden="true" size={14} />
          </Link>
        </div>
        <div className="help-support-band__body">
          <span>
            <LifeBuoy aria-hidden="true" />
          </span>
          <div>
            <h2>Still need help?</h2>
            <p>
              Open a tracked case for product, billing, security, or privacy help. You’ll keep the
              full conversation and control any diagnostic sharing.
            </p>
          </div>
          <Link className="help-primary-link" to="/app/support">
            Open support <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="help-support-band__footer">
          <span>Not signed in?</span>
          <Link to="/contact">Contact us</Link>
          <span aria-hidden="true">·</span>
          <Link to="/accessibility">Accessibility</Link>
          <span aria-hidden="true">·</span>
          <Link to="/trust">Trust center</Link>
        </div>
      </section>
    </div>
  );
}

function HelpArticleCard({ article }: { readonly article: HelpArticle }) {
  const Icon = article.icon;
  return (
    <Link className="help-article-card" to={`/help/${article.slug}`}>
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <small>{article.category}</small>
        <h3>{article.title}</h3>
        <p>{article.summary}</p>
        <footer>
          <Clock3 aria-hidden="true" /> {article.minutes} min read
        </footer>
      </div>
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}

function HelpArticlePage({ article }: { readonly article: HelpArticle }) {
  const Icon = article.icon;
  const related = articles
    .filter(
      (item) =>
        item.slug !== article.slug &&
        (item.category === article.category || item.category === "Getting started")
    )
    .slice(0, 3);
  return (
    <div className="help-article-page">
      <nav aria-label="Breadcrumb" className="help-breadcrumb">
        <Link to="/help">Help center</Link>
        <ChevronRight aria-hidden="true" />
        <span>{article.category}</span>
        <ChevronRight aria-hidden="true" />
        <span aria-current="page">{article.title}</span>
      </nav>
      <div className="help-article-layout">
        <article>
          <header className="help-article-hero">
            <span>
              <Icon aria-hidden="true" />
            </span>
            <div>
              <small>{article.category}</small>
              <h1>{article.title}</h1>
              <p>{article.summary}</p>
              <footer>
                <Clock3 aria-hidden="true" /> {article.minutes} min read <span>·</span> Updated{" "}
                {article.updated}
              </footer>
            </div>
          </header>
          <nav aria-label="On this page" className="help-on-this-page">
            <strong>On this page</strong>
            {article.sections.map((section, index) => (
              <a href={`#help-section-${index + 1}`} key={section.title}>
                {section.title}
              </a>
            ))}
          </nav>
          <div className="help-article-sections">
            {article.sections.map((section, index) => (
              <section id={`help-section-${index + 1}`} key={section.title}>
                <span className="help-step-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                  {section.steps ? (
                    <ol>
                      {section.steps.map((step) => (
                        <li key={step}>
                          <span>
                            <Check aria-hidden="true" />
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {section.note ? (
                    <aside>
                      <CircleHelp aria-hidden="true" />
                      <p>{section.note}</p>
                    </aside>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
          <div className="help-article-cta">
            <div>
              <strong>Ready to continue?</strong>
              <p>Open the exact product surface described in this guide.</p>
            </div>
            <Link className="help-primary-link" to={article.productLink.to}>
              {article.productLink.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>
        <aside className="help-related">
          <div>
            <LifeBuoy aria-hidden="true" />
            <h2>Need more help?</h2>
            <p>Open a tracked support case and keep the conversation in your workspace.</p>
            <Link to="/app/support">Open support</Link>
          </div>
          <section>
            <h2>Related guides</h2>
            {related.map((item) => (
              <Link key={item.slug} to={`/help/${item.slug}`}>
                <span>
                  {item.title}
                  <small>{item.minutes} min read</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function HelpNotFound() {
  return (
    <div className="help-not-found">
      <span>
        <FileText aria-hidden="true" />
      </span>
      <h1>We couldn’t find that guide</h1>
      <p>The link may have moved. Search the current help catalog or return to the help center.</p>
      <HelpSearch />
      <Link className="help-primary-link" to="/help">
        <ArrowLeft aria-hidden="true" /> Back to help center
      </Link>
    </div>
  );
}

function SupportFrame({ children }: { readonly children: ReactNode }) {
  return (
    <WorkspaceShell contentClassName="support-shell-content">
      <div className="support-frame">
        <nav aria-label="Support" className="support-nav">
          <Link to="/help">
            <BookOpen aria-hidden="true" /> Help center
          </Link>
          <Link to="/app/support">
            <LifeBuoy aria-hidden="true" /> Support cases
          </Link>
          <Link to="/app/feedback">
            <MessageSquare aria-hidden="true" /> Send feedback
          </Link>
          <Link to="/status">
            <Bell aria-hidden="true" /> System status
          </Link>
        </nav>
        {children}
      </div>
    </WorkspaceShell>
  );
}

const supportError = (cause: unknown, fallback: string) =>
  cause instanceof RequestFailure ? cause.message : fallback;
const formValue = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

export function SupportPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<readonly SupportTicket[]>();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetchSupportTickets()
        .then(setTickets)
        .catch((cause: unknown) =>
          setError(supportError(cause, "Support cases could not be loaded."))
        ),
    []
  );
  useEffect(() => void load(), [load]);
  const visibleTickets = tickets?.filter(
    (ticket) =>
      filter === "all" ||
      (filter === "resolved"
        ? ["resolved", "closed"].includes(ticket.status)
        : ["open", "waiting"].includes(ticket.status))
  );
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const ticket = await createSupportTicket({
        category: formValue(data, "category"),
        severity: formValue(data, "severity"),
        subject: formValue(data, "subject"),
        diagnosticConsent: data.get("diagnosticConsent") === "on"
      });
      const message = formValue(data, "message").trim();
      if (message) await addSupportMessage(ticket.id, message);
      navigate(`/app/support/${ticket.id}`);
    } catch (cause) {
      setError(supportError(cause, "The support case could not be created."));
      setBusy(false);
    }
  };
  return (
    <SupportFrame>
      <main className="support-page">
        <header className="support-heading">
          <div>
            <span className="support-kicker">Customer support</span>
            <h1>Get help with clear ownership</h1>
            <p>
              Open a tracked case, keep every response together, and share diagnostics only after
              reviewing exactly what they contain.
            </p>
          </div>
          <Button onClick={() => setShowCreate((current) => !current)} tone="accent">
            <LifeBuoy aria-hidden="true" /> {showCreate ? "Close form" : "Open support case"}
          </Button>
        </header>
        <section aria-label="Support service summary" className="support-summary">
          <Card>
            <span>
              <i aria-hidden="true" />
              Service status
            </span>
            <strong>Operational</strong>
            <Link to="/status">View status</Link>
          </Card>
          <Card>
            <span>
              <Clock3 aria-hidden="true" />
              Response target
            </span>
            <strong>Based on severity</strong>
            <small>Urgent cases are prioritized</small>
          </Card>
          <Card>
            <span>
              <LockKeyhole aria-hidden="true" />
              Diagnostic sharing
            </span>
            <strong>Consent required</strong>
            <small>Secrets and content excluded</small>
          </Card>
        </section>
        {error ? (
          <p className="support-error" role="alert">
            {error}
          </p>
        ) : null}
        {showCreate ? (
          <Card className="support-create-card">
            <div className="support-create-card__heading">
              <span>
                <Mail aria-hidden="true" />
              </span>
              <div>
                <h2>Tell us what happened</h2>
                <p>
                  Specific context helps route the case correctly. Never include passwords, tokens,
                  keys, or customer secrets.
                </p>
              </div>
            </div>
            <form onSubmit={(event) => void create(event)}>
              <div className="support-form-grid">
                <label>
                  Category
                  <select name="category" defaultValue="product">
                    <option value="product">Product</option>
                    <option value="billing">Billing</option>
                    <option value="security">Security</option>
                    <option value="privacy">Privacy</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Severity
                  <select name="severity" defaultValue="normal">
                    <option value="low">Low — question or guidance</option>
                    <option value="normal">Normal — work is affected</option>
                    <option value="high">High — important work is blocked</option>
                    <option value="urgent">Urgent — security or critical operations</option>
                  </select>
                </label>
              </div>
              <label>
                Subject
                <input
                  maxLength={200}
                  minLength={3}
                  name="subject"
                  placeholder="Briefly describe the issue"
                  required
                />
              </label>
              <label>
                What happened?
                <textarea
                  maxLength={10000}
                  minLength={10}
                  name="message"
                  placeholder="What did you expect, what happened, when, and which workflow or run was affected?"
                  required
                  rows={6}
                />
              </label>
              <div className="support-consent">
                <input id="support-diagnostic-consent" name="diagnosticConsent" type="checkbox" />
                <label htmlFor="support-diagnostic-consent">
                  <strong>Allow a diagnostic preview for this case</strong>
                  <small>
                    You will still review and explicitly approve the generated bundle before it is
                    shared.
                  </small>
                </label>
              </div>
              <div className="support-form-actions">
                <Button disabled={busy} tone="accent" type="submit">
                  {busy ? "Creating case…" : "Create support case"}
                </Button>
                <Button onClick={() => setShowCreate(false)} type="button">
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
        <section className="support-cases">
          <div className="support-cases__heading">
            <div>
              <h2>Your support cases</h2>
              <p>Cases are visible to authorized members of this workspace.</p>
            </div>
            <div role="group" aria-label="Filter support cases">
              {(["all", "open", "resolved"] as const).map((value) => (
                <button
                  aria-pressed={filter === value}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {value[0]?.toUpperCase()}
                  {value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {!tickets ? (
            <Skeleton label="Loading support cases" />
          ) : visibleTickets?.length ? (
            <div className="support-ticket-list">
              {visibleTickets.map((ticket) => (
                <Link key={ticket.id} to={`/app/support/${ticket.id}`}>
                  <span className={`support-ticket-icon support-ticket-icon--${ticket.severity}`}>
                    <LifeBuoy aria-hidden="true" />
                  </span>
                  <div>
                    <span>
                      <Badge
                        tone={
                          ticket.status === "open"
                            ? "warning"
                            : ticket.status === "waiting"
                              ? "accent"
                              : "success"
                        }
                      >
                        {ticket.status}
                      </Badge>
                      <small>
                        {ticket.category} · {ticket.severity}
                      </small>
                    </span>
                    <strong>{ticket.subject}</strong>
                    <small>
                      Opened {new Date(ticket.createdAt).toLocaleDateString()}{" "}
                      {ticket.assignee
                        ? `· Assigned to ${ticket.assignee}`
                        : "· Awaiting assignment"}
                    </small>
                  </div>
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={filter === "all" ? "No support cases yet" : `No ${filter} cases`}>
              <p>
                {filter === "all"
                  ? "When you need help, open a case and the full history will appear here."
                  : "Try another filter or open a new case."}
              </p>
            </EmptyState>
          )}
        </section>
      </main>
    </SupportFrame>
  );
}

export function SupportDetailPage() {
  const { ticketId = "" } = useParams();
  const [ticket, setTicket] = useState<SupportTicket>();
  const [currentUserId, setCurrentUserId] = useState("");
  const [diagnostic, setDiagnostic] = useState<DiagnosticBundle>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([fetchSupportTicket(ticketId), fetchMeBootstrap()])
        .then(([nextTicket, bootstrap]) => {
          setTicket(nextTicket);
          setCurrentUserId(bootstrap.user.id);
        })
        .catch((cause: unknown) =>
          setError(supportError(cause, "This support case could not be loaded."))
        ),
    [ticketId]
  );
  useEffect(() => void load(), [load]);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = formValue(data, "message").trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      await addSupportMessage(ticketId, body);
      form.reset();
      setNotice("Your reply was added to the case.");
      await load();
    } catch (cause) {
      setError(supportError(cause, "Your reply could not be added."));
    } finally {
      setBusy(false);
    }
  };
  const prepareDiagnostic = async () => {
    setBusy(true);
    setError("");
    try {
      setDiagnostic(await createDiagnosticBundle(ticketId));
    } catch (cause) {
      setError(supportError(cause, "A diagnostic preview could not be created."));
    } finally {
      setBusy(false);
    }
  };
  const approveDiagnostic = async () => {
    if (!diagnostic) return;
    setBusy(true);
    try {
      setDiagnostic(await consentDiagnosticBundle(diagnostic.id));
      setNotice("Diagnostic sharing approved. The redacted bundle is being prepared.");
    } catch (cause) {
      setError(supportError(cause, "Diagnostic consent could not be recorded."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SupportFrame>
      <main className="support-detail-page">
        {!ticket ? (
          error ? (
            <ErrorState title="Support case unavailable">
              <p>{error}</p>
              <Link to="/app/support">Back to support</Link>
            </ErrorState>
          ) : (
            <Skeleton label="Loading support case" />
          )
        ) : (
          <>
            <nav aria-label="Breadcrumb" className="support-breadcrumb">
              <Link to="/app/support">
                <ArrowLeft aria-hidden="true" /> Support cases
              </Link>
              <span>/</span>
              <span aria-current="page">Case {ticket.id.slice(0, 8)}</span>
            </nav>
            <header className="support-detail-heading">
              <div>
                <span>
                  <Badge
                    tone={
                      ticket.status === "open"
                        ? "warning"
                        : ticket.status === "waiting"
                          ? "accent"
                          : "success"
                    }
                  >
                    {ticket.status}
                  </Badge>
                  <small>
                    Case {ticket.id.slice(0, 8)} · {ticket.category}
                  </small>
                </span>
                <h1>{ticket.subject}</h1>
                <p>
                  Opened {new Date(ticket.createdAt).toLocaleString()} · Severity: {ticket.severity}
                </p>
              </div>
              <Link className="support-help-link" to="/help/troubleshooting/common-issues">
                <BookOpen aria-hidden="true" /> Troubleshooting guide
              </Link>
            </header>
            {notice ? (
              <p className="support-notice" role="status">
                <Check aria-hidden="true" />
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="support-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="support-detail-layout">
              <section className="support-conversation" aria-labelledby="case-conversation-heading">
                <div className="support-conversation__heading">
                  <div>
                    <h2 id="case-conversation-heading">Conversation</h2>
                    <p>Messages are retained with the support case.</p>
                  </div>
                  <Badge tone="neutral">{ticket.messages?.length ?? 0} messages</Badge>
                </div>
                <div className="support-messages">
                  {ticket.messages?.length ? (
                    ticket.messages.map((message) => {
                      const ownMessage = message.authorUserId === currentUserId;
                      return (
                        <article key={message.id}>
                          <span aria-hidden="true">{ownMessage ? "You" : "KS"}</span>
                          <div>
                            <header>
                              <strong>{ownMessage ? "You" : "Knotline support"}</strong>
                              <time dateTime={message.createdAt}>
                                {new Date(message.createdAt).toLocaleString()}
                              </time>
                            </header>
                            <p>{message.body}</p>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="support-empty-conversation">
                      <MessageSquare aria-hidden="true" />
                      <strong>No messages yet</strong>
                      <p>Add the details support needs to investigate.</p>
                    </div>
                  )}
                </div>
                <form className="support-reply" onSubmit={(event) => void send(event)}>
                  <label htmlFor="support-reply-message">Add a reply</label>
                  <textarea
                    id="support-reply-message"
                    maxLength={10000}
                    name="message"
                    placeholder="Share an update or answer from support…"
                    required
                    rows={5}
                  />
                  <div>
                    <small>Do not include passwords, tokens, keys, or customer secrets.</small>
                    <Button disabled={busy} tone="accent" type="submit">
                      <Send aria-hidden="true" /> {busy ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </form>
              </section>
              <aside className="support-case-sidebar">
                <Card>
                  <h2>Case details</h2>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{ticket.status}</dd>
                    </div>
                    <div>
                      <dt>Severity</dt>
                      <dd>{ticket.severity}</dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{ticket.category}</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{ticket.assignee ?? "Support queue"}</dd>
                    </div>
                    <div>
                      <dt>Last updated</dt>
                      <dd>{new Date(ticket.updatedAt ?? ticket.createdAt).toLocaleDateString()}</dd>
                    </div>
                  </dl>
                </Card>
                <Card className="support-diagnostic-card">
                  <span>
                    <LockKeyhole aria-hidden="true" />
                  </span>
                  <h2>Share diagnostics safely</h2>
                  <p>
                    First generate a preview. Nothing is shared until you review it and explicitly
                    approve.
                  </p>
                  {!diagnostic ? (
                    <Button disabled={busy} onClick={() => void prepareDiagnostic()}>
                      Generate preview
                    </Button>
                  ) : (
                    <div className="support-diagnostic-preview">
                      <span>
                        <strong>Included</strong>
                        {diagnostic.preview.includes.map((item) => (
                          <small key={item}>
                            <Check aria-hidden="true" />
                            {item.replaceAll("_", " ")}
                          </small>
                        ))}
                      </span>
                      <span>
                        <strong>Excluded</strong>
                        {diagnostic.preview.excludes.map((item) => (
                          <small key={item}>
                            <LockKeyhole aria-hidden="true" />
                            {item}
                          </small>
                        ))}
                      </span>
                      <p>Preview expires {new Date(diagnostic.expiresAt).toLocaleString()}.</p>
                      {diagnostic.state === "awaiting_consent" ? (
                        <Button
                          disabled={busy}
                          onClick={() => void approveDiagnostic()}
                          tone="accent"
                        >
                          Approve and prepare bundle
                        </Button>
                      ) : (
                        <Badge tone="accent">{diagnostic.state}</Badge>
                      )}
                    </div>
                  )}
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>
    </SupportFrame>
  );
}

export function FeedbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const type = formValue(data, "type");
      const ticket = await createSupportTicket({
        category:
          type === "accessibility" ? "product" : type === "security" ? "security" : "product",
        severity: type === "unsafe-output" ? "high" : "normal",
        subject: `[${type}] ${formValue(data, "subject")}`,
        diagnosticConsent: false
      });
      await addSupportMessage(ticket.id, formValue(data, "message"));
      navigate(`/app/support/${ticket.id}`);
    } catch (cause) {
      setError(supportError(cause, "Your feedback could not be submitted."));
      setBusy(false);
    }
  };
  return (
    <SupportFrame>
      <main className="feedback-page">
        <header>
          <span>
            <MessageSquare aria-hidden="true" />
          </span>
          <div>
            <span className="support-kicker">Product feedback</span>
            <h1>Help us improve Knotline</h1>
            <p>
              Report a product issue, accessibility barrier, citation problem, or unsafe output.
              You’ll receive a tracked case for follow-up.
            </p>
          </div>
        </header>
        {error ? (
          <p className="support-error" role="alert">
            {error}
          </p>
        ) : null}
        <Card>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Feedback type
              <select name="type" defaultValue="product">
                <option value="product">Product experience</option>
                <option value="accessibility">Accessibility barrier</option>
                <option value="citation">Citation quality</option>
                <option value="unsafe-output">Unsafe or incorrect output</option>
                <option value="security">Security concern</option>
              </select>
            </label>
            <label>
              Subject
              <input minLength={3} maxLength={160} name="subject" required />
            </label>
            <label>
              What should we know?
              <textarea
                minLength={10}
                maxLength={10000}
                name="message"
                placeholder="What happened, what did you expect, and how did it affect your work?"
                required
                rows={8}
              />
            </label>
            <p>
              <ShieldCheck aria-hidden="true" /> Feedback is private to authorized workspace members
              and the support team. Do not include secrets.
            </p>
            <Button disabled={busy} tone="accent" type="submit">
              {busy ? "Submitting…" : "Submit feedback"}
            </Button>
          </form>
        </Card>
      </main>
    </SupportFrame>
  );
}
