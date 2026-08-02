import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Clock3,
  Download,
  Gauge,
  Search,
  Share2,
  Sparkles,
  Waypoints,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { WorkspacePageHeader } from "./WorkspacePageHeader.js";
import {
  createReport,
  createSavedView,
  exportReport,
  fetchAnalytics,
  fetchReport,
  fetchReports,
  fetchSavedViews,
  searchWorkspace,
  type ReportSummary,
  type SavedView,
  type SearchResult
} from "./api.js";
import { msg } from "./i18n.js";
import "./M28Pages.css";
const visibleText = (value: unknown, fallback: string) =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

export function GlobalSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [views, setViews] = useState<readonly SavedView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetchSavedViews()
      .then((data) => active && setViews(data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await searchWorkspace(query));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("search.error"));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const view = await createSavedView({
      name: msg("search.saved.name", { query }),
      resourceType: "run",
      visibility: "private",
      definition: {
        filters: { query },
        sort: ["updatedAt:desc"],
        columns: ["title", "type", "updatedAt"]
      }
    });
    setViews([...views, view]);
  };
  return (
    <main className="page-shell insight-shell">
      <header>
        <Badge tone="accent">
          <Search aria-hidden />
          {msg("search.badge")}
        </Badge>
        <h1>{msg("search.heading")}</h1>
        <p>{msg("search.body")}</p>
      </header>
      <form className="global-search" onSubmit={(event) => void submit(event)}>
        <label>
          <span>{msg("search.label")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={msg("search.placeholder")}
          />
        </label>
        <Button tone="accent" type="submit">
          {msg("search.submit")}
        </Button>
      </form>
      {busy ? <Skeleton label={msg("search.loading")} /> : null}
      {error ? <ErrorState title={msg("search.error")}>{error}</ErrorState> : null}
      {results.length ? (
        <section>
          <div className="section-heading">
            <h2>{msg("search.results")}</h2>
            <Button onClick={() => void save()}>{msg("search.save")}</Button>
          </div>
          <div className="search-results">
            {results.map((result) => (
              <Card key={result.id}>
                <Badge tone="neutral">{result.resourceType}</Badge>
                <h3>
                  {visibleText(
                    result.fields.title ?? result.fields.name,
                    msg("search.result.untitled")
                  )}
                </h3>
                <p>{visibleText(result.fields.summary, msg("search.result.authorized"))}</p>
                <Link to={`/app/${result.resourceType}s/${result.resourceId}`}>
                  {msg("search.open")}
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ) : !busy && query ? (
        <EmptyState title={msg("search.empty")}>
          <p>{msg("search.empty.body")}</p>
        </EmptyState>
      ) : null}
      <aside>
        <h2>{msg("search.views")}</h2>
        {views.length ? (
          <ul>
            {views.map((view) => (
              <li key={view.id}>
                <strong>{view.name}</strong>
                <small>
                  {msg("search.view.meta", {
                    visibility: view.visibility,
                    version: String(view.schemaVersion)
                  })}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>{msg("search.views.empty")}</p>
        )}
      </aside>
    </main>
  );
}

type AnalyticsData = {
  metrics: readonly Readonly<Record<string, unknown>>[];
  freshThrough: string | null;
  partial: boolean;
  demoExcluded: boolean;
};

type MetricPresentation = {
  readonly label: Parameters<typeof msg>[0];
  readonly format: "percent" | "count" | "minutes" | "hours";
  readonly icon: LucideIcon;
};

const metricPresentation: Readonly<Record<string, MetricPresentation>> = {
  "workflow.success_rate": {
    label: "analytics.metric.workflow.success",
    format: "percent",
    icon: Gauge
  },
  "runs.in_progress": { label: "analytics.metric.runs.progress", format: "count", icon: Activity },
  "run.median_duration_minutes": {
    label: "analytics.metric.run.duration",
    format: "minutes",
    icon: Clock3
  },
  "task.sla_on_track": { label: "analytics.metric.task.sla", format: "percent", icon: Sparkles },
  "approvals.waiting": {
    label: "analytics.metric.approvals.waiting",
    format: "count",
    icon: Clock3
  },
  "agent.success_rate": { label: "analytics.metric.agent.success", format: "percent", icon: Bot },
  "hours.returned": { label: "analytics.metric.hours.returned", format: "hours", icon: Sparkles },
  "workflow.active": { label: "analytics.metric.workflow.active", format: "count", icon: Waypoints }
};

const metricDimensions = (metric: Readonly<Record<string, unknown>>) =>
  metric.dimensions && typeof metric.dimensions === "object"
    ? (metric.dimensions as Readonly<Record<string, unknown>>)
    : {};

const metricValue = (
  metric: Readonly<Record<string, unknown>>,
  format: MetricPresentation["format"]
) => {
  if (typeof metric.value !== "number") return msg("analytics.unavailable");
  if (format === "percent") return `${metric.value.toFixed(1)}%`;
  if (format === "minutes")
    return msg("analytics.value.minutes", { value: metric.value.toFixed(1) });
  if (format === "hours") return msg("analytics.value.hours", { value: metric.value.toFixed(1) });
  return Math.round(metric.value).toLocaleString();
};

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData>();
  const [reports, setReports] = useState<readonly ReportSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([fetchAnalytics(), fetchReports()])
      .then(([analytics, nextReports]) => {
        if (active) {
          setData(analytics);
          setReports(nextReports);
        }
      })
      .catch(
        (cause: unknown) =>
          active && setError(cause instanceof Error ? cause.message : msg("analytics.error"))
      );
    return () => {
      active = false;
    };
  }, []);
  const add = async () => {
    const report = await createReport({
      name: msg("analytics.report.default"),
      visibility: "private",
      definition: {
        metrics: ["workflow.success_rate", "task.sla_attention"],
        dimensions: ["workflow"],
        range: "30d",
        visualization: "table"
      }
    });
    setReports([report, ...reports]);
  };
  return (
    <main className="page-shell insight-shell pulse-page">
      <WorkspacePageHeader
        actions={
          <nav aria-label={msg("analytics.actions.label")}>
            <Link to="/app/runs">
              {msg("analytics.actions.runs")}
              <ArrowRight aria-hidden />
            </Link>
            <Link to="/app/workflows/new">
              {msg("analytics.actions.workflow")}
              <ArrowRight aria-hidden />
            </Link>
          </nav>
        }
        className="pulse-header"
        description={msg("analytics.body")}
        eyebrow={msg("workspace.section.pulse")}
        title={msg("analytics.heading")}
      />
      {error ? <ErrorState title={msg("analytics.error")}>{error}</ErrorState> : null}
      {!data ? (
        <Skeleton label={msg("analytics.loading")} />
      ) : (
        <>
          <section className="pulse-status" aria-label={msg("analytics.status.label")}>
            <div>
              <i aria-hidden />
              <span>
                <strong>{data.partial ? msg("analytics.partial") : msg("analytics.fresh")}</strong>
                <small>
                  {data.freshThrough
                    ? new Date(data.freshThrough).toLocaleString()
                    : msg("analytics.no.data")}
                </small>
              </span>
            </div>
            <p>
              {data.metrics.some((metric) => metricDimensions(metric).dataClass === "local_demo")
                ? msg("analytics.local.demo")
                : msg("analytics.demo.excluded")}
            </p>
          </section>
          <section aria-labelledby="pulse-overview-heading" className="pulse-overview">
            <div className="pulse-section-heading">
              <div>
                <span>{msg("analytics.overview.eyebrow")}</span>
                <h2 id="pulse-overview-heading">{msg("analytics.overview.heading")}</h2>
              </div>
              <small>{msg("analytics.overview.range")}</small>
            </div>
            <div className="metric-grid">
              {data.metrics.map((metric, index) => {
                const metricKey = visibleText(metric.metricKey, "metric");
                const presentation = metricPresentation[metricKey] ?? {
                  label: "analytics.metric",
                  format: "count" as const,
                  icon: Gauge
                };
                const dimensions = metricDimensions(metric);
                const trend = typeof dimensions.trend === "number" ? dimensions.trend : undefined;
                const TrendIcon = trend !== undefined && trend < 0 ? ArrowDownRight : ArrowUpRight;
                const Icon = presentation.icon;
                return (
                  <Card className="pulse-metric" key={`${metricKey}-${index}`}>
                    <div>
                      <span>
                        <Icon aria-hidden />
                      </span>
                      <small>{msg(presentation.label)}</small>
                    </div>
                    <strong>{metricValue(metric, presentation.format)}</strong>
                    <footer>
                      <span>
                        {msg("analytics.contributors", {
                          count:
                            typeof metric.contributingCount === "number"
                              ? String(metric.contributingCount)
                              : "0"
                        })}
                      </span>
                      {trend !== undefined ? (
                        <b
                          className={
                            dimensions.trendTone === "attention"
                              ? "pulse-trend pulse-trend--attention"
                              : "pulse-trend"
                          }
                        >
                          <TrendIcon aria-hidden />
                          {Math.abs(trend).toFixed(1)}%
                        </b>
                      ) : null}
                    </footer>
                  </Card>
                );
              })}
            </div>
          </section>
          {!data.metrics.length ? (
            <EmptyState title={msg("analytics.empty")}>
              <p>{msg("analytics.empty.body")}</p>
            </EmptyState>
          ) : null}
        </>
      )}
      <section className="pulse-reports">
        <div className="section-heading pulse-section-heading">
          <div>
            <span>{msg("analytics.reports.eyebrow")}</span>
            <h2>{msg("analytics.reports")}</h2>
          </div>
          <Button tone="accent" onClick={() => void add()}>
            {msg("analytics.report.create")}
          </Button>
        </div>
        <div className="report-list">
          {reports.map((report) => (
            <Card className="pulse-report" key={report.id}>
              <div>
                <span>
                  <Share2 aria-hidden />
                </span>
                <Badge tone="neutral">{report.visibility}</Badge>
              </div>
              <h3>{report.name}</h3>
              <p>{visibleText(report.definition.summary, msg("analytics.report.summary"))}</p>
              <footer>
                <span>
                  {report.updatedAt
                    ? msg("analytics.report.updated", {
                        date: new Date(report.updatedAt).toLocaleDateString()
                      })
                    : msg("analytics.report.meta", {
                        visibility: report.visibility,
                        state: report.state
                      })}
                </span>
                <Link to={`/app/analytics/reports/${report.id}`}>
                  {msg("analytics.report.open")}
                  <ArrowRight aria-hidden />
                </Link>
              </footer>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

export function ReportDetailPage() {
  const { reportId = "" } = useParams();
  const [report, setReport] = useState<ReportSummary>();
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    void fetchReport(reportId).then((data) => active && setReport(data));
    return () => {
      active = false;
    };
  }, [reportId]);
  if (!report)
    return (
      <main className="page-shell">
        <Skeleton label={msg("analytics.loading")} />
      </main>
    );
  return (
    <main className="page-shell insight-shell">
      <header>
        <Badge tone="accent">{msg("analytics.report.badge")}</Badge>
        <h1>{report.name}</h1>
        <p>{msg("analytics.report.freshness")}</p>
      </header>
      <Card>
        <h2>{msg("analytics.report.definition")}</h2>
        <pre>{JSON.stringify(report.definition, null, 2)}</pre>
      </Card>
      <Button
        tone="accent"
        onClick={() =>
          void exportReport(report.id).then(() => setStatus(msg("analytics.export.queued")))
        }
      >
        <Download aria-hidden />
        {msg("analytics.export")}
      </Button>
      {status ? <p role="status">{status}</p> : null}
    </main>
  );
}
