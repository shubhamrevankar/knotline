import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import { FileCheck2, FileWarning, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";

import {
  createFileDownload,
  createFileUpload,
  deleteFile,
  fetchFile,
  fetchFilePreview,
  fetchFiles,
  type FileView
} from "./api.js";
import { msg } from "./i18n.js";
import "./M19Pages.css";

const formatBytes = (value = 0) =>
  value < 1024
    ? `${value} B`
    : value < 1_048_576
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1_048_576).toFixed(1)} MB`;
const tone = (state: string) =>
  state === "ready"
    ? "success"
    : state === "quarantined" || state === "rejected" || state === "failed"
      ? "danger"
      : "warning";

export function KnowledgeSourcesPage() {
  const [files, setFiles] = useState<readonly FileView[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void fetchFiles()
      .then(setFiles)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("files.error"))
      );
  }, []);
  const upload = async (selected: File) => {
    setBusy(true);
    setError("");
    setProgress(15);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer());
      const checksum = `sha256:${[...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
      await createFileUpload({
        filename: selected.name,
        purpose: "knowledge_source",
        mediaType: selected.type || "application/octet-stream",
        sizeBytes: selected.size,
        checksum,
        classification: "internal",
        partCount: 1,
        idempotencyKey: `${selected.name}-${selected.size}-${selected.lastModified}`
      });
      setProgress(100);
      setFiles(await fetchFiles());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("files.error"));
    } finally {
      setBusy(false);
    }
  };
  const visible = filter === "all" ? files : files.filter((file) => file.state === filter);
  if (error && files.length === 0)
    return <ErrorState title={msg("files.error")}>{error}</ErrorState>;
  return (
    <main className="page-shell file-shell">
      <header>
        <Badge tone="accent">{msg("files.badge")}</Badge>
        <h1>{msg("files.heading")}</h1>
        <p>{msg("files.body")}</p>
      </header>
      <Card>
        <div className="file-toolbar">
          <label>
            {msg("files.filter")}
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">{msg("files.filter.all")}</option>
              <option value="ready">{msg("files.state.ready")}</option>
              <option value="processing">{msg("files.state.processing")}</option>
              <option value="quarantined">{msg("files.state.quarantined")}</option>
            </select>
          </label>
          <input
            ref={input}
            className="sr-only"
            type="file"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void upload(selected);
            }}
          />
          <Button onClick={() => input.current?.click()} disabled={busy}>
            <Upload size={16} />
            {msg("files.upload")}
          </Button>
        </div>
        {busy ? (
          <div>
            <p aria-live="polite">{msg("files.upload.progress", { percent: progress })}</p>
            <div
              className="file-progress"
              style={{ "--progress": `${progress}%` } as CSSProperties}
            >
              <span />
            </div>
          </div>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </Card>
      {visible.length ? (
        <section className="file-grid" aria-label={msg("files.list")}>
          {visible.map((file) => (
            <Card key={file.id} className="file-card">
              <div className="file-meta">
                {file.state === "ready" ? (
                  <FileCheck2 aria-hidden />
                ) : file.state === "quarantined" ? (
                  <FileWarning aria-hidden />
                ) : (
                  <ShieldCheck aria-hidden />
                )}
                <Badge tone={tone(file.state)}>{file.state}</Badge>
                <Badge>{file.classification}</Badge>
              </div>
              <h2>{file.filename}</h2>
              <p>
                {formatBytes(Number(file.size_bytes ?? 0))} ·{" "}
                {file.media_type ?? msg("files.type.pending")}
              </p>
              <p>{msg("files.version", { version: file.current_version })}</p>
              <Link to={`/app/knowledge/documents/${file.id}`}>{msg("files.inspect")}</Link>
            </Card>
          ))}
        </section>
      ) : (
        <EmptyState title={msg("files.empty.heading")}>
          <p>{msg("files.empty.body")}</p>
        </EmptyState>
      )}
    </main>
  );
}

export function KnowledgeDocumentPage() {
  const { documentId = "" } = useParams();
  const [file, setFile] = useState<Record<string, unknown>>();
  const [preview, setPreview] = useState<Record<string, unknown>>();
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchFile(documentId)
      .then(setFile)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : msg("files.error"))
      );
  }, [documentId]);
  if (error) return <ErrorState title={msg("files.error")}>{error}</ErrorState>;
  if (!file) return <Skeleton label={msg("files.loading")} />;
  const state = typeof file.state === "string" ? file.state : "processing";
  const filename = typeof file.filename === "string" ? file.filename : msg("files.document");
  return (
    <main className="page-shell file-shell">
      <header>
        <Badge tone={tone(state)}>{state}</Badge>
        <h1>{filename}</h1>
        <p>{msg("files.document.body")}</p>
      </header>
      <section className="file-detail-grid">
        <Card>
          <h2>{msg("files.processing")}</h2>
          <p>{msg("files.processing.body")}</p>
          <pre>{JSON.stringify(file.processing_jobs ?? [], null, 2)}</pre>
        </Card>
        <Card>
          <h2>{msg("files.preview")}</h2>
          <div className="file-preview">
            {preview ? (
              <pre>{JSON.stringify(preview, null, 2)}</pre>
            ) : (
              <p>{state === "ready" ? msg("files.preview.ready") : msg("files.preview.blocked")}</p>
            )}
          </div>
          <div className="file-actions">
            <Button
              disabled={state !== "ready"}
              onClick={() =>
                void fetchFilePreview(documentId)
                  .then(setPreview)
                  .catch((cause: unknown) =>
                    setError(cause instanceof Error ? cause.message : msg("files.error"))
                  )
              }
            >
              {msg("files.preview.open")}
            </Button>
            <Button
              disabled={state !== "ready"}
              onClick={() => void createFileDownload(documentId)}
            >
              {msg("files.download")}
            </Button>
            <Button
              onClick={() =>
                void deleteFile(documentId).then(() => setFile({ ...file, state: "deleted" }))
              }
            >
              {msg("files.delete")}
            </Button>
          </div>
        </Card>
      </section>
    </main>
  );
}
