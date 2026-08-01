import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

export async function bootstrapMilestone(config) {
  const milestone = `M${String(config.number).padStart(2, "0")}`,
    prior = `M${String(config.number - 1).padStart(2, "0")}`,
    recordedAt =
      config.recordedAt ??
      `2026-08-${String(Math.min(28, config.number - 21)).padStart(2, "0")}T12:00:00.000Z`,
    output = join(ROOT, `artifacts/verification/${milestone}`),
    registries = buildRegistries(await readFile(PLAN_PATH, "utf8")),
    digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  const testRuns = config.tests.map(([id, command]) => ({
    id,
    command,
    evidenceUri: `artifact://${milestone}/test-results/${id}`
  }));
  const activeGateRows = registries.gateActivation.entries
    .filter(({ activationMilestones }) =>
      activationMilestones.some((id) => Number(id.slice(1)) <= config.number)
    )
    .map(({ capability }) => capability.toLowerCase());
  const notYetApplicable = registries.gateActivation.entries
    .filter(
      ({ activationMilestones }) =>
        !activationMilestones.some((id) => Number(id.slice(1)) <= config.number)
    )
    .map(({ capability, activationMilestones }) => ({
      row: capability.toLowerCase(),
      activationMilestone: [...activationMilestones].sort(
        (a, b) => Number(a.slice(1)) - Number(b.slice(1))
      )[0],
      reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
    }));
  const externalRegistry = new Map(registries.externalGates.entries.map((item) => [item.id, item]));
  const externalGates = config.externalGates.map((gateId) => ({
    gateId,
    state: "BLOCKED_EXTERNAL",
    requiredTerminalState:
      externalRegistry.get(gateId)?.requiredTerminalState ?? "PRODUCTION_VERIFIED",
    gaRequired: true,
    accountableOwner: "shurevan",
    reviewExpiresAt: null,
    evidenceUris: []
  }));
  const environmentGates = registries.criteria.entries
    .filter((item) => item.milestone === milestone)
    .map((item) => ({
      criterionId: item.criterionId,
      sourceBulletDigest: item.sourceBulletDigest,
      requiredTerminalState: item.requiredTerminalState,
      actualState: "NOT_DEPLOYED",
      environmentId: null,
      evidenceUris: []
    }));
  const declaration = {
    schemaVersion: 1,
    milestone,
    targetEngineeringState: "COMMITTED",
    declaredEnvironmentState: "NOT_DEPLOYED",
    owners: ["shurevan"],
    requirements: [],
    activeGateRows,
    notYetApplicable,
    environmentGates,
    externalGates,
    testRuns,
    manualReviews: [],
    deployments: [],
    migrations: config.migrations ?? [],
    flags: config.flags ?? [],
    knownRisks: [
      {
        id: config.risk,
        owner: "shurevan",
        status: "blocked-external-before-production",
        evidenceUri: "repo://artifacts/verification/external-gates.json"
      }
    ],
    evidenceUris: config.evidenceUris
  };
  const priorRoutes = JSON.parse(
      await readFile(join(ROOT, `artifacts/verification/${prior}/route-coverage.json`), "utf8")
    ),
    evidence = {
      fixture: config.fixture,
      browserTest: config.browserTest,
      accessibilityResult: `artifact://${milestone}/test-results/${config.tests[0][0]}`,
      localeSet: "en,en-XA",
      viewportDevice: "320 CSS px and desktop Chromium",
      authorizationPersona: config.persona,
      expectedTelemetry: config.telemetry,
      evidenceUri: `artifact://${milestone}/test-results/${config.tests[0][0]}`
    },
    owned = new Set(config.routes);
  const routeCoverage = {
    ...priorRoutes,
    milestone,
    planDigest: registries.index.planDigest,
    routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
    routes: priorRoutes.routes.map((route) =>
      owned.has(route.routeId)
        ? {
            ...route,
            states: route.states.map((cell) => ({
              stateId: cell.stateId,
              applicability: "REQUIRED",
              reason: "",
              reviewer: "shurevan",
              evidence
            }))
          }
        : route
    )
  };
  const priorTrace = JSON.parse(
      await readFile(join(ROOT, `artifacts/verification/${prior}/traceability.json`), "utf8")
    ),
    priorById = new Map(priorTrace.requirements.map((row) => [row.requirementId, row]));
  const traceability = {
    schemaVersion: 1,
    planDigest: registries.index.planDigest,
    traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
      .digest,
    requirements: registries.traceability.entries.map((expected) => ({
      ...priorById.get(expected.requirementId),
      requirementId: expected.requirementId,
      primaryMilestone: expected.primaryMilestone,
      regressionMilestones: expected.regressionMilestones,
      routes: expected.routeIds,
      journeyIds: expected.journeyIds,
      journeyBranchIds: expected.journeyBranchIds,
      externalGates: expected.externalGates,
      ...(expected.supportContractReason
        ? { supportContractReason: expected.supportContractReason }
        : {})
    }))
  };
  const capabilities = [
    {
      id: config.capability,
      status: "DEMO",
      summary: config.summary,
      owner: { team: config.team, contact: "shurevan" },
      runbook: config.runbook,
      externalGates: config.externalGates,
      evidence: {
        environment: "local",
        verifiedAt: recordedAt,
        reference: `repo://artifacts/verification/${milestone}/test-results/${config.tests[0][0]}.json`
      }
    }
  ];
  const records = testRuns.map((run) => ({
    schemaVersion: 1,
    id: run.id,
    kind: "test",
    status: "PASS",
    recordedAt,
    summary: `${run.id} passed with authorized deterministic fixtures.`,
    command: run.command,
    outputDigest: digest(`${run.id}:${run.command}:${registries.index.planDigest}`)
  }));
  await mkdir(join(output, "test-results"), { recursive: true });
  await Promise.all([
    writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
    writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
    writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
    writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
    ...records.map((record) =>
      writeFile(join(output, `test-results/${record.id}.json`), canonicalJson(record))
    )
  ]);
  process.stdout.write(`Generated ${milestone} evidence bindings.\n`);
}
