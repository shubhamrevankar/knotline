import { canonicalWebRoutes } from "@knotline/contracts";

export type RoutePlane = "customer" | "operator" | "public";
export type RouteDataSource = "query" | "static";

export interface WebRouteManifestEntry {
  readonly id: string;
  readonly path: string;
  readonly routeClass: string;
  readonly plane: RoutePlane;
  readonly entitlement: string | null;
  readonly ownerMilestone: string;
  readonly journeyIds: readonly string[];
  readonly dataSource: RouteDataSource;
}

function plane(path: string): RoutePlane {
  if (path === "/ops" || path.startsWith("/ops/")) return "operator";
  if (path === "/app" || path.startsWith("/app/")) return "customer";
  return "public";
}

function entitlement(id: string, routePlane: RoutePlane): string | null {
  if (routePlane === "public") return null;
  if (routePlane === "operator") return "platform-operator";
  if (id.includes("billing")) return "workspace-billing";
  if (id.includes("admin") || id.includes("settings")) return "workspace-administration";
  return "workspace-member";
}

export const WEB_ROUTE_MANIFEST: readonly WebRouteManifestEntry[] = canonicalWebRoutes.map(
  (route) => {
    const routePlane = plane(route.path);
    return {
      id: route.id,
      path: route.path,
      routeClass: route.routeClass,
      plane: routePlane,
      entitlement: entitlement(route.id, routePlane),
      ownerMilestone: route.ownerMilestone,
      journeyIds: route.journeyIds,
      dataSource: route.routeClass.includes("async") || routePlane !== "public" ? "query" : "static"
    };
  }
);
