/* eslint-disable knotline/no-hardcoded-user-visible-string -- This is the owned English marketing surface. */
import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  Network,
  Play,
  Search,
  ShieldCheck,
  UserCheck,
  Workflow,
  Zap
} from "lucide-react";
import { Link } from "react-router-dom";

import "./PublicHomePage.css";

const teams = [
  [
    "01",
    "Operations",
    "Coordinate recurring, cross-functional work with explicit owners, response targets, exceptions, and recovery.",
    "/solutions/operations"
  ],
  [
    "02",
    "Customer support",
    "Resolve consequential cases with complete account context, governed remediation, and visible customer communication.",
    "/solutions/support"
  ],
  [
    "03",
    "Product teams",
    "Turn signals into coordinated launch, feedback, and incident workflows shared across teams and agents.",
    "/solutions/product"
  ],
  [
    "04",
    "IT & service delivery",
    "Standardize access, change, incidents, and service delivery without hiding control inside brittle automation.",
    "/solutions/it"
  ]
] as const;

const operationalFlow = [
  {
    number: "01",
    label: "Signal",
    title: "A critical case arrives",
    detail: "Capture the trigger, account context, severity, and response target.",
    icon: Zap
  },
  {
    number: "02",
    label: "Context",
    title: "Knowledge is assembled",
    detail: "Bring verified customer, incident, and policy data into one case record.",
    icon: Database
  },
  {
    number: "03",
    label: "Action",
    title: "Agents move the work",
    detail: "Investigate, draft, classify, and execute only within explicit authority.",
    icon: Bot
  },
  {
    number: "04",
    label: "Judgment",
    title: "People approve the stakes",
    detail: "Present evidence, recommendations, and impact to the accountable reviewer.",
    icon: UserCheck
  },
  {
    number: "05",
    label: "Outcome",
    title: "The loop closes visibly",
    detail: "Communicate, verify recovery, record the result, and retain the audit trail.",
    icon: FileCheck2
  }
] as const;

const faq = [
  [
    "Is Knotline another task or automation tool?",
    "No. Task tools track work and automation tools move data. Knotline coordinates an entire operation: workflow state, agent action, human judgment, source context, exceptions, and an inspectable history in one system."
  ],
  [
    "Do agents make decisions without our team?",
    "Only where you explicitly allow it. Each agent has scoped instructions, connected knowledge, tools, and approval policy. High-impact actions can always stop at a human gate."
  ],
  [
    "Does this replace the systems we already use?",
    "Knotline is the coordination layer across them. Connect the systems where your data and work already live, then give every run a clear path, owner, and outcome."
  ],
  [
    "Can we start with a human-only workflow?",
    "Yes. Model the operation first, run it with people, and introduce agents only where they improve speed or consistency. The operating model stays the same."
  ],
  [
    "What can teams build with it?",
    "Incident response, customer recovery, access reviews, launch readiness, onboarding, risk review, escalations, service delivery, and other multi-step work where ownership and evidence matter."
  ]
] as const;

function DemoShowcase() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="kh-demo" id="demo">
      <div className="kh-demo__chrome" aria-hidden="true">
        <span className="kh-demo__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="kh-demo__chrome-label">Product walkthrough</span>
        <span className="kh-demo__live">
          <i /> Knotline in action
        </span>
      </div>
      <div className="kh-demo__stage">
        {isPlaying ? (
          <iframe
            src="https://www.youtube-nocookie.com/embed/SnxhRPikL0g?autoplay=1&rel=0"
            title="Knotline product walkthrough"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <>
            <img
              src="/product/workflow-studio.webp"
              alt="Knotline workflow studio showing a governed enterprise onboarding workflow"
            />
            <div className="kh-demo__shade" aria-hidden="true" />
            <button
              className="kh-demo__play"
              type="button"
              onClick={() => setIsPlaying(true)}
              aria-label="Play the Knotline product walkthrough"
            >
              <span>
                <Play fill="currentColor" />
              </span>
              <strong>Watch Knotline work</strong>
              <small>Generation, approvals, integrations, and the final audit trail</small>
            </button>
          </>
        )}
      </div>
      <div className="kh-demo__chapters" aria-label="Walkthrough highlights">
        <span>
          <Workflow /> Plain-language generation
        </span>
        <span>
          <UserCheck /> Human approval
        </span>
        <span>
          <Network /> HubSpot + Slack
        </span>
        <span>
          <FileCheck2 /> Canonical outcome
        </span>
      </div>
    </div>
  );
}

function WorkflowPreview() {
  return (
    <div className="kh-mini-ui kh-builder" aria-label="Visual workflow builder preview">
      <div className="kh-mini-ui__bar">
        <span>
          <i /> Enterprise customer recovery
        </span>
        <span>Draft healthy</span>
      </div>
      <div className="kh-builder__canvas">
        <div className="kh-node kh-node--trigger" style={{ left: "7%", top: "39%" }}>
          <Zap />
          <span>
            <small>TRIGGER</small>
            <strong>Critical case received</strong>
          </span>
        </div>
        <div className="kh-connector kh-connector--one" />
        <div className="kh-node" style={{ left: "35%", top: "16%" }}>
          <Database />
          <span>
            <small>TRANSFORM</small>
            <strong>Normalize context</strong>
          </span>
        </div>
        <div className="kh-node" style={{ left: "35%", top: "62%" }}>
          <Search />
          <span>
            <small>AGENT</small>
            <strong>Collect evidence</strong>
          </span>
        </div>
        <div className="kh-connector kh-connector--two" />
        <div className="kh-node kh-node--approval" style={{ right: "7%", top: "39%" }}>
          <UserCheck />
          <span>
            <small>APPROVAL</small>
            <strong>Review recovery plan</strong>
          </span>
        </div>
      </div>
      <div className="kh-builder__toolbar">
        <span className="kh-mock-action">＋ Add step</span>
        <span>100%</span>
        <span>Fit view</span>
      </div>
    </div>
  );
}

function AgentPreview() {
  return (
    <div className="kh-mini-ui kh-agent" aria-label="Governed agent configuration preview">
      <div className="kh-mini-ui__bar">
        <span>
          <i /> Agent configuration
        </span>
        <span>Version 7</span>
      </div>
      <div className="kh-agent__body">
        <aside>
          <span>Identity</span>
          <span className="is-active">Instructions</span>
          <span>Knowledge</span>
          <span>Tools</span>
          <span>Guardrails</span>
          <span>Versions</span>
        </aside>
        <section>
          <div className="kh-agent__title">
            <span>
              <Bot />
            </span>
            <div>
              <small>RECOVERY OPERATIONS</small>
              <strong>Customer recovery analyst</strong>
            </div>
            <b>Draft saved</b>
          </div>
          <div className="kh-agent__field-label">Operating instructions</div>
          <div className="kh-agent__editor">
            <span>01</span>
            <p>Investigate critical customer incidents using only verified workspace sources.</p>
            <span>02</span>
            <p>Never execute external remediation without a recorded approval.</p>
            <span>03</span>
            <p>Surface conflicting evidence and explain confidence before recommending action.</p>
          </div>
          <div className="kh-agent__policy">
            <LockKeyhole />
            <span>
              <strong>Authority boundary</strong>
              <small>3 tools allowed · External writes require approval</small>
            </span>
            <span className="kh-mock-action">Review policy</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function AuditPreview() {
  return (
    <div className="kh-mini-ui kh-audit" aria-label="Run history and audit preview">
      <div className="kh-mini-ui__bar">
        <span>
          <i /> Run history
        </span>
        <span>Export evidence</span>
      </div>
      <div className="kh-audit__body">
        <div className="kh-audit__summary">
          <span>
            <CheckCircle2 />
          </span>
          <div>
            <small>RUN COMPLETE</small>
            <strong>Customer recovery verified</strong>
            <p>26 of 26 steps · Closed by Nora Singh</p>
          </div>
          <b>42m 18s</b>
        </div>
        <div className="kh-audit__line">
          <time>14:21:08</time>
          <span>
            <i className="is-green" />
          </span>
          <div>
            <strong>Recovery outcome verified</strong>
            <small>Agent compared live signals with the acceptance criteria.</small>
          </div>
          <em>Agent</em>
        </div>
        <div className="kh-audit__line">
          <time>14:17:32</time>
          <span>
            <i />
          </span>
          <div>
            <strong>Customer communication sent</strong>
            <small>Approved template · Delivery confirmed</small>
          </div>
          <em>Action</em>
        </div>
        <div className="kh-audit__line">
          <time>14:03:51</time>
          <span>
            <i className="is-blue" />
          </span>
          <div>
            <strong>Recovery proposal approved</strong>
            <small>Nora Singh · Evidence package v3</small>
          </div>
          <em>Human</em>
        </div>
        <div className="kh-audit__line">
          <time>13:49:16</time>
          <span>
            <i />
          </span>
          <div>
            <strong>Evidence collection completed</strong>
            <small>14 sources · 2 conflicting signals resolved</small>
          </div>
          <em>Agent</em>
        </div>
      </div>
    </div>
  );
}

function OperationsPreview() {
  const runs = [
    ["Enterprise customer recovery", "Critical account · Recovery team", "9 / 26", "Running"],
    ["Launch readiness", "Release 8.4 · Product operations", "18 / 21", "Approval"],
    ["Privileged access review", "Quarterly review · IT security", "12 / 12", "On track"],
    ["Partner onboarding", "Northstar Health · Partnerships", "6 / 14", "Waiting"]
  ] as const;

  return (
    <div className="kh-mini-ui kh-operations" aria-label="Live operations portfolio preview">
      <div className="kh-mini-ui__bar">
        <span>
          <i /> Live operations
        </span>
        <span>Updated just now</span>
      </div>
      <div className="kh-operations__body">
        <div className="kh-operations__metrics">
          <span>
            <small>ACTIVE RUNS</small>
            <strong>18</strong>
          </span>
          <span>
            <small>NEEDS REVIEW</small>
            <strong>2</strong>
          </span>
          <span>
            <small>ON TRACK</small>
            <strong>94%</strong>
          </span>
          <span>
            <small>RESPONSE TARGET</small>
            <strong>31m</strong>
          </span>
        </div>
        <div className="kh-operations__list">
          <div className="kh-operations__header">
            <span>Operation</span>
            <span>Progress</span>
            <span>Status</span>
          </div>
          {runs.map(([name, detail, progress, status]) => (
            <div className="kh-operations__row" key={name}>
              <span>
                <strong>{name}</strong>
                <small>{detail}</small>
              </span>
              <b>{progress}</b>
              <em className={`is-${status.toLowerCase().replace(" ", "-")}`}>{status}</em>
            </div>
          ))}
        </div>
        <div className="kh-operations__attention">
          <span>
            <UserCheck />
          </span>
          <div>
            <strong>Two decisions need attention</strong>
            <small>Both are inside their response targets.</small>
          </div>
          <b>
            Review queue <ArrowRight />
          </b>
        </div>
      </div>
    </div>
  );
}

export function PublicHomeContent() {
  return (
    <div className="knot-home">
      <section className="kh-hero">
        <div className="kh-hero__glow" aria-hidden="true" />
        <div className="kh-wrap kh-hero__copy">
          <div className="kh-eyebrow">
            <span /> Accountable operations for people and AI
          </div>
          <h1>
            <span>Complex operations.</span>
            <em>One accountable system.</em>
          </h1>
          <p>
            Knotline turns high-stakes operations into live, governed workflows—where agents handle
            the busywork, people own the judgment, and every decision stays clear.
          </p>
          <div className="kh-actions">
            <Link className="kh-button kh-button--primary" to="/auth/sign-in">
              Start building <ArrowRight />
            </Link>
            <a className="kh-button kh-button--quiet" href="#demo">
              Watch the walkthrough <Play />
            </a>
          </div>
          <div className="kh-assurance" aria-label="Platform assurances">
            <span>
              <Check /> Human approval gates
            </span>
            <span>
              <Check /> Governed agent authority
            </span>
            <span>
              <Check /> Complete run history
            </span>
          </div>
        </div>
        <div className="kh-wrap kh-hero__product">
          <DemoShowcase />
        </div>
        <div className="kh-wrap kh-proofbar">
          <p>For operations, support, product, and IT teams</p>
          <span>
            <Workflow /> Visual workflows
          </span>
          <span>
            <Bot /> Governed agents
          </span>
          <span>
            <UserCheck /> Human judgment
          </span>
          <span>
            <Network /> Connected context
          </span>
          <span>
            <ShieldCheck /> Inspectable history
          </span>
        </div>
      </section>

      <section className="kh-problem kh-section">
        <div className="kh-wrap kh-section-heading">
          <span className="kh-section-index">01 / THE SHIFT</span>
          <h2>
            Your most important operations were never meant to live across tickets, chat,
            spreadsheets, and opaque automation.
          </h2>
          <p>
            Knotline gives the whole operation a shared state. Everyone can see what is happening,
            what comes next, and where human judgment belongs.
          </p>
        </div>
        <div className="kh-wrap kh-before-after">
          <div className="kh-chaos" aria-label="Disconnected operations before Knotline">
            <span className="kh-chaos__label">BEFORE</span>
            <div className="kh-chaos__item">
              Spreadsheet <small>Owner unclear</small>
            </div>
            <div className="kh-chaos__item">
              #incident-war-room <small>126 new messages</small>
            </div>
            <div className="kh-chaos__item">
              Automation run <small>Failed silently</small>
            </div>
            <div className="kh-chaos__item">
              Approval request <small>Waiting 3 hours</small>
            </div>
          </div>
          <div className="kh-transition" aria-hidden="true">
            <ArrowRight />
            <span>One accountable system</span>
          </div>
          <div className="kh-clarity">
            <span className="kh-chaos__label">WITH KNOTLINE</span>
            <div className="kh-clarity__flow">
              <span>
                <CheckCircle2 /> Trigger captured
              </span>
              <i />
              <span>
                <Bot /> Agent investigated
              </span>
              <i />
              <span>
                <UserCheck /> Owner approved
              </span>
              <i />
              <span>
                <FileCheck2 /> Outcome verified
              </span>
            </div>
            <div className="kh-clarity__footer">
              <strong>Everyone sees the same truth.</strong>
              <span>One owner · One status · Full history</span>
            </div>
          </div>
        </div>
      </section>

      <section className="kh-platform kh-section" id="platform">
        <div className="kh-wrap kh-section-heading kh-section-heading--split">
          <div>
            <span className="kh-section-index">02 / THE PLATFORM</span>
            <h2>From process to outcome, without losing control.</h2>
          </div>
          <p>
            Design the operation, equip the agents, route judgment, and follow the live execution in
            one continuous product.
          </p>
        </div>
        <div className="kh-wrap kh-feature kh-feature--builder">
          <div className="kh-feature__copy">
            <span>01 · WORKFLOWS</span>
            <h3>Turn how your team works into a system everyone can follow.</h3>
            <p>
              Describe an outcome or build visually. Add logic, parallel paths, retries, owners,
              data contracts, review steps, and safe failure handling—then publish a version your
              team can trust.
            </p>
            <ul>
              <li>
                <Check /> Natural-language generation
              </li>
              <li>
                <Check /> Visual editing and branching
              </li>
              <li>
                <Check /> Validation before publishing
              </li>
            </ul>
            <Link to="/product/workflows">
              Explore workflows <ArrowRight />
            </Link>
          </div>
          <WorkflowPreview />
        </div>
        <div className="kh-wrap kh-feature kh-feature--reverse">
          <AgentPreview />
          <div className="kh-feature__copy">
            <span>02 · AGENTS</span>
            <h3>Delegate the work. Keep authority explicit.</h3>
            <p>
              Give each agent a job, trusted knowledge, permitted tools, and a clear boundary.
              Version every change and require review before consequential action.
            </p>
            <ul>
              <li>
                <Check /> Scoped tools and knowledge
              </li>
              <li>
                <Check /> Test before publishing
              </li>
              <li>
                <Check /> Human approval policies
              </li>
            </ul>
            <Link to="/product/agents">
              Explore governed agents <ArrowRight />
            </Link>
          </div>
        </div>
        <div className="kh-wrap kh-feature">
          <div className="kh-feature__copy">
            <span>03 · EXECUTION</span>
            <h3>Give operators a live room, not another status page.</h3>
            <p>
              Follow progress at the level that matters. See inputs, outputs, ownership, elapsed
              time, exceptions, and the exact context behind each decision—and act without leaving
              the run.
            </p>
            <ul>
              <li>
                <Check /> Live execution timeline
              </li>
              <li>
                <Check /> Human tasks and approvals
              </li>
              <li>
                <Check /> Retry, recover, and resume
              </li>
            </ul>
            <Link to="/product">
              See the execution platform <ArrowRight />
            </Link>
          </div>
          <OperationsPreview />
        </div>
        <div className="kh-wrap kh-feature kh-feature--reverse">
          <AuditPreview />
          <div className="kh-feature__copy">
            <span>04 · ACCOUNTABILITY</span>
            <h3>Answer “what happened?” without reconstructing the story.</h3>
            <p>
              Every input, agent action, approval, tool call, retry, and outcome becomes part of one
              inspectable run history. Operators can diagnose quickly; leaders can trust the system.
            </p>
            <ul>
              <li>
                <Check /> Source-linked decisions
              </li>
              <li>
                <Check /> Immutable workflow versions
              </li>
              <li>
                <Check /> Exportable evidence history
              </li>
            </ul>
            <Link to="/security">
              Review security and trust <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <section className="kh-example kh-section">
        <div className="kh-wrap kh-section-heading kh-section-heading--split">
          <div>
            <span className="kh-section-index">03 / ONE REAL OPERATION</span>
            <h2>A critical customer case, coordinated end to end.</h2>
          </div>
          <p>
            A single run can carry complex work across systems, agents, and teams while preserving
            one clear line of accountability.
          </p>
        </div>
        <ol className="kh-wrap kh-operational-flow">
          {operationalFlow.map(({ number, label, title, detail, icon: Icon }) => (
            <li key={number}>
              <span className="kh-flow-number">{number}</span>
              <span className="kh-flow-icon">
                <Icon />
              </span>
              <small>{label}</small>
              <h3>{title}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
        <div className="kh-wrap kh-example__result">
          <span>
            <GitBranch /> 26 coordinated steps
          </span>
          <i />
          <span>
            <Clock3 /> One live response target
          </span>
          <i />
          <span>
            <ShieldCheck /> Complete evidence trail
          </span>
        </div>
      </section>

      <section className="kh-principles kh-section">
        <div className="kh-wrap kh-section-heading">
          <span className="kh-section-index">04 / BUILT FOR THE WORK</span>
          <h2>One operating foundation. Four teams that cannot afford ambiguity.</h2>
        </div>
        <div className="kh-wrap kh-principle-grid">
          {teams.map(([number, title, body, href]) => (
            <Link to={href} key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <b>
                See the solution <ArrowRight />
              </b>
            </Link>
          ))}
        </div>
      </section>

      <section className="kh-security kh-section">
        <div className="kh-wrap kh-security__card">
          <div className="kh-security__copy">
            <span className="kh-section-index">05 / GOVERNANCE BY DESIGN</span>
            <h2>Trust is part of the workflow, not a promise around it.</h2>
            <p>
              Knotline keeps access, context, authority, and evidence close to the work itself—so
              teams can automate more without surrendering oversight.
            </p>
            <Link className="kh-button kh-button--light" to="/security">
              Visit the security center <ArrowRight />
            </Link>
          </div>
          <div className="kh-security__grid">
            <article>
              <LockKeyhole />
              <h3>Explicit authority</h3>
              <p>Roles, agent tools, and approval gates define who—or what—can take each action.</p>
            </article>
            <article>
              <Network />
              <h3>Permission-aware context</h3>
              <p>Knowledge remains scoped to the identity and workspace allowed to use it.</p>
            </article>
            <article>
              <FileCheck2 />
              <h3>Versioned operations</h3>
              <p>Published workflows and agents retain a stable, attributable change history.</p>
            </article>
            <article>
              <Search />
              <h3>Inspectable execution</h3>
              <p>
                Run history keeps the inputs, actions, decisions, failures, and outcomes together.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="kh-faq kh-section">
        <div className="kh-wrap kh-faq__layout">
          <div className="kh-faq__intro">
            <span className="kh-section-index">06 / QUESTIONS, ANSWERED</span>
            <h2>Know what you are putting at the center of operations.</h2>
            <p>
              Start with a single workflow. Add systems and agents as the operating model proves
              itself.
            </p>
            <Link to="/contact">
              Talk with us <ArrowRight />
            </Link>
          </div>
          <div className="kh-faq__items">
            {faq.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="kh-final">
        <div className="kh-final__threads" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="kh-wrap">
          <span>THE OPERATION IS THE PRODUCT</span>
          <h2>
            Give complex work
            <br />a clear way forward.
          </h2>
          <p>Build the workflow. Govern the agents. Keep people in command.</p>
          <div className="kh-actions">
            <Link className="kh-button kh-button--light" to="/auth/sign-in">
              Start building <ArrowRight />
            </Link>
            <Link className="kh-button kh-button--dark-quiet" to="/contact">
              Talk to us
            </Link>
          </div>
          <small>From first signal to verified outcome.</small>
        </div>
      </section>
    </div>
  );
}
