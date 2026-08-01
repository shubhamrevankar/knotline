import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { Code2, KeyRound, Webhook } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createApiCredential,
  createDeveloperWebhook,
  createServicePrincipal,
  fetchDeveloperWebhooks,
  fetchServicePrincipals,
  type DeveloperWebhook,
  type ServicePrincipal
} from "./api.js";
import { msg } from "./i18n.js";
import "./M30Pages.css";
export function DeveloperPlatformPage() {
  const [principals, setPrincipals] = useState<readonly ServicePrincipal[]>(),
    [hooks, setHooks] = useState<readonly DeveloperWebhook[]>(),
    [secret, setSecret] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([fetchServicePrincipals(), fetchDeveloperWebhooks()])
      .then(([p, h]) => {
        setPrincipals(p);
        setHooks(h);
      })
      .catch((e) => setError(e instanceof Error ? e.message : msg("developer.error")));
  }, []);
  if (error)
    return (
      <main className="page-shell developer-shell">
        <ErrorState title={msg("developer.error")}>{error}</ErrorState>
      </main>
    );
  if (!principals || !hooks)
    return (
      <main className="page-shell developer-shell">
        <Skeleton label={msg("developer.loading")} />
      </main>
    );
  const addPrincipal = async () => {
    const p = await createServicePrincipal({
      name: msg("developer.principal.default"),
      purpose: msg("developer.principal.purpose"),
      role: "automation",
      scopes: ["runs:read", "runs:start"],
      resourceRestrictions: {},
      environment: "test",
      expiresAt: new Date(Date.now() + 86400000 * 90).toISOString()
    });
    setPrincipals([...principals, p]);
    const credential = await createApiCredential(p.id, {
      environment: "test",
      expiresAt: new Date(Date.now() + 86400000 * 90).toISOString()
    });
    setSecret(String(credential.token ?? ""));
  };
  const addHook = async () =>
    setHooks([
      ...hooks,
      await createDeveloperWebhook({
        name: msg("developer.webhook.default"),
        endpointUrl: "https://example.test/knotline-events",
        eventTypes: ["run.succeeded", "run.failed"]
      })
    ]);
  return (
    <main className="page-shell developer-shell">
      <header>
        <Badge tone="accent">
          <Code2 aria-hidden />
          {msg("developer.badge")}
        </Badge>
        <h1>{msg("developer.heading")}</h1>
        <p>{msg("developer.body")}</p>
      </header>
      {secret ? (
        <Card>
          <Badge tone="warning">{msg("developer.secret.once")}</Badge>
          <code>{secret}</code>
          <p>{msg("developer.secret.warning")}</p>
        </Card>
      ) : null}
      <section>
        <div className="section-heading">
          <h2>
            <KeyRound aria-hidden />
            {msg("developer.principals")}
          </h2>
          <Button onClick={() => void addPrincipal()}>{msg("developer.principal.add")}</Button>
        </div>
        {principals.length ? (
          <div className="developer-grid">
            {principals.map((p) => (
              <Card key={p.id}>
                <Badge tone={p.environment === "live" ? "warning" : "neutral"}>
                  {p.environment}
                </Badge>
                <h3>{p.name}</h3>
                <p>{p.purpose}</p>
                <code>{p.scopes.join(" · ")}</code>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title={msg("developer.principals.empty")}>
            {msg("developer.principals.empty.body")}
          </EmptyState>
        )}
      </section>
      <section>
        <div className="section-heading">
          <h2>
            <Webhook aria-hidden />
            {msg("developer.webhooks")}
          </h2>
          <Button onClick={() => void addHook()}>{msg("developer.webhook.add")}</Button>
        </div>
        {hooks.length ? (
          <div className="developer-grid">
            {hooks.map((h) => (
              <Card key={h.id}>
                <Badge tone="neutral">{h.state}</Badge>
                <h3>{h.name}</h3>
                <code>{h.endpointUrl}</code>
                <p>{h.eventTypes.join(" · ")}</p>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title={msg("developer.webhooks.empty")}>
            {msg("developer.webhooks.empty.body")}
          </EmptyState>
        )}
      </section>
      <section>
        <h2>{msg("developer.quickstart")}</h2>
        <pre>
          <code>{`curl -H "Authorization: Bearer $KNOTLINE_TOKEN" \\\n  https://api.example.test/public/v1/health`}</code>
        </pre>
        <p>{msg("developer.compatibility")}</p>
      </section>
    </main>
  );
}
