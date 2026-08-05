import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@knotline/ui";
import {
  BookOpenCheck,
  Database,
  FileCheck2,
  FileText,
  FileWarning,
  Globe2,
  Search,
  ShieldCheck,
  Upload
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";

import {
  createFileDownload,
  createFileUpload,
  createWebsiteKnowledgeSource,
  deleteFile,
  fetchFile,
  fetchFilePreview,
  fetchKnowledgeFiles,
  uploadFileContent,
  type FileView
} from "./api.js";
import { msg } from "./i18n.js";
import { WorkspacePageHeader } from "./WorkspacePageHeader.js";
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
  const [classification, setClassification] = useState("internal");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteTitle, setWebsiteTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => fetchKnowledgeFiles().then(setFiles);
  useEffect(() => {
    void refresh().catch((cause: unknown) =>
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
      const created = await createFileUpload({
        filename: selected.name,
        purpose: "knowledge_source",
        mediaType: selected.type || "application/octet-stream",
        sizeBytes: selected.size,
        checksum,
        classification,
        partCount: 1,
        idempotencyKey: `${selected.name}-${selected.size}-${selected.lastModified}`
      });
      const uploadId =
        typeof created.upload_id === "string"
          ? created.upload_id
          : typeof created.uploadId === "string"
            ? created.uploadId
            : "";
      if (!uploadId) throw new Error(msg("files.upload.session.error"));
      setProgress(40);
      await uploadFileContent(uploadId, selected);
      setProgress(100);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("files.error"));
    } finally {
      setBusy(false);
    }
  };
  const addWebsite = async () => {
    if (!websiteUrl.trim()) return;
    setBusy(true);
    setError("");
    setProgress(20);
    try {
      await createWebsiteKnowledgeSource({
        url: websiteUrl.trim(),
        ...(websiteTitle.trim() ? { title: websiteTitle.trim() } : {})
      });
      setProgress(100);
      setWebsiteUrl("");
      setWebsiteTitle("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("files.error"));
    } finally {
      setBusy(false);
    }
  };
  const visible = filter === "all" ? files : files.filter((file) => file.state === filter);
  const readyCount = files.filter(({ state }) => state === "ready").length;
  const processingCount = files.filter(({ state }) =>
    ["initiated", "uploading", "processing"].includes(state)
  ).length;
  if (error && files.length === 0)
    return <ErrorState title={msg("files.error")}>{error}</ErrorState>;
  return (
    <main className="page-shell file-shell knowledge-shell">
      <WorkspacePageHeader
        actions={
          <Link to="/app/knowledge/search">
            <Search aria-hidden size={16} />
            {msg("files.search")}
          </Link>
        }
        description={msg("files.body")}
        eyebrow={msg("workspace.section.knowledge")}
        title={msg("files.heading")}
      />

      <section aria-label={msg("files.summary")} className="knowledge-summary-grid">
        <Card>
          <Database aria-hidden />
          <span>{msg("files.summary.sources")}</span>
          <strong>{files.length}</strong>
        </Card>
        <Card>
          <BookOpenCheck aria-hidden />
          <span>{msg("files.summary.ready")}</span>
          <strong>{readyCount}</strong>
        </Card>
        <Card>
          <ShieldCheck aria-hidden />
          <span>{msg("files.summary.processing")}</span>
          <strong>{processingCount}</strong>
        </Card>
      </section>

      <section className="knowledge-intake-grid">
        <Card className="knowledge-intake-card">
          <div className="knowledge-intake-heading">
            <span className="knowledge-intake-icon">
              <FileText aria-hidden />
            </span>
            <div>
              <Badge>{msg("files.upload.badge")}</Badge>
              <h2>{msg("files.upload.heading")}</h2>
              <p>{msg("files.upload.body")}</p>
            </div>
          </div>
          <label className="knowledge-classification">
            <span>{msg("files.classification")}</span>
            <select
              value={classification}
              onChange={(event) => setClassification(event.target.value)}
            >
              <option value="internal">{msg("files.classification.internal")}</option>
              <option value="confidential">{msg("files.classification.confidential")}</option>
              <option value="restricted">{msg("files.classification.restricted")}</option>
              <option value="public">{msg("files.classification.public")}</option>
            </select>
          </label>
          <input
            ref={input}
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            type="file"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void upload(selected);
              event.currentTarget.value = "";
            }}
          />
          <button
            className="knowledge-dropzone"
            disabled={busy}
            onClick={() => input.current?.click()}
            type="button"
          >
            <Upload aria-hidden />
            <strong>{msg("files.upload.choose")}</strong>
            <span>{msg("files.upload.formats")}</span>
          </button>
        </Card>

        <Card className="knowledge-intake-card knowledge-website-card">
          <div className="knowledge-intake-heading">
            <span className="knowledge-intake-icon knowledge-intake-icon-web">
              <Globe2 aria-hidden />
            </span>
            <div>
              <Badge>{msg("files.website.badge")}</Badge>
              <h2>{msg("files.website.heading")}</h2>
              <p>{msg("files.website.body")}</p>
            </div>
          </div>
          <label>
            <span>{msg("files.website.url")}</span>
            <input
              inputMode="url"
              onChange={(event) => setWebsiteUrl(event.currentTarget.value)}
              placeholder={msg("files.website.url.placeholder")}
              type="url"
              value={websiteUrl}
            />
          </label>
          <label>
            <span>{msg("files.website.title")}</span>
            <input
              onChange={(event) => setWebsiteTitle(event.currentTarget.value)}
              placeholder={msg("files.website.title.placeholder")}
              value={websiteTitle}
            />
          </label>
          <Button disabled={busy || !websiteUrl.trim()} onClick={() => void addWebsite()}>
            <Globe2 aria-hidden size={16} />
            {msg("files.website.add")}
          </Button>
        </Card>
      </section>

      {busy ? (
        <Card className="knowledge-progress-card">
          <div>
            <strong>{msg("files.processing.live")}</strong>
            <span>{msg("files.processing.live.body")}</span>
          </div>
          <span>{progress}%</span>
          <div className="file-progress" style={{ "--progress": `${progress}%` } as CSSProperties}>
            <span />
          </div>
        </Card>
      ) : null}
      {error ? (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="knowledge-library" aria-labelledby="knowledge-library-heading">
        <div className="knowledge-library-heading">
          <div>
            <Badge tone="accent">{msg("files.library.badge")}</Badge>
            <h2 id="knowledge-library-heading">{msg("files.library.heading")}</h2>
            <p>{msg("files.library.body")}</p>
          </div>
          <label>
            <span>{msg("files.filter")}</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">{msg("files.filter.all")}</option>
              <option value="ready">{msg("files.state.ready")}</option>
              <option value="processing">{msg("files.state.processing")}</option>
              <option value="quarantined">{msg("files.state.quarantined")}</option>
            </select>
          </label>
        </div>
        {visible.length ? (
          <div className="file-grid" aria-label={msg("files.list")}>
            {visible.map((file) => (
              <Card key={file.id} className="file-card">
                <div className="file-meta">
                  <span className={`knowledge-file-icon knowledge-file-icon-${file.state}`}>
                    {file.state === "ready" ? (
                      <FileCheck2 aria-hidden />
                    ) : file.state === "quarantined" ? (
                      <FileWarning aria-hidden />
                    ) : (
                      <ShieldCheck aria-hidden />
                    )}
                  </span>
                  <Badge tone={tone(file.state)}>{file.state}</Badge>
                </div>
                <h2>{file.filename}</h2>
                <p>
                  {formatBytes(Number(file.size_bytes ?? 0))} ·{" "}
                  {file.media_type ?? msg("files.type.pending")}
                </p>
                <div className="file-card-footer">
                  <span>{file.classification}</span>
                  <span>{msg("files.version", { version: file.current_version })}</span>
                  <Link to={`/app/knowledge/documents/${file.id}`}>{msg("files.inspect")}</Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title={msg("files.empty.heading")}>
            <p>{msg("files.empty.body")}</p>
          </EmptyState>
        )}
      </section>
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
  const previewText = typeof preview?.text === "string" ? preview.text : undefined;
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
            {previewText ? (
              <pre>{previewText}</pre>
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
