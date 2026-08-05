import type { WorkflowDefinition } from "@knotline/contracts";
import { Badge, Button, Card } from "@knotline/ui";
import {
  ArrowLeft,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Sparkles,
  Upload
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  acceptWorkflowGeneration,
  cancelWorkflowGeneration,
  createVersionedWorkflow,
  dryRunWorkflowDefinition,
  fetchWorkflowGeneration,
  importWorkflowDefinition,
  previewWorkflowImport,
  startWorkflowGeneration,
  type WorkflowGenerationResource
} from "./api.js";
import { msg } from "./i18n.js";
import { AuthGate } from "./AuthPages.js";

type CreationStage = 1 | 2 | 3 | 4;

const creationSteps = [
  msg("generation.step.describe"),
  msg("generation.step.review"),
  msg("generation.step.test"),
  msg("generation.step.publish")
];

type GeneratedNodeKind = WorkflowDefinition["nodes"][number]["kind"];

function generatedCapabilityLabel(kind: GeneratedNodeKind): string {
  switch (kind) {
    case "trigger":
      return msg("generation.kind.trigger");
    case "human":
      return msg("generation.kind.human");
    case "agent":
      return msg("generation.kind.agent");
    case "approval":
      return msg("generation.kind.approval");
    case "condition":
      return msg("generation.kind.condition");
    case "delay":
      return msg("generation.kind.delay");
    case "loop":
      return msg("generation.kind.loop");
    case "subworkflow":
      return msg("generation.kind.subworkflow");
    case "transform":
      return msg("generation.kind.transform");
    case "integration_action":
      return msg("generation.kind.integrationaction");
  }
}

export function GuidedWorkflowPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<CreationStage>(1);
  const [blankError, setBlankError] = useState("");

  const createBlank = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get("name");
    const description = data.get("description");
    if (typeof name !== "string" || typeof description !== "string") return;
    try {
      const created = await createVersionedWorkflow(name, description);
      void navigate(`/app/workflows/${created.id}/studio`);
    } catch (reason) {
      setBlankError(String(reason));
    }
  };

  return (
    <AuthGate>
      <main className="workflow-onboarding">
        <header className="workflow-onboarding-header">
          <Link to="/app/workflows">
            <ArrowLeft aria-hidden="true" />
            {msg("generation.back")}
          </Link>
          <Badge tone="accent">{msg("generation.gateway")}</Badge>
        </header>

        <section className="workflow-onboarding-intro" aria-labelledby="workflow-create-title">
          <div>
            <span className="auth-kicker">{msg("generation.intro.kicker")}</span>
            <h1 id="workflow-create-title">{msg("generation.page.heading")}</h1>
            <p>{msg("generation.page.body")}</p>
          </div>
          <ol className="creation-progress" aria-label={msg("generation.progress.label")}>
            {creationSteps.map((label, index) => {
              const step = (index + 1) as CreationStage;
              const complete = step < stage;
              const current = step === stage;
              return (
                <li className={complete ? "is-complete" : current ? "is-current" : ""} key={label}>
                  <span aria-hidden="true">{complete ? <Check /> : step}</span>
                  <strong>{label}</strong>
                </li>
              );
            })}
          </ol>
        </section>

        <GuidedWorkflowCreate onStageChange={setStage} />

        <details className="alternate-creation">
          <summary>
            <span>
              <strong>{msg("generation.alternatives.heading")}</strong>
              <small>{msg("generation.alternatives.body")}</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="creation-choices">
            <Card>
              <h2>{msg("generation.blank.heading")}</h2>
              <p>{msg("generation.blank.body")}</p>
              <form onSubmit={(event) => void createBlank(event)}>
                <label>
                  {msg("workflow.create.name")}
                  <input name="name" required minLength={2} maxLength={120} />
                </label>
                <label>
                  {msg("workflow.create.description")}
                  <textarea name="description" maxLength={500} />
                </label>
                <Button type="submit">{msg("generation.blank.create")}</Button>
              </form>
              {blankError ? <p role="alert">{blankError}</p> : null}
            </Card>
            <Card>
              <h2>{msg("generation.template.heading")}</h2>
              <p>{msg("generation.template.body")}</p>
              <Link to="/app/templates">{msg("generation.template.browse")}</Link>
            </Card>
          </div>
        </details>
      </main>
    </AuthGate>
  );
}

export function GuidedWorkflowCreate({
  onStageChange
}: {
  readonly onStageChange: (stage: CreationStage) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [generation, setGeneration] = useState<WorkflowGenerationResource>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [dryRun, setDryRun] = useState<Awaited<ReturnType<typeof dryRunWorkflowDefinition>>>();
  const [publishedWorkflowId, setPublishedWorkflowId] = useState("");
  const [acceptedAsDraft, setAcceptedAsDraft] = useState(false);
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importContent, setImportContent] = useState("");
  const [importPreview, setImportPreview] = useState<{
    readonly definition: WorkflowDefinition;
    readonly findings: readonly { readonly severity: string; readonly message: string }[];
  }>();
  const generatedNodes = generation?.result?.definition.nodes ?? [];
  const generatedCapabilities = [...new Set(generatedNodes.map(({ kind }) => kind))];

  useEffect(() => {
    if (!generation || !["QUEUED", "RUNNING", "CANCELLING"].includes(generation.lifecycle)) return;
    const timer = window.setTimeout(() => {
      void fetchWorkflowGeneration(generation.id)
        .then((next) => {
          setGeneration(next);
          if (next.result) onStageChange(2);
        })
        .catch((reason: unknown) => setError(String(reason)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [generation, onStageChange]);

  const generate = async (event?: FormEvent, retryOf?: string) => {
    event?.preventDefault();
    setWorking(true);
    setError("");
    setDryRun(undefined);
    onStageChange(1);
    try {
      const next = await startWorkflowGeneration(prompt, retryOf);
      setGeneration(next);
      if (next.result) onStageChange(2);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  const testSafely = async () => {
    if (!generation?.result) return;
    setWorking(true);
    setError("");
    try {
      const nodes = generation.result.definition.nodes;
      const humanSubmissions = Object.fromEntries(
        nodes
          .filter(({ kind }) => kind === "human")
          .map(({ key }) => [key, { status: "submitted", source: "controlled_safe_test" }])
      );
      const agentOutputs = Object.fromEntries(
        nodes
          .filter(({ kind }) => kind === "agent")
          .map(({ key }) => [key, { status: "completed", source: "controlled_safe_test" }])
      );
      const connectorOutputs = Object.fromEntries(
        nodes
          .filter(({ kind }) => kind === "integration_action")
          .map(({ key }) => [key, { status: "simulated", externalWrite: false }])
      );
      const healthyConnections = nodes
        .filter(({ kind }) => kind === "integration_action")
        .map(({ configuration }) => configuration.connectionRef)
        .filter((value): value is string => typeof value === "string");
      const report = await dryRunWorkflowDefinition(generation.result.definition, {
        input: { source: "guided_fixture" },
        humanSubmissions,
        agentOutputs,
        connectorOutputs,
        permissions: ["workflow.run"],
        entitlements: ["workflows"],
        healthyConnections,
        budgetMinor: Math.max(100, nodes.filter(({ kind }) => kind === "agent").length * 100),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      });
      setDryRun(report);
      onStageChange(3);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  const accept = async () => {
    if (!generation || !dryRun?.preflight.allowed) return;
    setWorking(true);
    setError("");
    try {
      const publish = generation.result?.quality.publishable === true;
      const accepted = await acceptWorkflowGeneration(generation.id, publish);
      setPublishedWorkflowId(accepted.workflowId);
      setAcceptedAsDraft(!accepted.published);
      onStageChange(4);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  const previewImport = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const content =
        importFormat === "json" ? (JSON.parse(importContent) as WorkflowDefinition) : importContent;
      setImportPreview(await previewWorkflowImport(importFormat, content));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  const acceptImport = async () => {
    if (!importPreview) return;
    setWorking(true);
    try {
      const imported = await importWorkflowDefinition(importPreview.definition);
      globalThis.location.assign(`/app/workflows/${imported.id}/studio`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  if (publishedWorkflowId) {
    return (
      <Card className="publish-success" aria-live="polite">
        <span className="publish-success-icon" aria-hidden="true">
          <CheckCircle2 />
        </span>
        <Badge tone="accent">
          {acceptedAsDraft
            ? msg("generation.draft.success.badge")
            : msg("generation.publish.success.badge")}
        </Badge>
        <h2>
          {acceptedAsDraft
            ? msg("generation.draft.success.heading")
            : msg("generation.publish.success.heading")}
        </h2>
        <p>
          {acceptedAsDraft
            ? msg("generation.draft.success.body")
            : msg("generation.publish.success.body")}
        </p>
        <div className="action-row">
          <Link className="primary-button" to={`/app/workflows/${publishedWorkflowId}`}>
            {msg("generation.publish.success.view")}
          </Link>
          <Link className="secondary-button" to="/app/workflows">
            {msg("generation.publish.success.library")}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="guided-create">
      <Card className="guided-primary-card">
        <div className="guided-card-heading">
          <span className="guided-card-icon" aria-hidden="true">
            <Sparkles />
          </span>
          <div>
            <h2>{msg("generation.heading")}</h2>
            <p>{msg("generation.body")}</p>
          </div>
        </div>

        <form className="workflow-prompt-form" onSubmit={(event) => void generate(event)}>
          <label htmlFor="workflow-prompt">{msg("generation.prompt")}</label>
          <textarea
            id="workflow-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            minLength={10}
            maxLength={8000}
            required
            placeholder={msg("generation.placeholder")}
          />
          <div className="prompt-footer">
            <span>{msg("generation.prompt.hint")}</span>
            <Button tone="accent" type="submit" disabled={working || prompt.trim().length < 10}>
              <Sparkles aria-hidden="true" />
              {working && !generation?.result
                ? msg("generation.working")
                : msg("generation.generate")}
            </Button>
          </div>
        </form>

        {generation ? (
          <section className="generation-review" aria-live="polite">
            <div className="review-heading">
              <div>
                <Badge tone={generation.result ? "accent" : "neutral"}>
                  {msg("generation.status", { status: generation.phase ?? generation.lifecycle })}
                </Badge>
                <h3>{generation.result?.definition.name ?? msg("generation.preparing")}</h3>
              </div>
              {["QUEUED", "RUNNING"].includes(generation.lifecycle) ? (
                <Button
                  onClick={() => void cancelWorkflowGeneration(generation.id).then(setGeneration)}
                >
                  {msg("generation.cancel")}
                </Button>
              ) : null}
            </div>
            {generation.failureCode ? <p role="alert">{generation.failureCode}</p> : null}
            {generation.result ? (
              <>
                <p className="review-summary">
                  {msg("generation.diff", {
                    nodes: generation.result.diff.addedNodes,
                    edges: generation.result.diff.addedEdges
                  })}
                </p>
                <div
                  className="workflow-complexity"
                  aria-label={msg("generation.complexity.label")}
                >
                  <article>
                    <strong>{generatedNodes.length}</strong>
                    <span>{msg("generation.complexity.steps")}</span>
                  </article>
                  <article>
                    <strong>{generation.result.definition.edges.length}</strong>
                    <span>{msg("generation.complexity.paths")}</span>
                  </article>
                  <article>
                    <strong>{generatedNodes.filter(({ kind }) => kind === "agent").length}</strong>
                    <span>{msg("generation.complexity.agents")}</span>
                  </article>
                  <article>
                    <strong>
                      {
                        generatedNodes.filter(({ kind }) => kind === "human" || kind === "approval")
                          .length
                      }
                    </strong>
                    <span>{msg("generation.complexity.human.gates")}</span>
                  </article>
                  <article>
                    <strong>
                      {generatedNodes.filter(({ kind }) => kind === "integration_action").length}
                    </strong>
                    <span>{msg("generation.complexity.integrations")}</span>
                  </article>
                </div>
                <div className="workflow-capabilities">
                  <strong>{msg("generation.capabilities.heading")}</strong>
                  <div>
                    {generatedCapabilities.map((kind) => (
                      <span key={kind}>{generatedCapabilityLabel(kind)}</span>
                    ))}
                  </div>
                </div>
                <section
                  className={`generation-quality ${
                    generation.result.quality.publishable
                      ? "is-ready"
                      : generation.result.quality.draftAcceptable
                        ? "needs-connections"
                        : "is-blocked"
                  }`}
                >
                  <div className="generation-quality-heading">
                    <div>
                      <span>{msg("generation.quality.heading")}</span>
                      <strong>
                        {msg("generation.quality.score", {
                          score: generation.result.quality.score
                        })}
                      </strong>
                    </div>
                    <Badge tone={generation.result.quality.publishable ? "accent" : "warning"}>
                      {generation.result.quality.publishable
                        ? msg("generation.quality.publishable")
                        : generation.result.quality.draftAcceptable
                          ? msg("generation.quality.draft")
                          : msg("generation.quality.blocked")}
                    </Badge>
                  </div>
                  <div className="generation-quality-metrics">
                    <span>
                      <strong>{generation.result.quality.summary.automatedSteps}</strong>
                      {msg("generation.quality.automated")}
                    </span>
                    <span>
                      <strong>{generation.result.quality.summary.humanSteps}</strong>
                      {msg("generation.quality.human")}
                    </span>
                    <span>
                      <strong>{generation.result.quality.summary.conditionalApprovals}</strong>
                      {msg("generation.quality.approvals")}
                    </span>
                    <span>
                      <strong>{generation.result.quality.summary.connectedActions}</strong>
                      {msg("generation.quality.connected")}
                    </span>
                    <span>
                      <strong>{generation.result.quality.summary.automationOpportunities}</strong>
                      {msg("generation.quality.opportunities")}
                    </span>
                    <span>
                      <strong>{generation.result.quality.summary.agentCapabilityGaps}</strong>
                      {msg("generation.quality.agent.gaps")}
                    </span>
                    <span>
                      <strong>
                        {generation.result.quality.summary.scenariosPassed}/
                        {generation.result.quality.summary.scenariosTotal}
                      </strong>
                      {msg("generation.quality.scenarios")}
                    </span>
                  </div>
                  {generation.result.quality.summary.automationOpportunities > 0 ? (
                    <div className="quality-explanation">
                      <p>
                        {msg("generation.quality.connection.explanation", {
                          count: generation.result.quality.summary.automationOpportunities
                        })}
                      </p>
                      <Link to="/app/connections">
                        {msg("generation.quality.connections.open")}
                      </Link>
                    </div>
                  ) : (
                    <p className="quality-explanation">
                      {msg("generation.quality.automation.ready")}
                    </p>
                  )}
                  {generation.result.quality.agentGaps.length > 0 ? (
                    <div className="quality-explanation">
                      <p>{msg("generation.quality.agent.explanation")}</p>
                      <Link to="/app/agents/new">{msg("generation.quality.agent.create")}</Link>
                    </div>
                  ) : null}
                </section>
                <div className="generation-design-review">
                  <section>
                    <h4>{msg("generation.quality.integrations")}</h4>
                    <ul>
                      {generation.result.quality.integrations.length ? (
                        generation.result.quality.integrations.map((integration) => (
                          <li key={integration.key} data-mode={integration.mode}>
                            <strong>{integration.label}</strong>
                            <span>
                              {integration.mode.replace("_", " ")} · {integration.reason}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li>{msg("generation.quality.integrations.none")}</li>
                      )}
                    </ul>
                  </section>
                  <section>
                    <h4>{msg("generation.quality.agents")}</h4>
                    <ul>
                      {generation.result.quality.agents.length ? (
                        generation.result.quality.agents.map((agent) => (
                          <li
                            key={agent.nodeKey}
                            data-mode={agent.suitable ? "connected" : "missing"}
                          >
                            <strong>
                              {agent.nodeName} → {agent.agentName} v{agent.agentVersion}
                            </strong>
                            <span>{agent.reason}</span>
                          </li>
                        ))
                      ) : (
                        <li>{msg("generation.quality.agents.none")}</li>
                      )}
                      {generation.result.quality.agentGaps.map((gap) => (
                        <li key={gap} data-mode="missing">
                          <strong>{msg("generation.quality.agent.required")}</strong>
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4>{msg("generation.quality.approval.plan")}</h4>
                    <ul>
                      {generation.result.quality.approvals.length ? (
                        generation.result.quality.approvals.map((approval) => (
                          <li key={approval.nodeKey}>
                            <strong>
                              {approval.nodeName} · {approval.riskLevel}
                            </strong>
                            <span>{approval.reason}</span>
                          </li>
                        ))
                      ) : (
                        <li>{msg("generation.quality.approvals.none")}</li>
                      )}
                    </ul>
                  </section>
                  <section>
                    <h4>{msg("generation.quality.path.tests")}</h4>
                    <ul>
                      {generation.result.quality.scenarios.map((scenario) => (
                        <li
                          key={scenario.id}
                          data-mode={scenario.status === "passed" ? "connected" : "missing"}
                        >
                          <strong>{scenario.name}</strong>
                          <span>
                            {msg("generation.quality.path.summary", {
                              status: scenario.status,
                              steps: scenario.path.length,
                              terminal:
                                scenario.terminalNodeKey ?? msg("generation.quality.missing")
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
                <div className="review-columns">
                  <section>
                    <h4>{msg("generation.assumptions")}</h4>
                    <ul>
                      {generation.result.assumptions.map((assumption) => (
                        <li key={assumption}>
                          <Check aria-hidden="true" />
                          {assumption}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4>{msg("generation.assignments")}</h4>
                    <ul>
                      {generation.result.assignments.map((assignment) => (
                        <li key={assignment}>
                          <Check aria-hidden="true" />
                          {assignment}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
                <details className="technical-details">
                  <summary>{msg("generation.technical.details")}</summary>
                  <dl className="generation-metadata">
                    <div>
                      <dt>{msg("generation.environment")}</dt>
                      <dd>{generation.result.environmentStatus}</dd>
                    </div>
                    <div>
                      <dt>{msg("generation.provider")}</dt>
                      <dd>{generation.result.provider}</dd>
                    </div>
                    <div>
                      <dt>{msg("generation.model")}</dt>
                      <dd>{generation.result.exactModelId ?? msg("generation.model.recorded")}</dd>
                    </div>
                    <div>
                      <dt>{msg("generation.prompt.version")}</dt>
                      <dd>{generation.result.promptVersion}</dd>
                    </div>
                    <div>
                      <dt>{msg("generation.compiler.version")}</dt>
                      <dd>{generation.result.compilerVersion}</dd>
                    </div>
                    <div>
                      <dt>{msg("generation.cost")}</dt>
                      <dd>
                        {generation.result.usage.costMinor} {generation.result.usage.currency}
                      </dd>
                    </div>
                    <div>
                      <dt>{msg("generation.repairs")}</dt>
                      <dd>{generation.result.repairAttempts}</dd>
                    </div>
                  </dl>
                  <h4>{msg("generation.integrations")}</h4>
                  {generation.result.missingIntegrations.length ? (
                    <ul>
                      {generation.result.missingIntegrations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{msg("generation.integrations.none")}</p>
                  )}
                  <h4>{msg("generation.findings")}</h4>
                  {generation.result.findings.length ? (
                    <ul>
                      {generation.result.findings.map((finding) => (
                        <li key={`${finding.code}-${finding.message}`}>
                          {finding.severity}: {finding.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{msg("generation.findings.none")}</p>
                  )}
                </details>
                <div className="review-actions">
                  <Button
                    onClick={() => void generate(undefined, generation.id)}
                    disabled={working}
                  >
                    {msg("generation.regenerate")}
                  </Button>
                  <Button
                    onClick={() => {
                      setGeneration(undefined);
                      setDryRun(undefined);
                      onStageChange(1);
                    }}
                  >
                    {msg("generation.discard")}
                  </Button>
                  <Button tone="accent" onClick={() => void testSafely()} disabled={working}>
                    <FlaskConical aria-hidden="true" />
                    {working ? msg("generation.testing") : msg("generation.dryrun")}
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {dryRun ? (
          <section className="dry-run-report" aria-live="polite">
            <div className="review-heading">
              <div>
                <span className="auth-kicker">{msg("generation.step.test")}</span>
                <h3>{msg("dryrun.heading")}</h3>
              </div>
              <Badge tone={dryRun.preflight.allowed ? "accent" : "warning"}>
                {dryRun.preflight.allowed ? msg("dryrun.ready") : msg("dryrun.blocked")}
              </Badge>
            </div>
            <p>{msg("dryrun.explanation")}</p>
            <div className="test-summary">
              <span>
                <strong>{dryRun.steps.length}</strong>
                {msg("dryrun.steps")}
              </span>
              <span>
                <strong>{dryRun.externalWrites}</strong>
                {msg("dryrun.external.writes")}
              </span>
              <span>
                <strong>{dryRun.preflight.checks.filter((check) => check.passed).length}</strong>
                {msg("dryrun.checks.passed")}
              </span>
            </div>
            <ul className="check-list">
              {dryRun.preflight.checks.map((check) => (
                <li key={check.key} className={check.passed ? "is-passed" : "is-blocked"}>
                  {check.passed ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">×</span>
                  )}
                  {check.message}
                </li>
              ))}
            </ul>
            <div className="publish-bar">
              <div>
                <strong>
                  {generation?.result?.quality.publishable
                    ? msg("generation.publish.ready.heading")
                    : msg("generation.draft.ready.heading")}
                </strong>
                <span>
                  {generation?.result?.quality.publishable
                    ? msg("generation.publish.ready.body")
                    : msg("generation.draft.ready.body")}
                </span>
              </div>
              <Button
                tone="accent"
                onClick={() => void accept()}
                disabled={working || !dryRun.preflight.allowed}
              >
                {working
                  ? msg("generation.publishing")
                  : generation?.result?.quality.publishable
                    ? msg("generation.accept.publish")
                    : msg("generation.accept.draft")}
              </Button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="guided-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      <details className="import-workflow">
        <summary>
          <Upload aria-hidden="true" />
          {msg("import.heading")}
          <ChevronDown aria-hidden="true" />
        </summary>
        <div>
          <p>{msg("import.body")}</p>
          <form onSubmit={(event) => void previewImport(event)}>
            <label>
              {msg("import.format")}
              <select
                value={importFormat}
                onChange={(event) => setImportFormat(event.target.value as "json" | "csv")}
              >
                <option value="json">{msg("import.json")}</option>
                <option value="csv">{msg("import.csv")}</option>
              </select>
            </label>
            <label>
              {msg("import.content")}
              <textarea
                value={importContent}
                onChange={(event) => setImportContent(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={working}>
              <Braces aria-hidden="true" />
              {msg("import.preview")}
            </Button>
          </form>
          {importPreview ? (
            <div className="import-preview">
              <strong>{importPreview.definition.name}</strong>
              <p>
                {msg("import.summary", {
                  nodes: importPreview.definition.nodes.length,
                  findings: importPreview.findings.length
                })}
              </p>
              <Button
                tone="accent"
                onClick={() => void acceptImport()}
                disabled={
                  working || importPreview.findings.some(({ severity }) => severity === "error")
                }
              >
                {msg("import.accept")}
              </Button>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
