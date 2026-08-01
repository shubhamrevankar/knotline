/* eslint-disable knotline/no-hardcoded-user-visible-string -- M31 governance copy is an owned, English-only compliance catalog pending additional locale catalogs. */
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { FileCheck2, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createAuditExport,
  createLegalHold,
  createSupportAccess,
  fetchAuditEvents,
  fetchLegalHolds,
  fetchRetentionPolicies,
  fetchSupportAccess,
  putRetentionPolicies,
  requestWorkspaceDeletion,
  requestWorkspaceExport,
  type AuditEvent,
  type LegalHold,
  type RetentionPolicy,
  type SupportAccessGrant
} from "./api.js";
import "./M31Pages.css";

export function GovernancePage() {
  const [audit, setAudit] = useState<readonly AuditEvent[]>(),
    [retention, setRetention] = useState<readonly RetentionPolicy[]>(),
    [holds, setHolds] = useState<readonly LegalHold[]>(),
    [support, setSupport] = useState<readonly SupportAccessGrant[]>(),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([
      fetchAuditEvents(),
      fetchRetentionPolicies(),
      fetchLegalHolds(),
      fetchSupportAccess()
    ])
      .then(([a, r, h, s]) => {
        setAudit(a);
        setRetention(r);
        setHolds(h);
        setSupport(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Governance could not be loaded"));
  }, []);
  if (error)
    return (
      <main className="page-shell governance-shell">
        <ErrorState title="Governance unavailable">{error}</ErrorState>
      </main>
    );
  if (!audit || !retention || !holds || !support)
    return (
      <main className="page-shell governance-shell">
        <Skeleton label="Loading governance controls" />
      </main>
    );
  const saveRetention = async () =>
    setRetention(
      await putRetentionPolicies([
        { dataClass: "run_content", durationDays: 365, action: "delete" },
        { dataClass: "audit", durationDays: 2555, action: "archive" }
      ])
    );
  const addHold = async () =>
    setHolds([
      await createLegalHold({
        caseReference: "CASE-2026-001",
        scope: { workspace: true },
        reason: "Preserve records for an authorized review"
      }),
      ...holds
    ]);
  const grant = async () =>
    setSupport([
      await createSupportAccess({
        operatorReference: "support-on-call",
        scope: { metadata: true },
        reason: "Customer requested diagnosis",
        ticket: "SUP-1001",
        accessMode: "read",
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      }),
      ...support
    ]);
  return (
    <main className="page-shell governance-shell">
      <header>
        <Badge tone="accent">
          <ShieldCheck aria-hidden />
          Governance center
        </Badge>
        <h1>Audit, privacy, and data control</h1>
        <p>
          Verify activity, define retention, preserve held records, and track exports or deletion
          without hiding incomplete work.
        </p>
      </header>
      {notice ? (
        <Card>
          <Badge tone="success">Request recorded</Badge>
          <p>{notice}</p>
        </Card>
      ) : null}
      <section className="governance-grid">
        <Card>
          <h2>
            <FileCheck2 aria-hidden />
            Immutable audit
          </h2>
          <p>{audit.length} chained events available.</p>
          <Button
            onClick={() =>
              void createAuditExport().then((v) =>
                setNotice(`Audit export ${String(v.id)} is queued.`)
              )
            }
          >
            Export with integrity manifest
          </Button>
          {audit.slice(0, 3).map((event) => (
            <p key={event.id}>
              <code>#{event.sequence}</code> {event.action} · {event.result}
            </p>
          ))}
        </Card>
        <Card>
          <h2>
            <Scale aria-hidden />
            Retention and legal hold
          </h2>
          <p>
            {retention.length
              ? retention.map((p) => `${p.dataClass}: ${p.durationDays} days`).join(" · ")
              : "No custom retention policy yet."}
          </p>
          <div className="governance-actions">
            <Button onClick={() => void saveRetention()}>Apply safe defaults</Button>
            <Button tone="neutral" onClick={() => void addHold()}>
              Create legal hold
            </Button>
          </div>
          {holds.map((hold) => (
            <p key={hold.id}>
              <Badge tone="warning">{hold.state}</Badge> {hold.caseReference} · {hold.reason}
            </p>
          ))}
        </Card>
        <Card>
          <h2>Portable export and deletion</h2>
          <p>
            Workspace export and deletion are distinct durable jobs. Active legal holds block
            destructive steps.
          </p>
          <div className="governance-actions">
            <Button
              onClick={() =>
                void requestWorkspaceExport().then((v) =>
                  setNotice(`Workspace export ${String(v.id)} is queued.`)
                )
              }
            >
              Request export
            </Button>
            <Button
              tone="danger"
              onClick={() =>
                void requestWorkspaceDeletion().then((v) =>
                  setNotice(`Deletion ${String(v.id)} is ${String(v.state)}.`)
                )
              }
            >
              Request deletion
            </Button>
          </div>
        </Card>
        <Card>
          <h2>Bounded support access</h2>
          <p>
            Every grant requires a ticket, explicit scope, expiry, mode, and customer-visible
            history.
          </p>
          <Button onClick={() => void grant()}>Authorize one-hour read access</Button>
          {support.length ? (
            support.map((item) => (
              <p key={item.id}>
                <Badge tone={item.state === "active" ? "warning" : "neutral"}>{item.state}</Badge>{" "}
                {item.ticket} · {item.accessMode}
              </p>
            ))
          ) : (
            <EmptyState title="No support access">
              No operator can access this workspace.
            </EmptyState>
          )}
        </Card>
      </section>
    </main>
  );
}
