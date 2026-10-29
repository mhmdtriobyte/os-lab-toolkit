export type FitStrategy = 'first' | 'best' | 'worst';

export const FIT_STRATEGIES: { id: FitStrategy; name: string; rule: string }[] = [
  {
    id: 'first',
    name: 'First fit',
    rule: 'Use the first hole (lowest address) that is big enough.',
  },
  {
    id: 'best',
    name: 'Best fit',
    rule: 'Use the smallest hole that is big enough (ties: lowest address).',
  },
  { id: 'worst', name: 'Worst fit', rule: 'Use the largest hole (ties: lowest address).' },
];

export type MemoryOp =
  { kind: 'alloc'; name: string; size: number } | { kind: 'free'; name: string };

export interface Segment {
  /** Index of the original block (holes only merge within the same block). */
  block: number;
  start: number;
  size: number;
  /** Process name, or null for a hole. */
  owner: string | null;
}

export interface AllocStep {
  op: MemoryOp;
  segments: Segment[];
  /** Segment index that changed (the allocated or freed segment), if any. */
  changed: number | null;
  ok: boolean;
  note: string;
}

export interface AllocResult {
  steps: AllocStep[];
  /** Allocation requests that could not be satisfied. */
  failed: string[];
  freeTotal: number;
  largestHole: number;
}

/** Lays the blocks out one after another, each starting as a single hole. */
export function initialSegments(blocks: readonly number[]): Segment[] {
  let start = 0;
  return blocks.map((size, block) => {
    const s = { block, start, size, owner: null };
    start += size;
    return s;
  });
}

function pickHole(segments: readonly Segment[], size: number, strategy: FitStrategy): number {
  const fits = segments.flatMap((s, i) => (s.owner === null && s.size >= size ? [i] : []));
  if (fits.length === 0) return -1;
  if (strategy === 'first') return fits[0] as number;
  const sizeOf = (i: number) => (segments[i] as Segment).size;
  return fits.reduce((best, i) =>
    strategy === 'best'
      ? sizeOf(i) < sizeOf(best)
        ? i
        : best
      : sizeOf(i) > sizeOf(best)
        ? i
        : best,
  );
}

function coalesce(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.owner === null && s.owner === null && prev.block === s.block)
      prev.size += s.size;
    else out.push({ ...s });
  }
  return out;
}

export function simulateAllocation(
  blocks: readonly number[],
  ops: readonly MemoryOp[],
  strategy: FitStrategy,
): AllocResult {
  let segments = initialSegments(blocks);
  const steps: AllocStep[] = [];
  const failed: string[] = [];
  for (const op of ops) {
    if (op.kind === 'alloc') {
      const i = pickHole(segments, op.size, strategy);
      if (i < 0) {
        failed.push(op.name);
        steps.push({
          op,
          segments,
          changed: null,
          ok: false,
          note: `${op.name} (${op.size}) must wait: no hole is large enough.`,
        });
        continue;
      }
      const hole = segments[i] as Segment;
      const next = segments.slice();
      const used = { ...hole, size: op.size, owner: op.name };
      const rest = hole.size - op.size;
      next.splice(
        i,
        1,
        used,
        ...(rest > 0 ? [{ ...hole, start: hole.start + op.size, size: rest }] : []),
      );
      segments = next;
      steps.push({
        op,
        segments,
        changed: i,
        ok: true,
        note: `${op.name} (${op.size}) goes into the hole of ${hole.size} at ${hole.start}${rest > 0 ? `, leaving a hole of ${rest}` : ''}.`,
      });
    } else {
      const i = segments.findIndex((s) => s.owner === op.name);
      if (i < 0) {
        steps.push({
          op,
          segments,
          changed: null,
          ok: false,
          note: `${op.name} is not in memory.`,
        });
        continue;
      }
      const freed = segments[i] as Segment;
      segments = coalesce(segments.map((s, k) => (k === i ? { ...s, owner: null } : s)));
      steps.push({
        op,
        segments,
        changed: segments.findIndex(
          (s) => s.start <= freed.start && freed.start < s.start + s.size,
        ),
        ok: true,
        note: `${op.name} releases ${freed.size} at ${freed.start}; adjacent holes merge.`,
      });
    }
  }
  const holes = segments.filter((s) => s.owner === null).map((s) => s.size);
  return {
    steps,
    failed,
    freeTotal: holes.reduce((a, b) => a + b, 0),
    largestHole: Math.max(0, ...holes),
  };
}
