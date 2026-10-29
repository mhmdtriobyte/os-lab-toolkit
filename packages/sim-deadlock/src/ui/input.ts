import type { BankerState, DetectionState, Rag, RagEdge, RagNode } from '../engine';

export type DeadlockTab = 'banker' | 'detection' | 'rag';

export interface DeadlockInput {
  tab: DeadlockTab;
  banker: BankerState & { requestProcess: number; requestVector: number[] };
  detection: DetectionState;
  rag: Rag;
}

export const DEFAULT_INPUT: DeadlockInput = {
  tab: 'banker',
  banker: {
    processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
    resources: ['A', 'B', 'C'],
    allocation: [
      [0, 1, 0],
      [2, 0, 0],
      [3, 0, 2],
      [2, 1, 1],
      [0, 0, 2],
    ],
    max: [
      [7, 5, 3],
      [3, 2, 2],
      [9, 0, 2],
      [2, 2, 2],
      [4, 3, 3],
    ],
    available: [3, 3, 2],
    requestProcess: 1,
    requestVector: [1, 0, 2],
  },
  detection: {
    processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
    resources: ['A', 'B', 'C'],
    allocation: [
      [0, 1, 0],
      [2, 0, 0],
      [3, 0, 3],
      [2, 1, 1],
      [0, 0, 2],
    ],
    request: [
      [0, 0, 0],
      [2, 0, 2],
      [0, 0, 1],
      [1, 0, 0],
      [0, 0, 2],
    ],
    available: [0, 0, 0],
  },
  rag: {
    nodes: [
      { id: 'p1', kind: 'process', name: 'P1', instances: 0, x: 0, y: 0 },
      { id: 'p2', kind: 'process', name: 'P2', instances: 0, x: 320, y: 0 },
      { id: 'r1', kind: 'resource', name: 'R1', instances: 1, x: 160, y: -120 },
      { id: 'r2', kind: 'resource', name: 'R2', instances: 1, x: 160, y: 140 },
    ],
    edges: [
      { id: 'e1', from: 'r1', to: 'p1', count: 1 },
      { id: 'e2', from: 'p1', to: 'r2', count: 1 },
      { id: 'e3', from: 'r2', to: 'p2', count: 1 },
      { id: 'e4', from: 'p2', to: 'r1', count: 1 },
    ],
  },
};

const MAX_DIM = 12;

const isInt = (v: unknown, min = 0, max = 999): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function names(v: unknown): string[] | null {
  return Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_DIM &&
    v.every((x) => typeof x === 'string')
    ? (v as string[]).map((s) => s.slice(0, 12))
    : null;
}

function matrix(v: unknown, rows: number, cols: number): number[][] | null {
  if (!Array.isArray(v) || v.length !== rows) return null;
  const ok = v.every((r) => Array.isArray(r) && r.length === cols && r.every((x) => isInt(x)));
  return ok ? (v as number[][]).map((r) => [...r]) : null;
}

function vector(v: unknown, cols: number): number[] | null {
  return Array.isArray(v) && v.length === cols && v.every((x) => isInt(x))
    ? [...(v as number[])]
    : null;
}

function sanitizeBanker(raw: unknown): DeadlockInput['banker'] {
  const r = (raw ?? {}) as Record<string, unknown>;
  const processes = names(r.processes);
  const resources = names(r.resources);
  if (!processes || !resources) return DEFAULT_INPUT.banker;
  const n = processes.length;
  const m = resources.length;
  const allocation = matrix(r.allocation, n, m);
  const max = matrix(r.max, n, m);
  const available = vector(r.available, m);
  if (!allocation || !max || !available) return DEFAULT_INPUT.banker;
  return {
    processes,
    resources,
    allocation,
    max,
    available,
    requestProcess: isInt(r.requestProcess, 0, n - 1) ? r.requestProcess : 0,
    requestVector: vector(r.requestVector, m) ?? new Array<number>(m).fill(0),
  };
}

function sanitizeDetection(raw: unknown): DetectionState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const processes = names(r.processes);
  const resources = names(r.resources);
  if (!processes || !resources) return DEFAULT_INPUT.detection;
  const allocation = matrix(r.allocation, processes.length, resources.length);
  const request = matrix(r.request, processes.length, resources.length);
  const available = vector(r.available, resources.length);
  if (!allocation || !request || !available) return DEFAULT_INPUT.detection;
  return { processes, resources, allocation, request, available };
}

function sanitizeRag(raw: unknown): Rag {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (
    !Array.isArray(r.nodes) ||
    !Array.isArray(r.edges) ||
    r.nodes.length > 40 ||
    r.edges.length > 120
  ) {
    return DEFAULT_INPUT.rag;
  }
  const nodes: RagNode[] = [];
  for (const n of r.nodes as Record<string, unknown>[]) {
    if (typeof n?.id !== 'string' || (n.kind !== 'process' && n.kind !== 'resource'))
      return DEFAULT_INPUT.rag;
    nodes.push({
      id: n.id,
      kind: n.kind,
      name: typeof n.name === 'string' ? n.name.slice(0, 12) : n.id,
      instances: n.kind === 'resource' ? (isInt(n.instances, 1, 99) ? n.instances : 1) : 0,
      x: typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : 0,
      y: typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : 0,
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: RagEdge[] = [];
  for (const e of r.edges as Record<string, unknown>[]) {
    if (typeof e?.id !== 'string' || typeof e.from !== 'string' || typeof e.to !== 'string')
      return DEFAULT_INPUT.rag;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    edges.push({ id: e.id, from: e.from, to: e.to, count: isInt(e.count, 1, 99) ? e.count : 1 });
  }
  return { nodes, edges };
}

/** Each part falls back to its default independently, so a preset only needs to provide its own tab. */
export function sanitizeInput(raw: unknown): DeadlockInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tab: DeadlockTab = r.tab === 'detection' || r.tab === 'rag' ? r.tab : 'banker';
  return {
    tab,
    banker: r.banker ? sanitizeBanker(r.banker) : DEFAULT_INPUT.banker,
    detection: r.detection ? sanitizeDetection(r.detection) : DEFAULT_INPUT.detection,
    rag: r.rag ? sanitizeRag(r.rag) : DEFAULT_INPUT.rag,
  };
}
