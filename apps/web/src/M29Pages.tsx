import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { CreditCard, Gauge, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createBudget,
  fetchBillingSummary,
  fetchBudgets,
  fetchUsageSummary,
  setSpendStop,
  type BillingSummary,
  type BudgetSummary,
  type UsageSummary
} from "./api.js";
import { msg } from "./i18n.js";
import "./M29Pages.css";
export function BillingPage() {
  const [billing, setBilling] = useState<BillingSummary>(),
    [usage, setUsage] = useState<UsageSummary>(),
    [budgets, setBudgets] = useState<readonly BudgetSummary[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([fetchBillingSummary(), fetchUsageSummary(), fetchBudgets()])
      .then(([b, u, items]) => {
        setBilling(b);
        setUsage(u);
        setBudgets(items);
      })
      .catch((e) => setError(e instanceof Error ? e.message : msg("billing.error")));
  }, []);
  if (error)
    return (
      <main className="page-shell billing-shell">
        <ErrorState title={msg("billing.error")}>{error}</ErrorState>
      </main>
    );
  if (!billing || !usage)
    return (
      <main className="page-shell billing-shell">
        <Skeleton label={msg("billing.loading")} />
      </main>
    );
  const add = async () =>
    setBudgets([
      ...budgets,
      await createBudget({
        name: msg("billing.budget.default"),
        currency: "USD",
        amount: "500.00",
        mode: "hard",
        period: "monthly",
        scope: {}
      })
    ]);
  return (
    <main className="page-shell billing-shell">
      <header>
        <Badge tone="accent">
          <CreditCard aria-hidden />
          {msg("billing.badge")}
        </Badge>
        <h1>{msg("billing.heading")}</h1>
        <p>{msg("billing.body")}</p>
      </header>
      <section className="billing-grid">
        <Card>
          <h2>{msg("billing.plan")}</h2>
          <strong>{billing.subscription?.planName ?? msg("billing.plan.none")}</strong>
          <p>{billing.subscription?.state ?? billing.providerState}</p>
          <small>{msg("billing.no.cards")}</small>
        </Card>
        <Card>
          <h2>
            <Gauge aria-hidden />
            {msg("billing.usage")}
          </h2>
          {usage.partial ? (
            <EmptyState title={msg("billing.usage.empty")}>
              {msg("billing.usage.empty.body")}
            </EmptyState>
          ) : (
            <dl>
              {usage.dimensions.map((item) => (
                <div key={item.meter}>
                  <dt>{item.meter}</dt>
                  <dd>
                    {item.quantity} {item.unit} · {item.currency} {item.amount}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <small>
            {msg("billing.fresh", { date: usage.freshThrough ?? msg("billing.not.available") })}
          </small>
        </Card>
      </section>
      <section>
        <div className="section-heading">
          <h2>{msg("billing.budgets")}</h2>
          <Button onClick={() => void add()}>{msg("billing.budget.add")}</Button>
        </div>
        {budgets.length ? (
          <div className="billing-grid">
            {budgets.map((b) => (
              <Card key={b.id}>
                <Badge tone={b.mode === "hard" ? "warning" : "neutral"}>{b.mode}</Badge>
                <h3>{b.name}</h3>
                <p>
                  {b.currency} {b.amount} / {b.period}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title={msg("billing.budget.empty")}>
            {msg("billing.budget.empty.body")}
          </EmptyState>
        )}
        <Button tone="danger" onClick={() => void setSpendStop(true, msg("billing.stop.reason"))}>
          <ShieldAlert aria-hidden />
          {msg("billing.stop")}
        </Button>
      </section>
      <section>
        <h2>{msg("billing.invoices")}</h2>
        {billing.invoices.length ? (
          billing.invoices.map((i) => (
            <Card key={i.id}>
              {i.currency} {i.total} · {i.state}
            </Card>
          ))
        ) : (
          <p>{msg("billing.invoices.empty")}</p>
        )}
      </section>
    </main>
  );
}
export const UsagePage = BillingPage;
