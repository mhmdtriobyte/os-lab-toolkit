import { describe, expect, it } from 'vitest';
import { simulateAllocation, type FitStrategy, type MemoryOp } from './allocation';
import { beladyCurve, parseReferenceString, simulatePaging } from './paging';

// Silberschatz reference string.
const textbook = parseReferenceString('7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1') as number[];
const belady = parseReferenceString('1,2,3,4,1,2,5,1,2,3,4,5') as number[];

describe('page replacement', () => {
  it('textbook string with 3 frames: FIFO 15, LRU 12, OPT 9 faults', () => {
    expect(simulatePaging(textbook, 3, 'fifo').faults).toBe(15);
    expect(simulatePaging(textbook, 3, 'lru').faults).toBe(12);
    expect(simulatePaging(textbook, 3, 'optimal').faults).toBe(9);
  });

  it('FIFO replaces the oldest page', () => {
    const r = simulatePaging(textbook, 3, 'fifo');
    expect(r.steps[3]).toMatchObject({ page: 2, victim: 7, loadedInto: 0, frames: [2, 0, 1] });
  });

  it('clock gives a second chance to referenced pages', () => {
    const r = simulatePaging(belady, 3, 'clock');
    expect(r.faults).toBe(9);
    expect(r.steps[3]).toMatchObject({
      page: 4,
      victim: 1,
      frames: [4, 2, 3],
      refBits: [true, false, false],
      hand: 1,
    });
  });

  it("shows Belady's anomaly for FIFO but not for LRU", () => {
    expect(simulatePaging(belady, 3, 'fifo').faults).toBe(9);
    expect(simulatePaging(belady, 4, 'fifo').faults).toBe(10);
    expect(beladyCurve(belady, 5).some((p) => p.anomaly)).toBe(true);
    expect(beladyCurve(belady, 5, 'lru').some((p) => p.anomaly)).toBe(false);
  });

  it('parses reference strings', () => {
    expect(parseReferenceString('1, 2  3')).toEqual([1, 2, 3]);
    expect(parseReferenceString('1 x 3')).toBeNull();
    expect(parseReferenceString('')).toBeNull();
  });
});

// Silberschatz exercise: partitions 100, 500, 200, 300, 600; processes 212, 417, 112, 426.
const blocks = [100, 500, 200, 300, 600];
const ops: MemoryOp[] = [
  { kind: 'alloc', name: 'P1', size: 212 },
  { kind: 'alloc', name: 'P2', size: 417 },
  { kind: 'alloc', name: 'P3', size: 112 },
  { kind: 'alloc', name: 'P4', size: 426 },
];

const placement = (strategy: FitStrategy) => {
  const r = simulateAllocation(blocks, ops, strategy);
  const last = r.steps[r.steps.length - 1]?.segments ?? [];
  return {
    blocks: Object.fromEntries(last.filter((s) => s.owner).map((s) => [s.owner, blocks[s.block]])),
    failed: r.failed,
  };
};

describe('contiguous allocation', () => {
  it('first fit', () => {
    expect(placement('first')).toEqual({ blocks: { P1: 500, P2: 600, P3: 500 }, failed: ['P4'] });
  });

  it('best fit', () => {
    expect(placement('best')).toEqual({
      blocks: { P1: 300, P2: 500, P3: 200, P4: 600 },
      failed: [],
    });
  });

  it('worst fit', () => {
    expect(placement('worst')).toEqual({ blocks: { P1: 600, P2: 500, P3: 600 }, failed: ['P4'] });
  });

  it('freeing merges adjacent holes in the same block', () => {
    const r = simulateAllocation(
      [100],
      [
        { kind: 'alloc', name: 'A', size: 30 },
        { kind: 'alloc', name: 'B', size: 30 },
        { kind: 'free', name: 'A' },
        { kind: 'free', name: 'B' },
      ],
      'first',
    );
    expect(r.steps[r.steps.length - 1]?.segments).toEqual([
      { block: 0, start: 0, size: 100, owner: null },
    ]);
    expect(r.largestHole).toBe(100);
  });
});
