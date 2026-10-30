import { describe, expect, it } from 'vitest';
import { simulateAllocation, type MemoryOp } from './allocation';
import { parseReferenceString, simulatePaging } from './paging';

interface Preset {
  id: string;
  input: { tab: string; refs?: string; frames?: number; blocks?: string; ops?: MemoryOp[] };
}

const presets = import.meta.glob<Preset>('../../../../examples/memory/*.json', {
  eager: true,
  import: 'default',
});

describe('memory presets', () => {
  it.each(Object.entries(presets))('%s is valid', (path, preset) => {
    expect(path.endsWith(`/${preset.id}.json`)).toBe(true);
    const { refs, frames, blocks, ops } = preset.input;
    if (preset.input.tab === 'paging') {
      const parsed = parseReferenceString(refs ?? '');
      expect(parsed).not.toBeNull();
      expect(simulatePaging(parsed ?? [], frames ?? 3, 'fifo').steps.length).toBe(parsed?.length);
    } else {
      const sizes = (blocks ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      expect(sizes.every((s) => s > 0)).toBe(true);
      expect(simulateAllocation(sizes, ops ?? [], 'first').steps).toHaveLength(ops?.length ?? 0);
    }
  });

  it('the fragmentation preset fails although enough memory is free', () => {
    const { ops } = (Object.values(presets).find((p) => p.id === 'fragmentation') as Preset).input;
    const r = simulateAllocation([600], ops ?? [], 'first');
    expect(r.failed).toEqual(['E']);
    expect(r.freeTotal).toBe(300);
    expect(r.largestHole).toBe(150);
    expect(r.fragmented).toBe(true);
  });
});
