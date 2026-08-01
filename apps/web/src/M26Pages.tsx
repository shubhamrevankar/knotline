import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { Activity, CalendarClock, Pause, Play, Send, Webhook } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  createWorkflowTrigger,
  fetchTriggerDeliveries,
  fetchWorkflowTriggers,
  sendTriggerTestEvent,
  transitionWorkflowTrigger,
  type TriggerDelivery,
  type WorkflowTriggerSummary
} from "./api.js";
import { msg } from "./i18n.js";
import "./M26Pages.css";

export function WorkflowTriggersPage() {
  const { workflowId = "" } = useParams();
  const [items, setItems] = useState<readonly WorkflowTriggerSummary[]>([]);
  const [deliveries, setDeliveries] = useState<readonly TriggerDelivery[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await fetchWorkflowTriggers(workflowId);
    setItems(data);
    setSelected((value) => value || data[0]?.id || "");
  }, [workflowId]);
  useEffect(() => {
    let active = true;
    void fetchWorkflowTriggers(workflowId)
      .then((data) => {
        if (!active) return;
        setItems(data);
        setSelected((value) => value || data[0]?.id || "");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : msg("triggers.error"));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [workflowId]);
  useEffect(() => {
    if (!selected) return;
    void fetchTriggerDeliveries(selected)
      .then(setDeliveries)
      .catch(() => setDeliveries([]));
  }, [selected]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    const kind = field("kind");
    const schedule =
      kind === "schedule"
        ? {
            cron: field("cron"),
            timeZone: field("timeZone"),
            dstPolicy: "skip_gap",
            missedPolicy: "latest",
            jitterSeconds: 30
          }
        : undefined;
    try {
      setError("");
      await createWorkflowTrigger(workflowId, {
        type: kind,
        environment: "test",
        schemaVersion: "1.0",
        filter: [],
        mappings: {},
        deduplication: "event_id",
        concurrency: 4,
        ratePerMinute: 60,
        configuration: { retentionDays: 7 },
        schedule
      });
      setStatus(msg("triggers.created"));
      await load();
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("triggers.error"));
    }
  };
  const toggle = async (item: WorkflowTriggerSummary) => {
    try {
      await transitionWorkflowTrigger(item.id, item.state !== "enabled");
      setStatus(item.state === "enabled" ? msg("triggers.paused") : msg("triggers.enabled"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("triggers.error"));
    }
  };
  const test = async (item: WorkflowTriggerSummary) => {
    try {
      const result = await sendTriggerTestEvent(item.id);
      setStatus(msg("triggers.test.queued", { state: result.state }));
      setDeliveries(await fetchTriggerDeliveries(item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("triggers.error"));
    }
  };
  return (
    <main className="page-shell trigger-shell">
      <header>
        <Badge tone="accent">{msg("triggers.badge")}</Badge>
        <h1>{msg("triggers.heading")}</h1>
        <p>{msg("triggers.body")}</p>
      </header>
      {busy ? <Skeleton label={msg("triggers.loading")} /> : null}
      {error ? <ErrorState title={msg("triggers.error")}>{error}</ErrorState> : null}
      {status ? (
        <p role="status" className="trigger-status">
          {status}
        </p>
      ) : null}
      <section className="trigger-layout">
        <div>
          <h2>{msg("triggers.configured")}</h2>
          <div className="trigger-list">
            {items.map((item) => (
              <Card key={item.id}>
                <button
                  className="trigger-select"
                  onClick={() => setSelected(item.id)}
                  type="button"
                >
                  <span>
                    {item.kind === "schedule" ? (
                      <CalendarClock aria-hidden />
                    ) : (
                      <Webhook aria-hidden />
                    )}
                    <strong>{item.triggerKey}</strong>
                  </span>
                  <Badge tone={item.state === "enabled" ? "success" : "neutral"}>
                    {item.state}
                  </Badge>
                </button>
                <dl>
                  <div>
                    <dt>{msg("triggers.version")}</dt>
                    <dd>
                      v{item.version} · {item.environment}
                    </dd>
                  </div>
                  <div>
                    <dt>{msg("triggers.health")}</dt>
                    <dd>
                      {item.errorCount ?? 0} {msg("triggers.errors")} · {item.backlogCount ?? 0}{" "}
                      {msg("triggers.queued")}
                    </dd>
                  </div>
                  {item.cron ? (
                    <div>
                      <dt>{msg("triggers.schedule")}</dt>
                      <dd>
                        <code>{item.cron}</code> · {item.timeZone}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="trigger-actions">
                  <Button onClick={() => void toggle(item)}>
                    {item.state === "enabled" ? <Pause aria-hidden /> : <Play aria-hidden />}
                    {item.state === "enabled" ? msg("triggers.pause") : msg("triggers.enable")}
                  </Button>
                  <Button
                    disabled={item.environment !== "test" || item.state !== "enabled"}
                    onClick={() => void test(item)}
                  >
                    <Send aria-hidden />
                    {msg("triggers.test")}
                  </Button>
                </div>
                {item.disabledReason ? <small>{item.disabledReason}</small> : null}
              </Card>
            ))}
          </div>
          {!busy && !items.length ? (
            <EmptyState title={msg("triggers.empty")}>
              <p>{msg("triggers.empty.body")}</p>
            </EmptyState>
          ) : null}
        </div>
        <aside>
          <Card>
            <h2>{msg("triggers.add")}</h2>
            <form onSubmit={(event) => void create(event)}>
              <label>
                {msg("triggers.type")}
                <select name="kind">
                  <option value="manual">{msg("triggers.type.manual")}</option>
                  <option value="schedule">{msg("triggers.type.schedule")}</option>
                  <option value="signed_webhook">{msg("triggers.type.webhook")}</option>
                  <option value="connector_event">{msg("triggers.type.connector")}</option>
                  <option value="parent_workflow">{msg("triggers.type.parent")}</option>
                </select>
              </label>
              <label>
                {msg("triggers.cron")}
                <input defaultValue="0 9 * * 1-5" name="cron" />
              </label>
              <label>
                {msg("triggers.timezone")}
                <input defaultValue="Asia/Kolkata" name="timeZone" />
              </label>
              <Button tone="accent" type="submit">
                {msg("triggers.create")}
              </Button>
            </form>
          </Card>
          <Card>
            <h2>
              <Activity aria-hidden />
              {msg("triggers.deliveries")}
            </h2>
            {deliveries.length ? (
              <ol className="delivery-list">
                {deliveries.map((delivery) => (
                  <li key={delivery.id}>
                    <strong>{delivery.state}</strong>
                    <span>
                      {delivery.provider} · {delivery.sourceId}
                    </span>
                    <time dateTime={delivery.receivedAt}>
                      {new Date(delivery.receivedAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p>{msg("triggers.deliveries.empty")}</p>
            )}
          </Card>
        </aside>
      </section>
    </main>
  );
}
