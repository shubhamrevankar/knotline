import { Badge, Button, Card } from "@knotline/ui";
import { Activity, Flag, ShieldAlert, Siren } from "lucide-react";
import "./M34Pages.css";
const services = [
  {
    name: "Web and API",
    state: "healthy",
    detail: "Synthetic sign-in and workflow canary passing"
  },
  { name: "Workflow runtime", state: "healthy", detail: "Queue lag within objective" },
  {
    name: "Notifications",
    state: "degraded",
    detail: "Fixture provider latency elevated; email remains queued"
  },
  { name: "Public API", state: "healthy", detail: "Error budget available" }
];
export function OperatorConsole() {
  return (
    <main className="operator-console">
      <header>
        <Badge tone="warning">
          <ShieldAlert aria-hidden />
          Isolated operator plane
        </Badge>
        <h1>Health, incidents, and safe controls</h1>
        <p>
          Workspace sessions cannot reach this surface. Repairs and kill switches require duty
          scope, ticket, recent step-up, preview, and immutable audit.
        </p>
      </header>
      <section className="operator-metrics">
        <Card>
          <strong>99.97%</strong>
          <span>Journey availability</span>
        </Card>
        <Card>
          <strong>0.42×</strong>
          <span>30-day error-budget burn</span>
        </Card>
        <Card>
          <strong>14 s</strong>
          <span>Oldest runnable work</span>
        </Card>
        <Card>
          <strong>0</strong>
          <span>Unowned critical alerts</span>
        </Card>
      </section>
      <section className="operator-grid">
        <Card>
          <h2>
            <Activity aria-hidden />
            Service health
          </h2>
          {services.map((item) => (
            <div className="operator-row" key={item.name}>
              <span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
              <Badge tone={item.state === "healthy" ? "success" : "warning"}>{item.state}</Badge>
            </div>
          ))}
        </Card>
        <Card>
          <h2>
            <Siren aria-hidden />
            Active incidents
          </h2>
          <p>
            No declared production incident. Deterministic staging game-day fixtures remain
            available.
          </p>
          <Button>Start incident record</Button>
        </Card>
        <Card>
          <h2>
            <Flag aria-hidden />
            Kill switches
          </h2>
          <p>All controls default to safe and expire automatically.</p>
          <Button tone="danger">Preview connector quarantine</Button>
        </Card>
        <Card>
          <h2>Repair queue</h2>
          <p>Two stuck-work fixtures await a scoped, idempotent preview. No action has executed.</p>
          <Button>Open repair preview</Button>
        </Card>
      </section>
    </main>
  );
}
export function FeatureAccessPage() {
  return (
    <main className="page-shell operator-console">
      <Badge tone="accent">
        <Flag aria-hidden />
        Feature access
      </Badge>
      <h1>Controlled feature rollout</h1>
      <p>
        Every flag has an owner, purpose, cohort, expiry, dependency, safe default, audit record,
        and cleanup date.
      </p>
      <section className="operator-grid">
        <Card>
          <h2>Agent evaluations</h2>
          <Badge tone="success">Enabled</Badge>
          <p>Workspace-wide release policy.</p>
        </Card>
        <Card>
          <h2>External provider writes</h2>
          <Badge tone="warning">Fixture only</Badge>
          <p>Real provider credentials remain externally gated.</p>
        </Card>
      </section>
    </main>
  );
}
