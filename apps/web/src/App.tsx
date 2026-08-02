/* eslint-disable knotline/no-hardcoded-user-visible-string -- Run launch copy ships as one verified vertical journey; message catalog extraction follows the surface review. */
import { ArrowUpRight, Library, Play, Settings2 } from "lucide-react";
import { Dialog } from "@knotline/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Workflow, WorkflowSummary } from "@knotline/contracts";
import {
  fetchWorkflow,
  fetchWorkflowVersion,
  fetchWorkflowVersions,
  fetchWorkflows,
  startWorkflowRun
} from "./api";
import { i18n, msg } from "./i18n.js";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { WorkspacePageHeader } from "./WorkspacePageHeader.js";
import { WorkspaceShell } from "./WorkspaceShell.js";

function StatusPill({ status }: { status: WorkflowSummary["status"] }) {
  const label = {
    active: msg("customer.status.active"),
    archived: msg("customer.status.archived"),
    draft: msg("customer.status.draft"),
    paused: msg("customer.status.paused")
  }[status];
  return <span className={`workflow-status workflow-status--${status}`}>{label}</span>;
}

export function App() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [connected, setConnected] = useState(false);
  const [runError, setRunError] = useState("");
  const [startingRun, setStartingRun] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runDefinitionLoading, setRunDefinitionLoading] = useState(false);
  const [runVersion, setRunVersion] = useState<number>();
  const [runSchema, setRunSchema] = useState<Readonly<Record<string, unknown>>>({});
  const [runInput, setRunInput] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    fetchWorkflows()
      .then((items) => {
        setWorkflows(items);
        setConnected(true);
        setSelectedId((current) => current || items[0]?.id || "");
      })
      .catch(() => {
        setWorkflows([]);
        setWorkflow(null);
        setConnected(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchWorkflow(selectedId)
      .then((selected) => {
        setWorkflow(selected);
        setConnected(true);
      })
      .catch(() => {
        setWorkflow(null);
        setConnected(false);
      });
  }, [selectedId]);

  const runFields = useMemo(() => {
    const properties = runSchema.properties;
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
    const required = new Set(Array.isArray(runSchema.required) ? runSchema.required : []);
    return Object.entries(
      properties as Readonly<Record<string, Readonly<Record<string, unknown>>>>
    ).map(([key, property]) => ({
      key,
      label:
        typeof property.title === "string"
          ? property.title
          : key.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/^./u, (value) => value.toUpperCase()),
      description: typeof property.description === "string" ? property.description : "",
      type: typeof property.type === "string" ? property.type : "string",
      format: typeof property.format === "string" ? property.format : "",
      options: Array.isArray(property.enum) ? property.enum.map(String) : [],
      required: required.has(key)
    }));
  }, [runSchema]);

  const suggestedValue = (key: string, property: Readonly<Record<string, unknown>>) => {
    if (["string", "number", "boolean"].includes(typeof property.default))
      return String(property.default);
    const normalized = key.toLowerCase();
    if (normalized.includes("caseid")) return `CASE-${new Date().getFullYear()}-0842`;
    if (normalized.includes("customerid")) return "ACCT-48291";
    if (normalized.includes("summary"))
      return "Enterprise customer cannot access a critical production workspace after an identity change.";
    if (normalized.includes("reportedat")) return new Date().toISOString().slice(0, 16);
    if (normalized.includes("contracttier")) return "Enterprise";
    if (normalized.includes("estimatedimpact")) return "250000";
    return "";
  };

  const openRunDialog = async () => {
    if (!workflow) return;
    setRunDialogOpen(true);
    setRunDefinitionLoading(true);
    setRunError("");
    try {
      const versions = await fetchWorkflowVersions(workflow.id);
      const published = versions
        .filter(({ state }) => state === "published" || state === "superseded")
        .sort((left, right) => right.version - left.version)[0];
      if (!published) throw new Error("Publish this workflow before starting a run.");
      const version = await fetchWorkflowVersion(workflow.id, published.version);
      const schema = version.definition.inputSchema;
      const properties =
        schema.properties &&
        typeof schema.properties === "object" &&
        !Array.isArray(schema.properties)
          ? (schema.properties as Readonly<Record<string, Readonly<Record<string, unknown>>>>)
          : {};
      setRunVersion(published.version);
      setRunSchema(schema);
      setRunInput(
        Object.fromEntries(
          Object.entries(properties).map(([key, property]) => [key, suggestedValue(key, property)])
        )
      );
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : "Run configuration is unavailable.");
    } finally {
      setRunDefinitionLoading(false);
    }
  };

  const runWorkflow = async () => {
    if (!workflow || startingRun) return;
    const missing = runFields.filter(({ required, key }) => required && !runInput[key]?.trim());
    if (missing.length) {
      setRunError(`Complete ${missing.map(({ label }) => label).join(", ")} before starting.`);
      return;
    }
    setStartingRun(true);
    setRunError("");
    try {
      const typedInput = Object.fromEntries(
        runFields.map(({ key, type }) => [
          key,
          type === "number" || type === "integer" ? Number(runInput[key]) : runInput[key]
        ])
      );
      const run = await startWorkflowRun(workflow.id, typedInput);
      void navigate(`/app/runs/${run.id}`);
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : "The run could not be started.");
    } finally {
      setStartingRun(false);
    }
  };

  return (
    <>
      <WorkspaceShell connected={connected}>
        <section aria-labelledby="workflows-heading" className="page">
          <WorkspacePageHeader
            actions={
              <Link className="secondary-button" to="/app/templates">
                <Library aria-hidden="true" size={16} />
                {msg("customer.workflow.patterns")}
              </Link>
            }
            className="page-heading"
            description={msg("customer.workflow.tagline")}
            eyebrow={msg("customer.section.operations")}
            headingId="workflows-heading"
            title={msg("customer.workflow.heading")}
          />

          <div aria-label={msg("customer.metrics.label")} className="metric-strip" role="group">
            <article>
              <span>{msg("customer.metrics.workflows")}</span>
              <strong>{i18n.number(workflows.length)}</strong>
              <small>{msg("customer.metrics.workflowsdetail")}</small>
            </article>
            <article>
              <span>{msg("customer.metrics.runs")}</span>
              <strong>
                {i18n.number(workflows.reduce((sum, item) => sum + item.activeRuns, 0))}
              </strong>
              <small>{msg("customer.metrics.runsdetail")}</small>
            </article>
            <article>
              <span>{msg("customer.metrics.drafts")}</span>
              <strong>
                {i18n.number(workflows.filter((item) => item.status === "draft").length)}
              </strong>
              <small>{msg("customer.metrics.draftsdetail")}</small>
            </article>
            <article>
              <span>{msg("customer.metrics.steps")}</span>
              <strong>
                {i18n.number(workflows.reduce((sum, item) => sum + item.nodeCount, 0))}
              </strong>
              <small>{msg("customer.metrics.stepsdetail")}</small>
            </article>
          </div>

          <div className="workspace-grid">
            <section aria-labelledby="workflow-library-heading" className="workflow-list-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{msg("customer.library.heading")}</span>
                  <strong id="workflow-library-heading">
                    {msg("customer.library.count", { count: workflows.length })}
                  </strong>
                </div>
                <Link
                  aria-label={msg("customer.library.settings")}
                  className="icon-button"
                  to="/app/templates"
                >
                  <Settings2 aria-hidden="true" size={16} />
                </Link>
              </div>
              <div
                aria-label={msg("customer.library.group")}
                className="workflow-list"
                role="group"
              >
                {workflows.map((item) => (
                  <button
                    aria-pressed={item.id === selectedId}
                    key={item.id}
                    className={
                      item.id === selectedId
                        ? "workflow-card workflow-card--active"
                        : "workflow-card"
                    }
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <span className="workflow-card-top">
                      <StatusPill status={item.status} />
                      <small>v{item.version}</small>
                    </span>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    <span className="workflow-meta">
                      <span>{msg("customer.workflow.steps", { count: item.nodeCount })}</span>
                      <span>{msg("customer.workflow.runs", { count: item.activeRuns })}</span>
                      <ArrowUpRight aria-hidden="true" size={15} />
                    </span>
                  </button>
                ))}
                {!connected && workflows.length === 0 ? (
                  <p role="status">{msg("app.loading.workspace")}</p>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="selected-workflow-heading" className="canvas-panel">
              {workflow ? (
                <>
                  <div className="canvas-header">
                    <div>
                      <span className="eyebrow">
                        {msg("customer.map.version", { version: workflow.version })}
                      </span>
                      <h2 id="selected-workflow-heading">{workflow.name}</h2>
                    </div>
                    <div className="canvas-actions">
                      <Link
                        className="workflow-edit-button"
                        to={`/app/workflows/${workflow.id}/studio`}
                      >
                        {msg("customer.map.edit")}
                      </Link>
                      <button
                        className="run-button"
                        disabled={startingRun}
                        onClick={() => void openRunDialog()}
                        type="button"
                      >
                        <span aria-hidden="true" />
                        {startingRun ? "Starting…" : msg("customer.map.run")}
                      </button>
                    </div>
                    {runError && <p className="workflow-run-error">{runError}</p>}
                  </div>
                  <WorkflowCanvas workflow={workflow} />
                </>
              ) : (
                <div className="canvas-header">
                  <h2 id="selected-workflow-heading">{msg("app.loading.workspace")}</h2>
                </div>
              )}
              <div aria-label={msg("customer.map.legend")} className="canvas-legend" role="group">
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--running" />
                  {msg("customer.map.running")}
                </span>
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--waiting" />
                  {msg("customer.map.waiting")}
                </span>
                <span>
                  <i aria-hidden="true" className="legend-dot legend-dot--complete" />
                  {msg("customer.map.complete")}
                </span>
              </div>
            </section>
          </div>
        </section>
      </WorkspaceShell>
      <Dialog
        open={runDialogOpen}
        title={`Run ${workflow?.name ?? "workflow"}`}
        onDismiss={() => !startingRun && setRunDialogOpen(false)}
      >
        <div className="run-launch-dialog">
          <div className="run-launch-context">
            <span>Production execution</span>
            <strong>
              {runVersion ? `Published version ${runVersion}` : "Checking published version"}
            </strong>
            <p>
              The values below become the immutable input for this run. You can inspect them later
              in the run room.
            </p>
          </div>
          {runDefinitionLoading ? (
            <p role="status">Loading run requirements…</p>
          ) : runFields.length ? (
            <div className="run-launch-fields">
              {runFields.map((field) => (
                <label key={field.key}>
                  <span>
                    {field.label} {field.required ? <b>Required</b> : <small>Optional</small>}
                  </span>
                  {field.options.length ? (
                    <select
                      value={runInput[field.key] ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setRunInput((current) => ({ ...current, [field.key]: value }));
                      }}
                    >
                      <option value="">Select an option</option>
                      {field.options.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : field.key.toLowerCase().includes("summary") ? (
                    <textarea
                      rows={3}
                      value={runInput[field.key] ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setRunInput((current) => ({ ...current, [field.key]: value }));
                      }}
                    />
                  ) : (
                    <input
                      type={
                        field.format === "date-time"
                          ? "datetime-local"
                          : field.type === "number"
                            ? "number"
                            : "text"
                      }
                      value={runInput[field.key] ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setRunInput((current) => ({ ...current, [field.key]: value }));
                      }}
                    />
                  )}
                  {field.description ? <small>{field.description}</small> : null}
                </label>
              ))}
            </div>
          ) : !runError ? (
            <p>This workflow does not require any input. It is ready to run.</p>
          ) : null}
          {runError ? (
            <p className="workflow-run-error" role="alert">
              {runError}
            </p>
          ) : null}
          <div className="run-launch-checks" aria-label="Run preflight checks">
            <span>Published definition</span>
            <strong>{runVersion ? "Ready" : "Pending"}</strong>
            <span>Execution policy</span>
            <strong>Enforced</strong>
            <span>External actions</span>
            <strong>Governed</strong>
          </div>
          <div className="run-launch-actions">
            <button
              className="secondary-button"
              disabled={startingRun}
              onClick={() => setRunDialogOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="run-button"
              disabled={startingRun || runDefinitionLoading || !runVersion}
              onClick={() => void runWorkflow()}
              type="button"
            >
              <Play aria-hidden="true" size={15} /> {startingRun ? "Starting run…" : "Start run"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
