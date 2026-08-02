/* eslint-disable knotline/no-hardcoded-user-visible-string -- This is the owned English public product catalog pending locale extraction. */
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  CloudCog,
  Code2,
  Database,
  FileCheck2,
  FileText,
  GitBranch,
  Globe2,
  KeyRound,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  MessageSquareText,
  Network,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UsersRound,
  Waypoints,
  Webhook,
  type LucideIcon
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import "./M02PublicSitePages.css";

type ProductPage = "overview" | "workflows" | "agents" | "knowledge" | "integrations";

type MarketingConfig = {
  eyebrow: string;
  title: string;
  body: string;
  proof: readonly string[];
  capabilities: readonly { icon: LucideIcon; title: string; body: string }[];
};

const productPages: Record<Exclude<ProductPage, "integrations">, MarketingConfig> = {
  overview: {
    eyebrow: "The accountable operations platform",
    title: "One place for people and agents to move important work forward.",
    body: "Knotline turns a process into a shared operating surface: every handoff has an owner, every decision has context, and every automated action stays within explicit guardrails.",
    proof: [
      "Visual workflow builder",
      "Governed AI agents",
      "Human approvals",
      "Complete run history"
    ],
    capabilities: [
      {
        icon: Waypoints,
        title: "Design the real process",
        body: "Model branches, retries, approvals, assignments, data contracts, and recovery paths without hiding operational detail."
      },
      {
        icon: Bot,
        title: "Delegate with control",
        body: "Give agents a purpose, tools, knowledge, limits, and evaluation criteria before they can act."
      },
      {
        icon: UsersRound,
        title: "Keep people in command",
        body: "Route judgment calls to the right person with the evidence, deadline, and decision options already attached."
      },
      {
        icon: FileCheck2,
        title: "Know what happened",
        body: "Follow each run from trigger through outcome with structured events, outputs, decisions, and accountable owners."
      }
    ]
  },
  workflows: {
    eyebrow: "Knotline Workflows",
    title: "Build operations that remain clear when the work gets complicated.",
    body: "Move beyond brittle checklists. Create durable workflows with conditional paths, parallel work, human review, automated steps, failure handling, and live execution visibility.",
    proof: [
      "Canvas-based editing",
      "Versioned publishing",
      "Test before release",
      "Live run rooms"
    ],
    capabilities: [
      {
        icon: GitBranch,
        title: "Express every path",
        body: "Combine actions, transforms, delays, conditions, approvals, agent work, and child workflows in one readable graph."
      },
      {
        icon: Play,
        title: "Test with safe data",
        body: "Validate individual steps and end-to-end paths before a version reaches the people who depend on it."
      },
      {
        icon: Clock3,
        title: "Operate in real time",
        body: "See progress, waiting states, owners, deadlines, inputs, outputs, and recovery options without leaving the run."
      },
      {
        icon: BadgeCheck,
        title: "Publish with confidence",
        body: "Review changes, verify configuration, preserve prior versions, and control who can publish."
      }
    ]
  },
  agents: {
    eyebrow: "Knotline Agents",
    title: "AI teammates with a job description, boundaries, and a record of their work.",
    body: "Create specialized agents for operational work while keeping their identity, instructions, knowledge, tools, memory, approvals, and evaluation history visible and governable.",
    proof: ["Explicit tool scopes", "Knowledge boundaries", "Approval gates", "Evaluation history"],
    capabilities: [
      {
        icon: Bot,
        title: "Define the role",
        body: "Set a clear purpose, operating instructions, expected outputs, escalation behavior, and ownership."
      },
      {
        icon: KeyRound,
        title: "Grant minimum authority",
        body: "Choose precisely which tools and actions an agent may use, then require approval for consequential operations."
      },
      {
        icon: Network,
        title: "Ground every answer",
        body: "Attach approved knowledge sources and keep retrieved context permission-aware and attributable."
      },
      {
        icon: FileCheck2,
        title: "Evaluate continuously",
        body: "Test realistic cases, compare versions, inspect activity, and improve behavior from evidence rather than intuition."
      }
    ]
  },
  knowledge: {
    eyebrow: "Knotline Knowledge",
    title: "Give work the right context without creating another information maze.",
    body: "Connect operational knowledge to the workflows and agents that need it. Preserve source, freshness, access rules, and retrieval history so context remains trustworthy.",
    proof: [
      "Source-level access",
      "Citation-ready retrieval",
      "Freshness visibility",
      "Usage history"
    ],
    capabilities: [
      {
        icon: Database,
        title: "Connect trusted sources",
        body: "Bring approved documents and repositories into a catalog with clear ownership and synchronization state."
      },
      {
        icon: ShieldCheck,
        title: "Respect access rules",
        body: "Keep workspace and source permissions attached as knowledge is retrieved and used."
      },
      {
        icon: Search,
        title: "Find operational context",
        body: "Retrieve the most relevant passages for a task while preserving enough source detail for review."
      },
      {
        icon: Layers3,
        title: "Manage the lifecycle",
        body: "Inspect ingestion, indexing, freshness, failures, and usage from a single administrative surface."
      }
    ]
  }
};

const solutionPages: Record<string, MarketingConfig> = {
  operations: {
    eyebrow: "Solutions for Operations",
    title: "Turn recurring coordination into a reliable operating system.",
    body: "Standardize complex work without losing the judgment and flexibility experienced operators bring.",
    proof: ["Clear ownership", "Repeatable controls", "Live exceptions", "Auditable outcomes"],
    capabilities: [
      {
        icon: Waypoints,
        title: "Operational playbooks",
        body: "Turn the best-known process into a workflow teams can actually run and improve."
      },
      {
        icon: UserCheck,
        title: "Exception ownership",
        body: "Put the right exception in front of the right person with its full context."
      },
      {
        icon: Clock3,
        title: "Service targets",
        body: "Make deadlines, waiting time, and risk visible before commitments are missed."
      },
      {
        icon: FileCheck2,
        title: "Control evidence",
        body: "Capture decisions and outputs as part of the work, not in a separate audit scramble."
      }
    ]
  },
  support: {
    eyebrow: "Solutions for Customer Support",
    title: "Resolve complex customer issues with context, ownership, and speed.",
    body: "Coordinate support, engineering, success, finance, and AI assistance around one visible recovery path.",
    proof: ["Case orchestration", "Customer context", "Human judgment", "Consistent closeout"],
    capabilities: [
      {
        icon: LifeBuoy,
        title: "Guided recovery",
        body: "Route each case through triage, evidence, remediation, communication, and closeout."
      },
      {
        icon: MessageSquareText,
        title: "Customer-ready updates",
        body: "Prepare consistent communications from the latest verified run context."
      },
      {
        icon: UsersRound,
        title: "Cross-team ownership",
        body: "Coordinate every contributor without losing the accountable case owner."
      },
      {
        icon: Sparkles,
        title: "Governed assistance",
        body: "Use agents to summarize, investigate, and draft while people retain consequential decisions."
      }
    ]
  },
  product: {
    eyebrow: "Solutions for Product Teams",
    title: "Move from customer signal to accountable product action.",
    body: "Collect evidence, assess impact, align owners, and carry a decision through delivery and customer follow-up.",
    proof: ["Signal intake", "Evidence synthesis", "Decision records", "Delivery handoffs"],
    capabilities: [
      {
        icon: MessageSquareText,
        title: "Unify signals",
        body: "Bring customer, support, sales, and product evidence into one structured intake."
      },
      {
        icon: Sparkles,
        title: "Synthesize patterns",
        body: "Use governed agents to cluster and summarize evidence without obscuring its source."
      },
      {
        icon: UserCheck,
        title: "Record decisions",
        body: "Capture who decided, why, what was considered, and what happens next."
      },
      {
        icon: GitBranch,
        title: "Close the loop",
        body: "Connect prioritization to delivery, release, and customer communication."
      }
    ]
  },
  it: {
    eyebrow: "Solutions for IT & Service Delivery",
    title: "Standardize service work while keeping exceptions safe.",
    body: "Build governed paths for access, incidents, changes, device lifecycle, and service requests.",
    proof: ["Controlled access", "Incident paths", "Change approvals", "Evidence by default"],
    capabilities: [
      {
        icon: KeyRound,
        title: "Access requests",
        body: "Validate need, route approvals, provision safely, and preserve a complete record."
      },
      {
        icon: CloudCog,
        title: "Incident coordination",
        body: "Move from detection through triage, mitigation, communication, and review."
      },
      {
        icon: ShieldCheck,
        title: "Change control",
        body: "Require the right verification and approval before consequential changes run."
      },
      {
        icon: FileCheck2,
        title: "Audit-ready execution",
        body: "Keep inputs, decisions, outputs, and operators connected to the run."
      }
    ]
  },
  "go-to-market": {
    eyebrow: "Solutions for Go-to-market",
    title: "Coordinate the revenue work that falls between systems.",
    body: "Turn handoffs across marketing, sales, legal, finance, and success into visible, owned execution.",
    proof: ["Deal coordination", "Launch readiness", "Approval paths", "Customer handoffs"],
    capabilities: [
      {
        icon: UsersRound,
        title: "Multi-team deal rooms",
        body: "Coordinate specialists around one current commercial path."
      },
      {
        icon: UserCheck,
        title: "Approvals",
        body: "Route pricing, legal, and risk decisions with complete context."
      },
      {
        icon: Clock3,
        title: "Commitment tracking",
        body: "Expose deadlines and blockers before a customer commitment slips."
      },
      {
        icon: FileCheck2,
        title: "Clean handoffs",
        body: "Carry decisions and obligations into onboarding and account ownership."
      }
    ]
  },
  finance: {
    eyebrow: "Solutions for Finance",
    title: "Put dependable controls inside day-to-day financial operations.",
    body: "Coordinate reviews, exceptions, approvals, and evidence without turning every process into a ticket chase.",
    proof: ["Separation of duties", "Approval evidence", "Exception routing", "Close visibility"],
    capabilities: [
      {
        icon: ShieldCheck,
        title: "Embedded controls",
        body: "Put validation and required approvals directly in the workflow."
      },
      {
        icon: UserCheck,
        title: "Explicit authority",
        body: "Make decision rights and separation of duties clear."
      },
      {
        icon: GitBranch,
        title: "Exception paths",
        body: "Handle non-standard cases without losing policy or traceability."
      },
      {
        icon: FileCheck2,
        title: "Continuous evidence",
        body: "Generate the history needed for review while the work happens."
      }
    ]
  },
  hr: {
    eyebrow: "Solutions for People Teams",
    title: "Create thoughtful employee journeys that never lose the human owner.",
    body: "Coordinate onboarding, changes, leave, mobility, and offboarding across people, managers, IT, and finance.",
    proof: ["Employee journeys", "Sensitive access", "Cross-team tasks", "Timely completion"],
    capabilities: [
      {
        icon: UsersRound,
        title: "Joined-up journeys",
        body: "Coordinate every contributor around the employee experience."
      },
      {
        icon: LockKeyhole,
        title: "Sensitive by design",
        body: "Keep personal context scoped to the people and steps that need it."
      },
      {
        icon: Clock3,
        title: "Time-aware tasks",
        body: "Align work to start dates, notice periods, and policy windows."
      },
      {
        icon: UserCheck,
        title: "Human accountability",
        body: "Keep a named owner on decisions that affect people."
      }
    ]
  }
};

function Hero({
  config,
  secondary = "/templates"
}: {
  config: MarketingConfig;
  secondary?: string;
}) {
  return (
    <section className="marketing-hero">
      <div>
        <span className="marketing-eyebrow">{config.eyebrow}</span>
        <h1>{config.title}</h1>
        <p>{config.body}</p>
        <div className="marketing-actions">
          <Link className="marketing-primary" to="/auth/sign-in">
            Start building <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="marketing-secondary" to={secondary}>
            Explore examples
          </Link>
        </div>
        <ul>
          {config.proof.map((item) => (
            <li key={item}>
              <Check aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <WorkflowVisual />
    </section>
  );
}

function WorkflowVisual() {
  const steps = [
    [CircleCheck, "Capture request", "Validated"],
    [Sparkles, "Assess context", "Agent working"],
    [UserCheck, "Review decision", "Human approval"],
    [GitBranch, "Execute outcome", "Controlled path"]
  ] as const;
  return (
    <div className="marketing-visual" aria-label="Example governed workflow">
      <div className="marketing-visual__bar">
        <span>
          <i />
          <i />
          <i />
        </span>
        <small>Customer recovery · Version 4</small>
        <b>Live</b>
      </div>
      <div className="marketing-visual__canvas">
        {steps.map(([Icon, title, state], index) => (
          <div className={`marketing-node marketing-node--${index + 1}`} key={title}>
            <span>
              <Icon aria-hidden="true" />
            </span>
            <div>
              <strong>{title}</strong>
              <small>{state}</small>
            </div>
            {index < 3 ? <i aria-hidden="true" /> : null}
          </div>
        ))}
        <div className="marketing-event">
          <span>AL</span>
          <p>
            <strong>Alex approved remediation</strong>
            <small>Reason and evidence preserved</small>
          </p>
          <time>Now</time>
        </div>
      </div>
    </div>
  );
}

function CapabilitySection({ config }: { config: MarketingConfig }) {
  return (
    <section className="marketing-section">
      <div className="marketing-section__heading">
        <span>BUILT FOR REAL OPERATIONS</span>
        <h2>Enough structure to be dependable. Enough clarity to stay usable.</h2>
        <p>
          Every capability works as part of one system, so teams do not have to reconstruct the
          truth from disconnected tools.
        </p>
      </div>
      <div className="marketing-capabilities">
        {config.capabilities.map(({ icon: Icon, title, body }, index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <Icon aria-hidden="true" />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OperatingModel() {
  return (
    <section className="marketing-model">
      <div>
        <span>FROM IDEA TO OUTCOME</span>
        <h2>A complete operating loop, not another isolated builder.</h2>
      </div>
      <ol>
        {[
          ["Design", "Model the process, ownership, data, controls, and exceptions."],
          ["Verify", "Test steps and paths with controlled inputs before publishing."],
          ["Run", "Coordinate people, agents, systems, approvals, and deadlines live."],
          ["Improve", "Use run evidence, failures, feedback, and evaluations to evolve safely."]
        ].map(([title, body], index) => (
          <li key={title}>
            <span>{index + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="marketing-final">
      <span>READY WHEN THE WORK MATTERS</span>
      <h2>Give your next critical process one accountable home.</h2>
      <p>
        Start with a proven pattern or build the operating path your team already knows it needs.
      </p>
      <Link to="/auth/sign-in">
        Enter the workspace <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

export function ProductMarketingPage({ page }: { page: ProductPage }) {
  if (page === "integrations") return <IntegrationsMarketingPage />;
  const config = productPages[page];
  return (
    <>
      <Hero config={config} />
      <CapabilitySection config={config} />
      <OperatingModel />
      <FinalCta />
    </>
  );
}

export function SolutionMarketingPage({ solution }: { solution: string }) {
  const config = solutionPages[solution];
  if (!config) return null;
  return (
    <>
      <Hero config={config} />
      <CapabilitySection config={config} />
      <section className="marketing-proof">
        <div>
          <span>ONE SHARED VIEW</span>
          <h2>Everyone sees the work at the level they need.</h2>
        </div>
        <div>
          <article>
            <strong>Operators</strong>
            <p>Current work, exceptions, context, and the next safe action.</p>
          </article>
          <article>
            <strong>Leaders</strong>
            <p>Progress, service risk, bottlenecks, and accountable outcomes.</p>
          </article>
          <article>
            <strong>Reviewers</strong>
            <p>Decisions, evidence, changes, and execution history in context.</p>
          </article>
        </div>
      </section>
      <FinalCta />
    </>
  );
}

const integrations = [
  ["Slack", "Collaboration", MessageSquareText],
  ["Microsoft Teams", "Collaboration", MessageSquareText],
  ["Microsoft 365", "Productivity", Boxes],
  ["Gmail & Google Calendar", "Productivity", Boxes],
  ["Salesforce", "Customer", UsersRound],
  ["HubSpot", "Customer", UsersRound],
  ["Linear", "Delivery", Layers3],
  ["Jira Cloud", "Delivery", Layers3],
  ["GitHub", "Engineering", Code2],
  ["S3-compatible storage", "Data", Database],
  ["REST API", "Developer", Globe2],
  ["Signed webhooks", "Developer", Webhook],
  ["CSV import", "Data", FileText]
] as const;

function IntegrationsMarketingPage() {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      integrations.filter(([name, category]) =>
        `${name} ${category}`.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );
  const config: MarketingConfig = {
    eyebrow: "Knotline Integrations",
    title: "Connect the systems where your work already lives.",
    body: "Bring signals in, take governed action, and preserve the outcome in Knotline. Credentials, scopes, test status, and failures stay visible to administrators.",
    proof: ["Explicit permissions", "Connection testing", "Signed webhooks", "Observable failures"],
    capabilities: []
  };
  return (
    <>
      <Hero config={config} secondary="/docs" />
      <section className="integration-catalog">
        <div className="marketing-section__heading">
          <span>INTEGRATION CATALOG</span>
          <h2>Build across your existing stack.</h2>
          <p>
            Use managed connectors for common systems or the developer interfaces for anything
            unique to your operation.
          </p>
        </div>
        <label>
          <Search aria-hidden="true" />
          <span className="sr-only">Search integrations</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search integrations"
            type="search"
            value={query}
          />
        </label>
        <div>
          {visible.map(([name, category, Icon]) => (
            <article key={name}>
              <span>
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{name}</h3>
                <p>{category}</p>
              </div>
              <ChevronRight aria-hidden="true" />
            </article>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="integration-empty">
            No matching connector. Use the REST API or signed webhooks for a custom integration.
          </p>
        ) : null}
      </section>
      <OperatingModel />
      <FinalCta />
    </>
  );
}

const templateData = {
  "incident-response": {
    name: "Customer incident recovery",
    label: "Support + Operations",
    body: "Coordinate intelligent triage, evidence collection, human judgment, governed remediation, customer communication, and auditable closeout.",
    steps: [
      "Validate incident and customer context",
      "Assess severity and blast radius",
      "Collect technical evidence in parallel",
      "Request remediation approval",
      "Execute and verify recovery",
      "Communicate and close with evidence"
    ]
  },
  "customer-onboarding": {
    name: "Enterprise customer onboarding",
    label: "Go-to-market + Operations",
    body: "Carry a signed customer through discovery, security, configuration, training, launch readiness, and accountable handoff.",
    steps: [
      "Confirm commercial and delivery scope",
      "Collect technical requirements",
      "Coordinate security review",
      "Configure and validate workspace",
      "Prepare administrators and users",
      "Approve launch and transfer ownership"
    ]
  }
} as const;

export function TemplatesMarketingPage({ slug }: { slug?: string }) {
  const selected = slug ? templateData[slug as keyof typeof templateData] : undefined;
  if (selected)
    return (
      <>
        <section className="template-detail">
          <div>
            <Link to="/templates">Templates</Link>
            <span>{selected.label}</span>
            <h1>{selected.name}</h1>
            <p>{selected.body}</p>
            <div className="marketing-actions">
              <Link className="marketing-primary" to="/auth/sign-in">
                Use this template <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="marketing-secondary" to="/docs/getting-started">
                Read setup guide
              </Link>
            </div>
          </div>
          <ol>
            {selected.steps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
                {index < selected.steps.length - 1 ? <i /> : null}
              </li>
            ))}
          </ol>
        </section>
        <section className="template-includes">
          <h2>What this template includes</h2>
          <div>
            <article>
              <UserCheck />
              <h3>Human decisions</h3>
              <p>Consequential actions stop for an accountable reviewer.</p>
            </article>
            <article>
              <GitBranch />
              <h3>Exception paths</h3>
              <p>Failure and escalation paths are part of the design.</p>
            </article>
            <article>
              <FileCheck2 />
              <h3>Outcome evidence</h3>
              <p>Each run closes with decisions and outputs attached.</p>
            </article>
          </div>
        </section>
        <FinalCta />
      </>
    );
  return (
    <>
      <section className="library-hero">
        <span className="marketing-eyebrow">Knotline Templates</span>
        <h1>Start with the shape of a proven operation.</h1>
        <p>
          Templates are complete, editable starting points—not rigid recipes. Adapt ownership,
          tools, controls, and language to your organization.
        </p>
      </section>
      <section className="template-library">
        {Object.entries(templateData).map(([key, item], index) => (
          <Link key={key} to={`/templates/${key}`}>
            <span>{item.label}</span>
            <div className="template-mini-map" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <h2>{item.name}</h2>
            <p>{item.body}</p>
            <strong>
              View template <ArrowRight />
            </strong>
            <small>0{index + 1}</small>
          </Link>
        ))}
      </section>
      <FinalCta />
    </>
  );
}

const docPages: Record<
  string,
  {
    title: string;
    intro: string;
    sections: readonly { title: string; body: string; code?: string }[];
  }
> = {
  "getting-started": {
    title: "Get started with Knotline",
    intro:
      "Create a workspace, publish your first workflow, and run it with the right people in the loop.",
    sections: [
      {
        title: "1. Set up your workspace",
        body: "Name the workspace, invite the first operators, and assign roles. Workspace owners control member access, security, and platform settings."
      },
      {
        title: "2. Create a workflow",
        body: "Start from a template or describe the outcome you need. In the studio, add steps, connect paths, configure data and ownership, then test representative cases."
      },
      {
        title: "3. Publish and run",
        body: "Resolve validation findings, publish a version, and begin a run. The run room shows current progress, outputs, waiting work, decisions, and recovery actions."
      }
    ]
  },
  api: {
    title: "API overview",
    intro: "Connect services to Knotline using authenticated, workspace-scoped interfaces.",
    sections: [
      {
        title: "Authentication",
        body: "Use a scoped credential created by a workspace administrator. Keep it server-side and rotate it according to your security policy.",
        code: "Authorization: Bearer <workspace_token>"
      },
      {
        title: "Requests",
        body: "Send JSON over HTTPS. Attach your own stable idempotency key to retried mutations so an interrupted client does not duplicate work.",
        code: "Idempotency-Key: your-stable-request-id"
      },
      {
        title: "Errors",
        body: "Error responses include a stable category and request identifier. Log the request identifier when escalating an integration failure."
      }
    ]
  },
  webhooks: {
    title: "Signed webhooks",
    intro: "Receive workflow and run events with verifiable authenticity and retry-safe delivery.",
    sections: [
      {
        title: "Verify every delivery",
        body: "Compute a signature from the raw request body with the endpoint secret and compare it using constant-time equality before parsing the event."
      },
      {
        title: "Acknowledge quickly",
        body: "Return a successful response after durable receipt, then process asynchronously. Failed deliveries can be retried, so consumers must be idempotent."
      },
      {
        title: "Operate safely",
        body: "Rotate endpoint secrets, inspect delivery history, and disable a destination without deleting its configuration."
      }
    ]
  },
  authentication: {
    title: "Authentication and sessions",
    intro: "Understand customer sign-in, protected sessions, and workspace access.",
    sections: [
      {
        title: "Sign in",
        body: "Customers use a single-use email link or a verified Google identity. Successful authentication creates a protected session cookie."
      },
      {
        title: "Workspace authorization",
        body: "Membership and role checks are applied independently of authentication. A valid identity cannot access a workspace it does not belong to."
      },
      {
        title: "Session control",
        body: "People can inspect active sessions, revoke another session, or sign out everywhere from profile security settings."
      }
    ]
  }
};

export function DocsMarketingPage({ slug }: { slug?: string }) {
  const article = slug ? docPages[slug] : undefined;
  if (slug && !article)
    return (
      <section className="docs-not-found">
        <BookOpen />
        <h1>Documentation page not found</h1>
        <p>
          The requested guide is not available. Choose a maintained guide from the documentation
          home.
        </p>
        <Link to="/docs">Return to documentation</Link>
      </section>
    );
  if (article)
    return (
      <div className="docs-layout">
        <aside>
          <Link to="/docs">Documentation</Link>
          <strong>START HERE</strong>
          <Link to="/docs/getting-started">Getting started</Link>
          <Link to="/docs/authentication">Authentication</Link>
          <strong>DEVELOPERS</strong>
          <Link to="/docs/api">API overview</Link>
          <Link to="/docs/webhooks">Webhooks</Link>
        </aside>
        <article>
          <span>DOCUMENTATION</span>
          <h1>{article.title}</h1>
          <p>{article.intro}</p>
          {article.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              {section.code ? (
                <pre>
                  <code>{section.code}</code>
                </pre>
              ) : null}
            </section>
          ))}
          <div className="docs-help">
            <LifeBuoy />
            <div>
              <strong>Still need help?</strong>
              <p>Find task-focused guides or contact the support team.</p>
            </div>
            <Link to="/help">Open help center</Link>
          </div>
        </article>
      </div>
    );
  return (
    <>
      <section className="docs-hero">
        <span className="marketing-eyebrow">Knotline Documentation</span>
        <h1>Build, operate, and integrate with confidence.</h1>
        <p>
          Task-focused guides for workspace members, administrators, workflow builders, and
          developers.
        </p>
        <label>
          <Search />
          <span className="sr-only">Search documentation</span>
          <input placeholder="Search the documentation" type="search" />
        </label>
      </section>
      <section className="docs-cards">
        <Link to="/docs/getting-started">
          <Waypoints />
          <span>START HERE</span>
          <h2>Build your first workflow</h2>
          <p>From workspace setup through a successful first run.</p>
          <strong>
            Read the guide <ArrowRight />
          </strong>
        </Link>
        <Link to="/docs/authentication">
          <LockKeyhole />
          <span>ADMINISTRATION</span>
          <h2>Authentication and sessions</h2>
          <p>How identities, protected sessions, and workspace access fit together.</p>
          <strong>
            Read the guide <ArrowRight />
          </strong>
        </Link>
        <Link to="/docs/api">
          <Code2 />
          <span>DEVELOPERS</span>
          <h2>API overview</h2>
          <p>Connect services with scoped authentication and reliable requests.</p>
          <strong>
            Read the guide <ArrowRight />
          </strong>
        </Link>
        <Link to="/docs/webhooks">
          <Webhook />
          <span>DEVELOPERS</span>
          <h2>Signed webhooks</h2>
          <p>Consume operational events safely and idempotently.</p>
          <strong>
            Read the guide <ArrowRight />
          </strong>
        </Link>
      </section>
      <FinalCta />
    </>
  );
}

export function PricingMarketingPage() {
  const plans = [
    {
      name: "Team",
      note: "For a team putting its first critical operations in one place.",
      features: [
        "Workflow builder and versioning",
        "People, tasks, and approvals",
        "Governed agents and knowledge",
        "Run history and standard integrations"
      ],
      cta: "Start building"
    },
    {
      name: "Business",
      note: "For several teams standardizing operations and governance.",
      features: [
        "Everything in Team",
        "Advanced roles and governance",
        "Evaluation and operational insights",
        "Expanded integration and support options"
      ],
      cta: "Talk to us",
      featured: true
    },
    {
      name: "Enterprise",
      note: "For organization-wide deployment, control, and assurance.",
      features: [
        "Everything in Business",
        "Enterprise identity and provisioning",
        "Security assurance workflows",
        "Deployment and support planning"
      ],
      cta: "Contact sales"
    }
  ];
  return (
    <>
      <section className="pricing-hero">
        <span className="marketing-eyebrow">Pricing</span>
        <h1>Choose the operating foundation that fits your team.</h1>
        <p>
          Knotline is offered through workspace plans. Current commercial terms, usage allowances,
          and support commitments are confirmed in a clear order form before you buy.
        </p>
      </section>
      <section className="pricing-plans">
        {plans.map((plan) => (
          <article
            className={plan.featured ? "pricing-plan pricing-plan--featured" : "pricing-plan"}
            key={plan.name}
          >
            {plan.featured ? <span>RECOMMENDED FOR SCALE</span> : <span>WORKSPACE PLAN</span>}
            <h2>{plan.name}</h2>
            <p>{plan.note}</p>
            <div>
              <strong>Talk to us for current pricing</strong>
              <small>No purchase or metered surprise from this page.</small>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check />
                  {feature}
                </li>
              ))}
            </ul>
            <Link to={plan.name === "Team" ? "/auth/sign-in" : "/contact"}>
              {plan.cta}
              <ArrowRight />
            </Link>
          </article>
        ))}
      </section>
      <section className="pricing-compare">
        <div>
          <span>PLAN COMPARISON</span>
          <h2>The capabilities teams ask about first.</h2>
        </div>
        <table aria-label="Plan capability comparison">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Team</th>
              <th>Business</th>
              <th>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Workflow design and live runs", true, true, true],
              ["Agents, tools, and knowledge", true, true, true],
              ["Human tasks and approvals", true, true, true],
              ["Advanced governance", false, true, true],
              ["Enterprise identity", false, false, true],
              ["Deployment planning", false, false, true]
            ].map(([label, ...values]) => (
              <tr key={String(label)}>
                <th scope="row">{label}</th>
                {values.map((value, index) => (
                  <td aria-label={value ? "Included" : "Contact us"} key={index}>
                    {value ? <Check /> : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="pricing-faq">
        <div>
          <span>COMMON QUESTIONS</span>
          <h2>Clear answers before a conversation.</h2>
        </div>
        <div>
          <details>
            <summary>Can I evaluate Knotline before buying?</summary>
            <p>
              Yes. Start building a workspace and use a representative workflow to assess the
              complete product experience. A commercial conversation confirms the plan needed for
              continued organizational use.
            </p>
          </details>
          <details>
            <summary>Are prices published on this page?</summary>
            <p>
              Not yet. We will not invent a number that may not reflect your deployment. Current
              pricing, included usage, and support terms are documented before commitment.
            </p>
          </details>
          <details>
            <summary>Can we control usage and authority?</summary>
            <p>
              Yes. Workspace controls define member roles, agent tools, knowledge access, approvals,
              and operational limits. Commercial usage controls are documented with the selected
              plan.
            </p>
          </details>
          <details>
            <summary>Do you support enterprise review?</summary>
            <p>
              Yes. The trust and security surfaces document implemented controls, and the Enterprise
              process supports deeper assurance and deployment planning.
            </p>
          </details>
        </div>
      </section>
      <FinalCta />
    </>
  );
}

export function SecurityMarketingPage() {
  const controls = [
    [
      LockKeyhole,
      "Protected authentication",
      "Single-use email links or verified Google identity create protected cookie sessions. Active sessions can be inspected and revoked."
    ],
    [
      UsersRound,
      "Workspace isolation",
      "Workspace membership and role checks scope customer access. Tenant boundaries are enforced in the data access path."
    ],
    [
      KeyRound,
      "Explicit authority",
      "Agent tools, connector credentials, member roles, and approval rights are granted deliberately and remain administratively visible."
    ],
    [
      UserCheck,
      "Human control",
      "Consequential paths can require accountable human approval, with the decision, reason, actor, and time preserved."
    ],
    [
      FileCheck2,
      "Operational history",
      "Version changes, run events, outputs, decisions, and security-relevant actions are recorded for investigation and review."
    ],
    [
      CloudCog,
      "Safe integration operations",
      "Connections expose scopes, test state, and failures. Signed webhook patterns support verification and retry-safe consumers."
    ]
  ] as const;
  return (
    <>
      <section className="security-hero">
        <div>
          <span className="marketing-eyebrow">Security at Knotline</span>
          <h1>Trust is part of the operating model, not a badge in the footer.</h1>
          <p>
            Knotline is designed so identities, authority, approvals, data access, and execution
            history remain explicit as work moves across people, agents, and connected systems.
          </p>
          <div className="marketing-actions">
            <Link className="marketing-primary" to="/trust">
              Visit the trust center <ArrowRight />
            </Link>
            <Link className="marketing-secondary" to="/contact">
              Contact security
            </Link>
          </div>
        </div>
        <div>
          <ShieldCheck />
          <strong>Controls that stay connected to the work</strong>
          <ul>
            <li>
              <Check />
              Identity and session controls
            </li>
            <li>
              <Check />
              Role and workspace boundaries
            </li>
            <li>
              <Check />
              Human approval gates
            </li>
            <li>
              <Check />
              Traceable execution history
            </li>
          </ul>
        </div>
      </section>
      <section className="security-controls">
        <div className="marketing-section__heading">
          <span>IMPLEMENTED CONTROL AREAS</span>
          <h2>Protection across the complete operational path.</h2>
          <p>
            These descriptions focus on product controls available in Knotline. We do not claim a
            certification that has not been independently completed.
          </p>
        </div>
        <div>
          {controls.map(([Icon, title, body]) => (
            <article key={title}>
              <Icon />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="security-response">
        <div>
          <span>ASSURANCE AND RESPONSE</span>
          <h2>A direct path when you need evidence or help.</h2>
          <p>
            Review maintained trust information, check service status, or contact the team with a
            security or privacy question.
          </p>
        </div>
        <div>
          <Link to="/trust">
            <ShieldCheck />
            <span>
              <strong>Trust center</strong>
              <small>Product controls and assurance information</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/status">
            <CloudCog />
            <span>
              <strong>System status</strong>
              <small>Current service health and history</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/contact">
            <LifeBuoy />
            <span>
              <strong>Contact the team</strong>
              <small>Security, privacy, and deployment questions</small>
            </span>
            <ArrowRight />
          </Link>
        </div>
      </section>
    </>
  );
}
