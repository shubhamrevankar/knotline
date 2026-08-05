import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import {
  Activity,
  ArrowUpRight,
  Cable,
  CheckCircle2,
  Clock3,
  Database,
  Ellipsis,
  RefreshCw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  deleteConnection,
  createHttpConnection,
  fetchConnection,
  fetchConnectionSources,
  fetchConnections,
  fetchConnectorCatalog,
  requestConnectionSync,
  startConnectionAuthorization,
  testHttpConnection,
  transitionConnection,
  updateConnectionSources,
  type ConnectionSummary,
  type ConnectionSourceSurface,
  type ConnectorCatalogItem
} from "./api.js";
import { msg } from "./i18n.js";
import { WorkspacePageHeader } from "./WorkspacePageHeader.js";
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
const receiptStatus = (receipt: Readonly<Record<string, unknown>>) => {
  if (typeof receipt.responseStatus === "number") return String(receipt.responseStatus);
  if (typeof receipt.errorCode === "string") return receipt.errorCode;
  return msg("connections.http.no.response");
};
const LIVE_PROVIDER_KEYS = new Set(["slack-collaboration", "hubspot-crm"]);
const CUSTOM_CONNECTION_KEYS = new Set(["generic-rest", "signed-webhook"]);
const CONNECTOR_LOGO_URLS: Readonly<Record<string, string>> = {
  "microsoft-365": "https://api.iconify.design/logos/microsoft-icon.svg",
  "google-mail-calendar": "https://api.iconify.design/logos/google-icon.svg",
  "salesforce-crm": "https://api.iconify.design/logos/salesforce.svg",
  "hubspot-crm": "https://api.iconify.design/logos/hubspot.svg",
  "s3-compatible": "https://api.iconify.design/logos/aws.svg",
  "csv-import": "https://api.iconify.design/vscode-icons/file-type-excel2.svg",
  "generic-rest": "https://api.iconify.design/mdi/api.svg",
  "signed-webhook": "https://api.iconify.design/mdi/webhook.svg",
  "google-workspace-knowledge": "https://api.iconify.design/logos/google-drive.svg",
  "notion-knowledge": "https://api.iconify.design/logos/notion-icon.svg",
  "confluence-cloud-knowledge": "https://api.iconify.design/logos/confluence.svg",
  "linear-work": "https://api.iconify.design/logos/linear-icon.svg",
  "jira-cloud-work": "https://api.iconify.design/logos/jira.svg",
  "github-app": "https://api.iconify.design/logos/github-icon.svg",
  "slack-collaboration": "https://api.iconify.design/logos/slack-icon.svg",
  "microsoft-teams-collaboration": "https://api.iconify.design/logos/microsoft-teams.svg",
  "x-publishing": "https://api.iconify.design/simple-icons/x.svg",
  "fixture-cloud": "https://api.iconify.design/mdi/cloud-outline.svg"
};

function ProviderLogo({
  connectorKey,
  label,
  large = false
}: {
  connectorKey: string;
  label: string;
  large?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const className = `provider-logo${large ? " provider-logo-large" : ""}`;
  const logoUrl = CONNECTOR_LOGO_URLS[connectorKey];
  return (
    <span aria-label={label} className={className} role="img">
      {logoUrl && !imageFailed ? (
        <img
          alt=""
          aria-hidden
          decoding="async"
          loading={large ? "eager" : "lazy"}
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
          src={logoUrl}
        />
      ) : (
        <Cable aria-hidden />
      )}
    </span>
  );
}

function ConnectorCard({ item, available }: { item: ConnectorCatalogItem; available: boolean }) {
  const content = (
    <Card className={available ? "connector-card" : "connector-card connector-card-planned"}>
      <div className="connector-card-topline">
        <ProviderLogo
          connectorKey={item.key}
          label={manifestText(item.manifest.displayName, item.key)}
        />
        <Badge tone={available ? "success" : "neutral"}>
          {available ? msg("connections.provider.available") : msg("connections.provider.planned")}
        </Badge>
      </div>
      <div className="connector-card-copy">
        <strong>{manifestText(item.manifest.displayName, item.key)}</strong>
        <p>{manifestText(item.manifest.provider, item.key)}</p>
      </div>
      {available ? <ArrowUpRight aria-hidden className="connector-card-arrow" size={18} /> : null}
    </Card>
  );
  return available ? (
    <a href={`/app/connections/new/${item.key}`}>{content}</a>
  ) : (
    <div aria-label={`${manifestText(item.manifest.displayName, item.key)} coming soon`}>
      {content}
    </div>
  );
}

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
  const liveProviders = catalog.filter(({ key }) => LIVE_PROVIDER_KEYS.has(key));
  const customConnections = catalog.filter(({ key }) => CUSTOM_CONNECTION_KEYS.has(key));
  const plannedConnectors = catalog.filter(
    ({ key }) => !LIVE_PROVIDER_KEYS.has(key) && !CUSTOM_CONNECTION_KEYS.has(key)
  );
  const connectedItems = items.filter(({ state }) =>
    ["active", "degraded", "disabled", "reauthorization_required"].includes(state)
  );
  const setupItems = items.filter(
    ({ state }) => !["active", "degraded", "disabled", "reauthorization_required"].includes(state)
  );
  return (
    <main className="page-shell connection-shell">
      <WorkspacePageHeader
        description={msg("connections.body")}
        eyebrow={msg("workspace.section.connections")}
        title={msg("connections.heading")}
      />
      {busy ? <Skeleton label={msg("connections.loading")} /> : null}
      {error ? <ErrorState title={msg("connections.error")}>{error}</ErrorState> : null}
      <section aria-labelledby="connected-heading" className="connection-section connected-section">
        <div className="connection-section-heading">
          <div>
            <span className="section-kicker">{msg("connections.connected.kicker")}</span>
            <h2 id="connected-heading">{msg("connections.connected")}</h2>
            <p>{msg("connections.connected.body")}</p>
          </div>
          {connectedItems.length ? (
            <span className="connection-total">{connectedItems.length}</span>
          ) : null}
        </div>
        <div className="connection-grid connected-grid">
          {connectedItems.map((item) => (
            <a href={`/app/connections/${item.id}`} key={item.id}>
              <Card className="connected-card">
                <div className="connected-card-topline">
                  <ProviderLogo connectorKey={item.connectorKey} label={item.displayName} />
                  <Badge tone={healthTone(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
                </div>
                <div className="connected-card-copy">
                  <strong>{item.displayName}</strong>
                  <p>{item.accountLabel ?? msg("connections.account.pending")}</p>
                </div>
                <div className="connected-card-footer">
                  <span>
                    <Database aria-hidden size={15} />
                    {msg("connections.objects", { count: item.objectCount })}
                  </span>
                  <ArrowUpRight aria-hidden size={17} />
                </div>
              </Card>
            </a>
          ))}
        </div>
        {!busy && !connectedItems.length ? (
          <EmptyState title={msg("connections.empty")}>
            <p>{msg("connections.empty.body")}</p>
          </EmptyState>
        ) : null}
        {setupItems.length ? (
          <div className="connection-setup-activity">
            <div className="setup-activity-heading">
              <Clock3 aria-hidden size={17} />
              <strong>{msg("connections.setup.activity")}</strong>
              <span>{setupItems.length}</span>
            </div>
            <div className="setup-activity-list">
              {setupItems.map((item) => (
                <a href={`/app/connections/${item.id}`} key={item.id}>
                  <ProviderLogo connectorKey={item.connectorKey} label={item.displayName} />
                  <span>
                    <strong>{item.displayName}</strong>
                    <small>{item.accountLabel ?? msg("connections.account.pending")}</small>
                  </span>
                  <Badge tone={healthTone(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
                  <ArrowUpRight aria-hidden size={16} />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <section className="connection-section">
        <div className="connection-section-heading">
          <div>
            <Badge tone="success">{msg("connections.available.badge")}</Badge>
            <h2>{msg("connections.available")}</h2>
            <p>{msg("connections.available.body")}</p>
          </div>
        </div>
        <div className="connection-grid">
          {liveProviders.map((item) => (
            <ConnectorCard available item={item} key={item.id} />
          ))}
        </div>
      </section>
      <section className="connection-section">
        <div className="connection-section-heading">
          <div>
            <h2>{msg("connections.custom")}</h2>
            <p>{msg("connections.custom.body")}</p>
          </div>
        </div>
        <div className="connection-grid">
          {customConnections.map((item) => (
            <ConnectorCard available item={item} key={item.id} />
          ))}
        </div>
      </section>
      <section className="connection-section connection-section-planned">
        <div className="connection-section-heading">
          <div>
            <Badge>{msg("connections.planned.badge")}</Badge>
            <h2>{msg("connections.catalog")}</h2>
            <p>{msg("connections.catalog.body")}</p>
          </div>
        </div>
        <div className="connection-grid">
          {plannedConnectors.map((item) => (
            <ConnectorCard available={false} item={item} key={item.id} />
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
  const [displayName, setDisplayName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [method, setMethod] = useState<"POST" | "PUT" | "PATCH">("POST");
  const provider = lastSegment();
  useEffect(() => {
    void fetchConnectorCatalog()
      .then((items) => {
        const item = items.find((value) => value.key === provider);
        setCatalog(item);
        setScopes((item?.manifest.requiredScopes as string[] | undefined) ?? []);
        setDisplayName(manifestText(item?.manifest.displayName, provider));
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("connections.error"))
      );
  }, [provider]);
  const connect = async () => {
    if (!catalog) return;
    let authorizationWindow: Window | null = null;
    try {
      setError("");
      authorizationWindow = window.open("about:blank", "_blank");
      if (!authorizationWindow) throw new Error(msg("connections.authorize.popup.blocked"));
      authorizationWindow.opener = null;
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
      authorizationWindow.location.replace(started.authorizationUrl);
      setStatus(msg("connections.setup.opened"));
    } catch (cause) {
      authorizationWindow?.close();
      setStatus("");
      setError(cause instanceof Error ? cause.message : msg("connections.error"));
    }
  };
  const isLiveHttp = provider === "generic-rest" || provider === "signed-webhook";
  const connectHttp = async () => {
    if (!catalog) return;
    try {
      setError("");
      setStatus(msg("connections.http.testing"));
      const created = await createHttpConnection({
        connectorKey: catalog.key,
        manifestVersion: catalog.version,
        displayName,
        region: (catalog.manifest.regions as string[] | undefined)?.[0] ?? "global",
        endpoint,
        method,
        ...(authorization.trim() ? { authorization: authorization.trim() } : {})
      });
      location.assign(`/app/connections/${created.connectionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("connections.error"));
      setStatus("");
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
      <header className="connection-setup-header">
        <ProviderLogo
          connectorKey={catalog.key}
          label={manifestText(catalog.manifest.displayName, catalog.key)}
          large
        />
        <div>
          <Badge>{msg("connections.setup.badge")}</Badge>
          <h1>
            {msg("connections.setup.heading", { provider: String(catalog.manifest.displayName) })}
          </h1>
          <p>{msg("connections.setup.body")}</p>
        </div>
      </header>
      <Card>
        {isLiveHttp ? (
          <div className="live-http-form">
            <div>
              <Badge tone="success">{msg("connections.http.live")}</Badge>
              <h2>{msg("connections.http.heading")}</h2>
              <p>{msg("connections.http.body")}</p>
            </div>
            <label>
              {msg("connections.http.name")}
              <input
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <div className="live-http-target">
              <label>
                {msg("connections.http.method")}
                <select
                  onChange={(event) => setMethod(event.target.value as typeof method)}
                  value={method}
                >
                  <option value="POST">{msg("connections.http.method.post")}</option>
                  <option value="PUT">{msg("connections.http.method.put")}</option>
                  <option value="PATCH">{msg("connections.http.method.patch")}</option>
                </select>
              </label>
              <label>
                {msg("connections.http.endpoint")}
                <input
                  inputMode="url"
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder={msg("connections.http.endpoint.placeholder")}
                  required
                  type="url"
                  value={endpoint}
                />
              </label>
            </div>
            <label>
              {msg("connections.http.authorization")}
              <input
                autoComplete="off"
                onChange={(event) => setAuthorization(event.target.value)}
                placeholder={msg("connections.http.authorization.placeholder")}
                type="password"
                value={authorization}
              />
              <small>{msg("connections.http.authorization.help")}</small>
            </label>
            <div className="connection-test-note">
              <ShieldCheck aria-hidden size={18} />
              <span>{msg("connections.http.test.note")}</span>
            </div>
            <Button
              disabled={!endpoint.trim() || !displayName.trim() || Boolean(status)}
              onClick={() => void connectHttp()}
            >
              <Activity aria-hidden size={16} />
              {status || msg("connections.http.connect")}
            </Button>
          </div>
        ) : (
          <>
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
              {msg("connections.permission", {
                fidelity: String(catalog.manifest.permissionFidelity)
              })}
            </p>
            <dl className="connection-capabilities">
              <div>
                <dt>{msg("connections.capabilities.objects")}</dt>
                <dd>{(catalog.manifest.objectTypes as string[] | undefined)?.join(", ")}</dd>
              </div>
              <div>
                <dt>{msg("connections.capabilities.actions")}</dt>
                <dd>
                  {(catalog.manifest.actions as string[] | undefined)?.join(", ") ||
                    msg("connections.capabilities.none")}
                </dd>
              </div>
              <div>
                <dt>{msg("connections.capabilities.gate")}</dt>
                <dd>
                  {catalog.certification?.externalGate ?? msg("connections.capabilities.fixture")}
                </dd>
              </div>
            </dl>
            {catalog.certification?.limitations.map((limitation) => (
              <p className="connection-limitation" key={limitation}>
                {limitation}
              </p>
            ))}
            <Button
              disabled={catalog.certification?.liveStatus === "BLOCKED_EXTERNAL"}
              onClick={() => void connect()}
            >
              {catalog.certification?.liveStatus === "BLOCKED_EXTERNAL"
                ? msg("connections.authorize.blocked")
                : msg("connections.authorize")}
            </Button>
            {status ? <p role="status">{status}</p> : null}
          </>
        )}
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
    ConnectionSummary & {
      runs: readonly Readonly<Record<string, unknown>>[];
      receipts: readonly Readonly<Record<string, unknown>>[];
    }
  >();
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(() => {
    const authorization = new URLSearchParams(location.search).get("authorization");
    if (authorization === "succeeded") return msg("connections.authorization.succeeded");
    if (authorization === "denied") return msg("connections.authorization.denied");
    return "";
  });
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
  const syncNow = async () => {
    try {
      setError("");
      setSyncing(true);
      setStatus(msg("connections.sync.running"));
      const result = await requestConnectionSync(id);
      if (result.state === "failed")
        setStatus(
          msg("connections.sync.failed", {
            error: typeof result.errorKind === "string" ? result.errorKind : "PROVIDER_SYNC_FAILED"
          })
        );
      else
        setStatus(
          msg("connections.sync.completed", {
            count: typeof result.processedCount === "number" ? result.processedCount : 0
          })
        );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("connections.error"));
    } finally {
      setSyncing(false);
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
      <header className="connection-detail-hero">
        <div className="connection-detail-identity">
          <ProviderLogo connectorKey={item.connectorKey} label={item.displayName} large />
          <div>
            <div className="connection-detail-state">
              <Badge tone={healthTone(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
              <span>{msg("connections.detail.managed")}</span>
            </div>
            <h1>{item.displayName}</h1>
            <p>{item.accountLabel ?? msg("connections.account.pending")}</p>
          </div>
        </div>
        <div className="connection-detail-toolbar">
          <div className="connection-primary-actions">
            <Button disabled={syncing} onClick={() => void syncNow()}>
              <RefreshCw aria-hidden size={16} />
              {syncing ? msg("connections.sync.running") : msg("connections.sync")}
            </Button>
            {["generic-rest", "signed-webhook", "slack-collaboration", "hubspot-crm"].includes(
              item.connectorKey
            ) ? (
              <Button
                tone="neutral"
                onClick={() =>
                  void act(() => testHttpConnection(id), msg("connections.http.retested"))
                }
              >
                <Activity aria-hidden size={16} />
                {msg("connections.http.test")}
              </Button>
            ) : null}
          </div>
          <details className="connection-more-actions">
            <summary>
              <Ellipsis aria-hidden size={19} />
              {msg("connections.more.actions")}
            </summary>
            <div>
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
                      transitionConnection(
                        id,
                        item.state === "disabled" ? "resumptions" : "pauses"
                      ),
                    msg("connections.state.changed")
                  )
                }
              >
                {item.state === "disabled" ? msg("connections.enable") : msg("connections.disable")}
              </Button>
              <Button
                tone="danger"
                onClick={() =>
                  void act(() => deleteConnection(id), msg("connections.delete.queued"))
                }
              >
                <Trash2 aria-hidden size={16} />
                {msg("connections.delete")}
              </Button>
            </div>
          </details>
        </div>
      </header>
      {error ? <ErrorState title={msg("connections.error")}>{error}</ErrorState> : null}
      {status ? (
        <p className="connection-status-message" role="status">
          <CheckCircle2 aria-hidden size={18} />
          {status}
        </p>
      ) : null}
      <section className="connection-health">
        <Card className="connection-panel">
          <div className="connection-panel-heading">
            <Activity aria-hidden size={19} />
            <div>
              <h2>{msg("connections.health")}</h2>
              <p>{msg("connections.health.body")}</p>
            </div>
          </div>
          <dl className="connection-metrics">
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
            {item.healthLatencyMs !== undefined ? (
              <div>
                <dt>{msg("connections.http.latency")}</dt>
                <dd>{msg("connections.http.milliseconds", { value: item.healthLatencyMs })}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
        <Card className="connection-panel">
          <div className="connection-panel-heading">
            <ShieldCheck aria-hidden size={19} />
            <div>
              <h2>{msg("connections.scopes")}</h2>
              <p>{msg("connections.scopes.body")}</p>
            </div>
          </div>
          <p>{msg("connections.permission", { fidelity: item.permissionFidelity })}</p>
          <ul className="scope-list">
            {item.grantedScopes.map((scope) => (
              <li key={scope}>
                <code>{scope}</code>
              </li>
            ))}
          </ul>
        </Card>
      </section>
      {item.endpoint ? (
        <section>
          <h2>{msg("connections.http.delivery.history")}</h2>
          <p className="connection-endpoint">
            <code>{item.method ?? "POST"}</code> {item.endpoint}
          </p>
          {item.receipts.length ? (
            <div className="receipt-list">
              {item.receipts.map((receipt) => (
                <Card key={String(receipt.id)}>
                  <div className="connection-title">
                    <Badge tone={receipt.state === "succeeded" ? "success" : "danger"}>
                      {String(receipt.state)}
                    </Badge>
                    <strong>{receiptStatus(receipt)}</strong>
                    <small>
                      {msg("connections.http.milliseconds", {
                        value: Number(receipt.durationMs)
                      })}
                    </small>
                  </div>
                  <p>{new Date(String(receipt.createdAt)).toLocaleString()}</p>
                  <code>{String(receipt.operationId)}</code>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title={msg("connections.http.delivery.empty")} />
          )}
        </section>
      ) : null}
      {item.connectorKey === "fixture-cloud" ? null : <ProviderSourcesPanel connectionId={id} />}
      <section>
        <div className="sync-history-heading">
          <div>
            <span className="section-kicker">{msg("connections.sync.history.kicker")}</span>
            <h2>{msg("connections.sync.history")}</h2>
          </div>
        </div>
        {item.runs.length ? (
          <div className="sync-history-list">
            {item.runs.map((run) => (
              <Card className="sync-history-row" key={String(run.id)}>
                <span
                  aria-hidden
                  className={`sync-state-dot sync-state-${String(run.state).toLowerCase()}`}
                />
                <div>
                  <strong>{String(run.mode)}</strong>
                  <p>
                    {msg("connections.sync.processed", { count: Number(run.processedCount ?? 0) })}
                  </p>
                </div>
                <Badge tone={run.state === "succeeded" ? "success" : "neutral"}>
                  {String(run.state)}
                </Badge>
                <time>
                  {run.completedAt instanceof Date
                    ? run.completedAt.toLocaleString()
                    : typeof run.completedAt === "string" || typeof run.completedAt === "number"
                      ? new Date(run.completedAt).toLocaleString()
                      : "—"}
                </time>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title={msg("connections.sync.empty")} />
        )}
      </section>
    </main>
  );
}
