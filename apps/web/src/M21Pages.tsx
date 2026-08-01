import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { Boxes, Download, GitMerge, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createKnowledgeEntity,
  exportKnowledgeEntity,
  fetchKnowledgeAdministration,
  fetchKnowledgeEntities,
  fetchKnowledgeEntity,
  mintKnowledgeProof,
  requestKnowledgeReindex,
  traverseKnowledgeEntity,
  type KnowledgeEntityProfile,
  type KnowledgeEntitySummary
} from "./api.js";
import { msg } from "./i18n.js";
import "./M21Pages.css";

const entityIdFromPath = () => location.pathname.split("/").at(-1) ?? "";
const readable = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));
const scalar = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "—";

export function KnowledgeOverviewPage() {
  const [data, setData] = useState<{
    sources: readonly Readonly<Record<string, unknown>>[];
    conflicts: readonly Readonly<Record<string, unknown>>[];
  }>();
  const [error, setError] = useState("");
  const [repair, setRepair] = useState("");
  useEffect(() => {
    void fetchKnowledgeAdministration()
      .then(setData)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("graph.error"))
      );
  }, []);
  if (error)
    return (
      <main className="page-shell">
        <ErrorState title={msg("graph.error")}>{error}</ErrorState>
      </main>
    );
  if (!data)
    return (
      <main className="page-shell">
        <Skeleton label={msg("graph.loading")} />
      </main>
    );
  return (
    <main className="page-shell graph-shell">
      <header>
        <Badge tone="accent">{msg("graph.admin.badge")}</Badge>
        <h1>{msg("graph.admin.heading")}</h1>
        <p>{msg("graph.admin.body")}</p>
      </header>
      <section className="graph-metrics">
        <Card>
          <strong>{data.sources.length}</strong>
          <span>{msg("graph.admin.sources")}</span>
        </Card>
        <Card>
          <strong>{data.conflicts.length}</strong>
          <span>{msg("graph.admin.conflicts")}</span>
        </Card>
      </section>
      <section>
        <h2>{msg("graph.admin.health")}</h2>
        {data.sources.length ? (
          data.sources.map((source) => (
            <Card key={String(source.id)} className="graph-source">
              <ShieldCheck aria-hidden />
              <div>
                <strong>{String(source.title)}</strong>
                <p>
                  {msg("graph.admin.state", {
                    state: String(source.state),
                    epoch: scalar(source.aclEpoch)
                  })}
                </p>
              </div>
              <Button
                tone="neutral"
                onClick={() =>
                  void requestKnowledgeReindex()
                    .then(() => setRepair(msg("graph.admin.reindex.queued")))
                    .catch((cause: unknown) =>
                      setError(cause instanceof Error ? cause.message : msg("graph.error"))
                    )
                }
              >
                <RefreshCw aria-hidden size={16} />
                {msg("graph.admin.reindex")}
              </Button>
            </Card>
          ))
        ) : (
          <EmptyState title={msg("graph.admin.empty")}>
            <p>{msg("graph.admin.empty.body")}</p>
          </EmptyState>
        )}
      </section>
      {repair ? <p role="status">{repair}</p> : null}
    </main>
  );
}

export function KnowledgeEntitiesPage() {
  const [items, setItems] = useState<KnowledgeEntitySummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const load = () =>
    fetchKnowledgeEntities()
      .then((value) => setItems(value.items))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("graph.error"))
      )
      .finally(() => setBusy(false));
  useEffect(() => {
    void load();
  }, []);
  const create = async () => {
    setBusy(true);
    try {
      await createKnowledgeEntity({
        type: "project",
        canonicalName: msg("graph.fixture.name"),
        aliases: [msg("graph.fixture.alias")],
        facts: []
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("graph.error"));
      setBusy(false);
    }
  };
  return (
    <main className="page-shell graph-shell">
      <header>
        <Badge tone="accent">{msg("graph.badge")}</Badge>
        <h1>{msg("graph.heading")}</h1>
        <p>{msg("graph.body")}</p>
        <Button onClick={() => void create()}>
          <Boxes aria-hidden size={16} />
          {msg("graph.create")}
        </Button>
      </header>
      {busy ? <Skeleton label={msg("graph.loading")} /> : null}
      {error ? <ErrorState title={msg("graph.error")}>{error}</ErrorState> : null}
      <section className="entity-grid" aria-label={msg("graph.list")}>
        {items.map((entity) => (
          <a key={entity.id} href={`/app/knowledge/entities/${entity.id}`}>
            <Card>
              <Badge>{entity.type}</Badge>
              <h2>{entity.canonicalName}</h2>
              <p>{msg("graph.revision", { revision: entity.revision })}</p>
            </Card>
          </a>
        ))}
      </section>
    </main>
  );
}

export function KnowledgeEntityPage() {
  const [profile, setProfile] = useState<KnowledgeEntityProfile>();
  const [relations, setRelations] = useState<KnowledgeEntitySummary[]>([]);
  const [packet, setPacket] = useState<Record<string, unknown>>();
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchKnowledgeEntity(entityIdFromPath())
      .then(setProfile)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("graph.error"))
      );
  }, []);
  const traverse = async () => {
    try {
      const proof = await mintKnowledgeProof();
      setRelations((await traverseKnowledgeEntity(entityIdFromPath(), proof.proof)).items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("graph.error"));
    }
  };
  const exportPacket = async () => {
    try {
      const proof = await mintKnowledgeProof();
      setPacket(await exportKnowledgeEntity(entityIdFromPath(), proof.proof));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("graph.error"));
    }
  };
  if (error && !profile)
    return (
      <main className="page-shell">
        <ErrorState title={msg("graph.error")}>{error}</ErrorState>
      </main>
    );
  if (!profile)
    return (
      <main className="page-shell">
        <Skeleton label={msg("graph.loading")} />
      </main>
    );
  return (
    <main className="page-shell graph-shell">
      <header>
        <Badge>{profile.type}</Badge>
        <h1>{profile.canonicalName}</h1>
        <p>{msg("graph.profile.body")}</p>
        <div className="graph-actions">
          <Button onClick={() => void traverse()}>
            <GitMerge aria-hidden size={16} />
            {msg("graph.traverse")}
          </Button>
          <Button tone="neutral" onClick={() => void exportPacket()}>
            <Download aria-hidden size={16} />
            {msg("graph.export")}
          </Button>
        </div>
      </header>
      {error ? <ErrorState title={msg("graph.error")}>{error}</ErrorState> : null}
      <div className="graph-layout">
        <section>
          <h2>{msg("graph.facts")}</h2>
          {profile.facts.map((fact) => (
            <Card key={String(fact.id)}>
              <strong>{String(fact.key)}</strong>
              <p>{readable(fact.value)}</p>
              <Badge>{String(fact.kind)}</Badge>
              <details>
                <summary>{msg("graph.provenance")}</summary>
                <pre>{JSON.stringify(fact.evidence, null, 2)}</pre>
              </details>
            </Card>
          ))}
        </section>
        <section>
          <h2>{msg("graph.relations")}</h2>
          <div className="graph-outline" role="tree">
            {relations.map((entity) => (
              <a
                role="treeitem"
                aria-selected="false"
                key={entity.id}
                href={`/app/knowledge/entities/${entity.id}`}
              >
                {entity.canonicalName} · {entity.type}
              </a>
            ))}
          </div>
          <h2>{msg("graph.conflicts")}</h2>
          {profile.conflicts.length ? (
            profile.conflicts.map((conflict) => (
              <Card key={String(conflict.id)}>
                <strong>{String(conflict.attributeKey)}</strong>
                <p>{msg("graph.conflict.visible")}</p>
              </Card>
            ))
          ) : (
            <p>{msg("graph.conflicts.none")}</p>
          )}
        </section>
      </div>
      {packet ? (
        <Card>
          <h2>{msg("graph.export.packet")}</h2>
          <pre>{JSON.stringify(packet, null, 2)}</pre>
        </Card>
      ) : null}
    </main>
  );
}
