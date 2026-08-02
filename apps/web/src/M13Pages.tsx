/* eslint-disable knotline/no-hardcoded-user-visible-string -- M13 approval surface copy moves into the full locale catalog at M33. */
import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { AlertTriangle, ArrowLeft, Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  decideApproval,
  fetchApproval,
  fetchApprovals,
  remindApproval,
  type ApprovalDetail,
  type ApprovalSummary
} from "./api.js";
import { WorkspaceShell } from "./WorkspaceShell.js";
import "./M13Pages.css";

function ApprovalShell({ children }: { readonly children: React.ReactNode }) {
  return <WorkspaceShell contentClassName="approval-shell-content">{children}</WorkspaceShell>;
}

function stateTone(state: string): "accent" | "danger" | "warning" | "neutral" {
  if (state === "CONSUMED") return "accent";
  if (["REJECTED", "REVOKED", "EXPIRED"].includes(state)) return "danger";
  if (["PENDING", "IN_REVIEW", "APPROVED_PENDING_EXECUTION"].includes(state)) return "warning";
  return "neutral";
}

function blockedDecisionMessage(approval: ApprovalDetail) {
  if (approval.state === "EXPIRED" || approval.decision_block_reason === "EXPIRED")
    return "This approval expired before a decision was recorded. It cannot be approved now.";
  if (approval.decision_block_reason === "SELF_APPROVAL_FORBIDDEN")
    return "You requested this approval, and its separation-of-duties policy requires a different reviewer.";
  if (approval.decision_block_reason === "NOT_ELIGIBLE")
    return "This decision is assigned to another eligible reviewer.";
  return "This approval is no longer accepting decisions.";
}

export function ApprovalInboxPage() {
  const [items, setItems] = useState<readonly ApprovalSummary[]>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    void fetchApprovals()
      .then(setItems)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause : new Error("Unable to load approvals"))
      );
  }, []);
  return (
    <ApprovalShell>
      <header className="approval-header">
        <div>
          <Badge tone="accent">Authorization queue</Badge>
          <h1>Approvals</h1>
          <p>Review the exact action, evidence, risk, and policy before deciding.</p>
        </div>
      </header>
      {error ? (
        <ErrorState title="Approvals unavailable">
          <p>{error.message}</p>
        </ErrorState>
      ) : !items ? (
        <Skeleton label="Loading approvals" />
      ) : items.length === 0 ? (
        <Card>
          <h2>Nothing needs review</h2>
          <p>New authorization requests will appear here.</p>
        </Card>
      ) : (
        <ul className="approval-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/app/approvals/${item.id}`}>
                <span
                  className={`approval-risk approval-risk--${item.risk}`}
                  aria-label={`${item.risk} risk`}
                />
                <span>
                  <strong>{item.title}</strong>
                  <small>Expires {new Date(item.expires_at).toLocaleString()}</small>
                </span>
                <Badge tone={stateTone(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
                <span>{item.eligible ? "Your decision" : "Requested by you"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ApprovalShell>
  );
}

export function ApprovalDetailPage() {
  const { approvalId = "" } = useParams();
  const [approval, setApproval] = useState<ApprovalDetail>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<Error>();
  const refresh = () => fetchApproval(approvalId).then(setApproval);
  useEffect(() => {
    void fetchApproval(approvalId)
      .then(setApproval)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause : new Error("Unable to load approval"))
      );
  }, [approvalId]);
  const activeStep = useMemo(
    () => approval?.steps.find(({ state }) => state === "active"),
    [approval]
  );
  const decide = async (
    outcome: "approve" | "reject" | "request_changes" | "abstain" | "cancel"
  ) => {
    if (!approval || !activeStep) return;
    setBusy(true);
    setNotice("");
    try {
      await decideApproval(approval.id, {
        stepKey: activeStep.step_key,
        outcome,
        reason,
        expectedVersion: Number(approval.state_version),
        idempotencyKey: crypto.randomUUID()
      });
      setNotice("Decision recorded. The immutable history has been updated.");
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "The decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <ApprovalShell>
        <ErrorState title="Approval unavailable">
          <p>{error.message}</p>
        </ErrorState>
      </ApprovalShell>
    );
  if (!approval)
    return (
      <ApprovalShell>
        <Skeleton label="Loading approval packet" />
      </ApprovalShell>
    );
  const open = ["PENDING", "IN_REVIEW"].includes(approval.state);
  return (
    <ApprovalShell>
      <header className="approval-detail-header">
        <div>
          <Link to="/app/approvals">
            <ArrowLeft aria-hidden="true" /> Approvals
          </Link>
          <h1>{approval.packet.title}</h1>
          <p>Authorization {approval.id}</p>
        </div>
        <Badge tone={stateTone(approval.state)}>{approval.state.replaceAll("_", " ")}</Badge>
      </header>
      <div className="approval-detail-grid">
        <article className="approval-packet">
          <section>
            <h2>Proposed action</h2>
            <p>{approval.packet.proposedAction}</p>
          </section>
          <section
            className={`approval-risk-card approval-risk-card--${approval.packet.risk.level}`}
          >
            <AlertTriangle aria-hidden="true" />
            <div>
              <h2>{approval.packet.risk.level} risk</h2>
              {approval.packet.risk.findings.length ? (
                <ul>
                  {approval.packet.risk.findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              ) : (
                <p>No additional risk findings.</p>
              )}
            </div>
          </section>
          <section>
            <h2>Affected resources</h2>
            {approval.packet.affectedResources.length ? (
              <ul>
                {approval.packet.affectedResources.map((resource) => (
                  <li key={`${resource.type}:${resource.id}`}>
                    <strong>{resource.label}</strong>
                    <small>
                      {resource.type} · {resource.id}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No resource references were attached.</p>
            )}
          </section>
          <section>
            <h2>Exact diff</h2>
            <pre>{JSON.stringify(approval.packet.diff, null, 2)}</pre>
          </section>
          <section>
            <h2>Provenance</h2>
            <pre>{JSON.stringify(approval.packet.provenance, null, 2)}</pre>
          </section>
        </article>
        <aside className="approval-decision" aria-label="Decision controls">
          <h2>Decision</h2>
          <p>Expires {new Date(approval.packet.expiresAt).toLocaleString()}</p>
          {open && activeStep && approval.can_decide ? (
            <>
              <label>
                <span>Reason</span>
                <textarea
                  required
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  placeholder="Explain your decision"
                />
              </label>
              <div className="approval-actions">
                <Button
                  tone="accent"
                  disabled={busy || !reason.trim()}
                  onClick={() => void decide("approve")}
                >
                  <Check aria-hidden="true" /> Approve
                </Button>
                <Button
                  disabled={busy || !reason.trim()}
                  onClick={() => void decide("request_changes")}
                >
                  Request changes
                </Button>
                <Button
                  tone="danger"
                  disabled={busy || !reason.trim()}
                  onClick={() => void decide("reject")}
                >
                  <X aria-hidden="true" /> Reject
                </Button>
                <Button disabled={busy || !reason.trim()} onClick={() => void decide("abstain")}>
                  Abstain
                </Button>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  void remindApproval(approval.id, crypto.randomUUID()).then(() =>
                    setNotice("Reminder queued once for each active reviewer.")
                  )
                }
              >
                Send reminder
              </Button>
            </>
          ) : (
            <div className="approval-blocked" role="status">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>Decision unavailable</strong>
                <p>{blockedDecisionMessage(approval)}</p>
                <Link to={`/app/runs/${approval.run_id}`}>Return to the run</Link>
              </div>
            </div>
          )}
          <p aria-live="polite">{notice}</p>
          <h3>Recorded decisions</h3>
          {approval.decisions.length ? (
            <ol>
              {approval.decisions.map((decision) => (
                <li key={decision.id}>
                  <strong>{decision.outcome.replaceAll("_", " ")}</strong>
                  <p>{decision.reason}</p>
                  <small>{new Date(decision.decided_at).toLocaleString()}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No decisions recorded.</p>
          )}
        </aside>
      </div>
    </ApprovalShell>
  );
}
