import { Badge, Button, Card, EmptyState, Skeleton } from "@knotline/ui";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  correctMyMemoryRecord,
  deleteMyMemoryRecord,
  exportMyMemory,
  fetchAgentMemoryPolicy,
  fetchMyMemory,
  fetchMyMemoryRecord,
  fetchWorkspaceMemory,
  updateAgentMemoryPolicy,
  type MemoryRecordView
} from "./api.js";
import { msg } from "./i18n.js";
import { ProfileShell } from "./M04ProfilePages.js";
import "./M17Pages.css";

export function ProfileMemoryPage() {
  const [records, setRecords] = useState<MemoryRecordView[]>();
  const [selected, setSelected] = useState<MemoryRecordView>();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    () => fetchMyMemory(query).then((items) => setRecords([...items])),
    [query]
  );
  useEffect(() => void load(), [load]);
  if (!records) return <Skeleton label={msg("memory.private.loading")} />;
  return (
    <ProfileShell>
      <main className="memory-page">
        <header>
          <Badge tone="accent">{msg("memory.private.badge")}</Badge>
          <h1>{msg("memory.private.heading")}</h1>
          <p>{msg("memory.private.body")}</p>
        </header>
        <div className="memory-toolbar">
          <label>
            <span>{msg("memory.search")}</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
          <Button
            onClick={() =>
              void exportMyMemory().then((items) => {
                setNotice(msg("memory.export.notice", { count: items.length }));
              })
            }
          >
            {msg("memory.export")}
          </Button>
        </div>
        {records.length === 0 ? (
          <EmptyState title={msg("memory.private.empty")}>
            <p>{msg("memory.private.empty.body")}</p>
          </EmptyState>
        ) : (
          <div className="memory-grid">
            <section aria-label={msg("memory.records")}>
              {records.map((record) => (
                <button
                  type="button"
                  className="memory-row"
                  key={record.id}
                  onClick={() => void fetchMyMemoryRecord(record.id).then(setSelected)}
                >
                  <strong>{record.purpose}</strong>
                  <span>{record.subject_id}</span>
                  <Badge tone={record.state === "active" ? "accent" : "warning"}>
                    {record.state}
                  </Badge>
                </button>
              ))}
            </section>
            <Card>
              {selected ? (
                <>
                  <h2>{msg("memory.provenance")}</h2>
                  <dl>
                    <dt>{msg("memory.purpose")}</dt>
                    <dd>{selected.purpose}</dd>
                    <dt>{msg("memory.sensitivity")}</dt>
                    <dd>{selected.sensitivity}</dd>
                    <dt>{msg("memory.retention")}</dt>
                    <dd>{selected.retention_expires_at ?? msg("memory.retention.default")}</dd>
                    <dt>{msg("memory.value.hash")}</dt>
                    <dd className="mono">{selected.value_hash}</dd>
                  </dl>
                  <details>
                    <summary>{msg("memory.current.value")}</summary>
                    <pre>{JSON.stringify(selected.value, null, 2)}</pre>
                  </details>
                  <Button
                    onClick={() =>
                      void correctMyMemoryRecord(selected.id, {
                        expectedVersion: selected.current_version,
                        value: selected.value,
                        reason: "User-confirmed correction"
                      }).then(async ({ version }) => {
                        setNotice(msg("memory.correct.notice", { version }));
                        await load();
                      })
                    }
                  >
                    {msg("memory.correct")}
                  </Button>
                  <Button
                    onClick={() =>
                      void correctMyMemoryRecord(selected.id, {
                        expectedVersion: selected.current_version,
                        value: selected.value,
                        reason: "User-approved scope change",
                        scope: "workspace_shared"
                      }).then(async ({ version }) => {
                        setSelected(undefined);
                        setNotice(msg("memory.scope.notice", { version }));
                        await load();
                      })
                    }
                  >
                    {msg("memory.scope.shared")}
                  </Button>
                  <Button
                    tone="danger"
                    onClick={() => {
                      if (!globalThis.confirm(msg("memory.delete.confirm"))) return;
                      void deleteMyMemoryRecord(selected.id).then(async () => {
                        setSelected(undefined);
                        setNotice(msg("memory.delete.notice"));
                        await load();
                      });
                    }}
                  >
                    {msg("memory.delete")}
                  </Button>
                </>
              ) : (
                <p>{msg("memory.select")}</p>
              )}
            </Card>
          </div>
        )}
        <p aria-live="polite">{notice}</p>
      </main>
    </ProfileShell>
  );
}

export function AgentMemoryPage() {
  const { agentId = "" } = useParams();
  const [policy, setPolicy] = useState<{
    revision: string;
    definition: Readonly<Record<string, unknown>>;
  }>();
  const [records, setRecords] = useState<MemoryRecordView[]>();
  const [notice, setNotice] = useState("");
  const load = useCallback(
    () =>
      Promise.all([fetchAgentMemoryPolicy(agentId), fetchWorkspaceMemory(agentId)]).then(
        ([nextPolicy, nextRecords]) => {
          setPolicy(nextPolicy);
          setRecords([...nextRecords]);
        }
      ),
    [agentId]
  );
  useEffect(() => void load(), [load]);
  if (!policy || !records) return <Skeleton label={msg("memory.policy.loading")} />;
  return (
    <main className="memory-page">
      <header>
        <Link to={`/app/agents/${agentId}`}>{msg("memory.agent.back")}</Link>
        <Badge tone="warning">{msg("memory.policy.badge")}</Badge>
        <h1>{msg("memory.policy.heading")}</h1>
        <p>{msg("memory.policy.body")}</p>
      </header>
      <Card>
        <h2>{msg("memory.policy.revision", { revision: policy.revision })}</h2>
        <p>
          {msg("memory.policy.scopes")}:{" "}
          {String((policy.definition.allowedScopes as string[] | undefined)?.join(", ") ?? "none")}
        </p>
        <p>
          {msg("memory.retention")}: {safeNumber(policy.definition.retentionDays)}{" "}
          {msg("memory.days")}
        </p>
        <Button
          onClick={() =>
            void updateAgentMemoryPolicy(agentId, {
              expectedRevision: Number(policy.revision),
              definition: policy.definition
            }).then(async ({ revision }) => {
              setNotice(msg("memory.policy.saved", { revision }));
              await load();
            })
          }
        >
          {msg("memory.policy.save")}
        </Button>
      </Card>
      <h2>{msg("memory.shared.heading")}</h2>
      {records.length ? (
        <div className="memory-cards">
          {records.map((record) => (
            <Card key={record.id}>
              <Badge tone={record.state === "active" ? "accent" : "warning"}>{record.state}</Badge>
              <h3>{record.purpose}</h3>
              <p>{record.subject_id}</p>
              <small>{record.value_hash}</small>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={msg("memory.shared.empty")}>
          <p>{msg("memory.shared.empty.body")}</p>
        </EmptyState>
      )}
      <p aria-live="polite">{notice}</p>
    </main>
  );
}

const safeNumber = (value: unknown) => (typeof value === "number" ? String(value) : "0");
