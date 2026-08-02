import {
  changedWorkflowSections,
  mergeChangedSections,
  validateWorkflowDefinition,
  type WorkflowDefinitionEdge,
  type WorkflowDefinitionNode
} from "@knotline/contracts";
import { Badge, Button, Card, ErrorState, Skeleton } from "@knotline/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  ArrowLeft,
  AlignHorizontalSpaceAround,
  Braces,
  Bot,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  FlaskConical,
  GitBranch,
  HelpCircle,
  LayoutGrid,
  ListTree,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  PlugZap,
  Plus,
  Redo2,
  Repeat2,
  Rocket,
  Save,
  Search,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  dryRunWorkflowDefinition,
  fetchWorkflowDraft,
  publishWorkflowDraft,
  saveWorkflowDraft,
  validateWorkflowDraft,
  type WorkflowDraft
} from "./api.js";
import { AuthGate } from "./AuthPages.js";
import { msg } from "./i18n.js";
import {
  clearEncryptedRecovery,
  loadEncryptedRecovery,
  saveEncryptedRecovery
} from "./studio-recovery.js";
import { deterministicLayout, initialStudioState, studioReducer } from "./studio-reducer.js";
import "./StudioPage.css";

const nodeKinds: readonly WorkflowDefinitionNode["kind"][] = [
  "trigger",
  "human",
  "agent",
  "approval",
  "condition",
  "delay",
  "loop",
  "subworkflow",
  "transform",
  "integration_action"
];

const kindLabel = (kind: WorkflowDefinitionNode["kind"]): string => {
  switch (kind) {
    case "trigger":
      return msg("canvas.kind.trigger");
    case "human":
      return msg("canvas.kind.human");
    case "agent":
      return msg("canvas.kind.agent");
    case "approval":
      return msg("canvas.kind.approval");
    case "condition":
      return msg("canvas.kind.condition");
    case "delay":
      return msg("canvas.kind.delay");
    case "loop":
      return msg("canvas.kind.loop");
    case "subworkflow":
      return msg("canvas.kind.subworkflow");
    case "transform":
      return msg("canvas.kind.transform");
    case "integration_action":
      return msg("canvas.kind.integrationaction");
  }
};

const studioIconByKind: Record<WorkflowDefinitionNode["kind"], LucideIcon> = {
  trigger: CircleDot,
  human: UserRound,
  agent: Bot,
  approval: ShieldCheck,
  condition: GitBranch,
  delay: Clock3,
  loop: Repeat2,
  subworkflow: Network,
  transform: Braces,
  integration_action: PlugZap
};

type StudioNodeData = {
  readonly label: string;
  readonly kind: WorkflowDefinitionNode["kind"];
  readonly disabled: boolean;
  readonly onInsertAfter: () => void;
  readonly recentlyAdded: boolean;
};

function StudioCanvasNode({ data, selected }: NodeProps<Node<StudioNodeData>>) {
  const Icon = studioIconByKind[data.kind];
  return (
    <article
      className={`studio-operation-node${selected ? " is-selected" : ""}${data.disabled ? " is-disabled" : ""}${data.recentlyAdded ? " is-new" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <span className="studio-operation-kind">
        <Icon aria-hidden="true" />
        {kindLabel(data.kind)}
      </span>
      <strong>{data.label}</strong>
      <button
        aria-label={msg("studio.node.insertafter", { name: data.label })}
        className="studio-node-insert"
        onClick={(event) => {
          event.stopPropagation();
          data.onInsertAfter();
        }}
        type="button"
      >
        <Plus aria-hidden="true" />
      </button>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const studioNodeTypes = { operation: StudioCanvasNode };

function safeTestFixture(definition: WorkflowDraft["definition"]) {
  const humanSubmissions = Object.fromEntries(
    definition.nodes
      .filter(({ kind }) => kind === "human")
      .map(({ key }) => [key, { status: "submitted", source: "controlled_safe_test" }])
  );
  const agentOutputs = Object.fromEntries(
    definition.nodes
      .filter(({ kind }) => kind === "agent")
      .map(({ key }) => [key, { status: "completed", source: "controlled_safe_test" }])
  );
  const connectorOutputs = Object.fromEntries(
    definition.nodes
      .filter(({ kind }) => kind === "integration_action")
      .map(({ key }) => [key, { status: "simulated", externalWrite: false }])
  );
  const healthyConnections = definition.nodes
    .filter(({ kind }) => kind === "integration_action")
    .map(({ configuration }) => configuration.connectionRef)
    .filter((value): value is string => typeof value === "string");
  return {
    input: { source: "workflow_studio_safe_test" },
    humanSubmissions,
    agentOutputs,
    connectorOutputs,
    permissions: ["workflow.run"],
    entitlements: ["workflows"],
    healthyConnections,
    budgetMinor: Math.max(
      100,
      definition.nodes.filter(({ kind }) => kind === "agent").length * 100
    ),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  };
}

function createNode(kind: WorkflowDefinitionNode["kind"], index: number): WorkflowDefinitionNode {
  const configuration =
    kind === "loop"
      ? { maxIterations: 10 }
      : kind === "approval"
        ? { policy: "workspace_owner" }
        : kind === "integration_action"
          ? {
              connectionRef: "conn_configure_me",
              idempotencyKey: "${nodes.start.output.id}",
              risk: "medium"
            }
          : kind === "subworkflow"
            ? { workflowRef: "wf_configure_me" }
            : {};
  return {
    key: `${kind}_${index}`,
    kind,
    name: `${kindLabel(kind)} ${index}`,
    description: "",
    position: { x: 120 + (index % 4) * 260, y: 100 + Math.floor(index / 4) * 180 },
    configuration
  };
}

export function StudioPage() {
  return (
    <AuthGate>
      <StudioRoute />
    </AuthGate>
  );
}

function StudioRoute() {
  const { workflowId = "" } = useParams();
  const query = useQuery({
    queryKey: ["workflow-draft", workflowId],
    queryFn: () => fetchWorkflowDraft(workflowId)
  });
  return (
    <main className="studio-page">
      {query.isError ? (
        <ErrorState title={msg("studio.error")}>
          <p>{String(query.error)}</p>
        </ErrorState>
      ) : !query.data ? (
        <Skeleton label={msg("studio.loading")} />
      ) : (
        <StudioEditor
          key={`${query.data.version}-${query.data.revision}`}
          initialDraft={query.data}
        />
      )}
    </main>
  );
}

function StudioEditor({ initialDraft }: { initialDraft: WorkflowDraft }) {
  const [searchParams] = useSearchParams();
  const [state, dispatch] = useReducer(
    studioReducer,
    initialStudioState(initialDraft.definition, initialDraft.revision)
  );
  const [serverDraft, setServerDraft] = useState(initialDraft);
  const [status, setStatus] = useState<"saved" | "saving" | "offline" | "conflict" | "invalid">(
    "saved"
  );
  const [palette, setPalette] = useState("");
  const [showPalette, setShowPalette] = useState(false);
  const [insertAfterKey, setInsertAfterKey] = useState<string>();
  const [stepSearch, setStepSearch] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [recentlyAddedKey, setRecentlyAddedKey] = useState<string>();
  const [isDragging, setIsDragging] = useState(false);
  const [addAtPosition, setAddAtPosition] = useState<{ x: number; y: number }>();
  const [contextMenu, setContextMenu] = useState<{
    kind: "node" | "edge" | "pane";
    key?: string;
    x: number;
    y: number;
  }>();
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [conflictServer, setConflictServer] = useState<WorkflowDraft>();
  const [conflictSections, setConflictSections] = useState<readonly string[]>([]);
  const [showPublishReview, setShowPublishReview] = useState(
    () => searchParams.get("review") === "publish"
  );
  const [reviewValidation, setReviewValidation] =
    useState<Awaited<ReturnType<typeof validateWorkflowDraft>>>();
  const [safeTest, setSafeTest] = useState<Awaited<ReturnType<typeof dryRunWorkflowDefinition>>>();
  const [releaseNote, setReleaseNote] = useState("");
  const [reviewAction, setReviewAction] = useState<
    "validating" | "testing" | "publishing" | undefined
  >();
  const [reviewError, setReviewError] = useState("");
  const [published, setPublished] = useState<Awaited<ReturnType<typeof publishWorkflowDraft>>>();
  const [stepTest, setStepTest] = useState<{
    key: string;
    steps: number;
    writes: number;
  }>();
  const [testingStep, setTestingStep] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const fitView = useRef<(() => void) | undefined>(undefined);
  const flowInstance = useRef<ReactFlowInstance<Node<StudioNodeData>, Edge> | undefined>(undefined);
  const canvasRef = useRef<HTMLElement>(null);
  const savedSnapshot = useRef(JSON.stringify(initialDraft.definition));
  const baseDefinition = useRef(initialDraft.definition);

  const save = useMutation({
    mutationFn: (definition: typeof state.definition) => saveWorkflowDraft(serverDraft, definition),
    onMutate: () => setStatus("saving"),
    onSuccess: (saved, submitted) => {
      savedSnapshot.current = JSON.stringify(submitted);
      baseDefinition.current = submitted;
      setServerDraft(saved);
      setStatus("saved");
      clearEncryptedRecovery(saved.workflowId);
    },
    onError: async (error) => {
      await saveEncryptedRecovery(serverDraft.workflowId, state.definition);
      setRecoveryAvailable(true);
      const conflicted = String(error).includes("409") || String(error).includes("412");
      setStatus(conflicted ? "conflict" : "offline");
      if (conflicted) {
        let remote: WorkflowDraft | undefined;
        try {
          remote = await fetchWorkflowDraft(serverDraft.workflowId);
        } catch {
          remote = undefined;
        }
        if (remote) {
          setConflictServer(remote);
          setConflictSections(changedWorkflowSections(baseDefinition.current, remote.definition));
        }
      }
    }
  });
  const saveDraft = useCallback(() => save.mutate(state.definition), [save, state.definition]);

  const openPublishReview = () => {
    setReviewValidation(undefined);
    setSafeTest(undefined);
    setReviewError("");
    setShowPublishReview(true);
  };

  const validateForRelease = async () => {
    setReviewAction("validating");
    setReviewError("");
    setSafeTest(undefined);
    try {
      if (JSON.stringify(state.definition) !== savedSnapshot.current)
        await save.mutateAsync(state.definition);
      const result = await validateWorkflowDraft(serverDraft.workflowId);
      setReviewValidation(result);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setReviewAction(undefined);
    }
  };

  const runSafeTest = async () => {
    setReviewAction("testing");
    setReviewError("");
    try {
      const result = await dryRunWorkflowDefinition(
        state.definition,
        safeTestFixture(state.definition)
      );
      setSafeTest(result);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setReviewAction(undefined);
    }
  };

  const publishRelease = async () => {
    if (!reviewValidation?.valid || !safeTest?.preflight.allowed || releaseNote.trim().length < 3)
      return;
    setReviewAction("publishing");
    setReviewError("");
    try {
      const result = await publishWorkflowDraft(
        serverDraft.workflowId,
        serverDraft.revision,
        releaseNote.trim()
      );
      setPublished(result);
      if (!result.published) setReviewValidation({ valid: false, findings: result.findings });
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setReviewAction(undefined);
    }
  };

  useEffect(() => {
    void loadEncryptedRecovery(serverDraft.workflowId).then((recovery) =>
      setRecoveryAvailable(Boolean(recovery))
    );
  }, [serverDraft.workflowId]);

  useEffect(() => {
    if (JSON.stringify(state.definition) === savedSnapshot.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDraft(), 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [saveDraft, serverDraft.revision, state.definition]);

  useEffect(() => {
    if (!showPublishReview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !reviewAction && !published) setShowPublishReview(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [published, reviewAction, showPublishReview]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
      if (command && event.key.toLowerCase() === "c")
        dispatch({ type: "copy", keys: state.selectedNodeKeys });
      if (command && event.key.toLowerCase() === "v") dispatch({ type: "paste" });
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDraft();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedEdgeKey) dispatch({ type: "delete_edge", key: state.selectedEdgeKey });
        else dispatch({ type: "delete_nodes", keys: state.selectedNodeKeys });
      }
      if (event.key.toLowerCase() === "a" && !command) {
        setInsertAfterKey(undefined);
        setShowPalette(true);
      }
      if (event.key.toLowerCase() === "f" && !command) fitView.current?.();
      if (event.key === "Escape") {
        setContextMenu(undefined);
        setShowPalette(false);
        setShowOutline(false);
      }
      if (event.key === "?") setShowHelp(true);
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [saveDraft, state.selectedEdgeKey, state.selectedNodeKeys]);

  const findings = useMemo(() => validateWorkflowDefinition(state.definition), [state.definition]);
  const displayedStatus =
    status === "saved" && findings.some(({ severity }) => severity === "error")
      ? "invalid"
      : status;

  const statusMessage = {
    saved: msg("studio.status.saved"),
    saving: msg("studio.status.saving"),
    offline: msg("studio.status.offline"),
    conflict: msg("studio.status.conflict"),
    invalid: msg("studio.status.invalid")
  }[displayedStatus];

  const focusFinding = (finding: (typeof findings)[number]) => {
    if (finding.location.type === "node" && finding.location.key) {
      setInspectorOpen(true);
      dispatch({ type: "select_node", key: finding.location.key });
      const node = state.definition.nodes.find(({ key }) => key === finding.location.key);
      if (node)
        window.setTimeout(
          () =>
            void flowInstance.current?.setCenter(node.position.x + 109, node.position.y + 45, {
              zoom: 0.9,
              duration: 350
            }),
          0
        );
    }
    if (finding.location.type === "edge" && finding.location.key)
      dispatch({ type: "select_edge", key: finding.location.key });
    if (finding.location.type === "edge") setInspectorOpen(true);
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(".studio-inspector input, .studio-inspector textarea")
          ?.focus(),
      0
    );
  };

  const reloadServer = async () => {
    const fresh = await fetchWorkflowDraft(serverDraft.workflowId);
    savedSnapshot.current = JSON.stringify(fresh.definition);
    baseDefinition.current = fresh.definition;
    setServerDraft(fresh);
    dispatch({ type: "replace", definition: fresh.definition, revision: fresh.revision });
    setStatus("saved");
    setConflictServer(undefined);
    setConflictSections([]);
  };

  const reapplyLocalChanges = () => {
    if (!conflictServer) return;
    const result = mergeChangedSections(
      baseDefinition.current,
      state.definition,
      conflictServer.definition
    );
    setConflictSections(result.conflicts);
    if (result.conflicts.length > 0) return;
    setServerDraft(conflictServer);
    savedSnapshot.current = JSON.stringify(conflictServer.definition);
    baseDefinition.current = conflictServer.definition;
    dispatch({ type: "replace", definition: result.merged, revision: state.revision + 1 });
    setConflictServer(undefined);
    setStatus("offline");
  };

  const recoverLocal = async () => {
    const recovered = await loadEncryptedRecovery(serverDraft.workflowId);
    if (!recovered) return;
    dispatch({ type: "replace", definition: recovered, revision: state.revision + 1 });
    setRecoveryAvailable(false);
    setStatus("offline");
  };

  const selectedNode = state.definition.nodes.find(({ key }) => key === state.selectedNodeKeys[0]);
  const selectedEdge = state.definition.edges.find(({ key }) => key === state.selectedEdgeKey);
  const nodes: Node<StudioNodeData>[] = useMemo(
    () =>
      state.definition.nodes.map((node) => ({
        id: node.key,
        type: "operation",
        ariaLabel: node.name,
        ariaRole: "button",
        position: node.position,
        data: {
          label: node.name,
          kind: node.kind,
          disabled: node.configuration.disabled === true,
          recentlyAdded: node.key === recentlyAddedKey,
          onInsertAfter: () => {
            setInsertAfterKey(node.key);
            setPalette("");
            setShowPalette(true);
          }
        },
        selected: state.selectedNodeKeys.includes(node.key),
        className: `studio-node studio-node-${node.kind}`
      })),
    [recentlyAddedKey, state.definition.nodes, state.selectedNodeKeys]
  );
  const edges: Edge[] = useMemo(
    () =>
      state.definition.edges.map((edge) => ({
        id: edge.key,
        source: edge.source,
        target: edge.target,
        label: edge.condition,
        selected: edge.key === state.selectedEdgeKey,
        markerEnd: { type: MarkerType.ArrowClosed },
        interactionWidth: 24,
        style: { stroke: "#80918c", strokeWidth: 1.5 }
      })),
    [state.definition.edges, state.selectedEdgeKey]
  );

  const addNode = (kind: WorkflowDefinitionNode["kind"]) => {
    const base = createNode(kind, state.definition.nodes.length + 1);
    let key = base.key;
    let suffix = 2;
    while (state.definition.nodes.some((node) => node.key === key)) key = `${base.key}_${suffix++}`;
    const source = state.definition.nodes.find(({ key: nodeKey }) => nodeKey === insertAfterKey);
    const viewportCenter = (() => {
      if (addAtPosition) return addAtPosition;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !flowInstance.current) return base.position;
      return flowInstance.current.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    })();
    const node = source
      ? { ...base, key, position: { x: source.position.x + 285, y: source.position.y + 120 } }
      : { ...base, key, position: { x: viewportCenter.x - 109, y: viewportCenter.y - 45 } };
    dispatch({ type: "add_node", node });
    if (source) {
      const edgePrefix = `edge_${source.key}_${key}`;
      let edgeKey = edgePrefix;
      let edgeSuffix = 2;
      while (state.definition.edges.some(({ key: candidate }) => candidate === edgeKey))
        edgeKey = `${edgePrefix}_${edgeSuffix++}`;
      dispatch({
        type: "connect",
        edge: {
          key: edgeKey,
          source: source.key,
          target: key,
          pathType: "default",
          mapping: {}
        }
      });
    }
    dispatch({ type: "select_node", key });
    setInspectorOpen(true);
    setRecentlyAddedKey(key);
    window.setTimeout(() => setRecentlyAddedKey((current) => (current === key ? undefined : current)), 2200);
    window.setTimeout(
      () =>
        void flowInstance.current?.setCenter(node.position.x + 109, node.position.y + 45, {
          zoom: Math.max(flowInstance.current?.getZoom() ?? 1, 0.9),
          duration: 420
        }),
      0
    );
    setInsertAfterKey(undefined);
    setAddAtPosition(undefined);
    setPalette("");
    setShowPalette(false);
    setShowOutline(false);
  };

  const testSelectedStep = async () => {
    if (!selectedNode) return;
    setTestingStep(true);
    try {
      const result = await dryRunWorkflowDefinition(
        state.definition,
        safeTestFixture(state.definition)
      );
      setStepTest({
        key: selectedNode.key,
        steps: result.steps.length,
        writes: result.externalWrites
      });
    } finally {
      setTestingStep(false);
    }
  };
  const autoLayout = (direction: "horizontal" | "vertical") => {
    try {
      const worker = new Worker(new URL("./studio-layout.worker.ts", import.meta.url), {
        type: "module"
      });
      worker.onmessage = (
        event: MessageEvent<Readonly<Record<string, { x: number; y: number }>>>
      ) => {
        dispatch({ type: "layout", positions: event.data, direction });
        worker.terminate();
        window.setTimeout(() => fitView.current?.(), 0);
      };
      worker.postMessage({ definition: state.definition, direction });
    } catch {
      dispatch({
        type: "layout",
        positions: deterministicLayout(state.definition, direction),
        direction
      });
    }
  };

  return (
    <>
      <header className="studio-header">
        <div className="studio-title-block">
          <Link className="studio-back-link" to="/app/workflows">
            <ArrowLeft aria-hidden="true" />
            {msg("studio.back.library")}
          </Link>
          <div className="studio-title-row">
            <div>
              <span className="studio-kicker">{msg("studio.kicker")}</span>
              <h1>{state.definition.name}</h1>
            </div>
            <Badge tone="neutral">
              {msg("studio.draft.version", {
                revision: serverDraft.revision,
                version: serverDraft.version
              })}
            </Badge>
          </div>
          <div className="studio-header-metrics" aria-label={msg("studio.summary")}>
            <span>{msg("studio.summary.steps", { count: state.definition.nodes.length })}</span>
            <span>{msg("studio.summary.paths", { count: state.definition.edges.length })}</span>
            <span
              className={`studio-save-state studio-save-state-${displayedStatus}`}
              role="status"
            >
              <i aria-hidden="true" />
              {statusMessage}
            </span>
          </div>
        </div>
        <div className="studio-header-actions">
          {recoveryAvailable ? (
            <Button onClick={() => void recoverLocal()}>{msg("studio.recovery.available")}</Button>
          ) : null}
          {status === "conflict" ? (
            <>
              <Button onClick={() => void reloadServer()}>{msg("studio.conflict.reload")}</Button>
              <Button onClick={reapplyLocalChanges} disabled={!conflictServer}>
                {msg("studio.conflict.reapply")}
              </Button>
            </>
          ) : null}
          <Button className="studio-save-button" onClick={saveDraft} disabled={status === "saving"}>
            <Save aria-hidden="true" />
            {msg("studio.save")}
          </Button>
          <Button tone="accent" onClick={openPublishReview} disabled={status !== "saved"}>
            <Rocket aria-hidden="true" />
            {msg("studio.review.publish")}
          </Button>
        </div>
      </header>
      {status === "conflict" ? (
        <aside className="studio-conflict-banner" role="alert">
          <strong>{msg("studio.conflict.heading")}</strong>
          <p>
            {conflictSections.length
              ? msg("studio.conflict.sections", { sections: conflictSections.join(", ") })
              : msg("studio.conflict.loading")}
          </p>
        </aside>
      ) : null}
      <div className="studio-toolbar" role="toolbar" aria-label={msg("studio.toolbar")}>
        <div className="studio-toolbar-group studio-toolbar-primary">
          <Button
            onClick={() => {
              setInsertAfterKey(undefined);
              setShowPalette((value) => !value);
            }}
            aria-expanded={showPalette}
          >
            {showPalette ? (
              <PanelLeftClose aria-hidden="true" />
            ) : (
              <PanelLeftOpen aria-hidden="true" />
            )}
            {msg("studio.addstep")}
          </Button>
          <Button onClick={() => fitView.current?.()}>
            <ScanSearch aria-hidden="true" />
            {msg("studio.fit")}
          </Button>
        </div>
        <span className="studio-toolbar-divider" aria-hidden="true" />
        <div className="studio-toolbar-group">
          <Button
            onClick={() => dispatch({ type: "undo" })}
            disabled={state.past.length === 0}
            aria-label={msg("studio.undo")}
          >
            <Undo2 aria-hidden="true" />
          </Button>
          <Button
            onClick={() => dispatch({ type: "redo" })}
            disabled={state.future.length === 0}
            aria-label={msg("studio.redo")}
          >
            <Redo2 aria-hidden="true" />
          </Button>
        </div>
        <span className="studio-toolbar-divider" aria-hidden="true" />
        <div className="studio-toolbar-group">
          <Button onClick={() => setShowOutline((value) => !value)}>
            <ListTree aria-hidden="true" />
            {msg("studio.outline")}
          </Button>
          <Button onClick={() => setInspectorOpen(true)}>
            <PencilLine aria-hidden="true" />
            {msg("studio.inspector.open")}
          </Button>
          <Button
            onClick={() => autoLayout(state.direction === "horizontal" ? "vertical" : "horizontal")}
          >
            <LayoutGrid aria-hidden="true" />
            {msg("studio.layout")}
          </Button>
        </div>
        {state.selectedNodeKeys.length > 0 ? (
          <>
            <span className="studio-toolbar-divider" aria-hidden="true" />
            <div className="studio-toolbar-group studio-toolbar-selection">
              <span>{msg("studio.selected", { count: state.selectedNodeKeys.length })}</span>
              <Button
                onClick={() => dispatch({ type: "align", keys: state.selectedNodeKeys, axis: "y" })}
              >
                <AlignHorizontalSpaceAround aria-hidden="true" />
                {msg("studio.align")}
              </Button>
              <Button
                onClick={() =>
                  dispatch({ type: "distribute", keys: state.selectedNodeKeys, axis: "x" })
                }
                disabled={state.selectedNodeKeys.length < 3}
              >
                {msg("studio.distribute")}
              </Button>
              <Button
                onClick={() =>
                  dispatch({
                    type: "group",
                    keys: state.selectedNodeKeys,
                    groupId: `group_${Date.now()}`
                  })
                }
                disabled={state.selectedNodeKeys.length < 2}
              >
                {msg("studio.group")}
              </Button>
              <Button
                onClick={() => dispatch({ type: "duplicate_nodes", keys: state.selectedNodeKeys })}
                disabled={state.selectedNodeKeys.length === 0}
              >
                <Copy aria-hidden="true" />
                {msg("studio.duplicate")}
              </Button>
              <Button
                onClick={() => dispatch({ type: "delete_nodes", keys: state.selectedNodeKeys })}
                disabled={state.selectedNodeKeys.length === 0}
              >
                <Trash2 aria-hidden="true" />
                {msg("studio.delete")}
              </Button>
            </div>
          </>
        ) : state.selectedEdgeKey ? (
          <>
            <span className="studio-toolbar-divider" aria-hidden="true" />
            <div className="studio-toolbar-group studio-toolbar-selection">
              <span>{msg("studio.connection.selected")}</span>
              <Button onClick={() => dispatch({ type: "delete_edge", key: state.selectedEdgeKey! })}>
                <Trash2 aria-hidden="true" />
                {msg("studio.edge.delete")}
              </Button>
            </div>
          </>
        ) : null}
        <div className="studio-toolbar-spacer" />
        <Button onClick={() => setShowHelp(true)}>
          <HelpCircle aria-hidden="true" />
          {msg("studio.help")}
        </Button>
      </div>
      <div
        className={`studio-layout ${showOutline ? "studio-layout-outline" : ""} ${showPalette ? "" : "studio-layout-no-palette"}${isDragging ? " is-dragging" : ""}`}
      >
        {showPalette ? (
          <aside className="studio-palette" aria-label={msg("studio.palette")}>
            <div className="studio-panel-heading">
              <div>
                <span>
                  {insertAfterKey
                    ? msg("studio.palette.insert.eyebrow")
                    : msg("studio.palette.eyebrow")}
                </span>
                <h2>
                  {insertAfterKey
                    ? msg("studio.palette.insert.heading")
                    : msg("studio.palette.heading")}
                </h2>
              </div>
              <Button
                aria-label={msg("studio.palette.close")}
                onClick={() => {
                  setShowPalette(false);
                  setInsertAfterKey(undefined);
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            {insertAfterKey ? (
              <p className="studio-insert-context">
                {msg("studio.palette.insert.body", {
                  name: state.definition.nodes.find(({ key }) => key === insertAfterKey)?.name ?? ""
                })}
              </p>
            ) : null}
            <label>
              <Search aria-hidden="true" />
              <span className="sr-only">{msg("studio.palette.search")}</span>
              <input
                value={palette}
                onChange={(event) => setPalette(event.target.value)}
                placeholder={msg("studio.palette.search")}
              />
            </label>
            {nodeKinds
              .filter((kind) => kindLabel(kind).toLowerCase().includes(palette.toLowerCase()))
              .map((kind) => (
                <Button className="studio-palette-item" key={kind} onClick={() => addNode(kind)}>
                  {(() => {
                    const Icon = studioIconByKind[kind];
                    return <Icon aria-hidden="true" />;
                  })()}
                  <span>
                    <strong>{kindLabel(kind)}</strong>
                    <small>{msg("studio.palette.add")}</small>
                  </span>
                  <Plus aria-hidden="true" />
                </Button>
              ))}
          </aside>
        ) : null}
        <section className="studio-canvas" aria-label={msg("studio.canvas")} ref={canvasRef}>
          <div className="studio-canvas-heading">
            <div>
              <span>{msg("studio.canvas.eyebrow")}</span>
              <strong>{msg("studio.canvas.heading")}</strong>
            </div>
            <div className="studio-canvas-tools">
              <span
                className={
                  findings.length ? "studio-health studio-health-attention" : "studio-health"
                }
              >
                {findings.length
                  ? msg("studio.health.issues", { count: findings.length })
                  : msg("studio.health.ready")}
              </span>
              <label className="studio-step-search">
                <Search aria-hidden="true" />
                <span className="sr-only">{msg("studio.find")}</span>
                <input
                  value={stepSearch}
                  onChange={(event) => setStepSearch(event.target.value)}
                  placeholder={msg("studio.find")}
                />
                {stepSearch ? (
                  <span className="studio-step-results">
                    {state.definition.nodes
                      .filter(({ name }) => name.toLowerCase().includes(stepSearch.toLowerCase()))
                      .slice(0, 6)
                      .map((node) => (
                        <button
                          key={node.key}
                          onClick={() => {
                            setInspectorOpen(true);
                            dispatch({ type: "select_node", key: node.key });
                            setStepSearch("");
                            void flowInstance.current?.setCenter(
                              node.position.x + 109,
                              node.position.y + 45,
                              { zoom: 0.9, duration: 350 }
                            );
                          }}
                          type="button"
                        >
                          {node.name}
                          <small>{kindLabel(node.kind)}</small>
                        </button>
                      ))}
                  </span>
                ) : null}
              </label>
            </div>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={studioNodeTypes}
            onlyRenderVisibleElements
            minZoom={0.2}
            maxZoom={2}
            nodeDragThreshold={1}
            selectionOnDrag
            onInit={(instance) => {
              flowInstance.current = instance;
              fitView.current = () => void instance.fitView({ padding: 0.2 });
              const firstNode = state.definition.nodes[0];
              window.setTimeout(() => {
                if (firstNode && state.definition.nodes.length > 8)
                  void instance.setCenter(firstNode.position.x + 109, firstNode.position.y + 45, {
                    zoom: 0.82,
                    duration: 450
                  });
                else void instance.fitView({ padding: 0.2 });
              }, 0);
            }}
            onNodeClick={(event, node) => {
              setContextMenu(undefined);
              setInspectorOpen(true);
              dispatch({
                type: "select_node",
                key: node.id,
                additive: event.metaKey || event.ctrlKey
              });
            }}
            onEdgeClick={(_event, edge) => {
              setContextMenu(undefined);
              setInspectorOpen(true);
              dispatch({ type: "select_edge", key: edge.id });
            }}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              setInspectorOpen(true);
              dispatch({ type: "select_node", key: node.id });
              setContextMenu({
                kind: "node",
                key: node.id,
                x: Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2,
                y: Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2
              });
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              setInspectorOpen(true);
              dispatch({ type: "select_edge", key: edge.id });
              setContextMenu({
                kind: "edge",
                key: edge.id,
                x: Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2,
                y: Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2
              });
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({
                kind: "pane",
                x: Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2,
                y: Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2
              });
              setAddAtPosition(flowInstance.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            }}
            onPaneClick={(event) => {
              setContextMenu(undefined);
              if (event.detail === 2) {
                setAddAtPosition(flowInstance.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
                setInsertAfterKey(undefined);
                setShowPalette(true);
              }
            }}
            onNodeDragStart={() => setIsDragging(true)}
            onNodeDragStop={(_event, node) => {
              setIsDragging(false);
              dispatch({ type: "move_node", key: node.id, position: node.position })
            }}
            onConnect={(connection: Connection) => {
              if (connection.source && connection.target)
                dispatch({
                  type: "connect",
                  edge: {
                    key: `edge_${Date.now()}`,
                    source: connection.source,
                    target: connection.target,
                    pathType: "default",
                    mapping: {}
                  }
                });
            }}
            onEdgesChange={(changes) => {
              const removed = changes.find((change) => change.type === "remove");
              if (removed) dispatch({ type: "delete_edge", key: removed.id });
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          <p className="studio-canvas-hint">{msg("studio.canvas.hint")}</p>
        </section>
        {showOutline ? (
          <section className="studio-outline" aria-labelledby="studio-outline-heading">
            <div className="row-between">
              <h2 id="studio-outline-heading">{msg("studio.outline")}</h2>
              <Badge tone="neutral">{state.definition.nodes.length}</Badge>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{msg("studio.node")}</th>
                  <th>{msg("studio.kind")}</th>
                  <th>{msg("studio.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {state.definition.nodes.map((node) => (
                  <tr
                    key={node.key}
                    className={state.selectedNodeKeys.includes(node.key) ? "selected" : ""}
                  >
                    <td>
                      <button
                        onClick={() => {
                          setInspectorOpen(true);
                          setShowOutline(false);
                          dispatch({ type: "select_node", key: node.key });
                          window.setTimeout(
                            () =>
                              void flowInstance.current?.setCenter(
                                node.position.x + 109,
                                node.position.y + 45,
                                { zoom: 0.9, duration: 350 }
                              ),
                            0
                          );
                        }}
                      >
                        {node.name}
                      </button>
                    </td>
                    <td>{kindLabel(node.kind)}</td>
                    <td>
                      <Button
                        onClick={() => dispatch({ type: "duplicate_nodes", keys: [node.key] })}
                        aria-label={msg("studio.node.duplicate", { name: node.name })}
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                      <Button
                        onClick={() => dispatch({ type: "delete_nodes", keys: [node.key] })}
                        aria-label={msg("studio.node.delete", { name: node.name })}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{msg("studio.edges")}</h3>
            <ul>
              {state.definition.edges.map((edge) => (
                <li key={edge.key}>
                  <button
                    onClick={() => {
                      setInspectorOpen(true);
                      setShowOutline(false);
                      dispatch({ type: "select_edge", key: edge.key });
                    }}
                  >
                    {edge.source} → {edge.target}
                  </button>
                  <Button
                    aria-label={msg("studio.edge.delete")}
                    onClick={() => dispatch({ type: "delete_edge", key: edge.key })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {inspectorOpen ? <aside className="studio-inspector" aria-label={msg("studio.inspector")}>
          <div className="studio-panel-heading">
            <div>
              <span>{msg("studio.inspector.eyebrow")}</span>
              <h2>{msg("studio.inspector.heading")}</h2>
            </div>
            <Button aria-label={msg("studio.inspector.close")} onClick={() => setInspectorOpen(false)}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <details className="studio-workflow-settings">
            <summary>{msg("studio.workflow.settings")}</summary>
            <label>
              {msg("studio.workflow.name")}
              <input
                value={state.definition.name}
                onChange={(event) =>
                  dispatch({ type: "update_workflow", patch: { name: event.target.value } })
                }
              />
            </label>
            <label>
              {msg("studio.workflow.description")}
              <textarea
                value={state.definition.description}
                onChange={(event) =>
                  dispatch({
                    type: "update_workflow",
                    patch: { description: event.target.value }
                  })
                }
              />
            </label>
          </details>
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              update={(patch) => dispatch({ type: "update_node", key: selectedNode.key, patch })}
              disable={(disabled) =>
                dispatch({ type: "disable", keys: [selectedNode.key], disabled })
              }
              testing={testingStep}
              onTest={() => void testSelectedStep()}
              {...(stepTest?.key === selectedNode.key ? { testResult: stepTest } : {})}
            />
          ) : selectedEdge ? (
            <EdgeInspector
              edge={selectedEdge}
              update={(patch) => dispatch({ type: "update_edge", key: selectedEdge.key, patch })}
              remove={() => dispatch({ type: "delete_edge", key: selectedEdge.key })}
            />
          ) : (
            <Card>
              <Braces aria-hidden="true" />
              <h2>{msg("studio.inspector.empty")}</h2>
              <p>{msg("studio.inspector.empty.body")}</p>
            </Card>
          )}
        </aside> : null}
        <section className="studio-validation" aria-labelledby="studio-validation-heading">
          <div className="row-between">
            <h2 id="studio-validation-heading">{msg("studio.validation")}</h2>
            <Badge
              tone={findings.some(({ severity }) => severity === "error") ? "danger" : "neutral"}
            >
              {findings.length}
            </Badge>
          </div>
          {findings.length === 0 ? (
            <p>{msg("studio.validation.clear")}</p>
          ) : (
            <ul>
              {findings.map((finding, index) => (
                <li key={`${finding.code}-${index}`}>
                  <button onClick={() => focusFinding(finding)}>
                    <strong>{finding.severity}</strong> · {finding.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {contextMenu ? (
        <div
          className="studio-context-menu"
          role="menu"
          aria-label={msg(`studio.context.${contextMenu.kind}`)}
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 226)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - (contextMenu.kind === "node" ? 190 : 112)))
          }}
        >
          {contextMenu.kind === "node" && contextMenu.key ? (
            <>
              <button onClick={() => setContextMenu(undefined)} role="menuitem">
                <PencilLine aria-hidden="true" /> {msg("studio.context.configure")}
              </button>
              <button
                onClick={() => {
                  setInsertAfterKey(contextMenu.key);
                  setShowPalette(true);
                  setContextMenu(undefined);
                }}
                role="menuitem"
              >
                <Plus aria-hidden="true" /> {msg("studio.context.insertafter")}
              </button>
              <button
                onClick={() => {
                  dispatch({ type: "duplicate_nodes", keys: [contextMenu.key!] });
                  setContextMenu(undefined);
                }}
                role="menuitem"
              >
                <Copy aria-hidden="true" /> {msg("studio.duplicate")}
              </button>
              <button
                className="is-danger"
                onClick={() => {
                  dispatch({ type: "delete_nodes", keys: [contextMenu.key!] });
                  setContextMenu(undefined);
                }}
                role="menuitem"
              >
                <Trash2 aria-hidden="true" /> {msg("studio.context.deletestep")}
              </button>
            </>
          ) : contextMenu.kind === "edge" && contextMenu.key ? (
            <>
              <button onClick={() => setContextMenu(undefined)} role="menuitem">
                <PencilLine aria-hidden="true" /> {msg("studio.context.editconnection")}
              </button>
              <button
                className="is-danger"
                onClick={() => {
                  dispatch({ type: "delete_edge", key: contextMenu.key! });
                  setContextMenu(undefined);
                }}
                role="menuitem"
              >
                <Trash2 aria-hidden="true" /> {msg("studio.edge.delete")}
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setInsertAfterKey(undefined);
                setShowPalette(true);
                setContextMenu(undefined);
              }}
              role="menuitem"
            >
              <Plus aria-hidden="true" /> {msg("studio.context.addhere")}
            </button>
          )}
        </div>
      ) : null}
      {recentlyAddedKey ? (
        <div className="studio-added-toast" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{msg("studio.added")}</span>
          <button onClick={() => dispatch({ type: "undo" })}>{msg("studio.added.undo")}</button>
        </div>
      ) : null}
      {showPublishReview ? (
        <div className="studio-review-backdrop" role="presentation">
          <section
            aria-labelledby="studio-review-heading"
            aria-modal="true"
            className="studio-review-dialog"
            role="dialog"
          >
            {published?.published ? (
              <div className="studio-publish-success" aria-live="polite">
                <span aria-hidden="true">
                  <CheckCircle2 />
                </span>
                <Badge tone="accent">{msg("studio.publish.success.badge")}</Badge>
                <h2 id="studio-review-heading">{msg("studio.publish.success.heading")}</h2>
                <p>
                  {msg("studio.publish.success.body", {
                    version: published.publishedVersion ?? serverDraft.version
                  })}
                </p>
                <div className="studio-publish-receipt">
                  <div>
                    <span>{msg("studio.publish.receipt.version")}</span>
                    <strong>v{published.publishedVersion ?? serverDraft.version}</strong>
                  </div>
                  <div>
                    <span>{msg("studio.publish.receipt.next")}</span>
                    <strong>v{published.nextDraftVersion ?? serverDraft.version + 1}</strong>
                  </div>
                  <div>
                    <span>{msg("studio.publish.receipt.writes")}</span>
                    <strong>{safeTest?.externalWrites ?? 0}</strong>
                  </div>
                </div>
                <div className="action-row">
                  <Link className="primary-button" to={`/app/workflows/${serverDraft.workflowId}`}>
                    {msg("studio.publish.success.view")}
                  </Link>
                  <Link className="secondary-button" to="/app/workflows">
                    {msg("studio.publish.success.library")}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <header className="studio-review-header">
                  <div>
                    <span className="studio-kicker">{msg("studio.review.kicker")}</span>
                    <h2 id="studio-review-heading">{msg("studio.review.heading")}</h2>
                    <p>{msg("studio.review.body")}</p>
                  </div>
                  <Button
                    aria-label={msg("studio.review.close")}
                    onClick={() => setShowPublishReview(false)}
                    disabled={Boolean(reviewAction)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </header>
                <div className="studio-review-summary">
                  <div>
                    <span>
                      {msg("studio.summary.steps", { count: state.definition.nodes.length })}
                    </span>
                    <strong>{state.definition.nodes.length}</strong>
                  </div>
                  <div>
                    <span>
                      {msg("studio.summary.paths", { count: state.definition.edges.length })}
                    </span>
                    <strong>{state.definition.edges.length}</strong>
                  </div>
                  <div>
                    <span>{msg("studio.draft.label")}</span>
                    <strong>v{serverDraft.version}</strong>
                  </div>
                </div>
                <ol className="studio-release-checklist">
                  <li className={reviewValidation?.valid ? "is-complete" : ""}>
                    <span aria-hidden="true">{reviewValidation?.valid ? <Check /> : "1"}</span>
                    <div>
                      <strong>{msg("studio.review.validate.heading")}</strong>
                      <p>{msg("studio.review.validate.body")}</p>
                      {reviewValidation ? (
                        <small role="status">
                          {reviewValidation.valid
                            ? msg("studio.review.validate.passed")
                            : msg("studio.review.validate.blocked", {
                                count: reviewValidation.findings.length
                              })}
                        </small>
                      ) : null}
                    </div>
                    <Button
                      onClick={() => void validateForRelease()}
                      disabled={Boolean(reviewAction)}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      {reviewAction === "validating"
                        ? msg("studio.review.validating")
                        : msg("studio.review.validate.action")}
                    </Button>
                  </li>
                  <li className={safeTest?.preflight.allowed ? "is-complete" : ""}>
                    <span aria-hidden="true">{safeTest?.preflight.allowed ? <Check /> : "2"}</span>
                    <div>
                      <strong>{msg("studio.review.test.heading")}</strong>
                      <p>{msg("studio.review.test.body")}</p>
                      {safeTest ? (
                        <small role="status">
                          {msg("studio.review.test.passed", {
                            checks: safeTest.preflight.checks.filter(({ passed }) => passed).length,
                            steps: safeTest.steps.length,
                            writes: safeTest.externalWrites
                          })}
                        </small>
                      ) : null}
                    </div>
                    <Button
                      onClick={() => void runSafeTest()}
                      disabled={!reviewValidation?.valid || Boolean(reviewAction)}
                    >
                      <FlaskConical aria-hidden="true" />
                      {reviewAction === "testing"
                        ? msg("studio.review.testing")
                        : msg("studio.review.test.action")}
                    </Button>
                  </li>
                  <li className={releaseNote.trim().length >= 3 ? "is-complete" : ""}>
                    <span aria-hidden="true">
                      {releaseNote.trim().length >= 3 ? <Check /> : "3"}
                    </span>
                    <div className="studio-release-note">
                      <strong>{msg("studio.review.note.heading")}</strong>
                      <p>{msg("studio.review.note.body")}</p>
                      <label>
                        <span className="sr-only">{msg("studio.review.note.label")}</span>
                        <textarea
                          value={releaseNote}
                          maxLength={2000}
                          onChange={(event) => setReleaseNote(event.target.value)}
                          placeholder={msg("studio.review.note.placeholder")}
                        />
                      </label>
                    </div>
                  </li>
                </ol>
                {reviewError ? (
                  <p className="studio-review-error" role="alert">
                    {reviewError}
                  </p>
                ) : null}
                <footer className="studio-review-footer">
                  <div>
                    <strong>{msg("studio.review.ready.heading")}</strong>
                    <span>{msg("studio.review.ready.body")}</span>
                  </div>
                  <Button
                    tone="accent"
                    onClick={() => void publishRelease()}
                    disabled={
                      !reviewValidation?.valid ||
                      !safeTest?.preflight.allowed ||
                      releaseNote.trim().length < 3 ||
                      Boolean(reviewAction)
                    }
                  >
                    <Rocket aria-hidden="true" />
                    {reviewAction === "publishing"
                      ? msg("studio.review.publishing")
                      : msg("studio.review.publish.action")}
                  </Button>
                </footer>
              </>
            )}
          </section>
        </div>
      ) : null}
      {showHelp ? (
        <div className="studio-help-backdrop" role="presentation">
          <Card
            className="studio-help"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-help-heading"
          >
            <div className="row-between">
              <h2 id="studio-help-heading">{msg("studio.shortcuts")}</h2>
              <Button onClick={() => setShowHelp(false)}>{msg("studio.close")}</Button>
            </div>
            <dl>
              <dt>{msg("studio.shortcut.save")}</dt>
              <dd>{msg("studio.save")}</dd>
              <dt>{msg("studio.shortcut.undo")}</dt>
              <dd>{msg("studio.undo")}</dd>
              <dt>{msg("studio.shortcut.redo")}</dt>
              <dd>{msg("studio.redo")}</dd>
              <dt>{msg("studio.shortcut.delete")}</dt>
              <dd>{msg("studio.delete")}</dd>
              <dt>?</dt>
              <dd>{msg("studio.help")}</dd>
            </dl>
            <a href="/docs/workflow-studio">{msg("studio.documentation")}</a>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function NodeInspector({
  node,
  update,
  disable,
  testing,
  testResult,
  onTest
}: {
  node: WorkflowDefinitionNode;
  update: (patch: Partial<WorkflowDefinitionNode>) => void;
  disable: (disabled: boolean) => void;
  testing: boolean;
  testResult?: { steps: number; writes: number };
  onTest: () => void;
}) {
  return (
    <Card className="studio-inspector-card">
      <Badge tone="accent">{kindLabel(node.kind)}</Badge>
      <h2>{msg("studio.node.inspector")}</h2>
      <div className="studio-node-test">
        <div>
          <strong>{msg("studio.node.test.heading")}</strong>
          <span>{msg("studio.node.test.body")}</span>
        </div>
        <Button onClick={onTest} disabled={testing}>
          <FlaskConical aria-hidden="true" />
          {testing ? msg("studio.node.testing") : msg("studio.node.test.action")}
        </Button>
        {testResult ? (
          <p role="status">
            <CheckCircle2 aria-hidden="true" />
            {msg("studio.node.test.passed", {
              steps: testResult.steps,
              writes: testResult.writes
            })}
          </p>
        ) : null}
      </div>
      <label>
        {msg("studio.node.name")}
        <input value={node.name} onChange={(event) => update({ name: event.target.value })} />
      </label>
      <label>
        {msg("studio.node.description")}
        <textarea
          value={node.description}
          onChange={(event) => update({ description: event.target.value })}
        />
      </label>
      <label>
        {msg("studio.node.timeout")}
        <input
          type="number"
          min="1"
          value={
            typeof node.configuration.timeoutSeconds === "number"
              ? node.configuration.timeoutSeconds
              : 300
          }
          onChange={(event) =>
            update({
              configuration: { ...node.configuration, timeoutSeconds: Number(event.target.value) }
            })
          }
        />
      </label>
      <label>
        {msg("studio.node.retry")}
        <input
          type="number"
          min="0"
          max="10"
          value={
            typeof node.configuration.retryLimit === "number" ? node.configuration.retryLimit : 0
          }
          onChange={(event) =>
            update({
              configuration: { ...node.configuration, retryLimit: Number(event.target.value) }
            })
          }
        />
      </label>
      <label>
        {msg("studio.node.assignment")}
        <input
          value={typeof node.configuration.assignee === "string" ? node.configuration.assignee : ""}
          onChange={(event) =>
            update({ configuration: { ...node.configuration, assignee: event.target.value } })
          }
        />
      </label>
      <label>
        {msg("studio.node.failure")}
        <select
          value={
            typeof node.configuration.failurePath === "string"
              ? node.configuration.failurePath
              : "stop"
          }
          onChange={(event) =>
            update({ configuration: { ...node.configuration, failurePath: event.target.value } })
          }
        >
          <option value="stop">{msg("studio.option.stop")}</option>
          <option value="continue">{msg("studio.option.continue")}</option>
          <option value="retry">{msg("studio.option.retry")}</option>
        </select>
      </label>
      {node.kind === "approval" ? (
        <label>
          {msg("studio.node.approval")}
          <input
            value={
              typeof node.configuration.policy === "string"
                ? node.configuration.policy
                : "workspace_owner"
            }
            onChange={(event) =>
              update({ configuration: { ...node.configuration, policy: event.target.value } })
            }
          />
        </label>
      ) : null}
      {node.kind === "integration_action" ? (
        <>
          <label>
            {msg("studio.node.risk")}
            <select
              value={
                typeof node.configuration.risk === "string" ? node.configuration.risk : "medium"
              }
              onChange={(event) =>
                update({ configuration: { ...node.configuration, risk: event.target.value } })
              }
            >
              <option value="low">{msg("studio.option.low")}</option>
              <option value="medium">{msg("studio.option.medium")}</option>
              <option value="high">{msg("studio.option.high")}</option>
            </select>
          </label>
          <label>
            {msg("studio.node.connection")}
            <input
              value={
                typeof node.configuration.connectionRef === "string"
                  ? node.configuration.connectionRef
                  : ""
              }
              onChange={(event) =>
                update({
                  configuration: { ...node.configuration, connectionRef: event.target.value }
                })
              }
            />
          </label>
        </>
      ) : null}
      <details className="studio-advanced-settings">
        <summary>{msg("studio.node.advanced")}</summary>
        <p>{msg("studio.node.advanced.body")}</p>
        <JsonConfigurationField
          label={msg("studio.node.input.schema")}
          value={node.configuration.inputSchema ?? { schemaVersion: 1 }}
          update={(inputSchema) =>
            update({ configuration: { ...node.configuration, inputSchema } })
          }
        />
        <JsonConfigurationField
          label={msg("studio.node.output.schema")}
          value={node.configuration.outputSchema ?? { schemaVersion: 1 }}
          update={(outputSchema) =>
            update({ configuration: { ...node.configuration, outputSchema } })
          }
        />
      </details>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={node.configuration.disabled === true}
          onChange={(event) => disable(event.target.checked)}
        />
        {msg("studio.node.disabled")}
      </label>
      <details>
        <summary>{msg("studio.node.configuration")}</summary>
        <pre>{JSON.stringify(node.configuration, null, 2)}</pre>
      </details>
    </Card>
  );
}

function JsonConfigurationField({
  label,
  value,
  update
}: {
  label: string;
  value: unknown;
  update: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <label>
      {label}
      <textarea
        value={text}
        aria-invalid={invalid}
        onChange={(event) => {
          setText(event.target.value);
          try {
            update(JSON.parse(event.target.value) as unknown);
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
    </label>
  );
}

function EdgeInspector({
  edge,
  update,
  remove
}: {
  edge: WorkflowDefinitionEdge;
  update: (patch: Partial<WorkflowDefinitionEdge>) => void;
  remove: () => void;
}) {
  return (
    <Card className="studio-inspector-card">
      <Badge tone="neutral">{msg("studio.edge")}</Badge>
      <h2>
        {edge.source} → {edge.target}
      </h2>
      <label>
        {msg("studio.edge.label")}
        <input
          value={edge.label ?? ""}
          onChange={(event) => update({ label: event.target.value })}
        />
      </label>
      <label>
        {msg("studio.edge.path")}
        <select
          value={edge.pathType ?? "default"}
          onChange={(event) =>
            update({ pathType: event.target.value as WorkflowDefinitionEdge["pathType"] })
          }
        >
          <option value="default">{msg("studio.option.default")}</option>
          <option value="success">{msg("studio.option.success")}</option>
          <option value="failure">{msg("studio.option.failure")}</option>
        </select>
      </label>
      <label>
        {msg("studio.edge.condition")}
        <textarea
          value={edge.condition ?? ""}
          onChange={(event) => update({ condition: event.target.value })}
          placeholder={msg("studio.edge.condition.placeholder")}
        />
      </label>
      <JsonConfigurationField
        label={msg("studio.edge.mapping")}
        value={edge.mapping ?? {}}
        update={(mapping) => update({ mapping: mapping as Record<string, string> })}
      />
      <p>{msg("studio.edge.condition.help")}</p>
      <Button className="studio-delete-connection" onClick={remove}>
        <Trash2 aria-hidden="true" />
        {msg("studio.edge.delete")}
      </Button>
    </Card>
  );
}
