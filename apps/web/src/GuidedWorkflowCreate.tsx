import type { WorkflowDefinition } from "@knotline/contracts";
import { Badge, Button, Card } from "@knotline/ui";
import { Braces, FlaskConical, Sparkles, Upload } from "lucide-react";
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

export function GuidedWorkflowPage() {
  const navigate = useNavigate();
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
      <main className="guided-create-page">
        <header>
          <Link to="/app/workflows">{msg("generation.back")}</Link>
          <Badge tone="warning">{msg("generation.simulated")}</Badge>
          <h1>{msg("generation.page.heading")}</h1>
          <p>{msg("generation.page.body")}</p>
        </header>
        <div className="creation-choices">
          <Card>
            <h2>{msg("generation.blank.heading")}</h2>
            <form onSubmit={(event) => void createBlank(event)}>
              <label>
                {msg("workflow.create.name")}
                <input name="name" required minLength={2} maxLength={120} />
              </label>
              <label>
                {msg("workflow.create.description")}
                <textarea name="description" maxLength={500} />
              </label>
              <Button tone="accent" type="submit">
                {msg("generation.blank.create")}
              </Button>
            </form>
            {blankError ? <p role="alert">{blankError}</p> : null}
          </Card>
          <Card>
            <h2>{msg("generation.template.heading")}</h2>
            <p>{msg("generation.template.body")}</p>
            <Link to="/app/templates">{msg("generation.template.browse")}</Link>
          </Card>
        </div>
        <GuidedWorkflowCreate
          onCreated={(workflowId) => void navigate(`/app/workflows/${workflowId}`)}
        />
      </main>
    </AuthGate>
  );
}

export function GuidedWorkflowCreate({
  onCreated
}: {
  readonly onCreated: (workflowId: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [generation, setGeneration] = useState<WorkflowGenerationResource>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [dryRun, setDryRun] = useState<Awaited<ReturnType<typeof dryRunWorkflowDefinition>>>();
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
        .then(setGeneration)
        .catch((reason: unknown) => setError(String(reason)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [generation]);

  const generate = async (event?: FormEvent, retryOf?: string) => {
    event?.preventDefault();
    setWorking(true);
    setError("");
    setDryRun(undefined);
    try {
      setGeneration(await startWorkflowGeneration(prompt, retryOf));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  const testSafely = async () => {
    if (!generation?.result) return;
    setWorking(true);
    try {
      setDryRun(
        await dryRunWorkflowDefinition(generation.result.definition, {
          input: { source: "guided_fixture" },
          humanSubmissions: { prepare_request: { status: "submitted" } },
          agentOutputs: {},
          connectorOutputs: {},
          permissions: ["workflow.run"],
          entitlements: ["workflows"],
          healthyConnections: [],
          budgetMinor: 100,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        })
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  const accept = async () => {
    if (!generation) return;
    setWorking(true);
    try {
      const accepted = await acceptWorkflowGeneration(generation.id, true);
      onCreated(accepted.workflowId);
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
      onCreated(imported.id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="guided-create">
      <Card>
        <div className="row-between">
          <h3>
            <Sparkles aria-hidden="true" /> {msg("generation.heading")}
          </h3>
          <Badge tone="warning">{msg("generation.simulated")}</Badge>
        </div>
        <p>{msg("generation.body")}</p>
        <form onSubmit={(event) => void generate(event)}>
          <label>
            {msg("generation.prompt")}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              minLength={10}
              maxLength={8000}
              required
              placeholder={msg("generation.placeholder")}
            />
          </label>
          <Button tone="accent" type="submit" disabled={working || prompt.trim().length < 10}>
            <Sparkles aria-hidden="true" /> {msg("generation.generate")}
          </Button>
        </form>
        {generation ? (
          <section className="generation-review" aria-live="polite">
            <div className="row-between">
              <strong>
                {msg("generation.status", { status: generation.phase ?? generation.lifecycle })}
              </strong>
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
                <h4>{generation.result.definition.name}</h4>
                <p>
                  {msg("generation.diff", {
                    nodes: generation.result.diff.addedNodes,
                    edges: generation.result.diff.addedEdges
                  })}
                </p>
                <dl className="generation-metadata">
                  <div>
                    <dt>{msg("generation.provider")}</dt>
                    <dd>{generation.result.provider}</dd>
                  </div>
                  <div>
                    <dt>{msg("generation.prompt.version")}</dt>
                    <dd>{generation.result.promptVersion}</dd>
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
                <h5>{msg("generation.assumptions")}</h5>
                <ul>
                  {generation.result.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
                <h5>{msg("generation.assignments")}</h5>
                <ul>
                  {generation.result.assignments.map((assignment) => (
                    <li key={assignment}>{assignment}</li>
                  ))}
                </ul>
                <h5>{msg("generation.integrations")}</h5>
                {generation.result.missingIntegrations.length ? (
                  <ul>
                    {generation.result.missingIntegrations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{msg("generation.integrations.none")}</p>
                )}
                <h5>{msg("generation.findings")}</h5>
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
                <div className="action-row">
                  <Button onClick={() => void testSafely()} disabled={working}>
                    <FlaskConical aria-hidden="true" /> {msg("generation.dryrun")}
                  </Button>
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
                    }}
                  >
                    {msg("generation.discard")}
                  </Button>
                  <Button tone="accent" onClick={() => void accept()} disabled={working}>
                    {msg("generation.accept.publish")}
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}
        {dryRun ? (
          <section className="dry-run-report" aria-live="polite">
            <div className="row-between">
              <h4>{msg("dryrun.heading")}</h4>
              <Badge tone={dryRun.preflight.allowed ? "accent" : "warning"}>
                {dryRun.preflight.allowed ? msg("dryrun.ready") : msg("dryrun.blocked")}
              </Badge>
            </div>
            <p>{msg("dryrun.sideeffects", { count: dryRun.externalWrites })}</p>
            <ol>
              {dryRun.steps.map((step) => (
                <li key={step.nodeKey}>
                  {step.nodeKey} · {step.source}
                </li>
              ))}
            </ol>
            <ul>
              {dryRun.preflight.checks.map((check) => (
                <li key={check.key}>
                  {check.passed ? "✓" : "×"} {check.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Card>

      <Card>
        <h3>
          <Upload aria-hidden="true" /> {msg("import.heading")}
        </h3>
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
            <Braces aria-hidden="true" /> {msg("import.preview")}
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
      </Card>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
