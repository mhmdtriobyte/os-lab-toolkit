import type { FitStrategy, MemoryOp, PagingAlgorithm } from '../engine';

export type MemoryTab = 'paging' | 'allocation';

export interface MemoryInput {
  tab: MemoryTab;
  /** Reference string as typed, e.g. "7 0 1 2 0 3". */
  refs: string;
  frames: number;
  algorithm: PagingAlgorithm | 'compare';
  /** Hole sizes as typed, e.g. "100, 500, 200". */
  blocks: string;
  ops: MemoryOp[];
  strategy: FitStrategy | 'compare';
}

export const DEFAULT_INPUT: MemoryInput = {
  tab: 'paging',
  refs: '7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1',
  frames: 3,
  algorithm: 'fifo',
  blocks: '100, 500, 200, 300, 600',
  ops: [
    { kind: 'alloc', name: 'P1', size: 212 },
    { kind: 'alloc', name: 'P2', size: 417 },
    { kind: 'alloc', name: 'P3', size: 112 },
    { kind: 'alloc', name: 'P4', size: 426 },
  ],
  strategy: 'first',
};

const ALGORITHMS = ['fifo', 'lru', 'optimal', 'clock', 'compare'];
const STRATEGIES = ['first', 'best', 'worst', 'compare'];

export function parseBlocks(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (
    parts.length === 0 ||
    parts.length > 20 ||
    parts.some((p) => !/^\d+$/.test(p) || Number(p) < 1)
  )
    return null;
  return parts.map(Number);
}

function sanitizeOps(v: unknown): MemoryOp[] | null {
  if (!Array.isArray(v) || v.length > 40) return null;
  const ops: MemoryOp[] = [];
  for (const raw of v as Record<string, unknown>[]) {
    const name = typeof raw?.name === 'string' ? raw.name.slice(0, 12) : null;
    if (!name) return null;
    if (raw.kind === 'free') ops.push({ kind: 'free', name });
    else if (
      typeof raw.size === 'number' &&
      Number.isInteger(raw.size) &&
      raw.size > 0 &&
      raw.size < 1e7
    ) {
      ops.push({ kind: 'alloc', name, size: raw.size });
    } else return null;
  }
  return ops;
}

export function sanitizeInput(raw: unknown): MemoryInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const frames =
    typeof r.frames === 'number' && Number.isInteger(r.frames)
      ? Math.min(12, Math.max(1, r.frames))
      : DEFAULT_INPUT.frames;
  return {
    tab: r.tab === 'allocation' ? 'allocation' : 'paging',
    refs: typeof r.refs === 'string' ? r.refs.slice(0, 400) : DEFAULT_INPUT.refs,
    frames,
    algorithm: ALGORITHMS.includes(r.algorithm as string)
      ? (r.algorithm as MemoryInput['algorithm'])
      : 'fifo',
    blocks: typeof r.blocks === 'string' ? r.blocks.slice(0, 200) : DEFAULT_INPUT.blocks,
    ops: sanitizeOps(r.ops) ?? DEFAULT_INPUT.ops,
    strategy: STRATEGIES.includes(r.strategy as string)
      ? (r.strategy as MemoryInput['strategy'])
      : 'first',
  };
}
