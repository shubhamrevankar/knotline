import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { BarChart3, Download, Search, Share2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
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
    <main className="page-shell insight-shell">
      <header>
        <Badge tone="accent">
          <BarChart3 aria-hidden />
          {msg("analytics.badge")}
        </Badge>
        <h1>{msg("analytics.heading")}</h1>
        <p>{msg("analytics.body")}</p>
      </header>
      {error ? <ErrorState title={msg("analytics.error")}>{error}</ErrorState> : null}
      {!data ? (
        <Skeleton label={msg("analytics.loading")} />
      ) : (
        <>
          <Card className="freshness">
            <strong>{data.partial ? msg("analytics.partial") : msg("analytics.fresh")}</strong>
            <span>
              {data.freshThrough
                ? new Date(data.freshThrough).toLocaleString()
                : msg("analytics.no.data")}
            </span>
            <small>{msg("analytics.demo.excluded")}</small>
          </Card>
          <section className="metric-grid">
            {data.metrics.map((metric, index) => (
              <Card key={`${visibleText(metric.metricKey, "metric")}-${index}`}>
                <small>{visibleText(metric.metricKey, msg("analytics.metric"))}</small>
                <strong>{visibleText(metric.value, msg("analytics.unavailable"))}</strong>
                <span>
                  {msg("analytics.contributors", {
                    count:
                      typeof metric.contributingCount === "number"
                        ? String(metric.contributingCount)
                        : "0"
                  })}
                </span>
              </Card>
            ))}
          </section>
          {!data.metrics.length ? (
            <EmptyState title={msg("analytics.empty")}>
              <p>{msg("analytics.empty.body")}</p>
            </EmptyState>
          ) : null}
        </>
      )}
      <section>
        <div className="section-heading">
          <h2>{msg("analytics.reports")}</h2>
          <Button tone="accent" onClick={() => void add()}>
            {msg("analytics.report.create")}
          </Button>
        </div>
        <div className="report-list">
          {reports.map((report) => (
            <Card key={report.id}>
              <Share2 aria-hidden />
              <h3>{report.name}</h3>
              <p>
                {msg("analytics.report.meta", {
                  visibility: report.visibility,
                  state: report.state
                })}
              </p>
              <Link to={`/app/analytics/reports/${report.id}`}>{msg("analytics.report.open")}</Link>
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
