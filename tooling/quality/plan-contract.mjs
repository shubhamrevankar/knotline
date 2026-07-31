#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../..");
export const PLAN_PATH = join(
  ROOT,
  "docs/implementation/knotline/2026-07-31-complete-end-to-end-implementation-plan.md"
);
export const GENERATED_DIRECTORY = join(ROOT, "contracts/generated");
const GENERATED_PACKAGE_ROUTES = join(ROOT, "packages/contracts/src/routes.generated.ts");

const GENERATED_FILES = Object.freeze({
  requirements: "requirements.json",
  milestones: "milestones.json",
  routes: "routes.json",
  routeStates: "route-states.json",
  journeys: "journeys.json",
  api: "api-operations.json",
  externalGates: "external-gates.json",
  traceability: "traceability.json",
  criteria: "environment-criteria.json",
  gateActivation: "gate-activation.json",
  schemas: "evidence-schemas.json",
  index: "registry-index.json"
});

const REQ_ID = /^(?:ID|ON|WF|RN|HU|AG|KN|CN|CO|BL|AD|OP|EX|NFR)-\d{3}$/;
const MILESTONE_ID = /^M\d{2}$/;
const JOURNEY_ID = /^CJ-\d{2}(?:\.[A-Z0-9_]+)?$/;
const EXTERNAL_ID = /^EXT-\d{3}$/;
const API_LINE = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)$/;

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex")}`;
}

export function stableJson(value) {
  return `${JSON.stringify(value, Object.keys(value).sort(), 2)}\n`;
}

function deepSort(value) {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, deepSort(item)])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(deepSort(value), null, 2)}\n`;
}

function section(markdown, startPattern, endPattern) {
  const start = markdown.search(startPattern);
  if (start < 0) throw new Error(`Missing plan section: ${startPattern}`);
  const tail = markdown.slice(start);
  const relativeEnd = tail.slice(1).search(endPattern);
  return relativeEnd < 0 ? tail : tail.slice(0, relativeEnd + 1);
}

function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

function stripCode(value) {
  return value.replaceAll("`", "").trim();
}

function ids(value, pattern) {
  return [...new Set([...value.matchAll(pattern)].map((match) => match[0]))].sort();
}

function milestoneIdsIn(value) {
  const result = new Set(ids(value, /M\d{2}/g));
  for (const match of value.replaceAll("–", "-").matchAll(/M(\d{2})-M(\d{2})/g)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    for (let number = start; number <= end; number += 1)
      result.add(`M${String(number).padStart(2, "0")}`);
  }
  return [...result].sort();
}

export function expandIdExpression(expression) {
  const expanded = [];
  const normalized = stripCode(expression).replaceAll("–", "-");
  for (const token of normalized.split(",").map((part) => part.trim())) {
    const range = token.match(/^([A-Z]+)-(\d{3})-([A-Z]+-)?(\d{3})$/);
    if (range) {
      const [, prefix, fromText, repeatedPrefix, toText] = range;
      if (repeatedPrefix && repeatedPrefix !== `${prefix}-`) {
        throw new Error(`Mismatched requirement range: ${token}`);
      }
      const from = Number(fromText);
      const to = Number(toText);
      if (to < from) throw new Error(`Descending requirement range: ${token}`);
      for (let number = from; number <= to; number += 1) {
        expanded.push(`${prefix}-${String(number).padStart(3, "0")}`);
      }
      continue;
    }
    if (REQ_ID.test(token)) expanded.push(token);
  }
  return expanded;
}

function parseRequirements(markdown) {
  const source = section(markdown, /^## 3\. Complete product requirements/m, /^## 5\./m);
  const seen = new Set();
  const requirements = [];
  for (const row of tableRows(source)) {
    const id = stripCode(row[0] ?? "");
    if (!REQ_ID.test(id)) continue;
    if (seen.has(id)) throw new Error(`Duplicate requirement ${id}`);
    seen.add(id);
    requirements.push({
      id,
      statement: stripCode(row[1] ?? ""),
      sourceSection: id.startsWith("NFR-") ? "4" : "3"
    });
  }
  return requirements.sort((a, b) => a.id.localeCompare(b.id));
}

function parseDependencyMap(markdown) {
  const source = section(markdown, /^## 22\. Milestone dependency map/m, /^## 23\./m);
  const dependencies = new Map();
  for (const row of tableRows(source)) {
    const id = stripCode(row[0] ?? "");
    if (!MILESTONE_ID.test(id)) continue;
    const direct = ids(row[1] ?? "", /M\d{2}/g);
    if (dependencies.has(id)) throw new Error(`Duplicate milestone dependency row ${id}`);
    dependencies.set(id, direct);
  }
  return dependencies;
}

function parseMilestones(markdown) {
  const detailed = section(markdown, /^## 23\. Detailed implementation milestones/m, /^## 24\./m);
  const dependencies = parseDependencyMap(markdown);
  const headings = [...detailed.matchAll(/^### (M\d{2}) — (.+)$/gm)];
  const milestones = headings.map((heading, index) => {
    const id = heading[1];
    const bodyStart = (heading.index ?? 0) + heading[0].length;
    const bodyEnd = headings[index + 1]?.index ?? detailed.length;
    const body = detailed.slice(bodyStart, bodyEnd);
    const status = body.match(/^\*\*Status:\*\* `([A-Z_]+)`/m)?.[1];
    const dependencyBlock =
      body.match(/^\*\*Depends on:\*\* ([\s\S]+?)\\\n\*\*Required commit:/m)?.[1] ?? "";
    const declaredDependencies = ids(dependencyBlock, /M\d{2}/g);
    const requiredCommit = body.match(/^\*\*Required commit:\*\* `([^`]+)`/m)?.[1];
    if (!id || !status || !requiredCommit)
      throw new Error(`Incomplete detailed milestone ${id ?? "unknown"}`);
    const mapped = dependencies.get(id);
    if (!mapped) throw new Error(`Missing dependency map row ${id}`);
    if (JSON.stringify(mapped) !== JSON.stringify(declaredDependencies)) {
      throw new Error(
        `Dependency mismatch for ${id}: map=${mapped.join(",")} detail=${declaredDependencies.join(",")}`
      );
    }
    return { id, title: heading[2].trim(), status, dependencies: mapped, requiredCommit };
  });
  if (milestones.length !== dependencies.size)
    throw new Error("Detailed milestone/dependency map cardinality mismatch");
  validateDag(milestones);
  return milestones;
}

function validateDag(milestones) {
  const known = new Set(milestones.map(({ id }) => id));
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(milestones.map((item) => [item.id, item]));
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Cyclic milestone dependency at ${id}`);
    if (visited.has(id)) return;
    const item = byId.get(id);
    if (!item) throw new Error(`Unknown milestone ${id}`);
    visiting.add(id);
    for (const dependency of item.dependencies) {
      if (!known.has(dependency)) throw new Error(`Unknown dependency ${dependency} from ${id}`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const milestone of milestones) visit(milestone.id);
}

function routeId(path) {
  if (path === "/") return "route.public.home";
  const tokens = path
    .split("/")
    .filter(Boolean)
    .map((token) =>
      token === "*"
        ? "wildcard"
        : token.startsWith(":")
          ? "detail"
          : token.replace(/[^a-zA-Z0-9]+/g, "-")
    );
  return `route.${tokens.join(".")}`;
}

function routeClass(path, sourceSection) {
  if (path.startsWith("/ops")) return "live_operator";
  if (/\/(runs|tasks|approvals)(?:\/|$)/.test(path)) return "live_operator";
  if (/\/(studio|settings|new)(?:\/|$)/.test(path) || path === "/contact")
    return "editor_form_settings";
  if (/^\/auth\//.test(path) || path === "/invitations/accept" || path === "/guest")
    return "public_async";
  if (
    sourceSection === "5.1" &&
    (/^\/(templates|help|docs)(?:\/|$)/.test(path) || path === "/product/integrations")
  )
    return "public_async";
  if (sourceSection === "5.1") return "static_public";
  if (/:\w+/.test(path)) return "protected_detail";
  return "protected_collection";
}

function parseRoutes(markdown, milestoneIds) {
  const inventory = section(
    markdown,
    /^## 5\. Information architecture and route inventory/m,
    /^### 5\.8/m
  );
  const routeMap = new Map();
  let currentSection = "";
  for (const line of inventory.split("\n")) {
    const heading = line.match(/^### (5\.[1-7])/);
    if (heading) currentSection = heading[1];
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const path = stripCode(cells[0] ?? "");
    if (!path.startsWith("/")) continue;
    if (routeMap.has(path)) throw new Error(`Duplicate route inventory path ${path}`);
    routeMap.set(path, {
      id: routeId(path),
      path,
      requiredSurface: stripCode(cells[1] ?? ""),
      sourceSection: currentSection,
      routeClass: routeClass(path, currentSection),
      ownerMilestone: "",
      journeyIds: []
    });
  }

  const mapping = section(
    markdown,
    /The route ownership registry is not deferred/,
    /Evidence dimensions for each/
  );
  for (const row of tableRows(mapping)) {
    const paths = [...(row[0] ?? "").matchAll(/`(\/[^`]*)`/g)].map((match) => match[1]);
    const owner = stripCode(row[1] ?? "");
    if (!MILESTONE_ID.test(owner)) continue;
    if (!milestoneIds.has(owner)) throw new Error(`Unknown route owner ${owner}`);
    const journeyIds = ids(row[2] ?? "", /CJ-\d{2}(?:\.[A-Z0-9_]+)?/g);
    for (const path of paths) {
      const route = routeMap.get(path);
      if (!route) throw new Error(`Route ownership references unknown path ${path}`);
      if (route.ownerMilestone) throw new Error(`Multiply owned route ${path}`);
      route.ownerMilestone = owner;
      route.journeyIds = journeyIds;
    }
  }
  for (const route of routeMap.values()) {
    if (!route.ownerMilestone) throw new Error(`Orphan route ${route.path}`);
    if (route.journeyIds.length === 0) throw new Error(`Route without journey ${route.path}`);
  }
  const routeIds = new Set();
  for (const route of routeMap.values()) {
    if (routeIds.has(route.id)) throw new Error(`Duplicate semantic route ID ${route.id}`);
    routeIds.add(route.id);
  }
  return [...routeMap.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function parseRouteStates(markdown) {
  const source = section(
    markdown,
    /^### 5\.8 Route-state applicability and evidence/m,
    /The route ownership registry is not deferred/
  );
  const rows = [];
  for (const row of tableRows(source)) {
    const label = row[0] ?? "";
    if (!label || label === "Route class") continue;
    const routeClassByLabel = {
      "Static public/legal/help article": "static_public",
      "Public async/catalog/contact/auth": "public_async",
      "Protected collection/search": "protected_collection",
      "Protected detail": "protected_detail",
      "Editor/form/settings": "editor_form_settings",
      "Live run/task/approval/operator": "live_operator"
    };
    const id = routeClassByLabel[label];
    if (!id) continue;
    const split = (value) => value.split(",").map(stripCode).filter(Boolean);
    rows.push({
      routeClass: id,
      alwaysRequired: split(row[1] ?? ""),
      conditional: split(row[2] ?? ""),
      normallyNotApplicable: split(row[3] ?? "")
    });
  }
  if (rows.length !== 6) throw new Error(`Expected six route-state classes, found ${rows.length}`);
  return rows;
}

function parseJourneys(markdown, milestones, routes) {
  const milestoneIds = new Set(milestones.map(({ id }) => id));
  const milestoneById = new Map(milestones.map((item) => [item.id, item]));
  const source = section(markdown, /^### 5\.9 Canonical critical journeys/m, /^## 6\./m);
  const journeys = new Map();
  for (const row of tableRows(source)) {
    const first = stripCode(row[0] ?? "");
    const match = first.match(/^(CJ-\d{2})\s+(.+)$/);
    if (!match) continue;
    const owner = stripCode(row[4] ?? "");
    if (!milestoneIds.has(owner)) throw new Error(`Unknown journey owner ${owner}`);
    journeys.set(match[1], {
      id: match[1],
      title: match[2],
      actorAndPrecondition: stripCode(row[1] ?? ""),
      successfulOutcome: stripCode(row[2] ?? ""),
      mandatoryBranches: stripCode(row[3] ?? ""),
      ownerMilestone: owner,
      coverageProfiles: (row[5] ?? "").split(",").map(stripCode).filter(Boolean),
      routeIds: routes
        .filter((route) => route.journeyIds.includes(match[1]))
        .map((route) => route.id),
      prerequisiteMilestones: milestoneById.get(owner).dependencies
    });
  }
  const branchTableStart = source.indexOf("| Branch ID | Mandatory branch |");
  if (branchTableStart < 0) throw new Error("Missing journey branch table");
  for (const row of tableRows(source.slice(branchTableStart))) {
    const id = stripCode(row[0] ?? "");
    if (!JOURNEY_ID.test(id) || !id.includes(".")) continue;
    const owners = milestoneIdsIn(row[2] ?? "");
    if (owners.length === 0 || owners.some((owner) => !milestoneIds.has(owner)))
      throw new Error(`Invalid owners for branch ${id}`);
    const parent = id.slice(0, 5);
    if (!journeys.has(parent)) throw new Error(`Orphan journey branch ${id}`);
    journeys.set(id, {
      id,
      title: stripCode(row[1] ?? ""),
      parentJourneyId: parent,
      ownerMilestones: owners,
      completionRule: stripCode(row[2] ?? ""),
      routeIds: routes.filter((route) => route.journeyIds.includes(id)).map((route) => route.id),
      prerequisiteMilestones: [
        ...new Set(owners.flatMap((owner) => milestoneById.get(owner).dependencies))
      ].sort()
    });
  }
  for (let number = 1; number <= 24; number += 1) {
    const id = `CJ-${String(number).padStart(2, "0")}`;
    if (!journeys.has(id)) throw new Error(`Missing canonical journey ${id}`);
  }
  return [...journeys.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function kebab(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function makeOperationId(method, path) {
  const name = path
    .split("/")
    .filter(Boolean)
    .map((part) => (part.startsWith(":") ? `by-${kebab(part.slice(1))}` : kebab(part)))
    .join("-");
  return `${method.toLowerCase()}-${name}`;
}

function exposure(path) {
  if (path.startsWith("/edge/v1/")) return "public_anonymous";
  if (path.startsWith("/callbacks/v1/")) return "provider_callback";
  if (path.startsWith("/public/v1/")) return "public_customer";
  if (/^\/(?:scim\/v2|\.well-known|oauth|userinfo|jwks\.json)/.test(path)) return "standards";
  if (/^\/ops\/(?:edge|callbacks|scim)\//.test(path)) return "platform_operator_auth";
  if (path.startsWith("/ops/v1/")) return "platform_operator";
  return "browser_internal";
}

function parseApi(markdown) {
  const source = section(
    markdown,
    /^## 10\. HTTP API inventory and exposure contract/m,
    /^## 11\./m
  );
  const operations = [];
  const seen = new Set();
  let sourceSection = "10";
  let inFence = false;
  for (const line of source.split("\n")) {
    const heading = line.match(/^### (10\.\d+)/);
    if (heading) sourceSection = heading[1];
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    const match = line.trim().replace(/\s+/g, " ").match(API_LINE);
    if (!match) continue;
    const key = `${match[1]} ${match[2]}`;
    if (seen.has(key)) throw new Error(`Duplicate API operation ${key}`);
    seen.add(key);
    operations.push({
      id: makeOperationId(match[1], match[2]),
      method: match[1],
      path: match[2],
      exposure: exposure(match[2]),
      sourceSection
    });
  }
  const operationIds = new Set();
  for (const operation of operations) {
    if (operationIds.has(operation.id))
      throw new Error(`Duplicate normalized API operation ID ${operation.id}`);
    operationIds.add(operation.id);
  }
  return operations.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

function parseExternalGates(markdown, milestoneIds) {
  const register = section(
    markdown,
    /^### 16\.9 External gate register/m,
    /The following is the default complete-product GA policy/
  );
  const policies = section(
    markdown,
    /\| Gate \| Default GA policy \| Required terminal state \|/,
    /M38 calculates its gate set/
  );
  const policyMap = new Map();
  for (const row of tableRows(policies)) {
    const id = stripCode(row[0] ?? "");
    if (EXTERNAL_ID.test(id)) {
      const terminalState = (row[2] ?? "").match(
        /(?:NOT_APPLICABLE|SANDBOX_VERIFIED|PRODUCTION_VERIFIED)/
      )?.[0];
      if (!terminalState) throw new Error(`Missing terminal state for ${id}`);
      policyMap.set(id, {
        gaPolicy: stripCode(row[1] ?? ""),
        requiredTerminalState: terminalState
      });
    }
  }
  const result = [];
  for (const row of tableRows(register)) {
    const idAndName = stripCode(row[0] ?? "");
    const match = idAndName.match(/^(EXT-\d{3})\s+(.+)$/);
    if (!match) continue;
    const policy = policyMap.get(match[1]);
    if (!policy) throw new Error(`Missing GA policy for ${match[1]}`);
    const neededBy = ids(row[2] ?? "", /M\d{2}/g);
    if (neededBy.some((id) => !milestoneIds.has(id)))
      throw new Error(`Unknown milestone in ${match[1]}`);
    result.push({
      id: match[1],
      name: match[2],
      accountableRole: stripCode(row[1] ?? ""),
      neededBy,
      unblockEvidence: stripCode(row[3] ?? ""),
      initialState: stripCode(row[4] ?? "")
        .split("/")[0]
        .trim(),
      ...policy
    });
  }
  if (result.length !== policyMap.size) throw new Error("External gate register/policy mismatch");
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function parseTraceability(markdown, requirements, milestoneIds, routes, journeys, externalGates) {
  const source = section(markdown, /^### 24\.2 Primary ownership matrix/m, /^### 24\.3/m);
  const requirementMap = new Map(requirements.map((item) => [item.id, item]));
  const gateIds = new Set(externalGates.map(({ id }) => id));
  const result = new Map();
  for (const row of tableRows(source)) {
    const requirementIds = expandIdExpression(row[0] ?? "");
    if (requirementIds.length === 0) continue;
    const primaryMilestone = stripCode(row[1] ?? "");
    if (!milestoneIds.has(primaryMilestone))
      throw new Error(`Unknown traceability milestone ${primaryMilestone}`);
    const evidenceFamilies = (row[3] ?? "")
      .split(",")
      .map(stripCode)
      .filter((value) => /^[A-Z0-9]+$/.test(value));
    const external = ids(row[4] ?? "", /EXT-\d{3}/g);
    if (external.some((id) => !gateIds.has(id)))
      throw new Error(`Unknown external gate in traceability row ${row[0]}`);
    for (const requirementId of requirementIds) {
      if (!requirementMap.has(requirementId))
        throw new Error(`Unknown requirement owner ${requirementId}`);
      if (result.has(requirementId))
        throw new Error(`Duplicate requirement owner ${requirementId}`);
      const linkedRoutes = routes.filter((route) => route.ownerMilestone === primaryMilestone);
      const linkedJourneyIds = new Set(linkedRoutes.flatMap((route) => route.journeyIds));
      for (const journeyId of [...linkedJourneyIds])
        if (journeyId.includes(".")) linkedJourneyIds.add(journeyId.slice(0, 5));
      for (const journey of journeys) {
        const owners =
          "ownerMilestone" in journey ? [journey.ownerMilestone] : journey.ownerMilestones;
        if (owners.includes(primaryMilestone)) linkedJourneyIds.add(journey.id);
      }
      result.set(requirementId, {
        requirementId,
        primaryMilestone,
        regressionMilestones: ["M38"],
        primarySurfacesAndContracts: stripCode(row[2] ?? ""),
        evidenceFamilies,
        externalGates: external,
        routeIds: linkedRoutes.map(({ id }) => id),
        journeyIds: [...linkedJourneyIds].filter((id) => !id.includes(".")).sort(),
        journeyBranchIds: [...linkedJourneyIds].filter((id) => id.includes(".")).sort(),
        supportContractReason:
          linkedRoutes.length === 0 && linkedJourneyIds.size === 0
            ? `Plan-owned support contract implemented by ${primaryMilestone}`
            : null
      });
    }
  }
  for (const requirement of requirements)
    if (!result.has(requirement.id)) throw new Error(`Missing requirement owner ${requirement.id}`);
  for (const journey of journeys.filter(({ id }) => id.includes("."))) {
    const rows = [...result.values()];
    if (rows.some((row) => row.journeyBranchIds.includes(journey.id))) continue;
    const parentJourneyId = journey.id.slice(0, 5);
    const parentRows = rows.filter((row) => row.journeyIds.includes(parentJourneyId));
    if (parentRows.length === 0) continue;
    for (const row of parentRows)
      row.journeyBranchIds = [...new Set([...row.journeyBranchIds, journey.id])].sort();
  }
  return [...result.values()].sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

function parseEnvironmentCriteria(markdown, milestones) {
  const defaultsSource = section(
    markdown,
    /^### 27\.1 Required environment terminal state/m,
    /^### 27\.2/m
  );
  const defaults = new Map();
  for (const row of tableRows(defaultsSource)) {
    const id = stripCode(row[0] ?? "");
    if (MILESTONE_ID.test(id)) defaults.set(id, stripCode(row[1] ?? ""));
  }
  const detailed = section(markdown, /^## 23\. Detailed implementation milestones/m, /^## 24\./m);
  const headings = [...detailed.matchAll(/^### (M\d{2}) —/gm)];
  const criteria = [];
  for (let index = 0; index < headings.length; index += 1) {
    const milestone = headings[index][1];
    const body = detailed.slice(
      (headings[index].index ?? 0) + headings[index][0].length,
      headings[index + 1]?.index ?? detailed.length
    );
    const bullets = body.split("\n").reduce((items, line) => {
      if (/^- /.test(line)) items.push(line.slice(2).trim());
      else if (items.length > 0 && /^ {2}\S/.test(line))
        items[items.length - 1] += ` ${line.trim()}`;
      return items;
    }, []);
    const used = new Set();
    for (const bullet of bullets.filter((value) => /^\[(?:ENV|ENG\+ENV|ENV\+EXT)/.test(value))) {
      let slug =
        bullet
          .replace(/^\[[^\]]+\]\s*/, "")
          .toLowerCase()
          .replace(/`[^`]+`/g, " ")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .split("-")
          .slice(0, 8)
          .join("-") || "criterion";
      let suffix = 2;
      const base = slug;
      while (used.has(slug)) slug = `${base}-${suffix++}`;
      used.add(slug);
      criteria.push({
        criterionId: `${milestone}.ENV.${slug}`,
        milestone,
        sourceBullet: bullet,
        sourceBulletDigest: sha256(`${bullet}\n`),
        requiredTerminalState:
          bullet.match(
            /Required environment terminal:\s*`(STAGING_VERIFIED|PRODUCTION_VERIFIED|NOT_APPLICABLE)`/
          )?.[1] ??
          defaults.get(milestone) ??
          "NOT_APPLICABLE",
        externalGates: ids(bullet, /EXT-\d{3}/g)
      });
    }
  }
  if (defaults.size !== milestones.length)
    throw new Error("Missing milestone environment terminal-state default");
  return criteria.sort((a, b) => a.criterionId.localeCompare(b.criterionId));
}

function parseGateActivation(markdown, milestoneIds) {
  const source = section(
    markdown,
    /\| Activated by \| Gate capabilities activated and cumulative thereafter \|/,
    /^### 20\.7/m
  );
  const entries = [];
  const byId = new Map();
  for (const row of tableRows(source)) {
    const expression = stripCode(row[0] ?? "").replaceAll("–", "-");
    if (!/^M\d{2}(?:-M\d{2})?$/.test(expression)) continue;
    const match = expression.match(/^M(\d{2})(?:-M(\d{2}))?$/);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    const activationMilestones = [];
    for (let number = start; number <= end; number += 1)
      activationMilestones.push(`M${String(number).padStart(2, "0")}`);
    if (activationMilestones.some((id) => !milestoneIds.has(id)))
      throw new Error(`Unknown gate activation milestone ${expression}`);
    const capabilities = (row[1] ?? "").split(",").map(stripCode).filter(Boolean);
    for (const capability of capabilities) {
      const id = capability
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!id) throw new Error(`Invalid gate capability ${capability}`);
      const existing = byId.get(id);
      if (existing) {
        existing.activationMilestones = [
          ...new Set([...existing.activationMilestones, ...activationMilestones])
        ].sort();
      } else {
        const entry = { id, capability, activationMilestones };
        byId.set(id, entry);
        entries.push(entry);
      }
    }
  }
  return entries;
}

function evidenceSchemas() {
  const digest = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
  const nonEmpty = { type: "string", minLength: 1 };
  const stringArray = { type: "array", items: nonEmpty, uniqueItems: true };
  const common = {
    schemaVersion: { const: 1 },
    milestone: { type: "string", pattern: "^M[0-9]{2}$" }
  };
  return [
    {
      id: "evidence-declaration-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "milestone",
          "targetEngineeringState",
          "declaredEnvironmentState",
          "owners",
          "requirements",
          "activeGateRows",
          "notYetApplicable",
          "environmentGates",
          "externalGates",
          "testRuns",
          "manualReviews",
          "deployments",
          "migrations",
          "flags",
          "knownRisks",
          "evidenceUris"
        ],
        properties: {
          ...common,
          targetEngineeringState: { enum: ["VERIFIED", "COMMITTED"] },
          declaredEnvironmentState: {
            enum: ["NOT_DEPLOYED", "STAGING_VERIFIED", "PRODUCTION_VERIFIED"]
          },
          owners: stringArray,
          requirements: stringArray,
          activeGateRows: stringArray,
          notYetApplicable: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["row", "activationMilestone", "reason"],
              properties: { row: nonEmpty, activationMilestone: common.milestone, reason: nonEmpty }
            }
          },
          environmentGates: { type: "array" },
          externalGates: { type: "array" },
          testRuns: { type: "array" },
          manualReviews: { type: "array" },
          deployments: { type: "array" },
          migrations: { type: "array" },
          flags: { type: "array" },
          knownRisks: { type: "array" },
          evidenceUris: stringArray
        }
      }
    },
    {
      id: "postcommit-manifest-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "milestone",
          "declarationDigest",
          "sourceCommit",
          "workflowId",
          "jobId",
          "startedAt",
          "endedAt",
          "artifactDigests",
          "testResults",
          "evidenceUris",
          "signature"
        ],
        properties: {
          ...common,
          declarationDigest: digest,
          sourceCommit: { type: "string", pattern: "^(?:[a-f0-9]{40}|[a-f0-9]{64})$" },
          workflowId: nonEmpty,
          jobId: nonEmpty,
          startedAt: { type: "string", format: "date-time" },
          endedAt: { type: "string", format: "date-time" },
          artifactDigests: { type: "object", minProperties: 1, additionalProperties: digest },
          imageDigests: { type: "object", minProperties: 1, additionalProperties: digest },
          sbomDigests: { type: "object", minProperties: 1, additionalProperties: digest },
          provenanceDigests: { type: "object", minProperties: 1, additionalProperties: digest },
          testResults: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "status", "evidenceUri"],
              properties: {
                id: nonEmpty,
                status: { const: "PASS" },
                evidenceUri: nonEmpty,
                artifactDigest: digest,
                durationMs: { type: "integer", minimum: 0 }
              }
            }
          },
          evidenceUris: { ...stringArray, minItems: 1 },
          deployments: stringArray,
          reviewerAttestations: stringArray,
          signature: {
            type: "object",
            additionalProperties: false,
            required: ["algorithm", "identity", "bundleUri", "bundleDigest"],
            properties: {
              algorithm: { const: "sigstore" },
              identity: nonEmpty,
              bundleUri: nonEmpty,
              bundleDigest: digest
            }
          }
        }
      }
    },
    {
      id: "route-coverage-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "milestone", "planDigest", "routeRegistryDigest", "routes"],
        properties: {
          schemaVersion: { const: 1 },
          milestone: common.milestone,
          planDigest: digest,
          routeRegistryDigest: digest,
          routes: { type: "array" }
        }
      }
    },
    {
      id: "requirement-traceability-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "planDigest", "traceabilityRegistryDigest", "requirements"],
        properties: {
          schemaVersion: { const: 1 },
          planDigest: digest,
          traceabilityRegistryDigest: digest,
          requirements: { type: "array" }
        }
      }
    },
    {
      id: "external-gate-ledger-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "planDigest", "gates"],
        properties: { schemaVersion: { const: 1 }, planDigest: digest, gates: { type: "array" } }
      }
    },
    {
      id: "capability-metadata-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "summary", "owner", "runbook", "externalGates"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_]*(?:\\.[a-z0-9_]+)+$" },
          status: { enum: ["LIVE", "BETA", "DEMO", "PLANNED"] },
          summary: nonEmpty,
          owner: {
            type: "object",
            additionalProperties: false,
            required: ["team", "contact"],
            properties: { team: nonEmpty, contact: nonEmpty }
          },
          runbook: nonEmpty,
          externalGates: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", pattern: "^EXT-[0-9]{3}$" }
          },
          evidence: {
            type: "object",
            additionalProperties: false,
            required: ["environment", "verifiedAt", "reference"],
            properties: {
              environment: { enum: ["local", "development", "staging", "production"] },
              verifiedAt: { type: "string", format: "date-time" },
              reference: nonEmpty
            }
          }
        }
      }
    },
    {
      id: "environment-promotion-v1",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "artifact",
          "targetEnvironment",
          "safeDefault",
          "smoke",
          "rollback",
          "alerts",
          "owner",
          "runbook",
          "externalGates",
          "publicStatus"
        ],
        properties: {
          schemaVersion: { const: 1 },
          artifact: {
            type: "object",
            additionalProperties: false,
            required: ["commitSha", "sha256"],
            properties: {
              commitSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
              sha256: { type: "string", pattern: "^[a-f0-9]{64}$" }
            }
          },
          targetEnvironment: { enum: ["development", "staging", "production"] },
          safeDefault: {
            type: "object",
            additionalProperties: false,
            required: ["externalWritesEnabled", "expensiveWorkEnabled", "featureFlags"],
            properties: {
              externalWritesEnabled: { const: false },
              expensiveWorkEnabled: { const: false },
              featureFlags: { type: "object", additionalProperties: { type: "boolean" } }
            }
          },
          smoke: {
            type: "object",
            additionalProperties: false,
            required: ["journeyId", "command", "syntheticTenantId", "expectedResult"],
            properties: {
              journeyId: nonEmpty,
              command: nonEmpty,
              syntheticTenantId: nonEmpty,
              expectedResult: nonEmpty
            }
          },
          rollback: {
            type: "object",
            additionalProperties: false,
            required: ["procedure", "triggers"],
            properties: { procedure: nonEmpty, triggers: { ...stringArray, minItems: 1 } }
          },
          alerts: { ...stringArray, minItems: 1 },
          owner: {
            type: "object",
            additionalProperties: false,
            required: ["team", "contact"],
            properties: { team: nonEmpty, contact: nonEmpty }
          },
          runbook: nonEmpty,
          externalGates: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "state", "required"],
              properties: {
                id: { type: "string", pattern: "^EXT-[0-9]{3}$" },
                state: {
                  enum: [
                    "NOT_APPLICABLE",
                    "BLOCKED_EXTERNAL",
                    "SIMULATED",
                    "SANDBOX_VERIFIED",
                    "PRODUCTION_VERIFIED"
                  ]
                },
                required: { type: "boolean" }
              }
            }
          },
          publicStatus: { enum: ["LIVE", "BETA", "DEMO", "PLANNED"] }
        }
      }
    }
  ];
}

export function buildRegistries(markdown) {
  const planDigest = sha256(markdown);
  const requirements = parseRequirements(markdown);
  const milestones = parseMilestones(markdown);
  const milestoneIds = new Set(milestones.map(({ id }) => id));
  const routes = parseRoutes(markdown, milestoneIds);
  const routeStates = parseRouteStates(markdown);
  const journeys = parseJourneys(markdown, milestones, routes);
  const journeyIds = new Set(journeys.map(({ id }) => id));
  for (const route of routes)
    for (const id of route.journeyIds)
      if (!journeyIds.has(id)) throw new Error(`Unknown journey ${id} on ${route.path}`);
  const api = parseApi(markdown);
  const externalGates = parseExternalGates(markdown, milestoneIds);
  const traceability = parseTraceability(
    markdown,
    requirements,
    milestoneIds,
    routes,
    journeys,
    externalGates
  );
  for (const journey of journeys) {
    const requirementLinked = traceability.some(
      (row) => row.journeyIds.includes(journey.id) || row.journeyBranchIds.includes(journey.id)
    );
    const parentId = journey.id.slice(0, 5);
    const routeLinked =
      journey.routeIds.length > 0 ||
      journeys.some(
        (candidate) =>
          (candidate.id === parentId || candidate.parentJourneyId === parentId) &&
          candidate.routeIds.length > 0
      );
    if (!requirementLinked && !routeLinked)
      throw new Error(`Orphan journey without route or requirement traceability ${journey.id}`);
  }
  const criteria = parseEnvironmentCriteria(markdown, milestones);
  const gateActivation = parseGateActivation(markdown, milestoneIds);
  const schemas = evidenceSchemas();
  const registries = {
    requirements,
    milestones,
    routes,
    routeStates,
    journeys,
    api,
    externalGates,
    traceability,
    criteria,
    gateActivation,
    schemas
  };
  const envelopes = Object.fromEntries(
    Object.entries(registries).map(([name, entries]) => [
      name,
      { schemaVersion: 1, planDigest, generatedFrom: relative(ROOT, PLAN_PATH), entries }
    ])
  );
  const indexEntries = Object.entries(envelopes).map(([name, envelope]) => ({
    name,
    file: GENERATED_FILES[name],
    count: envelope.entries.length,
    digest: sha256(canonicalJson(envelope))
  }));
  envelopes.index = {
    schemaVersion: 1,
    planDigest,
    generatedFrom: relative(ROOT, PLAN_PATH),
    entries: indexEntries
  };
  return envelopes;
}

async function listFiles(directory) {
  const result = [];
  for (const name of await readdir(directory).catch(() => [])) {
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) result.push(...(await listFiles(path)));
    else result.push(path);
  }
  return result;
}

function normalizeCodePath(path) {
  return path.replace(/:teamId/g, ":workspaceId");
}

export async function scanCodeRoutes(root = ROOT) {
  const paths = [join(root, "apps/api/src")];
  const result = [];
  for (const directory of paths) {
    for (const file of await listFiles(directory)) {
      if (!/\.[cm]?tsx?$/.test(file)) continue;
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(
        /\bapp\.(get|post|put|patch|delete)(?:<[\s\S]*?>)?\s*\(\s*["']([^"']+)["']/g
      )) {
        result.push({ method: match[1].toUpperCase(), path: match[2], file: relative(root, file) });
      }
    }
  }
  return result.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

export async function validateCodeRoutes(apiEntries, root = ROOT) {
  const codeRoutes = await scanCodeRoutes(root);
  const contracts = new Set(apiEntries.map(({ method, path }) => `${method} ${path}`));
  const legacy = JSON.parse(await readFile(join(root, "tooling/routes/legacy-m00.json"), "utf8"));
  const allowedInfrastructure = new Set([
    "GET /health/live",
    "GET /health/ready",
    "GET /__local/auth/emails/latest",
    "GET /__local/invitations/latest",
    "GET /__local/oidc/authorize"
  ]);
  const errors = [];
  const seenLegacy = new Set();
  for (const route of codeRoutes) {
    const key = `${route.method} ${route.path}`;
    if (contracts.has(key) || allowedInfrastructure.has(key)) continue;
    const mapping = legacy.entries.find(
      (entry) => entry.method === route.method && entry.codePath === route.path
    );
    if (!mapping) {
      errors.push(`Code route absent from API inventory: ${key} (${route.file})`);
      continue;
    }
    const target = `${mapping.method} ${mapping.contractPath}`;
    if (!contracts.has(target)) errors.push(`Legacy route maps to unknown contract: ${target}`);
    if (!mapping.reason || !MILESTONE_ID.test(mapping.removeByMilestone))
      errors.push(`Unjustified legacy route mapping: ${key}`);
    seenLegacy.add(key);
  }
  for (const entry of legacy.entries) {
    const key = `${entry.method} ${entry.codePath}`;
    if (!seenLegacy.has(key)) errors.push(`Stale legacy route mapping: ${key}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return codeRoutes.map((route) => ({ ...route, normalizedPath: normalizeCodePath(route.path) }));
}

async function writeRegistries(registries) {
  for (const [name, value] of Object.entries(registries)) {
    await writeFile(join(GENERATED_DIRECTORY, GENERATED_FILES[name]), canonicalJson(value));
  }
  await writeFile(
    GENERATED_PACKAGE_ROUTES,
    `// Generated by tooling/quality/plan-contract.mjs. Do not edit.\nexport const canonicalWebRoutes = ${JSON.stringify(registries.routes.entries, null, 2)} as const;\n`
  );
}

async function checkRegistries(registries) {
  const errors = [];
  for (const [name, value] of Object.entries(registries)) {
    const path = join(GENERATED_DIRECTORY, GENERATED_FILES[name]);
    const expected = canonicalJson(value);
    const actual = await readFile(path, "utf8").catch(() => "");
    if (actual !== expected)
      errors.push(`Generated registry drift: ${relative(ROOT, path)} (run contracts:generate)`);
  }
  const expectedPackageRoutes = `// Generated by tooling/quality/plan-contract.mjs. Do not edit.\nexport const canonicalWebRoutes = ${JSON.stringify(registries.routes.entries, null, 2)} as const;\n`;
  const actualPackageRoutes = await readFile(GENERATED_PACKAGE_ROUTES, "utf8").catch(() => "");
  if (actualPackageRoutes !== expectedPackageRoutes)
    errors.push(
      `Generated registry drift: ${relative(ROOT, GENERATED_PACKAGE_ROUTES)} (run contracts:generate)`
    );
  await validateCodeRoutes(registries.api.entries);
  if (errors.length) throw new Error(errors.join("\n"));
}

export async function run(command = "check") {
  const markdown = await readFile(PLAN_PATH, "utf8");
  const registries = buildRegistries(markdown);
  if (command === "generate") await writeRegistries(registries);
  else if (command === "check") await checkRegistries(registries);
  else throw new Error(`Usage: node tooling/quality/plan-contract.mjs <generate|check>`);
  return registries;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv[2])
    .then((registries) => {
      const count = registries.index.entries.reduce((total, entry) => total + entry.count, 0);
      process.stdout.write(
        `Plan contracts ${process.argv[2] ?? "check"} passed (${count} records).\n`
      );
      return undefined;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
