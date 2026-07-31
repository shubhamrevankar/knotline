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
  ReactFlow,
  type Connection,
  type Edge,
  type Node
} from "@xyflow/react";
import {
  AlignHorizontalSpaceAround,
  Braces,
  Copy,
  HelpCircle,
  LayoutGrid,
  ListTree,
  Plus,
  Redo2,
  Save,
  Search,
  Trash2,
  Undo2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchWorkflowDraft, saveWorkflowDraft, type WorkflowDraft } from "./api.js";
import { AuthGate } from "./AuthPages.js";
import { msg } from "./i18n.js";
import {
  clearEncryptedRecovery,
  loadEncryptedRecovery,
  saveEncryptedRecovery
} from "./studio-recovery.js";
import { deterministicLayout, initialStudioState, studioReducer } from "./studio-reducer.js";

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

const readableKind = (kind: WorkflowDefinitionNode["kind"]) => kind.replaceAll("_", " ");

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
    name: `${readableKind(kind)} ${index}`,
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
  const [state, dispatch] = useReducer(
    studioReducer,
    initialStudioState(initialDraft.definition, initialDraft.revision)
  );
  const [serverDraft, setServerDraft] = useState(initialDraft);
  const [status, setStatus] = useState<"saved" | "saving" | "offline" | "conflict" | "invalid">(
    "saved"
  );
  const [palette, setPalette] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [conflictServer, setConflictServer] = useState<WorkflowDraft>();
  const [conflictSections, setConflictSections] = useState<readonly string[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const fitView = useRef<(() => void) | undefined>(undefined);
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
      if (event.key === "Delete" || event.key === "Backspace")
        dispatch({ type: "delete_nodes", keys: state.selectedNodeKeys });
      if (event.key === "?") setShowHelp(true);
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [saveDraft, state.selectedNodeKeys]);

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
    if (finding.location.type === "node" && finding.location.key)
      dispatch({ type: "select_node", key: finding.location.key });
    if (finding.location.type === "edge" && finding.location.key)
      dispatch({ type: "select_edge", key: finding.location.key });
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
  const nodes: Node[] = useMemo(
    () =>
      state.definition.nodes.map((node) => ({
        id: node.key,
        position: node.position,
        data: { label: `${node.name} · ${readableKind(node.kind)}` },
        selected: state.selectedNodeKeys.includes(node.key),
        className: node.configuration.disabled
          ? "studio-node-disabled"
          : `studio-node studio-node-${node.kind}`
      })),
    [state.definition.nodes, state.selectedNodeKeys]
  );
  const edges: Edge[] = useMemo(
    () =>
      state.definition.edges.map((edge) => ({
        id: edge.key,
        source: edge.source,
        target: edge.target,
        label: edge.condition,
        selected: edge.key === state.selectedEdgeKey,
        markerEnd: { type: MarkerType.ArrowClosed }
      })),
    [state.definition.edges, state.selectedEdgeKey]
  );

  const addNode = (kind: WorkflowDefinitionNode["kind"]) => {
    const base = createNode(kind, state.definition.nodes.length + 1);
    let key = base.key;
    let suffix = 2;
    while (state.definition.nodes.some((node) => node.key === key)) key = `${base.key}_${suffix++}`;
    dispatch({ type: "add_node", node: { ...base, key } });
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
        <div>
          <Link to={`/app/workflows/${serverDraft.workflowId}`}>{msg("studio.back")}</Link>
          <h1>{state.definition.name}</h1>
        </div>
        <div className="studio-status" role="status">
          <span className={`studio-status-${displayedStatus}`} />
          {statusMessage}
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
        </div>
        <div className="action-row">
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
          <Button onClick={saveDraft}>
            <Save aria-hidden="true" />
            {msg("studio.save")}
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
        <Button onClick={() => setShowOutline((value) => !value)}>
          <ListTree aria-hidden="true" />
          {msg("studio.outline")}
        </Button>
        <Button
          onClick={() => autoLayout(state.direction === "horizontal" ? "vertical" : "horizontal")}
        >
          <LayoutGrid aria-hidden="true" />
          {msg("studio.layout")}
        </Button>
        <Button
          onClick={() => dispatch({ type: "align", keys: state.selectedNodeKeys, axis: "y" })}
        >
          <AlignHorizontalSpaceAround aria-hidden="true" />
          {msg("studio.align")}
        </Button>
        <Button
          onClick={() => dispatch({ type: "distribute", keys: state.selectedNodeKeys, axis: "x" })}
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
        <Button onClick={() => setShowHelp(true)}>
          <HelpCircle aria-hidden="true" />
          {msg("studio.help")}
        </Button>
      </div>
      <div className={`studio-layout ${showOutline ? "studio-layout-outline" : ""}`}>
        <aside className="studio-palette" aria-label={msg("studio.palette")}>
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
            .filter((kind) => readableKind(kind).includes(palette.toLowerCase()))
            .map((kind) => (
              <Button key={kind} onClick={() => addNode(kind)}>
                <Plus aria-hidden="true" />
                {readableKind(kind)}
              </Button>
            ))}
        </aside>
        <section className="studio-canvas" aria-label={msg("studio.canvas")}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onlyRenderVisibleElements
            fitView
            minZoom={0.2}
            maxZoom={2}
            onInit={(instance) => {
              fitView.current = () => void instance.fitView({ padding: 0.2 });
            }}
            onNodeClick={(event, node) =>
              dispatch({
                type: "select_node",
                key: node.id,
                additive: event.metaKey || event.ctrlKey
              })
            }
            onEdgeClick={(_event, edge) => dispatch({ type: "select_edge", key: edge.id })}
            onNodeDragStop={(_event, node) =>
              dispatch({ type: "move_node", key: node.id, position: node.position })
            }
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
                      <button onClick={() => dispatch({ type: "select_node", key: node.key })}>
                        {node.name}
                      </button>
                    </td>
                    <td>{readableKind(node.kind)}</td>
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
                  <button onClick={() => dispatch({ type: "select_edge", key: edge.key })}>
                    {edge.source} → {edge.target}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <aside className="studio-inspector" aria-label={msg("studio.inspector")}>
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              update={(patch) => dispatch({ type: "update_node", key: selectedNode.key, patch })}
              disable={(disabled) =>
                dispatch({ type: "disable", keys: [selectedNode.key], disabled })
              }
            />
          ) : selectedEdge ? (
            <EdgeInspector
              edge={selectedEdge}
              update={(patch) => dispatch({ type: "update_edge", key: selectedEdge.key, patch })}
            />
          ) : (
            <Card>
              <Braces aria-hidden="true" />
              <h2>{msg("studio.inspector.empty")}</h2>
              <p>{msg("studio.inspector.empty.body")}</p>
            </Card>
          )}
        </aside>
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
  disable
}: {
  node: WorkflowDefinitionNode;
  update: (patch: Partial<WorkflowDefinitionNode>) => void;
  disable: (disabled: boolean) => void;
}) {
  return (
    <Card className="studio-inspector-card">
      <Badge tone="accent">{readableKind(node.kind)}</Badge>
      <h2>{msg("studio.node.inspector")}</h2>
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
      <JsonConfigurationField
        label={msg("studio.node.input.schema")}
        value={node.configuration.inputSchema ?? { schemaVersion: 1 }}
        update={(inputSchema) => update({ configuration: { ...node.configuration, inputSchema } })}
      />
      <JsonConfigurationField
        label={msg("studio.node.output.schema")}
        value={node.configuration.outputSchema ?? { schemaVersion: 1 }}
        update={(outputSchema) =>
          update({ configuration: { ...node.configuration, outputSchema } })
        }
      />
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
  update
}: {
  edge: WorkflowDefinitionEdge;
  update: (patch: Partial<WorkflowDefinitionEdge>) => void;
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
    </Card>
  );
}
