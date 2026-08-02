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
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importContent, setImportContent] = useState("");
  const [importPreview, setImportPreview] = useState<{
    readonly definition: WorkflowDefinition;
    readonly findings: readonly { readonly severity: string; readonly message: string }[];
  }>();

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
      const report = await dryRunWorkflowDefinition(generation.result.definition, {
        input: { source: "guided_fixture" },
        humanSubmissions: { prepare_request: { status: "submitted" } },
        agentOutputs: {},
        connectorOutputs: {},
        permissions: ["workflow.run"],
        entitlements: ["workflows"],
        healthyConnections: [],
        budgetMinor: 100,
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
      const accepted = await acceptWorkflowGeneration(generation.id, true);
      setPublishedWorkflowId(accepted.workflowId);
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
        <Badge tone="accent">{msg("generation.publish.success.badge")}</Badge>
        <h2>{msg("generation.publish.success.heading")}</h2>
        <p>{msg("generation.publish.success.body")}</p>
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
              {working && !generation?.result ? msg("generation.working") : msg("generation.generate")}
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
                <Button onClick={() => void cancelWorkflowGeneration(generation.id).then(setGeneration)}>
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
                <div className="review-columns">
                  <section>
                    <h4>{msg("generation.assumptions")}</h4>
                    <ul>
                      {generation.result.assumptions.map((assumption) => (
                        <li key={assumption}><Check aria-hidden="true" />{assumption}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4>{msg("generation.assignments")}</h4>
                    <ul>
                      {generation.result.assignments.map((assignment) => (
                        <li key={assignment}><Check aria-hidden="true" />{assignment}</li>
                      ))}
                    </ul>
                  </section>
                </div>
                <details className="technical-details">
                  <summary>{msg("generation.technical.details")}</summary>
                  <dl className="generation-metadata">
                    <div><dt>{msg("generation.environment")}</dt><dd>{generation.result.environmentStatus}</dd></div>
                    <div><dt>{msg("generation.provider")}</dt><dd>{generation.result.provider}</dd></div>
                    <div><dt>{msg("generation.model")}</dt><dd>{generation.result.exactModelId ?? msg("generation.model.recorded")}</dd></div>
                    <div><dt>{msg("generation.prompt.version")}</dt><dd>{generation.result.promptVersion}</dd></div>
                    <div><dt>{msg("generation.cost")}</dt><dd>{generation.result.usage.costMinor} {generation.result.usage.currency}</dd></div>
                    <div><dt>{msg("generation.repairs")}</dt><dd>{generation.result.repairAttempts}</dd></div>
                  </dl>
                  <h4>{msg("generation.integrations")}</h4>
                  {generation.result.missingIntegrations.length ? (
                    <ul>{generation.result.missingIntegrations.map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : <p>{msg("generation.integrations.none")}</p>}
                  <h4>{msg("generation.findings")}</h4>
                  {generation.result.findings.length ? (
                    <ul>{generation.result.findings.map((finding) => <li key={`${finding.code}-${finding.message}`}>{finding.severity}: {finding.message}</li>)}</ul>
                  ) : <p>{msg("generation.findings.none")}</p>}
                </details>
                <div className="review-actions">
                  <Button onClick={() => void generate(undefined, generation.id)} disabled={working}>
                    {msg("generation.regenerate")}
                  </Button>
                  <Button onClick={() => { setGeneration(undefined); setDryRun(undefined); onStageChange(1); }}>
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
              <span><strong>{dryRun.steps.length}</strong>{msg("dryrun.steps")}</span>
              <span><strong>{dryRun.externalWrites}</strong>{msg("dryrun.external.writes")}</span>
              <span><strong>{dryRun.preflight.checks.filter((check) => check.passed).length}</strong>{msg("dryrun.checks.passed")}</span>
            </div>
            <ul className="check-list">
              {dryRun.preflight.checks.map((check) => (
                <li key={check.key} className={check.passed ? "is-passed" : "is-blocked"}>
                  {check.passed ? <CheckCircle2 aria-hidden="true" /> : <span aria-hidden="true">×</span>}
                  {check.message}
                </li>
              ))}
            </ul>
            <div className="publish-bar">
              <div>
                <strong>{msg("generation.publish.ready.heading")}</strong>
                <span>{msg("generation.publish.ready.body")}</span>
              </div>
              <Button tone="accent" onClick={() => void accept()} disabled={working || !dryRun.preflight.allowed}>
                {working ? msg("generation.publishing") : msg("generation.accept.publish")}
              </Button>
            </div>
          </section>
        ) : null}

        {error ? <p className="guided-error" role="alert">{error}</p> : null}
      </Card>

      <details className="import-workflow">
        <summary><Upload aria-hidden="true" />{msg("import.heading")}<ChevronDown aria-hidden="true" /></summary>
        <div>
          <p>{msg("import.body")}</p>
          <form onSubmit={(event) => void previewImport(event)}>
            <label>{msg("import.format")}
              <select value={importFormat} onChange={(event) => setImportFormat(event.target.value as "json" | "csv")}>
                <option value="json">{msg("import.json")}</option>
                <option value="csv">{msg("import.csv")}</option>
              </select>
            </label>
            <label>{msg("import.content")}
              <textarea value={importContent} onChange={(event) => setImportContent(event.target.value)} required />
            </label>
            <Button type="submit" disabled={working}><Braces aria-hidden="true" />{msg("import.preview")}</Button>
          </form>
          {importPreview ? (
            <div className="import-preview">
              <strong>{importPreview.definition.name}</strong>
              <p>{msg("import.summary", { nodes: importPreview.definition.nodes.length, findings: importPreview.findings.length })}</p>
              <Button tone="accent" onClick={() => void acceptImport()} disabled={working || importPreview.findings.some(({ severity }) => severity === "error")}>
                {msg("import.accept")}
              </Button>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
