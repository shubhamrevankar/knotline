import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { Blocks, Menu, Search, ShieldCheck, Waypoints } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";

import { readConsent, writeConsent, type ConsentPreference } from "./consent.js";
import {
  AuthGate,
  CheckEmailPage,
  GoogleCallbackPage,
  MagicCallbackPage,
  ProfilePage,
  SessionsPage,
  SignInPage
} from "./AuthPages.js";
import { msg } from "./i18n.js";
import {
  InvitationAcceptPage,
  MembersPage,
  OnboardingPage,
  RolesPage,
  WorkspaceSettingsPage
} from "./M05Pages.js";
import {
  TemplatesPage,
  WorkflowDetailPage,
  WorkflowSettingsPage,
  WorkflowVersionsPage
} from "./M06Pages.js";
import { WEB_ROUTE_MANIFEST, type WebRouteManifestEntry } from "./routes/manifest.js";

const WorkflowApp = lazy(async () => {
  const module = await import("./App.js");
  return { default: module.App };
});

const ComponentWorkbench = lazy(async () => {
  const module = await import("./ComponentWorkbench.js");
  return { default: module.ComponentWorkbench };
});

const WorkflowStudio = lazy(async () => {
  const module = await import("./StudioPage.js");
  return { default: module.StudioPage };
});

const GuidedWorkflowPage = lazy(async () => {
  const module = await import("./GuidedWorkflowCreate.js");
  return { default: module.GuidedWorkflowPage };
});

const RunsPage = lazy(async () => {
  const module = await import("./M11Pages.js");
  return { default: module.RunsPage };
});

const RunRoomPage = lazy(async () => {
  const module = await import("./M11Pages.js");
  return { default: module.RunRoomPage };
});

const TaskInboxPage = lazy(async () => {
  const module = await import("./M12Pages.js");
  return { default: module.TaskInboxPage };
});

const TaskDetailPage = lazy(async () => {
  const module = await import("./M12Pages.js");
  return { default: module.TaskDetailPage };
});

const solutionNames: Readonly<Record<string, string>> = {
  operations: msg("solution.operations"),
  "go-to-market": msg("solution.gotomarket"),
  product: msg("solution.product"),
  support: msg("solution.support"),
  finance: msg("solution.finance"),
  hr: msg("solution.hr"),
  it: msg("solution.it")
};

const ownedPublicTitles: Readonly<Record<string, string>> = {
  "route.public.home": msg("public.title.home"),
  "route.product": msg("public.title.product"),
  "route.product.workflows": msg("public.title.workflows"),
  "route.product.agents": msg("public.title.agents"),
  "route.product.knowledge": msg("public.title.knowledge"),
  "route.product.integrations": msg("public.title.integrations"),
  "route.templates": msg("public.title.templates"),
  "route.security": msg("public.title.security"),
  "route.docs": msg("public.title.docs"),
  "route.docs.wildcard": msg("public.title.documentation"),
  "route.changelog": msg("public.title.changelog")
};

function useMetadata(title: string, noIndex = false) {
  useEffect(() => {
    document.title = msg("metadata.title", { title });
    const upsertMeta = (selector: string, attributes: Record<string, string>) => {
      let element = document.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement("meta");
        document.head.append(element);
      }
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    };
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = noIndex ? "noindex,nofollow" : "index,follow";
    upsertMeta('meta[name="description"]', {
      name: "description",
      content: msg("metadata.description")
    });
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: title
    });
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: msg("metadata.description")
    });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary" });
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = `${globalThis.location.origin}${globalThis.location.pathname}`;
  }, [noIndex, title]);
}

function ConsentBanner() {
  const [preference, setPreference] = useState<ConsentPreference | null>(() =>
    globalThis.localStorage ? readConsent(globalThis.localStorage) : "essential"
  );
  if (preference) return null;
  const choose = (value: ConsentPreference) => {
    if (globalThis.localStorage) writeConsent(globalThis.localStorage, value);
    setPreference(value);
  };
  return (
    <aside className="consent-banner" aria-labelledby="consent-heading">
      <div>
        <strong id="consent-heading">{msg("consent.heading")}</strong>
        <p>{msg("consent.body")}</p>
      </div>
      <Button onClick={() => choose("essential")}>{msg("consent.essential")}</Button>
      <Button tone="accent" onClick={() => choose("measurement")}>
        {msg("consent.measurement")}
      </Button>
    </aside>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#main-content">
        {msg("public.skip")}
      </a>
      <header className="public-header">
        <Link className="public-brand" to="/">
          <Waypoints aria-hidden="true" />
          {msg("brand.name")}
        </Link>
        <nav aria-label={msg("public.nav.primary")}>
          <Link to="/product">{msg("nav.product")}</Link>
          <Link to="/solutions/operations">{msg("nav.solutions")}</Link>
          <Link to="/templates">{msg("nav.templates")}</Link>
          <Link to="/security">{msg("nav.security")}</Link>
          <Link to="/docs">{msg("nav.docs")}</Link>
        </nav>
        <Link className="public-app-link" to="/app/workflows">
          {msg("nav.open.demo")}
        </Link>
      </header>
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <span>{msg("brand.name")}</span>
        <nav aria-label={msg("public.footer.label")}>
          <Link to="/legal/privacy">{msg("public.footer.privacy")}</Link>
          <Link to="/accessibility">{msg("public.footer.accessibility")}</Link>
          <Link to="/status">{msg("public.footer.status")}</Link>
        </nav>
      </footer>
      <ConsentBanner />
    </div>
  );
}

function PublicHome() {
  useMetadata(msg("public.title.home"));
  return (
    <PublicLayout>
      <section className="public-hero">
        <Badge tone="accent">{msg("public.home.status")}</Badge>
        <h1>{msg("public.home.heading")}</h1>
        <p>{msg("public.home.body")}</p>
        <div className="public-actions">
          <Link className="public-primary" to="/app/workflows">
            {msg("public.home.cta.demo")}
          </Link>
          <Link to="/product">{msg("public.home.cta.product")}</Link>
        </div>
      </section>
      <section className="public-feature-grid" aria-label={msg("public.home.principles")}>
        <Card>
          <Blocks aria-hidden="true" />
          <h2>{msg("public.feature.workflow.title")}</h2>
          <p>{msg("public.feature.workflow.body")}</p>
        </Card>
        <Card>
          <ShieldCheck aria-hidden="true" />
          <h2>{msg("public.feature.governance.title")}</h2>
          <p>{msg("public.feature.governance.body")}</p>
        </Card>
        <Card>
          <Search aria-hidden="true" />
          <h2>{msg("public.feature.context.title")}</h2>
          <p>{msg("public.feature.context.body")}</p>
        </Card>
      </section>
    </PublicLayout>
  );
}

function NotFound({ publicPage = true }: { publicPage?: boolean }) {
  useMetadata(msg("public.notfound.heading"), !publicPage);
  const content = (
    <ErrorState title={msg("public.notfound.heading")}>
      <p>{msg("public.notfound.body")}</p>
      <Link to={publicPage ? "/" : "/app/workflows"}>{msg("public.notfound.return")}</Link>
    </ErrorState>
  );
  return publicPage ? (
    <PublicLayout>
      <div className="public-state">{content}</div>
    </PublicLayout>
  ) : (
    content
  );
}

function PublicRoute({ route }: { route: WebRouteManifestEntry }) {
  const params = useParams();
  if (route.id === "route.public.home") return <PublicHome />;
  if (route.id === "route.docs.wildcard" && params["*"] === "components") {
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label={msg("workbench.loading")} />}>
          <ComponentWorkbench />
        </Suspense>
      </PublicLayout>
    );
  }
  if (route.id === "route.solutions.detail") {
    const name = params.solution ? solutionNames[params.solution] : undefined;
    if (!name) return <NotFound />;
    return <PublicContent route={route} title={msg("solution.title", { name })} />;
  }
  if (
    route.id === "route.templates.detail" &&
    !["incident-response", "customer-onboarding"].includes(params.slug ?? "")
  )
    return <NotFound />;
  return <PublicContent route={route} title={ownedPublicTitles[route.id]} />;
}

const systemState = (state: string | null) => {
  switch (state) {
    case "unauthenticated":
      return [msg("state.unauthenticated.heading"), msg("state.unauthenticated.body")];
    case "forbidden":
      return [msg("state.forbidden.heading"), msg("state.forbidden.body")];
    case "plan":
      return [msg("state.plan.heading"), msg("state.plan.body")];
    case "suspended":
      return [msg("state.suspended.heading"), msg("state.suspended.body")];
    case "archived":
      return [msg("state.archived.heading"), msg("state.archived.body")];
    case "deleted":
      return [msg("state.deleted.heading"), msg("state.deleted.body")];
    case "offline":
      return [msg("state.offline.heading"), msg("state.offline.body")];
    case "degraded":
      return [msg("state.degraded.heading"), msg("state.degraded.body")];
    default:
      return null;
  }
};

function CustomerSystemState() {
  const [search] = useSearchParams();
  const content = systemState(search.get("state"));
  if (!content) return null;
  return (
    <div className="customer-system-state">
      <ErrorState title={content[0]}>
        <p>{content[1]}</p>
        <Link to="/app/workflows">{msg("state.return")}</Link>
      </ErrorState>
    </div>
  );
}

function PublicContent({
  route,
  title
}: {
  route: WebRouteManifestEntry;
  title?: string | undefined;
}) {
  const actualTitle = title ?? msg("public.page.planned.heading");
  useMetadata(actualTitle);
  const owned = route.ownerMilestone === "M02";
  return (
    <PublicLayout>
      <article className="public-page">
        <Badge tone={owned ? "accent" : "warning"}>
          {owned
            ? msg("public.page.available")
            : msg("public.page.planned", { milestone: route.ownerMilestone })}
        </Badge>
        <h1>{actualTitle}</h1>
        <p>{owned ? msg("public.page.body.owned") : msg("public.page.body.planned")}</p>
        <Card>
          <h2>{msg("public.capability.heading")}</h2>
          <p>
            {route.dataSource === "query"
              ? msg("public.capability.async")
              : msg("public.capability.static")}
          </p>
        </Card>
      </article>
    </PublicLayout>
  );
}

function CustomerRoute({ route }: { route: WebRouteManifestEntry }) {
  useMetadata(
    route.id === "route.app.workflows"
      ? msg("customer.nav.workflows")
      : msg("customer.page.planned"),
    true
  );
  const [search] = useSearchParams();
  if (systemState(search.get("state"))) return <CustomerSystemState />;
  if (route.path === "/app/workflows")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("app.loading.workspace")} />}>
          <WorkflowApp />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.profile.sessions") return <SessionsPage />;
  if (route.id === "route.app.profile") return <ProfilePage />;
  if (route.id === "route.app.onboarding") return <OnboardingPage />;
  if (route.id === "route.app.settings.workspace") return <WorkspaceSettingsPage />;
  if (route.id === "route.app.settings.members") return <MembersPage />;
  if (route.id === "route.app.settings.roles") return <RolesPage />;
  if (route.id === "route.app.workflows.detail") return <WorkflowDetailPage />;
  if (route.id === "route.app.workflows.new")
    return (
      <Suspense fallback={<Skeleton label={msg("generation.loading")} />}>
        <GuidedWorkflowPage />
      </Suspense>
    );
  if (route.id === "route.app.workflows.detail.studio")
    return (
      <Suspense fallback={<Skeleton label={msg("studio.loading")} />}>
        <WorkflowStudio />
      </Suspense>
    );
  if (route.id === "route.app.workflows.detail.settings") return <WorkflowSettingsPage />;
  if (
    route.id === "route.app.workflows.detail.versions" ||
    route.id === "route.app.workflows.detail.versions.detail"
  )
    return <WorkflowVersionsPage />;
  if (route.id === "route.app.templates" || route.id === "route.app.templates.detail")
    return <TemplatesPage />;
  if (route.id === "route.app.runs")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("run.loading")} />}>
          <RunsPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.runs.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("run.loading")} />}>
          <RunRoomPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.runs.detail.timeline")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("run.loading")} />}>
          <RunRoomPage view="timeline" />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.runs.detail.tasks.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("run.loading")} />}>
          <RunRoomPage view="task" />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.inbox" || route.id === "route.app.tasks")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading task inbox" />}>
          <TaskInboxPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.tasks.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading task" />}>
          <TaskDetailPage />
        </Suspense>
      </AuthGate>
    );
  return (
    <AuthGate>
      <div className="registered-shell">
        <aside aria-label={msg("customer.nav.label")}>
          <Link to="/app/workflows">
            <Waypoints aria-hidden="true" />
            {msg("brand.name")}
          </Link>
          <Link to="/app/workflows">
            <Blocks aria-hidden="true" />
            {msg("customer.nav.workflows")}
          </Link>
        </aside>
        <main>
          <Badge tone="warning">
            {msg("public.page.planned", { milestone: route.ownerMilestone })}
          </Badge>
          <h1>{msg("customer.route.heading")}</h1>
          <p>{msg("customer.route.body")}</p>
          <Button>
            <Menu aria-hidden="true" />
            {msg("customer.nav.open")}
          </Button>
        </main>
      </div>
    </AuthGate>
  );
}

function OperatorRoute({ route }: { route: WebRouteManifestEntry }) {
  useMetadata(msg("operator.surface"), true);
  return (
    <div className="operator-shell">
      <header>
        <ShieldCheck aria-hidden="true" />
        {msg("operator.plane")}
      </header>
      <main>
        <Badge tone="danger">{msg("operator.status", { milestone: route.ownerMilestone })}</Badge>
        <h1>{msg("operator.heading")}</h1>
        <p>{msg("operator.body")}</p>
      </main>
    </div>
  );
}

function CanonicalRoute({ route }: { route: WebRouteManifestEntry }) {
  if (route.id === "route.auth.sign-in") return <SignInPage />;
  if (route.id === "route.auth.check-email") return <CheckEmailPage />;
  if (route.id === "route.auth.magic.callback") return <MagicCallbackPage />;
  if (route.id === "route.auth.google.callback") return <GoogleCallbackPage />;
  if (route.id === "route.invitations.accept") return <InvitationAcceptPage />;
  if (route.plane === "operator") return <OperatorRoute route={route} />;
  if (route.plane === "customer") return <CustomerRoute route={route} />;
  return <PublicRoute route={route} />;
}

export function AppRouter() {
  const location = useLocation();
  return (
    <Routes location={location}>
      {WEB_ROUTE_MANIFEST.map((route) => (
        <Route key={route.id} path={route.path} element={<CanonicalRoute route={route} />} />
      ))}
      <Route path="*" element={<NotFound publicPage={!location.pathname.startsWith("/app")} />} />
    </Routes>
  );
}
