import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cx, useTheme } from '@oslab/core';
import { useEffect, useMemo } from 'react';
import type { ForkSnapshot, Process } from '../engine';
import { displayState, pidColor, STATE_STYLES } from './colors';

const NODE_W = 150;
const NODE_H = 84;
const GAP_X = 24;
const GAP_Y = 56;

interface ProcNodeData extends Record<string, unknown> {
  proc: Process;
  ran: number | null;
  color: string;
}

function ProcNode({ data }: NodeProps<Node<ProcNodeData>>) {
  const { proc, ran, color } = data;
  const state = displayState(proc, ran);
  const style = STATE_STYLES[state];
  const gone = proc.state === 'terminated';
  return (
    <div
      className={cx(
        'flex h-full w-full flex-col items-center justify-center rounded-lg border-2 bg-white px-2 text-center shadow-sm dark:bg-slate-900',
        gone && 'border-dashed opacity-50',
        state === 'running' && 'ring-4 ring-emerald-400/60',
      )}
      style={{ borderColor: proc.kind === 'user' ? color : '#94a3b8' }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="text-sm font-bold text-slate-900 dark:text-white">
        {proc.kind === 'user' ? `P${proc.pid}` : `${proc.name} (${proc.pid})`}
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-300">
        PPID {proc.ppid}
        {proc.orphaned && (
          <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">orphan</span>
        )}
      </div>
      <span className={cx('mt-1 rounded px-1.5 text-[11px] font-semibold', style.className)}>
        {state === 'zombie' ? 'zombie <defunct>' : style.label}
        {proc.signal ? ` (${proc.signal})` : ''}
      </span>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = { proc: ProcNode };

/** Tidy tree layout by creator (who forked whom), which never changes even when re-parented. */
function layout(procs: readonly Process[]): Map<number, { x: number; y: number }> {
  const children = new Map<number, number[]>();
  for (const p of procs) {
    if (p.pid === 1) continue;
    children.set(p.creator, [...(children.get(p.creator) ?? []), p.pid]);
  }
  const pos = new Map<number, { x: number; y: number }>();
  let nextX = 0;
  const place = (pid: number, depth: number): number => {
    const kids = children.get(pid) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = nextX;
      nextX += NODE_W + GAP_X;
    } else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = ((xs[0] as number) + (xs[xs.length - 1] as number)) / 2;
    }
    pos.set(pid, { x, y: depth * (NODE_H + GAP_Y) });
    return x;
  };
  place(1, 0);
  return pos;
}

/** Re-fits the view whenever processes appear, so new children are never off-screen. */
function FitOnGrow({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = window.requestAnimationFrame(
      () => void fitView({ padding: 0.15, maxZoom: 1.2, duration: 200 }),
    );
    return () => window.cancelAnimationFrame(id);
  }, [count, fitView]);
  return null;
}

export function ProcessTree(props: { snapshot: ForkSnapshot; pidStart: number }) {
  return (
    <ReactFlowProvider>
      <Tree {...props} />
    </ReactFlowProvider>
  );
}

function Tree({ snapshot, pidStart }: { snapshot: ForkSnapshot; pidStart: number }) {
  const { theme } = useTheme();
  const { sys, events, ran } = snapshot;
  const pos = useMemo(() => layout(sys.procs), [sys.procs]);

  const { nodes, edges } = useMemo(() => {
    const forkedNow = new Set(events.flatMap((e) => (e.k === 'fork' ? [e.child] : [])));
    const nodes: Node<ProcNodeData>[] = sys.procs.map((proc) => ({
      id: String(proc.pid),
      type: 'proc',
      position: pos.get(proc.pid) ?? { x: 0, y: 0 },
      data: { proc, ran, color: pidColor(proc.pid, pidStart) },
      width: NODE_W,
      height: NODE_H,
      draggable: false,
      connectable: false,
    }));
    const edges: Edge[] = [];
    for (const proc of sys.procs) {
      if (proc.pid === 1) continue;
      const color = proc.kind === 'user' ? pidColor(proc.pid, pidStart) : '#94a3b8';
      edges.push({
        id: `c${proc.pid}`,
        source: String(proc.creator),
        target: String(proc.pid),
        animated: forkedNow.has(proc.pid),
        label: proc.kind === 'user' && proc.pid !== pidStart ? 'fork()' : undefined,
        style: { stroke: color, strokeWidth: 2, opacity: proc.orphaned ? 0.35 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      });
      if (proc.orphaned) {
        edges.push({
          id: `o${proc.pid}`,
          source: '1',
          target: String(proc.pid),
          label: 're-parented',
          style: { stroke: '#e11d48', strokeDasharray: '6 4', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#e11d48' },
        });
      }
    }
    return { nodes, edges };
  }, [sys.procs, events, ran, pos, pidStart]);

  return (
    <div className="h-full min-h-[360px] w-full" aria-label="Process tree">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
      >
        <Background />
        <Controls showInteractive={false} />
        <FitOnGrow count={nodes.length} />
      </ReactFlow>
    </div>
  );
}
