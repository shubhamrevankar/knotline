import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { Menu, ShieldCheck } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";

import { readConsent, writeConsent, type ConsentPreference } from "./consent.js";
import {
  AuthGate,
  CheckEmailPage,
  GoogleCallbackPage,
  MagicCallbackPage,
  SignInPage
} from "./AuthPages.js";
import { msg } from "./i18n.js";
import { PublicHomeContent } from "./PublicHomePage.js";
import { PublicFooter, PublicHeader } from "./PublicSiteChrome.js";
import { WEB_ROUTE_MANIFEST, type WebRouteManifestEntry } from "./routes/manifest.js";
import { WorkspaceShell } from "./WorkspaceShell.js";

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

const WorkflowDetailPage = lazy(async () => ({
  default: (await import("./M06Pages.js")).WorkflowDetailPage
}));

const WorkflowSettingsPage = lazy(async () => ({
  default: (await import("./M06Pages.js")).WorkflowSettingsPage
}));

const WorkflowVersionsPage = lazy(async () => ({
  default: (await import("./M06Pages.js")).WorkflowVersionsPage
}));

const TemplatesPage = lazy(async () => ({
  default: (await import("./M06Pages.js")).TemplatesPage
}));

const InvitationAcceptPage = lazy(async () => ({
  default: (await import("./M05Pages.js")).InvitationAcceptPage
}));

const MembersPage = lazy(async () => ({
  default: (await import("./M05AdminPages.js")).MembersPage
}));

const OnboardingPage = lazy(async () => ({
  default: (await import("./M05OnboardingPage.js")).OnboardingPage
}));

const ProfilePage = lazy(async () => ({
  default: (await import("./M04ProfilePages.js")).ProfilePage
}));

const SessionsPage = lazy(async () => ({
  default: (await import("./M04ProfilePages.js")).SessionsPage
}));

const RolesPage = lazy(async () => ({
  default: (await import("./M05AdminPages.js")).RolesPage
}));

const WorkspaceSettingsPage = lazy(async () => ({
  default: (await import("./M05AdminPages.js")).WorkspaceSettingsPage
}));

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

const ApprovalInboxPage = lazy(async () => {
  const module = await import("./M13Pages.js");
  return { default: module.ApprovalInboxPage };
});

const ApprovalDetailPage = lazy(async () => {
  const module = await import("./M13Pages.js");
  return { default: module.ApprovalDetailPage };
});

const AgentCatalogPage = lazy(async () => {
  const module = await import("./M14Pages.js");
  return { default: module.AgentCatalogPage };
});
const AgentCreatePage = lazy(async () => {
  const module = await import("./M14Pages.js");
  return { default: module.AgentCreatePage };
});
const AgentOverviewPage = lazy(async () => {
  const module = await import("./M14Pages.js");
  return { default: module.AgentOverviewPage };
});
const AgentBuilderPage = lazy(async () => {
  const module = await import("./M14Pages.js");
  return { default: module.AgentBuilderPage };
});
const ProfileMemoryPage = lazy(async () => {
  const module = await import("./M17Pages.js");
  return { default: module.ProfileMemoryPage };
});
const AgentMemoryPage = lazy(async () => {
  const module = await import("./M17Pages.js");
  return { default: module.AgentMemoryPage };
});
const AgentEvaluationsPage = lazy(async () => {
  const module = await import("./M18Pages.js");
  return { default: module.AgentEvaluationsPage };
});
const AgentActivityPage = lazy(async () => {
  const module = await import("./M18Pages.js");
  return { default: module.AgentActivityPage };
});
const KnowledgeSourcesPage = lazy(async () => {
  const module = await import("./M19Pages.js");
  return { default: module.KnowledgeSourcesPage };
});
const KnowledgeDocumentPage = lazy(async () => {
  const module = await import("./M19Pages.js");
  return { default: module.KnowledgeDocumentPage };
});
const KnowledgeSearchPage = lazy(async () => {
  const module = await import("./M20Pages.js");
  return { default: module.KnowledgeSearchPage };
});
const KnowledgeOverviewPage = lazy(async () => {
  const module = await import("./M21Pages.js");
  return { default: module.KnowledgeOverviewPage };
});
const KnowledgeEntitiesPage = lazy(async () => {
  const module = await import("./M21Pages.js");
  return { default: module.KnowledgeEntitiesPage };
});
const KnowledgeEntityPage = lazy(async () => {
  const module = await import("./M21Pages.js");
  return { default: module.KnowledgeEntityPage };
});
const ConnectionsPage = lazy(async () => ({
  default: (await import("./M22Pages.js")).ConnectionsPage
}));
const ConnectionSetupPage = lazy(async () => ({
  default: (await import("./M22Pages.js")).ConnectionSetupPage
}));
const ConnectionDetailPage = lazy(async () => ({
  default: (await import("./M22Pages.js")).ConnectionDetailPage
}));
const WorkflowTriggersPage = lazy(async () => ({
  default: (await import("./M26Pages.js")).WorkflowTriggersPage
}));
const NotificationCenterPage = lazy(async () => ({
  default: (await import("./M27Pages.js")).NotificationCenterPage
}));
const NotificationSettingsPage = lazy(async () => ({
  default: (await import("./M27Pages.js")).NotificationSettingsPage
}));
const GlobalSearchPage = lazy(async () => ({
  default: (await import("./M28Pages.js")).GlobalSearchPage
}));
const AnalyticsPage = lazy(async () => ({
  default: (await import("./M28Pages.js")).AnalyticsPage
}));
const ReportDetailPage = lazy(async () => ({
  default: (await import("./M28Pages.js")).ReportDetailPage
}));
const BillingPage = lazy(async () => ({ default: (await import("./M29Pages.js")).BillingPage }));
const UsagePage = lazy(async () => ({ default: (await import("./M29Pages.js")).UsagePage }));
const DeveloperPlatformPage = lazy(async () => ({
  default: (await import("./M30Pages.js")).DeveloperPlatformPage
}));
const GovernancePage = lazy(async () => ({
  default: (await import("./M31Pages.js")).GovernancePage
}));
const EnterpriseIdentityPage = lazy(async () => ({
  default: (await import("./M32Pages.js")).EnterpriseIdentityPage
}));
const HelpCenterPage = lazy(async () => ({
  default: (await import("./M33HelpPages.js")).HelpCenterPage
}));
const SupportPage = lazy(async () => ({
  default: (await import("./M33HelpPages.js")).SupportPage
}));
const SupportDetailPage = lazy(async () => ({
  default: (await import("./M33HelpPages.js")).SupportDetailPage
}));
const FeedbackPage = lazy(async () => ({
  default: (await import("./M33HelpPages.js")).FeedbackPage
}));
const InformationPage = lazy(async () => ({
  default: (await import("./M33Pages.js")).InformationPage
}));
const ContactPage = lazy(async () => ({ default: (await import("./M33Pages.js")).ContactPage }));
const GuestPage = lazy(async () => ({ default: (await import("./M33Pages.js")).GuestPage }));
const OperatorConsole = lazy(async () => ({
  default: (await import("./M34Pages.js")).OperatorConsole
}));
const FeatureAccessPage = lazy(async () => ({
  default: (await import("./M34Pages.js")).FeatureAccessPage
}));
const SecurityAssurancePage = lazy(async () => ({
  default: (await import("./M35Pages.js")).SecurityAssurancePage
}));
const ReleasesPage = lazy(async () => ({ default: (await import("./M37Pages.js")).ReleasesPage }));

const ProductMarketingPage = lazy(async () => ({
  default: (await import("./M02PublicSitePages.js")).ProductMarketingPage
}));
const SolutionMarketingPage = lazy(async () => ({
  default: (await import("./M02PublicSitePages.js")).SolutionMarketingPage
}));
const PricingMarketingPage = lazy(async () => ({
  default: (await import("./M02PublicSitePages.js")).PricingMarketingPage
}));
const TemplatesMarketingPage = lazy(async () => ({
  default: (await import("./M02PublicSitePages.js")).TemplatesMarketingPage
}));
const DocsMarketingPage = lazy(async () => ({
  default: (await import("./M02PublicSitePages.js")).DocsMarketingPage
}));
const SecurityMarketingPage = lazy(async () => ({
  default: (await import("./M02PublicSitePages.js")).SecurityMarketingPage
}));

const solutionNames = new Set([
  "operations",
  "go-to-market",
  "product",
  "support",
  "finance",
  "hr",
  "it"
]);

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
  const storage =
    typeof globalThis.localStorage?.getItem === "function" &&
    typeof globalThis.localStorage?.setItem === "function"
      ? globalThis.localStorage
      : null;
  const [preference, setPreference] = useState<ConsentPreference | null>(() =>
    storage ? readConsent(storage) : "essential"
  );
  if (preference) return null;
  const choose = (value: ConsentPreference) => {
    if (storage) writeConsent(storage, value);
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

function PublicLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  return (
    <div className={home ? "public-shell public-shell--home" : "public-shell"}>
      <a className="skip-link" href="#main-content">
        {msg("public.skip")}
      </a>
      <PublicHeader />
      <main id="main-content">{children}</main>
      <PublicFooter />
      <ConsentBanner />
    </div>
  );
}

function PublicHome() {
  useMetadata(msg("public.title.home"));
  return (
    <PublicLayout home>
      <PublicHomeContent />
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
  useMetadata(ownedPublicTitles[route.id] ?? msg("brand.name"));
  if (route.id === "route.public.home") return <PublicHome />;
  if (route.id === "route.contact")
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading contact" />}>
          <ContactPage />
        </Suspense>
      </PublicLayout>
    );
  if (route.id === "route.guest")
    return (
      <Suspense fallback={<Skeleton label="Loading guest access" />}>
        <GuestPage />
      </Suspense>
    );
  if (
    [
      "route.help",
      "route.help.wildcard",
      "route.status",
      "route.trust",
      "route.accessibility",
      "route.legal.acceptable-use",
      "route.legal.dpa",
      "route.legal.privacy",
      "route.legal.subprocessors",
      "route.legal.terms"
    ].includes(route.id)
  )
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading information" />}>
          {route.id === "route.help" || route.id === "route.help.wildcard" ? (
            <HelpCenterPage {...(params["*"] ? { slug: params["*"] } : {})} />
          ) : (
            <InformationPage routeId={route.id} />
          )}
        </Suspense>
      </PublicLayout>
    );
  if (route.id === "route.docs.wildcard" && params["*"] === "components") {
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label={msg("workbench.loading")} />}>
          <ComponentWorkbench />
        </Suspense>
      </PublicLayout>
    );
  }
  const productPageByRoute: Readonly<
    Record<string, "overview" | "workflows" | "agents" | "knowledge" | "integrations">
  > = {
    "route.product": "overview",
    "route.product.workflows": "workflows",
    "route.product.agents": "agents",
    "route.product.knowledge": "knowledge",
    "route.product.integrations": "integrations"
  };
  const productPage = productPageByRoute[route.id];
  if (productPage)
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading product" />}>
          <ProductMarketingPage page={productPage} />
        </Suspense>
      </PublicLayout>
    );
  if (route.id === "route.solutions.detail") {
    const solution = params.solution;
    if (!solution || !solutionNames.has(solution)) return <NotFound />;
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading solution" />}>
          <SolutionMarketingPage solution={solution} />
        </Suspense>
      </PublicLayout>
    );
  }
  if (
    route.id === "route.templates.detail" &&
    !["incident-response", "customer-onboarding"].includes(params.slug ?? "")
  )
    return <NotFound />;
  if (route.id === "route.templates" || route.id === "route.templates.detail")
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading templates" />}>
          <TemplatesMarketingPage {...(params.slug ? { slug: params.slug } : {})} />
        </Suspense>
      </PublicLayout>
    );
  if (route.id === "route.docs" || route.id === "route.docs.wildcard")
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading documentation" />}>
          <DocsMarketingPage {...(params["*"] ? { slug: params["*"] } : {})} />
        </Suspense>
      </PublicLayout>
    );
  if (route.id === "route.pricing")
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading pricing" />}>
          <PricingMarketingPage />
        </Suspense>
      </PublicLayout>
    );
  if (route.id === "route.security")
    return (
      <PublicLayout>
        <Suspense fallback={<Skeleton label="Loading security" />}>
          <SecurityMarketingPage />
        </Suspense>
      </PublicLayout>
    );
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

function CustomerRouteContent({ route }: { route: WebRouteManifestEntry }) {
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
  if (route.id === "route.app.profile.sessions")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading session security" />}>
          <SessionsPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.profile")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading profile" />}>
          <ProfilePage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.onboarding")
    return (
      <Suspense fallback={<Skeleton label={msg("app.loading.workspace")} />}>
        <OnboardingPage />
      </Suspense>
    );
  if (route.id === "route.app.settings.workspace")
    return (
      <Suspense fallback={<Skeleton label={msg("app.loading.workspace")} />}>
        <WorkspaceSettingsPage />
      </Suspense>
    );
  if (route.id === "route.app.settings.members")
    return (
      <Suspense fallback={<Skeleton label={msg("app.loading.workspace")} />}>
        <MembersPage />
      </Suspense>
    );
  if (route.id === "route.app.settings.roles")
    return (
      <Suspense fallback={<Skeleton label={msg("app.loading.workspace")} />}>
        <RolesPage />
      </Suspense>
    );
  if (route.id === "route.app.workflows.detail")
    return (
      <Suspense fallback={<Skeleton label={msg("studio.loading")} />}>
        <WorkflowDetailPage />
      </Suspense>
    );
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
  if (route.id === "route.app.workflows.detail.settings")
    return (
      <Suspense fallback={<Skeleton label={msg("studio.loading")} />}>
        <WorkflowSettingsPage />
      </Suspense>
    );
  if (
    route.id === "route.app.workflows.detail.versions" ||
    route.id === "route.app.workflows.detail.versions.detail"
  )
    return (
      <Suspense fallback={<Skeleton label={msg("studio.loading")} />}>
        <WorkflowVersionsPage />
      </Suspense>
    );
  if (route.id === "route.app.templates" || route.id === "route.app.templates.detail")
    return (
      <Suspense fallback={<Skeleton label={msg("studio.loading")} />}>
        <TemplatesPage />
      </Suspense>
    );
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
  if (route.id === "route.app.approvals")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading approvals" />}>
          <ApprovalInboxPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.approvals.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading approval" />}>
          <ApprovalDetailPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading agent catalog" />}>
          <AgentCatalogPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents.new")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading agent creation" />}>
          <AgentCreatePage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading agent" />}>
          <AgentOverviewPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents.detail.builder")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading agent builder" />}>
          <AgentBuilderPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.profile.memory")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading private memory" />}>
          <ProfileMemoryPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents.detail.memory")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading agent memory" />}>
          <AgentMemoryPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents.detail.evals")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("eval.loading")} />}>
          <AgentEvaluationsPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.agents.detail.activity")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("activity.loading")} />}>
          <AgentActivityPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.knowledge.sources")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("files.loading")} />}>
          <KnowledgeSourcesPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.knowledge.documents.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("files.loading")} />}>
          <KnowledgeDocumentPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.knowledge.search")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("retrieval.loading")} />}>
          <KnowledgeSearchPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.knowledge")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("graph.loading")} />}>
          <KnowledgeOverviewPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.knowledge.entities")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("graph.loading")} />}>
          <KnowledgeEntitiesPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.knowledge.entities.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("graph.loading")} />}>
          <KnowledgeEntityPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.connections")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("connections.loading")} />}>
          <ConnectionsPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.connections.new.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("connections.loading")} />}>
          <ConnectionSetupPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.connections.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("connections.loading")} />}>
          <ConnectionDetailPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.workflows.detail.triggers")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("triggers.loading")} />}>
          <WorkflowTriggersPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.notifications")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("notifications.loading")} />}>
          <NotificationCenterPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.settings.notifications")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("notification.settings.loading")} />}>
          <NotificationSettingsPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.search")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("search.loading")} />}>
          <GlobalSearchPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app" || route.id === "route.app.analytics")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("analytics.loading")} />}>
          <AnalyticsPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.analytics.reports.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("analytics.loading")} />}>
          <ReportDetailPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.settings.billing" || route.id === "route.app.settings.usage")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("billing.loading")} />}>
          {route.id === "route.app.settings.billing" ? <BillingPage /> : <UsagePage />}
        </Suspense>
      </AuthGate>
    );
  if (
    [
      "route.app.developer.api",
      "route.app.developer.apps",
      "route.app.developer.webhooks",
      "route.app.settings.developers",
      "route.app.settings.webhooks"
    ].includes(route.id)
  )
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label={msg("developer.loading")} />}>
          <DeveloperPlatformPage />
        </Suspense>
      </AuthGate>
    );
  if (
    [
      "route.app.settings.audit",
      "route.app.settings.data",
      "route.app.settings.support-access",
      "route.ops.privacy"
    ].includes(route.id)
  )
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading governance controls" />}>
          <GovernancePage />
        </Suspense>
      </AuthGate>
    );
  if (
    [
      "route.app.settings.identity",
      "route.app.settings.policies",
      "route.app.settings.security"
    ].includes(route.id)
  )
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading enterprise controls" />}>
          <EnterpriseIdentityPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.support")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading support" />}>
          <SupportPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.support.detail")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading support case" />}>
          <SupportDetailPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.feedback")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading feedback" />}>
          <FeedbackPage />
        </Suspense>
      </AuthGate>
    );
  if (route.id === "route.app.settings.feature-access")
    return (
      <AuthGate>
        <Suspense fallback={<Skeleton label="Loading feature access" />}>
          <FeatureAccessPage />
        </Suspense>
      </AuthGate>
    );
  return (
    <AuthGate>
      <div className="page-shell">
        <Badge tone="warning">
          {msg("public.page.planned", { milestone: route.ownerMilestone })}
        </Badge>
        <h1>{msg("customer.route.heading")}</h1>
        <p>{msg("customer.route.body")}</p>
        <Button>
          <Menu aria-hidden="true" />
          {msg("customer.nav.open")}
        </Button>
      </div>
    </AuthGate>
  );
}

function CustomerRoute({ route }: { readonly route: WebRouteManifestEntry }) {
  const fullCanvas = [
    "route.app.workflows.new",
    "route.app.workflows.detail.studio",
    "route.app.onboarding"
  ].includes(route.id);
  const content = <CustomerRouteContent route={route} />;
  return fullCanvas ? content : <WorkspaceShell>{content}</WorkspaceShell>;
}

function OperatorRoute({ route }: { route: WebRouteManifestEntry }) {
  useMetadata(msg("operator.surface"), true);
  if (route.id === "route.ops.releases")
    return (
      <div className="operator-shell">
        <span className="sr-only">{msg("operator.plane")}</span>
        <Suspense fallback={<Skeleton label="Loading releases" />}>
          <ReleasesPage />
        </Suspense>
      </div>
    );
  if (route.id === "route.ops.security")
    return (
      <div className="operator-shell">
        <span className="sr-only">{msg("operator.plane")}</span>
        <Suspense fallback={<Skeleton label="Loading security assurance" />}>
          <SecurityAssurancePage />
        </Suspense>
      </div>
    );
  if (
    [
      "route.ops",
      "route.ops.incidents",
      "route.ops.providers",
      "route.ops.runtime",
      "route.ops.support",
      "route.ops.workspaces.detail"
    ].includes(route.id)
  )
    return (
      <div className="operator-shell">
        <span className="sr-only">{msg("operator.plane")}</span>
        <Suspense fallback={<Skeleton label="Loading operator controls" />}>
          <OperatorConsole />
        </Suspense>
      </div>
    );
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
  if (route.id === "route.invitations.accept")
    return (
      <Suspense fallback={<Skeleton label={msg("app.loading.workspace")} />}>
        <InvitationAcceptPage />
      </Suspense>
    );
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
