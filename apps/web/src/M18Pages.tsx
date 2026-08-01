import { Badge, Button, Card, EmptyState, Skeleton } from "@knotline/ui";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  createAgentRelease,
  createEvaluationDataset,
  fetchEvaluationComparisons,
  fetchEvaluationDatasets,
  type EvaluationComparisonView,
  type EvaluationDatasetView
} from "./api.js";
import { msg } from "./i18n.js";
import "./M18Pages.css";

const suiteId = "a1800000-0000-4000-8000-000000000001";

export function AgentEvaluationsPage() {
  const { agentId = "" } = useParams();
  const [datasets, setDatasets] = useState<EvaluationDatasetView[]>();
  const [comparisons, setComparisons] = useState<EvaluationComparisonView[]>();
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    () =>
      Promise.all([fetchEvaluationDatasets(), fetchEvaluationComparisons(agentId)]).then(
        ([nextDatasets, nextComparisons]) => {
          setDatasets([...nextDatasets]);
          setComparisons([...nextComparisons]);
        }
      ),
    [agentId]
  );
  useEffect(() => void load(), [load]);
  if (!datasets || !comparisons) return <Skeleton label={msg("eval.loading")} />;
  const comparison = comparisons[0];
  const releaseInput = (channel: "canary" | "stable") => ({
    environment: "production",
    channel,
    canaryPercentage: channel === "canary" ? 10 : 100,
    comparisonId: comparison?.id,
    gate: {
      requiredSuiteIds: [suiteId],
      minimumScore: 0.8,
      maximumRegression: 0.05,
      minimumSampleSize: 30,
      blockSafetyFailures: true,
      riskClass: "high"
    },
    gateDecision: comparison?.gate_decision
  });
  return (
    <main className="evaluation-page">
      <header>
        <div>
          <Link to={`/app/agents/${agentId}`}>{msg("eval.back")}</Link>
          <Badge tone="accent">{msg("eval.badge")}</Badge>
          <h1>{msg("eval.heading")}</h1>
          <p>{msg("eval.body")}</p>
        </div>
        <div className="evaluation-actions">
          <Button
            disabled={!comparison?.gate_decision?.passed}
            onClick={() =>
              void createAgentRelease(
                agentId,
                comparison?.candidate_version ?? 1,
                releaseInput("canary")
              ).then(({ id }) => setNotice(msg("eval.canary.notice", { id })))
            }
          >
            {msg("eval.canary")}
          </Button>
          <Button
            disabled={!comparison?.gate_decision?.passed}
            onClick={() =>
              void createAgentRelease(
                agentId,
                comparison?.candidate_version ?? 1,
                releaseInput("stable")
              ).then(({ id }) => setNotice(msg("eval.promote.notice", { id })))
            }
          >
            {msg("eval.promote")}
          </Button>
        </div>
      </header>
      <form
        className="evaluation-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createEvaluationDataset({
            name,
            description: msg("eval.dataset.default.description")
          }).then(async () => {
            setName("");
            setNotice(msg("eval.dataset.created"));
            await load();
          });
        }}
      >
        <label>
          <span>{msg("eval.dataset.name")}</span>
          <input required value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <Button type="submit">{msg("eval.dataset.create")}</Button>
      </form>
      <section className="evaluation-grid" aria-label={msg("eval.datasets")}>
        {datasets.map((dataset) => (
          <Card key={dataset.id}>
            <Badge tone="accent">{dataset.state}</Badge>
            <h2>{dataset.name}</h2>
            <p>{dataset.description}</p>
            <small>{msg("eval.dataset.cases", { count: dataset.case_count ?? 0 })}</small>
          </Card>
        ))}
      </section>
      {comparison ? (
        <Card>
          <h2>{msg("eval.comparison")}</h2>
          <div className="metric-grid">
            <div>
              <span>{msg("eval.baseline")}</span>
              <strong>{percent(comparison.summary.baselineScore)}</strong>
            </div>
            <div>
              <span>{msg("eval.candidate")}</span>
              <strong>{percent(comparison.summary.candidateScore)}</strong>
            </div>
            <div>
              <span>{msg("eval.delta")}</span>
              <strong>{percent(comparison.summary.delta)}</strong>
            </div>
            <div>
              <span>{msg("eval.sample")}</span>
              <strong>{comparison.summary.sampleSize}</strong>
            </div>
          </div>
          <p>
            {msg("eval.confidence", {
              low: percent(comparison.summary.confidence95[0]),
              high: percent(comparison.summary.confidence95[1])
            })}
          </p>
          {comparison.summary.lowSample ? (
            <Badge tone="warning">{msg("eval.low.sample")}</Badge>
          ) : null}
          <Badge tone={comparison.gate_decision?.passed ? "success" : "danger"}>
            {comparison.gate_decision?.passed ? msg("eval.gate.passed") : msg("eval.gate.blocked")}
          </Badge>
          <h3>{msg("eval.regressions")}</h3>
          <ul className="evaluation-regressions">
            {comparison.summary.regressions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title={msg("eval.empty")}>
          <p>{msg("eval.empty.body")}</p>
        </EmptyState>
      )}
      <p aria-live="polite">{notice}</p>
    </main>
  );
}

export function AgentActivityPage() {
  const { agentId = "" } = useParams();
  const [notice, setNotice] = useState("");
  return (
    <main className="evaluation-page">
      <header>
        <div>
          <Link to={`/app/agents/${agentId}`}>{msg("eval.back")}</Link>
          <Badge tone="warning">{msg("activity.badge")}</Badge>
          <h1>{msg("activity.heading")}</h1>
          <p>{msg("activity.body")}</p>
        </div>
      </header>
      <div className="evaluation-grid">
        <Card>
          <h2>{msg("activity.release")}</h2>
          <p>{msg("activity.release.body")}</p>
          <Button
            onClick={() =>
              void createAgentRelease(agentId, 2, {
                rollbackReleaseId: "a1800000-0000-4000-8000-000000000099"
              }).then(({ id }) => setNotice(msg("activity.rollback.notice", { id })))
            }
          >
            {msg("activity.rollback")}
          </Button>
        </Card>
        <Card>
          <h2>{msg("activity.monitoring")}</h2>
          <p>{msg("activity.monitoring.body")}</p>
          <Badge tone="warning">{msg("eval.low.sample")}</Badge>
        </Card>
      </div>
      <p aria-live="polite">{notice}</p>
    </main>
  );
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
