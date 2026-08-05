import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import {
  ArrowLeft,
  Bot,
  Cable,
  CheckCircle2,
  CircleAlert,
  Copy,
  GitCompare,
  History,
  PencilLine,
  RotateCcw,
  Send
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import {
  createWorkflowTemplate,
  fetchTemplates,
  fetchWorkflow,
  fetchWorkflowDiff,
  fetchWorkflowDraft,
  fetchWorkflowVersion,
  fetchWorkflowVersions,
  instantiateWorkflowTemplate,
  restoreWorkflowVersion,
  validateWorkflowDraft,
  type WorkflowDraft,
  type WorkflowTemplateSummary,
  type WorkflowVersionSummary
} from "./api.js";
import { AuthGate } from "./AuthPages.js";
import { msg } from "./i18n.js";

const CollaborationPanel = lazy(async () => {
  const module = await import("./CollaborationPanel.js");
  return { default: module.CollaborationPanel };
});

function WorkflowFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <AuthGate>
      <main className="workflow-manage-page">
        <header className="workflow-manage-header">
          <Link to="/app/workflows">
            <ArrowLeft aria-hidden="true" />
            {msg("workflow.manage.back")}
          </Link>
          <div>
            <Badge tone="accent">{msg("workflow.manage.badge")}</Badge>
            <h1>{title}</h1>
          </div>
        </header>
        {children}
      </main>
    </AuthGate>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <ErrorState title={msg("workflow.manage.error")}>
      <p>{message}</p>
    </ErrorState>
  );
}

export function WorkflowDetailPage() {
  const { workflowId = "" } = useParams();
  const [draft, setDraft] = useState<WorkflowDraft>();
  const [title, setTitle] = useState(msg("workflow.detail.heading"));
  const [findings, setFindings] = useState<
    Awaited<ReturnType<typeof validateWorkflowDraft>>["findings"]
  >([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([fetchWorkflow(workflowId), fetchWorkflowDraft(workflowId)])
      .then(([workflow, currentDraft]) => {
        setTitle(workflow.name);
        setDraft(currentDraft);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, [workflowId]);
  return (
    <WorkflowFrame title={title}>
      {error ? (
        <Failure message={error} />
      ) : !draft ? (
        <Skeleton label={msg("workflow.detail.loading")} />
      ) : (
        <div className="workflow-manage-grid">
          <Card className="definition-card">
            <div className="row-between">
              <h2>{msg("workflow.detail.draft")}</h2>
              <Badge tone="neutral">
                v{draft.version} · r{draft.revision}
              </Badge>
            </div>
            <p>{draft.definition.description}</p>
            <dl className="definition-metrics">
              <div>
                <dt>{msg("workflow.detail.nodes")}</dt>
                <dd>{draft.definition.nodes.length}</dd>
              </div>
              <div>
                <dt>{msg("workflow.detail.edges")}</dt>
                <dd>{draft.definition.edges.length}</dd>
              </div>
              <div>
                <dt>{msg("workflow.detail.hash")}</dt>
                <dd>
                  <code>{draft.contentHash.slice(0, 20)}…</code>
                </dd>
              </div>
            </dl>
            <div className="action-row">
              <Link className="primary-button" to={`/app/workflows/${workflowId}/studio`}>
                <PencilLine aria-hidden="true" />
                {msg("workflow.edit")}
              </Link>
              <Button
                onClick={() =>
                  void validateWorkflowDraft(workflowId).then((result) => {
                    setFindings(result.findings);
                    setNotice(
                      result.valid
                        ? msg("workflow.validate.valid")
                        : msg("workflow.validate.invalid")
                    );
                  })
                }
              >
                <CheckCircle2 aria-hidden="true" />
                {msg("workflow.validate")}
              </Button>
              <Link
                className="button-link workflow-review-link"
                to={`/app/workflows/${workflowId}/studio?review=publish`}
              >
                <Send aria-hidden="true" />
                {msg("workflow.review.publish")}
              </Link>
              <Link className="button-link" to={`/app/workflows/${workflowId}/versions`}>
                <History aria-hidden="true" />
                {msg("workflow.versions")}
              </Link>
            </div>
            {notice ? (
              <p role="status" className="inline-notice">
                {notice}
              </p>
            ) : null}
          </Card>
          {draft.generationReadiness && !draft.generationReadiness.quality.publishable ? (
            <Card className="definition-card workflow-readiness-card">
              <header className="workflow-readiness-header">
                <span className="workflow-readiness-icon" aria-hidden="true">
                  <CircleAlert />
                </span>
                <div>
                  <h2>{msg("workflow.readiness.heading")}</h2>
                  <p>
                    {msg("workflow.readiness.body", {
                      connections:
                        draft.generationReadiness.quality.summary.automationOpportunities,
                      agents: draft.generationReadiness.quality.summary.agentCapabilityGaps
                    })}
                  </p>
                </div>
                <Badge tone="warning">{msg("workflow.readiness.draft")}</Badge>
              </header>
              <div className="workflow-requirements-grid">
                {draft.generationReadiness.missingIntegrations.length ? (
                  <section>
                    <div className="workflow-requirement-heading">
                      <span aria-hidden="true">
                        <Cable />
                      </span>
                      <h3>{msg("workflow.readiness.connections")}</h3>
                      <Badge tone="neutral">
                        {draft.generationReadiness.missingIntegrations.length}
                      </Badge>
                    </div>
                    <ul className="workflow-requirement-list">
                      {draft.generationReadiness.missingIntegrations.map((requirement) => (
                        <li key={requirement}>
                          <span aria-hidden="true" />
                          {requirement}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {draft.generationReadiness.missingAgentCapabilities.length ? (
                  <section>
                    <div className="workflow-requirement-heading">
                      <span aria-hidden="true">
                        <Bot />
                      </span>
                      <h3>{msg("workflow.readiness.agents")}</h3>
                      <Badge tone="neutral">
                        {draft.generationReadiness.missingAgentCapabilities.length}
                      </Badge>
                    </div>
                    <ul className="workflow-requirement-list">
                      {draft.generationReadiness.missingAgentCapabilities.map((requirement) => (
                        <li key={requirement}>
                          <span aria-hidden="true" />
                          {requirement}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
              <footer className="workflow-readiness-actions">
                <Link className="primary-button" to="/app/connections">
                  <Cable aria-hidden="true" />
                  {msg("workflow.readiness.configure")}
                </Link>
                {draft.generationReadiness.missingAgentCapabilities.length ? (
                  <Link className="button-link" to="/app/agents/new">
                    <Bot aria-hidden="true" />
                    {msg("workflow.readiness.create.agent")}
                  </Link>
                ) : null}
              </footer>
            </Card>
          ) : null}
          <Card className="finding-card">
            <h2>{msg("workflow.findings.heading")}</h2>
            {findings.length === 0 ? (
              <p>{msg("workflow.findings.empty")}</p>
            ) : (
              <ul>
                {findings.map((finding) => (
                  <li key={`${finding.code}-${finding.location.key ?? finding.location.path}`}>
                    <Badge tone={finding.severity === "error" ? "danger" : "warning"}>
                      {finding.code}
                    </Badge>
                    <span>{finding.message}</span>
                    {finding.location.key ? (
                      <a href={`#node-${finding.location.key}`}>{finding.location.key}</a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="definition-card">
            <h2>{msg("workflow.definition.heading")}</h2>
            <ol className="definition-node-list">
              {draft.definition.nodes.map((node) => (
                <li id={`node-${node.key}`} key={node.key}>
                  <span>{node.kind}</span>
                  <strong>{node.name}</strong>
                  <code>{node.key}</code>
                </li>
              ))}
            </ol>
          </Card>
          <Suspense fallback={<Skeleton label={msg("collaboration.heading")} />}>
            <CollaborationPanel workflowId={workflowId} />
          </Suspense>
        </div>
      )}
    </WorkflowFrame>
  );
}

export function WorkflowVersionsPage() {
  const { workflowId = "", version: selectedVersion } = useParams();
  const [versions, setVersions] = useState<readonly WorkflowVersionSummary[]>();
  const [selected, setSelected] = useState<WorkflowDraft>();
  const [diff, setDiff] = useState<Readonly<Record<string, unknown>>>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    fetchWorkflowVersions(workflowId)
      .then(setVersions)
      .catch((reason: unknown) => setNotice(String(reason)));
  }, [workflowId]);
  useEffect(() => {
    if (selectedVersion)
      void fetchWorkflowVersion(workflowId, Number(selectedVersion)).then(setSelected);
  }, [selectedVersion, workflowId]);
  return (
    <WorkflowFrame title={msg("workflow.versions.heading")}>
      {notice ? (
        <p role="status" className="inline-notice">
          {notice}
        </p>
      ) : null}
      {!versions ? (
        <Skeleton label={msg("workflow.versions.loading")} />
      ) : (
        <div className="version-layout">
          <section className="version-list" aria-label={msg("workflow.versions.list")}>
            {versions.map((entry) => (
              <Card key={entry.version}>
                <div className="row-between">
                  <strong>v{entry.version}</strong>
                  <Badge tone={entry.state === "published" ? "success" : "neutral"}>
                    {entry.state}
                  </Badge>
                </div>
                <p>{entry.releaseNote || msg("workflow.versions.no.note")}</p>
                <code>{entry.contentHash.slice(0, 24)}…</code>
                <div className="action-row">
                  <Link to={`/app/workflows/${workflowId}/versions/${entry.version}`}>
                    {msg("workflow.versions.inspect")}
                  </Link>
                  <Button
                    onClick={() =>
                      void restoreWorkflowVersion(workflowId, entry.version).then(() =>
                        setNotice(msg("workflow.restore.success", { version: entry.version }))
                      )
                    }
                  >
                    <RotateCcw aria-hidden="true" />
                    {msg("workflow.restore")}
                  </Button>
                </div>
              </Card>
            ))}
          </section>
          <Card className="version-detail-card">
            <h2>
              {selected
                ? msg("workflow.version.selected", { version: selected.version })
                : msg("workflow.diff.heading")}
            </h2>
            {selected ? (
              <>
                <p>{selected.definition.name}</p>
                <p>
                  {msg("workflow.detail.nodes")}: {selected.definition.nodes.length}
                </p>
              </>
            ) : versions.length >= 2 ? (
              <Button
                onClick={() =>
                  void fetchWorkflowDiff(
                    workflowId,
                    versions[1]!.version,
                    versions[0]!.version
                  ).then(setDiff)
                }
              >
                <GitCompare aria-hidden="true" />
                {msg("workflow.diff.compare")}
              </Button>
            ) : (
              <p>{msg("workflow.diff.need.two")}</p>
            )}
            {diff ? <pre>{JSON.stringify(diff, null, 2)}</pre> : null}
          </Card>
        </div>
      )}
    </WorkflowFrame>
  );
}

export function WorkflowSettingsPage() {
  const { workflowId = "" } = useParams();
  const [notice, setNotice] = useState("");
  return (
    <WorkflowFrame title={msg("workflow.settings.heading")}>
      <Card className="definition-card">
        <h2>{msg("workflow.template.create")}</h2>
        <p>{msg("workflow.template.create.body")}</p>
        <Button
          onClick={() =>
            void createWorkflowTemplate(
              workflowId,
              msg("workflow.template.default.name"),
              msg("workflow.template.default.body")
            ).then(() => setNotice(msg("workflow.template.created")))
          }
        >
          <Copy aria-hidden="true" />
          {msg("workflow.template.create")}
        </Button>
        {notice ? (
          <p role="status" className="inline-notice">
            {notice}
          </p>
        ) : null}
      </Card>
    </WorkflowFrame>
  );
}

export function TemplatesPage() {
  const { templateId } = useParams();
  const [templates, setTemplates] = useState<readonly WorkflowTemplateSummary[]>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((reason: unknown) => setNotice(String(reason)));
  }, []);
  const selected = templates?.find(({ id }) => id === templateId);
  return (
    <WorkflowFrame title={msg("templates.heading")}>
      {notice ? (
        <p role="status" className="inline-notice">
          {notice}
        </p>
      ) : null}
      {!templates ? (
        <Skeleton label={msg("templates.loading")} />
      ) : (
        <section className="template-grid">
          {(selected ? [selected] : templates).map((template) => (
            <Card key={template.id}>
              <Badge tone="accent">v{template.version}</Badge>
              <h2>{template.name}</h2>
              <p>{template.description}</p>
              <p>
                {msg("workflow.detail.nodes")}: {template.definition.nodes.length}
              </p>
              <div className="action-row">
                <Link to={`/app/templates/${template.id}`}>{msg("templates.preview")}</Link>
                <Button
                  onClick={() =>
                    void instantiateWorkflowTemplate(template.id).then(() =>
                      setNotice(msg("templates.instantiated"))
                    )
                  }
                >
                  {msg("templates.use")}
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}
    </WorkflowFrame>
  );
}
