#!/usr/bin/env tsx

import routeContract from "../../contracts/generated/routes.json" with { type: "json" };
import { WEB_ROUTE_MANIFEST } from "../../apps/web/src/routes/manifest.js";

const errors: string[] = [];
const expected = new Map(routeContract.entries.map((route) => [route.id, route]));
const seen = new Set<string>();

for (const route of WEB_ROUTE_MANIFEST) {
  if (seen.has(route.id)) errors.push(`Duplicate web route ID: ${route.id}`);
  seen.add(route.id);
  const source = expected.get(route.id);
  if (!source) {
    errors.push(`Unknown web route ID: ${route.id}`);
    continue;
  }
  for (const key of ["path", "routeClass", "ownerMilestone"] as const) {
    if (route[key] !== source[key]) errors.push(`${route.id} ${key} drift`);
  }
  if (JSON.stringify(route.journeyIds) !== JSON.stringify(source.journeyIds))
    errors.push(`${route.id} journey drift`);
  const expectedPlane = route.path.startsWith("/ops")
    ? "operator"
    : route.path.startsWith("/app")
      ? "customer"
      : "public";
  if (route.plane !== expectedPlane) errors.push(`${route.id} is mounted in the wrong plane`);
  if (route.plane !== "public" && !route.entitlement)
    errors.push(`${route.id} lacks an entitlement`);
}
for (const id of expected.keys()) if (!seen.has(id)) errors.push(`Missing web route ID: ${id}`);
if (WEB_ROUTE_MANIFEST.length !== expected.size)
  errors.push(`Expected ${expected.size} web routes, found ${WEB_ROUTE_MANIFEST.length}`);

if (errors.length > 0) throw new Error(`Web route manifest failed:\n- ${errors.join("\n- ")}`);
process.stdout.write(`Web route manifest passed (${WEB_ROUTE_MANIFEST.length} routes).\n`);
