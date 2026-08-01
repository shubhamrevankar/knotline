import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { BookOpenCheck, Search, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  mintKnowledgeProof,
  openKnowledgeCitation,
  searchKnowledge,
  type KnowledgeSearchResponse
} from "./api.js";
import { msg } from "./i18n.js";
import "./M20Pages.css";

const coordinateKind = (coordinate: Readonly<Record<string, unknown>>) =>
  typeof coordinate.kind === "string" ? coordinate.kind : "section";
const coordinateIndex = (coordinate: Readonly<Record<string, unknown>>) =>
  typeof coordinate.index === "number" ? coordinate.index : 0;

export function KnowledgeSearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic" | "hybrid">("hybrid");
  const [result, setResult] = useState<KnowledgeSearchResponse>();
  const [proof, setProof] = useState("");
  const [citation, setCitation] = useState<Record<string, unknown>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const grant = await mintKnowledgeProof();
      setProof(grant.proof);
      setResult(
        await searchKnowledge(
          { query, mode, limit: 20, tokenLimit: 4_000, authorizationProof: grant.proof },
          true
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("retrieval.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page-shell retrieval-shell">
      <header>
        <Badge tone="accent">{msg("retrieval.badge")}</Badge>
        <h1>{msg("retrieval.heading")}</h1>
        <p>{msg("retrieval.body")}</p>
      </header>
      <Card>
        <form className="retrieval-search" onSubmit={(event) => void submit(event)}>
          <label>
            {msg("retrieval.query")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} required />
          </label>
          <Button type="submit" disabled={busy || !query.trim()}>
            <Search size={16} aria-hidden />
            {msg("retrieval.search")}
          </Button>
        </form>
        <div className="retrieval-filters" aria-label={msg("retrieval.mode")}>
          {(["keyword", "semantic", "hybrid"] as const).map((item) => (
            <Button
              key={item}
              tone={mode === item ? "accent" : "neutral"}
              onClick={() => setMode(item)}
            >
              {item === "keyword"
                ? msg("retrieval.mode.keyword")
                : item === "semantic"
                  ? msg("retrieval.mode.semantic")
                  : msg("retrieval.mode.hybrid")}
            </Button>
          ))}
        </div>
      </Card>
      {busy ? <Skeleton label={msg("retrieval.loading")} /> : null}
      {error ? <ErrorState title={msg("retrieval.error")}>{error}</ErrorState> : null}
      {result ? (
        result.results.length ? (
          <section className="retrieval-results" aria-label={msg("retrieval.results")}>
            <p aria-live="polite">
              {msg("retrieval.summary", {
                count: result.results.length,
                latency: result.latencyMs
              })}
            </p>
            {result.results.map((item) => (
              <Card key={item.chunkId} className="retrieval-result">
                <header>
                  <BookOpenCheck aria-hidden />
                  <h2>{item.title}</h2>
                  <Badge>{item.classification}</Badge>
                  <Badge tone="success">
                    <ShieldCheck size={12} aria-hidden /> {msg("retrieval.authorized")}
                  </Badge>
                </header>
                <blockquote>{item.snippet}</blockquote>
                <p>
                  {msg("retrieval.location", {
                    kind: coordinateKind(item.coordinate),
                    index: coordinateIndex(item.coordinate) + 1,
                    version: item.documentVersion
                  })}
                </p>
                <div className="retrieval-score">
                  <span>{msg("retrieval.score", { score: item.score.toFixed(3) })}</span>
                  <span>
                    {msg("retrieval.freshness", {
                      date: new Date(item.freshness).toLocaleString()
                    })}
                  </span>
                </div>
                <Button
                  tone="neutral"
                  onClick={() =>
                    void openKnowledgeCitation(
                      item.documentId,
                      result.manifestId,
                      item.chunkId,
                      proof
                    )
                      .then((response) => setCitation(response.data))
                      .catch((cause: unknown) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : msg("retrieval.citation.unavailable")
                        )
                      )
                  }
                >
                  {msg("retrieval.citation.open")}
                </Button>
              </Card>
            ))}
            {citation ? (
              <Card className="retrieval-citation">
                <h2>{msg("retrieval.citation")}</h2>
                <pre>{JSON.stringify(citation, null, 2)}</pre>
              </Card>
            ) : null}
          </section>
        ) : (
          <EmptyState title={msg("retrieval.empty.heading")}>
            <p>{msg("retrieval.empty.body")}</p>
          </EmptyState>
        )
      ) : null}
    </main>
  );
}
