import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { AuthFailure, secretHash } from "../../apps/api/src/auth.js";
import { CaptureInvitationMailer, WorkspaceService } from "../../apps/api/src/workspace.js";
import {
  createPool,
  migrate,
  PostgresAuthRepository,
  PostgresWorkspaceRepository,
  seedSyntheticTenants,
  SEED,
  type SessionIdentity,
  withTenantTransaction
} from "../../packages/db/src/index.js";

const IMAGE =
  "pgvector/pgvector:0.8.1-pg17-trixie@sha256:137f044b0efe3d57f39b972b9b53641b1f2045b99d879e298bbf514a25787dcf";
const containerName = `knotline-m05-workspace-${process.pid}-${Date.now()}`;
const password = "local-only-m05-workspace-password";
type DatabasePool = ReturnType<typeof createPool>;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function docker(...args: string[]) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

async function startPostgres() {
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_DB=knotline",
    "--env",
    "POSTGRES_USER=knotline_local",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    IMAGE
  );
  let port = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    port = docker("port", containerName, "5432/tcp").match(/:(\d+)$/u)?.[1] ?? "";
    if (port) break;
    await delay(100);
  }
  assert(port, "PostgreSQL did not publish a local port");
  const adminUrl = `postgresql://knotline_local:${password}@127.0.0.1:${port}/knotline`;
  const pool = createPool(adminUrl, { max: 20 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return { adminUrl, pool };
    } catch {
      await delay(250);
    }
  }
  throw new Error("PostgreSQL did not become ready");
}

async function identityFor(
  auth: PostgresAuthRepository,
  userId: string,
  verifier: string,
  now: Date
): Promise<SessionIdentity> {
  const session = await auth.createSession({
    userId,
    verifierHash: secretHash(verifier),
    ipHash: secretHash("127.0.0.1"),
    deviceSummary: "M05 workspace suite",
    now,
    idleExpiresAt: new Date(now.getTime() + 60 * 60_000),
    absoluteExpiresAt: new Date(now.getTime() + 24 * 60 * 60_000)
  });
  const authenticated = await auth.authenticateSession(
    session.sessionId,
    secretHash(verifier),
    now
  );
  assert(
    authenticated.status === "ok" && authenticated.identity,
    "Session identity was unavailable"
  );
  return authenticated.identity;
}

function tokenFrom(url: string) {
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token");
  assert(token, "Invitation link omitted its fragment token");
  return token;
}

async function runSuite(pool: DatabasePool) {
  const repository = new PostgresWorkspaceRepository(pool);
  const auth = new PostgresAuthRepository(pool);
  const mailer = new CaptureInvitationMailer();
  const service = new WorkspaceService(repository, mailer, "http://localhost:5173");
  const now = new Date();
  const mayaSeedIdentity = await identityFor(auth, SEED.userA, "maya-m05-verifier", now);
  const eliasSeedIdentity = await identityFor(auth, SEED.userB, "elias-m05-verifier", now);

  const workspace = await service.createWorkspace(mayaSeedIdentity, "m05-create", {
    name: "M05 Product Studio",
    timezone: "Asia/Kolkata",
    locale: "en",
    region: "local",
    sandbox: true
  });
  assert(
    workspace.isSandbox && workspace.sandboxLabel,
    "Sandbox workspace was not visibly labeled"
  );
  await service.switchWorkspace(mayaSeedIdentity, workspace.id);
  const mayaIdentity = { ...mayaSeedIdentity, activeWorkspaceId: workspace.id };
  const workspaceList = await service.listWorkspaces(mayaIdentity);
  assert(workspaceList.length >= 2, "Multi-workspace membership was not preserved");
  const access = await service.access(mayaIdentity, "m05-access");
  assert(
    access.role === "owner" && access.permissions.includes("*"),
    "Owner permissions were incomplete"
  );

  const invitation = await service.invite(mayaIdentity, "m05-invite", {
    email: eliasSeedIdentity.user.email,
    role: "member"
  });
  assert(invitation !== "existing_member", "Fresh invitation was treated as an existing member");
  const delivery = mailer.latest(eliasSeedIdentity.user.email);
  assert(delivery, "Invitation delivery was not captured");
  const token = tokenFrom(delivery.acceptanceUrl);
  assert(
    !(await service.previewInvitation(mayaIdentity, token)),
    "A forwarded invitation previewed for the wrong signed-in email"
  );
  const preview = await service.previewInvitation(eliasSeedIdentity, token);
  assert(
    preview?.workspaceId === workspace.id && preview.state === "pending",
    "Invitation preview failed"
  );
  const accepted = await service.respondToInvitation(
    eliasSeedIdentity,
    "m05-accept",
    token,
    "accept"
  );
  assert(accepted === "accepted", "Invitation acceptance failed");
  const replay = await service.respondToInvitation(
    eliasSeedIdentity,
    "m05-replay",
    token,
    "accept"
  );
  assert(replay === "used", "Invitation replay was not rejected");

  const eliasIdentity = { ...eliasSeedIdentity, activeWorkspaceId: workspace.id };
  const eliasAccess = await service.access(eliasIdentity, "m05-member-access");
  assert(
    eliasAccess.role === "member" && !eliasAccess.permissions.includes("member.invite"),
    "Member capability matrix was incorrect"
  );
  const deniedInvite = await Promise.allSettled([
    service.invite(eliasIdentity, "m05-denied-invite", {
      email: "third@example.test",
      role: "member"
    })
  ]);
  assert(
    deniedInvite[0]?.status === "rejected" &&
      deniedInvite[0].reason instanceof AuthFailure &&
      deniedInvite[0].reason.code === "PERMISSION_DENIED",
    "RBAC permitted an unauthorized invitation"
  );

  const members = await service.members(mayaIdentity, "m05-members");
  const mayaMember = members.find(({ userId }) => userId === SEED.userA);
  const eliasMember = members.find(({ userId }) => userId === SEED.userB);
  assert(mayaMember && eliasMember, "Accepted member was missing from the member list");
  await service.updateMember(mayaIdentity, "m05-admin", eliasMember.id, { role: "admin" });
  const adminEscalation = await Promise.allSettled([
    service.saveRole(eliasIdentity, "m05-role-escalation", {
      name: "Escalated role",
      description: "Must fail",
      permissions: ["workspace.delete"]
    })
  ]);
  assert(
    adminEscalation[0]?.status === "rejected" &&
      adminEscalation[0].reason instanceof AuthFailure &&
      adminEscalation[0].reason.code === "ROLE_PERMISSION_ESCALATION",
    "Custom role exceeded its creator's permission ceiling"
  );
  const customRole = await service.saveRole(mayaIdentity, "m05-role", {
    name: "Incident reviewer",
    description: "Reviews workflows and audit history",
    permissions: ["workspace.read", "workflow.read", "audit.read"]
  });
  assert(!customRole.system, "Custom role was marked as system managed");

  const groupId = await service.saveGroup(mayaIdentity, "m05-group", {
    name: "Launch team",
    description: "Manual launch group",
    memberIds: [SEED.userA, SEED.userB]
  });
  const groups = await service.groups(mayaIdentity, "m05-groups");
  assert(
    groups.find(({ id }) => id === groupId)?.memberIds.length === 2,
    "Group membership failed"
  );
  await service.saveReportingRelationship(mayaIdentity, "m05-reporting", {
    reportUserId: SEED.userB,
    managerUserId: SEED.userA
  });
  const cycle = await Promise.allSettled([
    service.saveReportingRelationship(mayaIdentity, "m05-cycle", {
      reportUserId: SEED.userA,
      managerUserId: SEED.userB
    })
  ]);
  assert(cycle[0]?.status === "rejected", "Organization relationship cycle was accepted");

  const lastOwner = await Promise.allSettled([
    service.updateMember(mayaIdentity, "m05-last-owner", mayaMember.id, { state: "suspended" })
  ]);
  assert(lastOwner[0]?.status === "rejected", "Last owner safeguard did not execute");
  assert(
    await service.transferOwnership(mayaIdentity, "m05-transfer", eliasMember.id),
    "Ownership transfer failed"
  );

  const initialOnboarding = await service.onboarding(eliasIdentity, "m05-onboarding");
  const updatedOnboarding = await service.updateOnboarding(eliasIdentity, "m05-onboarding-save", {
    currentStep: "workflow_source",
    completedSteps: ["role_use_case"],
    skippedSteps: ["optional_connection"],
    profile: { role: "operations", useCase: "customer-onboarding", teamSize: "2-10" },
    revision: initialOnboarding.revision
  });
  assert(updatedOnboarding !== "conflict", "Onboarding progress did not persist");
  const conflict = await service.updateOnboarding(eliasIdentity, "m05-onboarding-conflict", {
    currentStep: "readiness",
    completedSteps: [],
    skippedSteps: [],
    profile: {},
    revision: initialOnboarding.revision
  });
  assert(conflict === "conflict", "Stale onboarding revision overwrote newer progress");

  const sampleId = await service.createSampleData(eliasIdentity, "m05-sample-create");
  assert(sampleId, "Sample data was not created");
  assert(
    (await service.removeSampleData(eliasIdentity, "m05-sample-remove")) === 1,
    "Sample data removal failed"
  );

  const crossCount = await withTenantTransaction(
    pool,
    { workspaceId: SEED.workspaceA, principalId: SEED.userA, requestId: "m05-cross-tenant" },
    async (client) =>
      (
        await client.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM workspace_invitations WHERE workspace_id=$1`,
          [workspace.id]
        )
      ).rows[0]?.count ?? -1
  );
  assert(crossCount === 0, "RLS exposed invitations across workspaces");

  const auditEventCount = await withTenantTransaction(
    pool,
    { workspaceId: workspace.id, principalId: SEED.userB, requestId: "m05-audit-count" },
    async (client) =>
      (
        await client.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM audit_events WHERE workspace_id=$1`,
          [workspace.id]
        )
      ).rows[0]?.count ?? 0
  );
  assert(auditEventCount >= 10, "Workspace actions were not audited");

  return {
    workspace: { create: true, switch: true, sandboxLabel: true, multiWorkspace: true },
    invitation: { previewBinding: true, accept: true, replay: true, forwardingRejected: true },
    access: { personaMatrix: true, permissionCeiling: true, lastOwner: true, transfer: true },
    groups: { membership: true, cycleRejected: true },
    onboarding: { persisted: true, skipResume: true, revisionConflict: true },
    sampleData: { labeled: true, removed: true },
    isolation: { rls: true },
    auditEvents: auditEventCount
  };
}

let adminPool: DatabasePool | undefined;
let runtimePool: DatabasePool | undefined;
try {
  const started = await startPostgres();
  adminPool = started.pool;
  await migrate(started.adminUrl);
  await seedSyntheticTenants(adminPool);
  await adminPool.query(
    "ALTER ROLE knotline_runtime LOGIN PASSWORD 'local-only-m05-runtime-password'"
  );
  const runtimeUrl = new URL(started.adminUrl);
  runtimeUrl.username = "knotline_runtime";
  runtimeUrl.password = "local-only-m05-runtime-password";
  runtimePool = createPool(runtimeUrl.toString(), { max: 20 });
  const result = await runSuite(runtimePool);
  const directory = resolve("artifacts/security/M05");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "workspace-access.json"),
    `${JSON.stringify({ schemaVersion: 1, image: IMAGE, result }, null, 2)}\n`
  );
  process.stdout.write("M05 workspace access suite passed.\n");
} catch (error) {
  const logs = spawnSync("docker", ["logs", "--tail", "200", containerName], { encoding: "utf8" });
  process.stderr.write(logs.stdout ?? "");
  process.stderr.write(logs.stderr ?? "");
  throw error;
} finally {
  await runtimePool?.end();
  await adminPool?.end();
  spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
}
