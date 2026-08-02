/* eslint-disable knotline/no-hardcoded-user-visible-string -- This is the owned English marketing surface. */
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  MessageSquareText,
  Network,
  Play,
  Search,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Waypoints,
  Workflow,
  Zap
} from "lucide-react";
import { Link } from "react-router-dom";

import { KnotlineMark } from "./KnotlineLogo.js";
import "./PublicHomePage.css";

const operatingPrinciples = [
  [
    "01",
    "Design the whole operation",
    "Map the happy path, exceptions, owners, evidence, and recovery in one visual workflow."
  ],
  [
    "02",
    "Give agents clear authority",
    "Set the tools, knowledge, limits, and review policy for every agent before it joins live work."
  ],
  [
    "03",
    "Keep people in command",
    "Route consequential decisions to the right person with the context they need to act confidently."
  ],
  [
    "04",
    "Know what happened",
    "Follow every run, input, decision, retry, and handoff from first signal to final outcome."
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

function RunRoomPreview() {
  return (
    <div
      className="kh-app"
      aria-label="Product preview showing a live enterprise customer recovery run"
    >
      <div className="kh-app__rail" aria-hidden="true">
        <KnotlineMark className="kh-app__brand" size={24} />
        <span className="is-active">
          <Waypoints />
        </span>
        <span>
          <Workflow />
        </span>
        <span>
          <Bot />
        </span>
        <span>
          <UsersRound />
        </span>
      </div>
      <div className="kh-app__main">
        <header className="kh-app__topbar">
          <div>
            <span>Runs</span>
            <b>/</b>
            <strong>Enterprise customer recovery</strong>
          </div>
          <div className="kh-app__status">
            <i /> Live updates
          </div>
        </header>
        <section className="kh-run">
          <div className="kh-run__heading">
            <div>
              <span className="kh-ui-label">RUN 1842 · PRODUCTION</span>
              <h2>Enterprise customer recovery orchestration</h2>
              <p>Critical account · Response target 45 minutes</p>
            </div>
            <span className="kh-pill kh-pill--live">
              <Play /> Running
            </span>
          </div>
          <div className="kh-run__metrics">
            <span>
              <small>Progress</small>
              <strong>9 / 26</strong>
            </span>
            <span>
              <small>Elapsed</small>
              <strong>18m 24s</strong>
            </span>
            <span>
              <small>Owner</small>
              <strong>Recovery team</strong>
            </span>
            <span>
              <small>Health</small>
              <strong className="kh-positive">On track</strong>
            </span>
          </div>
          <div className="kh-run__body">
            <div className="kh-timeline">
              <div className="kh-timeline__top">
                <strong>Execution</strong>
                <span>26 steps</span>
              </div>
              <div className="kh-step is-done">
                <CheckCircle2 />
                <span>
                  <strong>Normalize account and incident context</strong>
                  <small>Transform · Completed in 2.4s</small>
                </span>
                <time>13:46</time>
              </div>
              <div className="kh-step is-done">
                <CheckCircle2 />
                <span>
                  <strong>Collect product and support evidence</strong>
                  <small>Agent · 14 sources verified</small>
                </span>
                <time>13:49</time>
              </div>
              <div className="kh-step is-active">
                <span className="kh-step__number">9</span>
                <span>
                  <strong>Review customer recovery proposal</strong>
                  <small>Human approval · Assigned to Nora Singh</small>
                </span>
                <span className="kh-pill kh-pill--waiting">Review</span>
              </div>
              <div className="kh-step">
                <Circle />
                <span>
                  <strong>Execute governed remediation</strong>
                  <small>Action · Waiting for approval</small>
                </span>
                <time>—</time>
              </div>
              <div className="kh-step">
                <Circle />
                <span>
                  <strong>Verify recovery and close the loop</strong>
                  <small>Agent + human task</small>
                </span>
                <time>—</time>
              </div>
            </div>
            <aside className="kh-review">
              <div className="kh-review__label">
                <ShieldCheck /> HUMAN JUDGMENT
              </div>
              <h3>Recovery proposal ready</h3>
              <p>
                The response is inside policy and the remediation has no irreversible external
                writes.
              </p>
              <dl>
                <div>
                  <dt>Evidence</dt>
                  <dd>14 verified sources</dd>
                </div>
                <div>
                  <dt>Recommendation</dt>
                  <dd>Approve with monitoring</dd>
                </div>
                <div>
                  <dt>Risk</dt>
                  <dd>
                    <span className="kh-risk">Low</span>
                  </dd>
                </div>
              </dl>
              <div className="kh-review__note">
                <MessageSquareText />
                <span>
                  <strong>Agent rationale</strong>
                  <small>
                    Customer impact is contained. Rollback remains available for 24 hours.
                  </small>
                </span>
              </div>
              <div className="kh-review__actions">
                <button type="button">Request changes</button>
                <button type="button">Approve step</button>
              </div>
            </aside>
          </div>
        </section>
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
        <button type="button">＋ Add step</button>
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
            <button type="button">Review policy</button>
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
            Make complex work move
            <br />
            <em>like one system.</em>
          </h1>
          <p>
            Knotline turns high-stakes operations into live, governed workflows—where agents handle
            the busywork, people own the judgment, and every decision stays clear.
          </p>
          <div className="kh-actions">
            <Link className="kh-button kh-button--primary" to="/auth/sign-in">
              Enter the workspace <ArrowRight />
            </Link>
            <a className="kh-button kh-button--quiet" href="#platform">
              See the product <Play />
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
          <RunRoomPreview />
        </div>
        <div className="kh-wrap kh-proofbar">
          <p>One operating system for consequential work</p>
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
          <RunRoomPreview />
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
          <span className="kh-section-index">04 / BUILT FOR TRUST</span>
          <h2>Speed is useful. Controlled speed changes how a company operates.</h2>
        </div>
        <div className="kh-wrap kh-principle-grid">
          {operatingPrinciples.map(([number, title, body]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
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
              Enter the workspace <ArrowRight />
            </Link>
            <Link className="kh-button kh-button--dark-quiet" to="/product">
              Explore the platform
            </Link>
          </div>
          <small>No invented black box. Just accountable execution.</small>
        </div>
      </section>
    </div>
  );
}
