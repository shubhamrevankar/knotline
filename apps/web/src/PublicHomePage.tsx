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
    "Run recurring, cross-functional processes with explicit owners, service targets, exception paths, and recovery.",
    "/solutions/operations"
  ],
  [
    "02",
    "Customer support",
    "Coordinate consequential cases with account context, approved remediation, and documented customer communication.",
    "/solutions/support"
  ],
  [
    "03",
    "Product teams",
    "Connect launch readiness, feedback, and incident work across teams, systems, and agents.",
    "/solutions/product"
  ],
  [
    "04",
    "IT & service delivery",
    "Standardize access, change, incident, and service workflows without burying control in scripts and handoffs.",
    "/solutions/it"
  ]
] as const;

const operationalFlow = [
  {
    number: "01",
    label: "Signal",
    title: "A critical case arrives",
    detail:
      "Create one immutable run with the trigger, account context, severity, and response target.",
    icon: Zap
  },
  {
    number: "02",
    label: "Context",
    title: "Knowledge is assembled",
    detail:
      "Assemble the permitted customer, incident, and policy evidence needed for the decision.",
    icon: Database
  },
  {
    number: "03",
    label: "Action",
    title: "Agents move the work",
    detail: "Let agents investigate and prepare actions within their published authority.",
    icon: Bot
  },
  {
    number: "04",
    label: "Judgment",
    title: "People approve the stakes",
    detail: "Route the evidence, recommendation, and risk to the accountable reviewer.",
    icon: UserCheck
  },
  {
    number: "05",
    label: "Outcome",
    title: "The loop closes visibly",
    detail: "Execute the approved path, verify the result, and retain the supporting evidence.",
    icon: FileCheck2
  }
] as const;

const faq = [
  [
    "Is Knotline another task or automation tool?",
    "Not quite. Task tools track assignments and automation tools move data. Knotline keeps execution state, agent work, human decisions, connected context, exception handling, and evidence in the same versioned run."
  ],
  [
    "Do agents make decisions without our team?",
    "Only within the authority you publish. Each agent has scoped instructions, knowledge, tools, output contracts, and approval policy. Consequential actions can be required to stop at a human gate."
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
          <h2>When operational state is scattered, ownership and judgment disappear with it.</h2>
          <p>
            Knotline brings triggers, context, actions, approvals, and outcomes into one shared run.
            Everyone can see the current state, the next step, and who owns the decision.
          </p>
        </div>
        <div className="kh-wrap kh-before-after">
          <div className="kh-chaos" aria-label="Disconnected operations before Knotline">
            <span className="kh-chaos__label">BEFORE</span>
            <div className="kh-chaos__item">
              Spreadsheet <small>Context fragmented</small>
            </div>
            <div className="kh-chaos__item">
              #incident-war-room <small>Decision buried</small>
            </div>
            <div className="kh-chaos__item">
              Automation run <small>Failure disconnected</small>
            </div>
            <div className="kh-chaos__item">
              Approval request <small>Owner unclear</small>
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
              <span>One run · Explicit owners · Durable history</span>
            </div>
          </div>
        </div>
      </section>

      <section className="kh-platform kh-section" id="platform">
        <div className="kh-wrap kh-section-heading kh-section-heading--split">
          <div>
            <span className="kh-section-index">02 / THE PLATFORM</span>
            <h2>Design the work. Govern the execution.</h2>
          </div>
          <p>
            Model the operation, define agent authority, route human judgment, and follow every run
            in one continuous system.
          </p>
        </div>
        <div className="kh-wrap kh-feature kh-feature--builder">
          <div className="kh-feature__copy">
            <span>01 · WORKFLOWS</span>
            <h3>Model the work your team actually performs.</h3>
            <p>
              Start with plain language or build visually. Define branching, parallel work, retries,
              owners, typed data, approval gates, and failure paths—then validate and publish an
              immutable version.
            </p>
            <ul>
              <li>
                <Check /> Prompt-to-workflow generation
              </li>
              <li>
                <Check /> Typed steps and conditional paths
              </li>
              <li>
                <Check /> Pre-publish graph validation
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
            <h3>Give agents responsibility—not unchecked authority.</h3>
            <p>
              Configure the job, instructions, knowledge, tools, output schema, and approval policy.
              Test and version the agent before a workflow can depend on it.
            </p>
            <ul>
              <li>
                <Check /> Scoped knowledge and tools
              </li>
              <li>
                <Check /> Typed output contracts
              </li>
              <li>
                <Check /> Versioned review and publishing
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
            <h3>Operate the run, not a collection of status updates.</h3>
            <p>
              Inspect immutable input, step-level state, outputs, ownership, elapsed time, and
              exceptions. Claim human work, review evidence, and intervene without leaving the run.
            </p>
            <ul>
              <li>
                <Check /> Live step-level state
              </li>
              <li>
                <Check /> Claimable work and approvals
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
              inspectable history. Trace any outcome back to its workflow version, evidence, actor,
              and decision.
            </p>
            <ul>
              <li>
                <Check /> Source-linked decisions
              </li>
              <li>
                <Check /> Immutable workflow and agent versions
              </li>
              <li>
                <Check /> Exportable audit evidence
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
            <h2>One workflow. Every handoff accounted for.</h2>
          </div>
          <p>
            See how a critical customer case moves across systems, agents, and people while
            preserving one clear line of accountability.
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
            <GitBranch /> Multi-system execution
          </span>
          <i />
          <span>
            <Clock3 /> Explicit response target
          </span>
          <i />
          <span>
            <ShieldCheck /> Exportable evidence trail
          </span>
        </div>
      </section>

      <section className="kh-principles kh-section">
        <div className="kh-wrap kh-section-heading">
          <span className="kh-section-index">04 / BUILT FOR THE WORK</span>
          <h2>One operating model, adapted to the teams doing the work.</h2>
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
              Access, context, authority, and evidence live with the run—so execution remains
              reviewable before, during, and after automation acts.
            </p>
            <Link className="kh-button kh-button--light" to="/security">
              Visit the security center <ArrowRight />
            </Link>
          </div>
          <div className="kh-security__grid">
            <article>
              <LockKeyhole />
              <h3>Explicit authority</h3>
              <p>
                Workspace roles, tool scopes, and approval gates define who can take each action.
              </p>
            </article>
            <article>
              <Network />
              <h3>Permission-aware context</h3>
              <p>Agents retrieve only the knowledge available to their workspace and authority.</p>
            </article>
            <article>
              <FileCheck2 />
              <h3>Versioned operations</h3>
              <p>Published workflows and agents are immutable, attributable execution contracts.</p>
            </article>
            <article>
              <Search />
              <h3>Inspectable execution</h3>
              <p>Every run retains its inputs, actions, decisions, failures, and final outcome.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="kh-faq kh-section">
        <div className="kh-wrap kh-faq__layout">
          <div className="kh-faq__intro">
            <span className="kh-section-index">06 / QUESTIONS, ANSWERED</span>
            <h2>Questions teams ask before governing real work.</h2>
            <p>
              Start with a human-led workflow, make it observable, then add agents and integrations
              behind explicit controls.
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
