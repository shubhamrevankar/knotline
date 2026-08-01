import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { Activity, Cable, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  deleteConnection,
  fetchConnection,
  fetchConnectionSources,
  fetchConnections,
  fetchConnectorCatalog,
  requestConnectionSync,
  startConnectionAuthorization,
  transitionConnection,
  updateConnectionSources,
  type ConnectionSummary,
  type ConnectionSourceSurface,
  type ConnectorCatalogItem
} from "./api.js";
import { msg } from "./i18n.js";
import "./M22Pages.css";

const lastSegment = () => location.pathname.split("/").filter(Boolean).at(-1) ?? "";
const manifestText = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;
const healthTone = (state: string) =>
  state === "active"
    ? "success"
    : state === "degraded" || state === "reauthorization_required"
      ? "warning"
      : "neutral";

export function ConnectionsPage() {
  const [items, setItems] = useState<ConnectionSummary[]>([]);
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    void Promise.all([fetchConnections(), fetchConnectorCatalog()])
      .then(([connections, connectors]) => {
        setItems(connections);
        setCatalog(connectors);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("connections.error"))
      )
      .finally(() => setBusy(false));
  }, []);
  return (
    <main className="page-shell connection-shell">
      <header>
        <Badge tone="accent">{msg("connections.badge")}</Badge>
        <h1>{msg("connections.heading")}</h1>
        <p>{msg("connections.body")}</p>
      </header>
      {busy ? <Skeleton label={msg("connections.loading")} /> : null}
      {error ? <ErrorState title={msg("connections.error")}>{error}</ErrorState> : null}
      <section aria-labelledby="connected-heading">
        <h2 id="connected-heading">{msg("connections.connected")}</h2>
        <div className="connection-grid">
          {items.map((item) => (
            <a href={`/app/connections/${item.id}`} key={item.id}>
              <Card>
                <div className="connection-title">
                  <Cable aria-hidden />
                  <strong>{item.displayName}</strong>
                  <Badge tone={healthTone(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
                </div>
                <p>{item.accountLabel ?? msg("connections.account.pending")}</p>
                <small>{msg("connections.objects", { count: item.objectCount })}</small>
              </Card>
            </a>
          ))}
        </div>
        {!busy && !items.length ? (
          <EmptyState title={msg("connections.empty")}>
            <p>{msg("connections.empty.body")}</p>
          </EmptyState>
        ) : null}
      </section>
      <section>
        <h2>{msg("connections.catalog")}</h2>
        <div className="connection-grid">
          {catalog.map((item) => (
            <a href={`/app/connections/new/${item.key}`} key={item.id}>
              <Card>
                <KeyRound aria-hidden />
                <strong>{manifestText(item.manifest.displayName, item.key)}</strong>
                <p>
                  {manifestText(item.manifest.provider, item.key)} · v{item.version}
                </p>
                {item.certification ? (
                  <Badge tone={item.certification.liveStatus === "LIVE" ? "success" : "warning"}>
                    {item.certification.liveStatus === "LIVE"
                      ? msg("connections.provider.live")
                      : msg("connections.provider.recorded")}
                  </Badge>
                ) : null}
              </Card>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

export function ConnectionSetupPage() {
  const [catalog, setCatalog] = useState<ConnectorCatalogItem>();
  const [scopes, setScopes] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const provider = lastSegment();
  useEffect(() => {
    void fetchConnectorCatalog()
      .then((items) => {
        const item = items.find((value) => value.key === provider);
        setCatalog(item);
        setScopes((item?.manifest.requiredScopes as string[] | undefined) ?? []);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("connections.error"))
      );
  }, [provider]);
  const connect = async () => {
    if (!catalog) return;
    try {
      setStatus(msg("connections.setup.creating"));
      const started = await startConnectionAuthorization({
        connectorKey: catalog.key,
        manifestVersion: catalog.version,
        displayName: manifestText(catalog.manifest.displayName, catalog.key),
        requestedScopes: scopes,
        region: (catalog.manifest.regions as string[] | undefined)?.[0] ?? "local",
        authMethod: "oauth2",
        sessionId: crypto.randomUUID(),
        browserNonce: crypto.randomUUID(),
        returnTarget: "/app/connections"
      });
      setStatus(msg("connections.setup.ready"));
      location.assign(started.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("connections.error"));
    }
  };
  if (error)
    return (
      <main className="page-shell">
        <ErrorState title={msg("connections.error")}>{error}</ErrorState>
      </main>
    );
  if (!catalog)
    return (
      <main className="page-shell">
        <Skeleton label={msg("connections.loading")} />
      </main>
    );
  return (
    <main className="page-shell connection-shell">
      <header>
        <Badge>{msg("connections.setup.badge")}</Badge>
        <h1>
          {msg("connections.setup.heading", { provider: String(catalog.manifest.displayName) })}
        </h1>
        <p>{msg("connections.setup.body")}</p>
      </header>
      <Card>
        <h2>{msg("connections.scopes")}</h2>
        <ul>
          {scopes.map((scope) => (
            <li key={scope}>
              <ShieldCheck aria-hidden size={16} />
              <code>{scope}</code>
            </li>
          ))}
        </ul>
        <p>
          {msg("connections.permission", { fidelity: String(catalog.manifest.permissionFidelity) })}
        </p>
        <Button onClick={() => void connect()}>{msg("connections.authorize")}</Button>
        {status ? <p role="status">{status}</p> : null}
      </Card>
    </main>
  );
}

function ProviderSourcesPanel({ connectionId }: { readonly connectionId: string }) {
  const [surface, setSurface] = useState<ConnectionSourceSurface>();
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchConnectionSources(connectionId)
      .then((value) => {
        setSurface(value);
        setMode(value.selection.mode);
        setSelected([...value.selection.sourceIds]);
        setInclude(value.selection.include.join("\n"));
        setExclude(value.selection.exclude.join("\n"));
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("connections.sources.error"))
      );
  }, [connectionId]);
  if (error) return <ErrorState title={msg("connections.sources.error")}>{error}</ErrorState>;
  if (!surface) return <Skeleton label={msg("connections.sources.loading")} />;
  if (!surface.sources.length) return null;
  const save = async () => {
    try {
      const value = await updateConnectionSources(connectionId, {
        mode,
        sourceIds: mode === "all" ? [] : selected,
        include: include
          .split("\n")
          .map((rule) => rule.trim())
          .filter(Boolean),
        exclude: exclude
          .split("\n")
          .map((rule) => rule.trim())
          .filter(Boolean),
        expectedRevision: surface.selection.revision
      });
      setSurface({ ...surface, selection: value });
      setStatus(msg("connections.sources.saved", { count: value.estimatedObjects }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("connections.sources.error"));
    }
  };
  return (
    <section aria-labelledby="provider-sources-heading" className="provider-sources">
      <div>
        <Badge tone="warning">{msg("connections.provider.recorded")}</Badge>
        <h2 id="provider-sources-heading">{msg("connections.sources.heading")}</h2>
        <p>{msg("connections.sources.body")}</p>
        {surface.certification ? (
          <p className="provider-certification">
            {msg("connections.sources.certification", {
              gate: surface.certification.externalGate,
              status: surface.certification.liveStatus
            })}
          </p>
        ) : null}
      </div>
      <Card>
        <fieldset>
          <legend>{msg("connections.sources.scope")}</legend>
          <label>
            <input
              checked={mode === "all"}
              name="source-mode"
              onChange={() => setMode("all")}
              type="radio"
            />
            {msg("connections.sources.all")}
          </label>
          <label>
            <input
              checked={mode === "selected"}
              name="source-mode"
              onChange={() => setMode("selected")}
              type="radio"
            />
            {msg("connections.sources.selected")}
          </label>
        </fieldset>
        <div className="source-picker">
          {surface.sources.map((source) => (
            <label className={!source.selectable ? "source-disabled" : ""} key={source.id}>
              <input
                aria-label={source.name}
                checked={mode === "all" || selected.includes(source.id)}
                disabled={mode === "all" || !source.selectable}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...new Set([...current, source.id])]
                      : current.filter((id) => id !== source.id)
                  )
                }
                type="checkbox"
              />
              <span>
                <strong>{source.name}</strong>
                <small>
                  {source.kind} · {msg("connections.objects", { count: source.estimatedObjects })}
                  {source.limitation ? ` · ${source.limitation}` : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
        <div className="source-rules">
          <label>
            {msg("connections.sources.include")}
            <textarea
              onChange={(event) => setInclude(event.target.value)}
              rows={3}
              value={include}
            />
          </label>
          <label>
            {msg("connections.sources.exclude")}
            <textarea
              onChange={(event) => setExclude(event.target.value)}
              rows={3}
              value={exclude}
            />
          </label>
        </div>
        <Button onClick={() => void save()}>{msg("connections.sources.save")}</Button>
        {status ? <p role="status">{status}</p> : null}
      </Card>
      {surface.certification?.limitations.map((limitation) => (
        <p className="provider-limitation" key={limitation}>
          {limitation}
        </p>
      ))}
    </section>
  );
}

export function ConnectionDetailPage() {
  const [item, setItem] = useState<
    ConnectionSummary & { runs: readonly Readonly<Record<string, unknown>>[] }
  >();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const id = lastSegment();
  const load = useCallback(
    () =>
      fetchConnection(id)
        .then(setItem)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : msg("connections.error"))
        ),
    [id]
  );
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      setStatus(message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("connections.error"));
    }
  };
  if (!item && !error)
    return (
      <main className="page-shell">
        <Skeleton label={msg("connections.loading")} />
      </main>
    );
  if (!item)
    return (
      <main className="page-shell">
        <ErrorState title={msg("connections.error")}>{error}</ErrorState>
      </main>
    );
  return (
    <main className="page-shell connection-shell">
      <header>
        <Badge tone={healthTone(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
        <h1>{item.displayName}</h1>
        <p>{item.accountLabel ?? msg("connections.account.pending")}</p>
        <div className="connection-actions">
          <Button
            onClick={() =>
              void act(() => requestConnectionSync(id), msg("connections.sync.queued"))
            }
          >
            <RefreshCw aria-hidden size={16} />
            {msg("connections.sync")}
          </Button>
          <Button
            tone="neutral"
            onClick={() =>
              void act(
                () => transitionConnection(id, "reconciliations"),
                msg("connections.reconcile.queued")
              )
            }
          >
            <Activity aria-hidden size={16} />
            {msg("connections.reconcile")}
          </Button>
          <Button
            tone="neutral"
            onClick={() =>
              void act(
                () =>
                  transitionConnection(id, item.state === "disabled" ? "resumptions" : "pauses"),
                msg("connections.state.changed")
              )
            }
          >
            {item.state === "disabled" ? msg("connections.enable") : msg("connections.disable")}
          </Button>
          <Button
            tone="danger"
            onClick={() => void act(() => deleteConnection(id), msg("connections.delete.queued"))}
          >
            <Trash2 aria-hidden size={16} />
            {msg("connections.delete")}
          </Button>
        </div>
      </header>
      {error ? <ErrorState title={msg("connections.error")}>{error}</ErrorState> : null}
      {status ? <p role="status">{status}</p> : null}
      <section className="connection-health">
        <Card>
          <h2>{msg("connections.health")}</h2>
          <dl>
            <div>
              <dt>{msg("connections.last.success")}</dt>
              <dd>{item.lastSuccessAt ? new Date(item.lastSuccessAt).toLocaleString() : "—"}</dd>
            </div>
            <div>
              <dt>{msg("connections.freshness")}</dt>
              <dd>{item.freshnessLagSeconds ?? "—"}</dd>
            </div>
            <div>
              <dt>{msg("connections.objects.label")}</dt>
              <dd>{item.objectCount}</dd>
            </div>
            <div>
              <dt>{msg("connections.errors")}</dt>
              <dd>{item.errorCount}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <h2>{msg("connections.scopes")}</h2>
          <p>{msg("connections.permission", { fidelity: item.permissionFidelity })}</p>
          <ul>
            {item.grantedScopes.map((scope) => (
              <li key={scope}>
                <code>{scope}</code>
              </li>
            ))}
          </ul>
        </Card>
      </section>
      {item.connectorKey === "fixture-cloud" ? null : <ProviderSourcesPanel connectionId={id} />}
      <section>
        <h2>{msg("connections.sync.history")}</h2>
        {item.runs.length ? (
          item.runs.map((run) => (
            <Card key={String(run.id)}>
              <strong>{String(run.mode)}</strong>
              <Badge>{String(run.state)}</Badge>
              <p>{msg("connections.sync.processed", { count: Number(run.processedCount ?? 0) })}</p>
            </Card>
          ))
        ) : (
          <EmptyState title={msg("connections.sync.empty")} />
        )}
      </section>
    </main>
  );
}
