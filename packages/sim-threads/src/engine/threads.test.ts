import { describe, expect, it } from 'vitest';
import { AsmError, assemble, pseudo } from './asm';
import { enabled, initialWorld } from './machine';
import { exploreThreads, replayThreads, runRandom } from './run';

interface Preset {
  id: string;
  input: { code: string };
}

const presets = Object.fromEntries(
  Object.values(
    import.meta.glob<Preset>('../../../../examples/threads/*.json', {
      eager: true,
      import: 'default',
    }),
  ).map((p) => [p.id, p.input.code]),
);

const code = (id: string) => {
  const c = presets[id];
  if (!c) throw new Error(`missing preset ${id}`);
  return c;
};

const finals = (id: string) =>
  exploreThreads(assemble(code(id))).outcomes.map((o) => o.output.split('\n').pop());

describe('assembler', () => {
  it('parses declarations, threads, labels and pseudo-code', () => {
    const p = assemble(code('race-counter-loop'));
    expect(p.shared).toEqual({ counter: 0 });
    expect(p.threads.map((t) => t.name)).toEqual(['A', 'B']);
    expect(p.threads[0]?.instrs.map(pseudo)).toEqual([
      'i = 2',
      'r = counter',
      'r = r + 1',
      'counter = r',
      'i = i - 1',
      'if (i != 0) goto loop',
    ]);
  });

  it.each([
    ['thread A\n  LOCK m', /not a declared mutex/],
    ['shared x\nthread A\n  JMP nowhere', /Unknown label/],
    ['thread A\n  FROB x', /Unknown instruction/],
    ['LOAD r, x', /after "thread NAME"/],
    ['shared x\nthread A\n  LOAD x, x', /use a register/],
    ['', /at least one thread/],
  ])('reports errors: %s', (src, message) => {
    expect(() => assemble(src)).toThrow(AsmError);
    expect(() => assemble(src)).toThrow(message);
  });
});

describe('race conditions', () => {
  it('unprotected counter++ can lose an update (more than one final value)', () => {
    expect(new Set(finals('race-counter'))).toEqual(
      new Set(['final: counter = 1', 'final: counter = 2']),
    );
  });

  it('lists every possible final value with counts', () => {
    const r = exploreThreads(assemble(code('race-counter-loop')));
    const values = r.outcomes.map((o) => o.output);
    expect(new Set(values)).toEqual(
      new Set(['final: counter = 2', 'final: counter = 3', 'final: counter = 4']),
    );
    expect(r.outcomes.reduce((s, o) => s + o.count, 0)).toBe(r.totalInterleavings);
  });

  it('with a mutex the counter is always correct', () => {
    expect(finals('mutex-counter')).toEqual(['final: counter = 2']);
  });

  it('with a binary semaphore the counter is always correct', () => {
    expect(finals('semaphore-counter')).toEqual(['final: counter = 2']);
  });
});

describe('classic problems', () => {
  it('dining philosophers can deadlock', () => {
    const r = exploreThreads(assemble(code('dining-philosophers')));
    expect(r.outcomes.some((o) => o.output.includes('DEADLOCK'))).toBe(true);
    const deadlock = r.outcomes.find((o) => o.output.includes('DEADLOCK'));
    // The example path really ends with nobody able to move.
    const steps = replayThreads(assemble(code('dining-philosophers')), deadlock?.path ?? []);
    expect(steps[steps.length - 1]?.state.end).toMatch(/DEADLOCK/);
  });

  it('the fixed dining philosophers never deadlock', () => {
    const r = exploreThreads(assemble(code('dining-philosophers-fixed')));
    expect(r.outcomes.every((o) => !o.output.includes('DEADLOCK'))).toBe(true);
  });

  it('producer-consumer keeps the buffer within bounds and ends empty', () => {
    const r = exploreThreads(assemble(code('producer-consumer')));
    expect(r.truncated).toBe(false);
    for (const o of r.outcomes) {
      expect(o.output.endsWith('final: count = 0')).toBe(true);
      let level = 0;
      for (const line of o.output.split('\n')) {
        if (line === 'produced') level++;
        if (line === 'consumed') level--;
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(2);
      }
    }
  });

  it('readers-writers never deadlock and the writer writes once', () => {
    const r = exploreThreads(assemble(code('readers-writers')));
    expect(r.outcomes.every((o) => o.output.includes('data = 1'))).toBe(true);
    expect(r.outcomes.some((o) => o.output.startsWith('R1 reads\nR2 reads'))).toBe(true);
  });

  it('condition variable: the waiter always proceeds', () => {
    const r = exploreThreads(assemble(code('condition-variable')));
    expect(r.outcomes.every((o) => o.output.startsWith('waiter proceeds'))).toBe(true);
  });
});

describe('runs', () => {
  it('random runs are reproducible and finish', () => {
    const p = assemble(code('producer-consumer'));
    const a = runRandom(p, 7);
    expect(a.truncated).toBe(false);
    expect(a.steps.map((s) => s.state.ran)).toEqual(runRandom(p, 7).steps.map((s) => s.state.ran));
    expect(a.steps[a.steps.length - 1]?.state.end).toBe('final: count = 0');
  });

  it('a lock held by another thread blocks', () => {
    const p = assemble(code('mutex-counter'));
    const steps = replayThreads(p, [0]);
    expect(enabled(p, steps[1]?.state.world ?? initialWorld(p))).toEqual([0]);
  });
});
