import {
  Alert,
  Button,
  cx,
  Field,
  NumberInput,
  Panel,
  Select,
  TextInput,
  useTheme,
} from '@oslab/core';
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useState } from 'react';
import { analyzeRag, edgeKind, type Rag, type RagNode } from '../engine';
import { MatrixEditor } from './MatrixEditor';
import { ScanView } from './ScanView';

interface NodeData extends Record<string, unknown> {
  node: RagNode;
  deadlocked: boolean;
  onCycle: boolean;
}

interface EdgeData extends Record<string, unknown> {
  count: number;
  /** Perpendicular offset so a request and an assignment between the same pair do not overlap. */
  offset: number;
}

const PROCESS_SIZE = 64;
const RESOURCE_W = 96;
const RESOURCE_H = 60;

const handleClass = '!h-3 !w-3 !border-2 !border-white !bg-indigo-500';

function ProcessNode({ data, selected }: NodeProps<Node<NodeData>>) {
  return (
    <div
      className={cx(
        'flex items-center justify-center rounded-full border-2 bg-white text-sm font-bold text-slate-900 shadow dark:bg-slate-900 dark:text-white',
        data.deadlocked ? 'border-rose-600 ring-4 ring-rose-400/50' : 'border-sky-600',
        selected && 'outline outline-2 outline-offset-2 outline-indigo-500',
      )}
      style={{ width: PROCESS_SIZE, height: PROCESS_SIZE }}
      title={data.deadlocked ? 'Deadlocked' : undefined}
    >
      {data.node.name}
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
}

function ResourceNode({ data, selected }: NodeProps<Node<NodeData>>) {
  const n = data.node.instances;
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-1 rounded-md border-2 bg-white text-sm font-bold text-slate-900 shadow dark:bg-slate-900 dark:text-white',
        data.onCycle ? 'border-rose-500' : 'border-emerald-600',
        selected && 'outline outline-2 outline-offset-2 outline-indigo-500',
      )}
      style={{ width: RESOURCE_W, height: RESOURCE_H }}
    >
      {data.node.name}
      <span
        className="flex max-w-[80px] flex-wrap justify-center gap-1"
        aria-label={`${n} instance(s)`}
      >
        {Array.from({ length: Math.min(n, 8) }, (_, i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-slate-700 dark:bg-slate-200" />
        ))}
        {n > 8 && <span className="text-[10px]">+{n - 8}</span>}
      </span>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
}

function center(n: InternalNode): { x: number; y: number; w: number; h: number } {
  const w = n.measured.width ?? 0;
  const h = n.measured.height ?? 0;
  return {
    x: n.internals.positionAbsolute.x + w / 2,
    y: n.internals.positionAbsolute.y + h / 2,
    w,
    h,
  };
}

/** Where the line from the node centre towards (tx, ty) leaves the node's box or circle. */
function border(n: InternalNode, tx: number, ty: number): { x: number; y: number } {
  const c = center(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  const len = Math.hypot(dx, dy) || 1;
  if (n.type === 'process')
    return { x: c.x + (dx / len) * (c.w / 2), y: c.y + (dy / len) * (c.h / 2) };
  const scale = Math.min(c.w / 2 / Math.abs(dx || 1e-9), c.h / 2 / Math.abs(dy || 1e-9));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  data,
  label,
}: EdgeProps<Edge<EdgeData>>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const sc = center(s);
  const tc = center(t);
  const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1;
  const off = data?.offset ?? 0;
  const ox = (-(tc.y - sc.y) / len) * off;
  const oy = ((tc.x - sc.x) / len) * off;
  const a = border(s, tc.x + ox, tc.y + oy);
  const b = border(t, sc.x + ox, sc.y + oy);
  const [path, lx, ly] = getStraightPath({
    sourceX: a.x + ox,
    sourceY: a.y + oy,
    targetX: b.x + ox,
    targetY: b.y + oy,
  });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan absolute rounded bg-white px-1 text-xs font-semibold text-slate-800 shadow dark:bg-slate-800 dark:text-slate-100"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { process: ProcessNode, resource: ResourceNode };
const edgeTypes = { floating: FloatingEdge };

function freshId(rag: Rag, prefix: string): string {
  const used = new Set([...rag.nodes.map((n) => n.id), ...rag.edges.map((e) => e.id)]);
  for (let k = 1; ; k++) if (!used.has(`${prefix}${k}`)) return `${prefix}${k}`;
}

function freshName(rag: Rag, prefix: string): string {
  const used = new Set(rag.nodes.map((n) => n.name));
  for (let k = 1; ; k++) if (!used.has(`${prefix}${k}`)) return `${prefix}${k}`;
}

function Graph({
  rag,
  onChange,
  selected,
  onSelect,
}: {
  rag: Rag;
  onChange: (rag: Rag) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { theme } = useTheme();
  const analysis = useMemo(() => analyzeRag(rag), [rag]);
  const cycleEdges = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i + 1 < analysis.cycle.length; i++)
      set.add(`${analysis.cycle[i]}>${analysis.cycle[i + 1]}`);
    return set;
  }, [analysis.cycle]);

  const nodes: Node<NodeData>[] = rag.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    data: {
      node: n,
      deadlocked: analysis.deadlocked.has(n.id),
      onCycle: analysis.onCycle.has(n.id),
    },
    selected: n.id === selected,
  }));
  const edges: Edge<EdgeData>[] = rag.edges.map((e) => {
    const kind = edgeKind(rag, e);
    const hot = cycleEdges.has(`${e.from}>${e.to}`);
    const color = hot ? '#e11d48' : kind === 'request' ? '#0284c7' : '#059669';
    const reverse = rag.edges.some((o) => o.from === e.to && o.to === e.from);
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'floating',
      selected: e.id === selected,
      label: e.count > 1 ? `×${e.count}` : undefined,
      data: { count: e.count, offset: reverse ? 7 : 0 },
      style: {
        stroke: color,
        strokeWidth: e.id === selected ? 4 : 2.5,
        strokeDasharray: kind === 'request' ? '7 5' : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
    };
  });

  const onNodesChange = (changes: NodeChange[]) => {
    const moves = new Map<string, { x: number; y: number }>();
    for (const c of changes) if (c.type === 'position' && c.position) moves.set(c.id, c.position);
    if (moves.size === 0) return;
    onChange({
      ...rag,
      nodes: rag.nodes.map((n) => {
        const p = moves.get(n.id);
        return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n;
      }),
    });
  };

  return (
    <div className="h-[460px] w-full rounded-md border border-slate-200 dark:border-slate-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={40}
        onNodesChange={onNodesChange}
        onConnect={(c) => {
          if (!c.source || !c.target || c.source === c.target) return;
          const draft = { id: freshId(rag, 'e'), from: c.source, to: c.target, count: 1 };
          if (edgeKind(rag, draft) === 'invalid') return;
          onChange({ ...rag, edges: [...rag.edges, draft] });
        }}
        onNodeClick={(_, n) => onSelect(n.id)}
        onEdgeClick={(_, e) => onSelect(e.id)}
        onPaneClick={() => onSelect(null)}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.3 }}
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function AddEdgeForm({ rag, onChange }: { rag: Rag; onChange: (rag: Rag) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const draft = { id: freshId(rag, 'e'), from, to, count: 1 };
  const kind = from && to ? edgeKind(rag, draft) : 'invalid';
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="From">
        <Select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">…</option>
          {rag.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To">
        <Select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">…</option>
          {rag.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        disabled={kind === 'invalid'}
        onClick={() => onChange({ ...rag, edges: [...rag.edges, draft] })}
      >
        Add {kind === 'request' ? 'request' : kind === 'assignment' ? 'assignment' : 'edge'}
      </Button>
    </div>
  );
}

function SelectionEditor({
  rag,
  selected,
  onChange,
  onSelect,
}: {
  rag: Rag;
  selected: string;
  onChange: (rag: Rag) => void;
  onSelect: (id: string | null) => void;
}) {
  const node = rag.nodes.find((n) => n.id === selected);
  const edge = rag.edges.find((e) => e.id === selected);
  if (node) {
    const set = (patch: Partial<RagNode>) =>
      onChange({
        ...rag,
        nodes: rag.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
      });
    return (
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name">
          <TextInput
            value={node.name}
            maxLength={12}
            onChange={(e) => set({ name: e.target.value })}
            className="w-24"
          />
        </Field>
        {node.kind === 'resource' && (
          <Field label="Instances">
            <NumberInput
              value={node.instances}
              min={1}
              max={99}
              onValueChange={(instances) => set({ instances })}
            />
          </Field>
        )}
        <Button
          variant="danger"
          onClick={() => {
            onChange({
              nodes: rag.nodes.filter((n) => n.id !== node.id),
              edges: rag.edges.filter((e) => e.from !== node.id && e.to !== node.id),
            });
            onSelect(null);
          }}
        >
          Delete {node.name}
        </Button>
      </div>
    );
  }
  if (edge) {
    const name = (id: string) => rag.nodes.find((n) => n.id === id)?.name ?? id;
    return (
      <div className="flex flex-wrap items-end gap-2">
        <span className="pb-1.5 text-sm">
          {edgeKind(rag, edge) === 'request' ? 'Request' : 'Assignment'} {name(edge.from)} →{' '}
          {name(edge.to)}
        </span>
        <Field label="Instances">
          <NumberInput
            value={edge.count}
            min={1}
            max={99}
            onValueChange={(count) =>
              onChange({
                ...rag,
                edges: rag.edges.map((e) => (e.id === edge.id ? { ...e, count } : e)),
              })
            }
          />
        </Field>
        <Button
          variant="danger"
          onClick={() => {
            onChange({ ...rag, edges: rag.edges.filter((e) => e.id !== edge.id) });
            onSelect(null);
          }}
        >
          Delete edge
        </Button>
      </div>
    );
  }
  return null;
}

export function RagView({ rag, onChange }: { rag: Rag; onChange: (rag: Rag) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const analysis = useMemo(() => analyzeRag(rag), [rag]);
  const processNames = analysis.processIds.map(
    (id) => rag.nodes.find((n) => n.id === id)?.name ?? id,
  );
  const resourceNames = analysis.resourceIds.map(
    (id) => rag.nodes.find((n) => n.id === id)?.name ?? id,
  );

  const addNode = (kind: RagNode['kind']) => {
    const node: RagNode = {
      id: freshId(rag, kind === 'process' ? 'p' : 'r'),
      kind,
      name: freshName(rag, kind === 'process' ? 'P' : 'R'),
      instances: kind === 'resource' ? 1 : 0,
      x: 40 + (rag.nodes.length % 5) * 90,
      y: kind === 'process' ? 220 : -80,
    };
    onChange({ ...rag, nodes: [...rag.nodes, node] });
    setSelected(node.id);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel
        title="Resource allocation graph"
        actions={
          <>
            <Button onClick={() => addNode('process')} disabled={rag.nodes.length >= 40}>
              + Process
            </Button>
            <Button onClick={() => addNode('resource')} disabled={rag.nodes.length >= 40}>
              + Resource
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <ReactFlowProvider>
            <Graph rag={rag} onChange={onChange} selected={selected} onSelect={setSelected} />
          </ReactFlowProvider>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Drag from a node&apos;s dot to another node to draw an edge. Process → resource is a{' '}
            <span className="font-semibold text-sky-700 dark:text-sky-400">request</span> (dashed);
            resource → process is an{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">assignment</span>
            . Dots inside a resource are its instances. Click a node or edge to edit it.
          </p>
          {selected && (
            <SelectionEditor
              rag={rag}
              selected={selected}
              onChange={onChange}
              onSelect={setSelected}
            />
          )}
          <AddEdgeForm rag={rag} onChange={onChange} />
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Analysis">
          <div className="flex flex-col gap-3">
            {analysis.errors.map((e) => (
              <Alert key={e} tone="error">
                {e}
              </Alert>
            ))}
            <Alert
              tone={
                analysis.verdict === 'deadlock'
                  ? 'error'
                  : analysis.verdict === 'no-cycle'
                    ? 'success'
                    : 'warning'
              }
            >
              <strong>
                {analysis.verdict === 'deadlock'
                  ? 'Deadlock'
                  : analysis.verdict === 'no-cycle'
                    ? 'No deadlock'
                    : 'Cycle, but no deadlock'}
                .
              </strong>{' '}
              {analysis.explanation}
            </Alert>
            {processNames.length > 0 && resourceNames.length > 0 && (
              <div className="flex flex-wrap gap-4">
                <MatrixEditor
                  caption="Allocation"
                  rows={processNames}
                  cols={resourceNames}
                  values={analysis.allocation}
                />
                <MatrixEditor
                  caption="Request"
                  rows={processNames}
                  cols={resourceNames}
                  values={analysis.request}
                />
                <MatrixEditor
                  caption="Available"
                  rows={['']}
                  cols={resourceNames}
                  values={[analysis.available]}
                />
              </div>
            )}
          </div>
        </Panel>
        {processNames.length > 0 && resourceNames.length > 0 && (
          <Panel title="Graph reduction (detection algorithm)">
            <ScanView
              result={analysis.detection}
              processes={processNames}
              resources={resourceNames}
              demand={analysis.request}
              demandLabel="Request"
              summary={analysis.detection.summary}
              ok={analysis.detection.deadlocked.length === 0}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
