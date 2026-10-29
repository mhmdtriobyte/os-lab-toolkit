import { describe, expect, it } from 'vitest';
import { explore } from './explore';

/** Two "threads" that each print their letter twice. */
interface S {
  a: number;
  b: number;
}

const spec = {
  initial: { a: 0, b: 0 },
  choices: (s: S) => [...(s.a < 2 ? ['a'] : []), ...(s.b < 2 ? ['b'] : [])],
  apply: (s: S, c: string) => ({
    next: c === 'a' ? { ...s, a: s.a + 1 } : { ...s, b: s.b + 1 },
    emit: c,
  }),
  key: (s: S) => `${s.a},${s.b}`,
};

describe('explore', () => {
  it('counts every interleaving and every distinct output', () => {
    const r = explore(spec);
    expect(r.totalInterleavings).toBe(6);
    expect(r.outcomes.map((o) => o.output).sort()).toEqual(
      ['aabb', 'abab', 'abba', 'baab', 'baba', 'bbaa'].sort(),
    );
    expect(r.truncated).toBe(false);
    expect(r.statesExplored).toBe(9);
  });

  it('rebuilds a path that produces each output', () => {
    const r = explore(spec);
    for (const o of r.outcomes) expect(o.path.join('')).toBe(o.output);
  });

  it('merges identical outputs and counts them', () => {
    const r = explore({
      ...spec,
      apply: (s: S, c: string) => ({ ...spec.apply(s, c), emit: 'x' }),
    });
    expect(r.outcomes).toHaveLength(1);
    expect(r.outcomes[0]?.count).toBe(6);
  });

  it('appends terminal outcomes', () => {
    const r = explore({
      ...spec,
      apply: (s: S, c: string) => ({ ...spec.apply(s, c), emit: '' }),
      outcome: () => 'done',
    });
    expect(r.outcomes[0]?.output).toBe('done');
  });

  it('reports non-terminating cycles', () => {
    const r = explore({
      initial: 0,
      choices: (s: number) => (s === 2 ? [] : ['inc', 'reset']),
      apply: (s: number, c: string) => ({ next: c === 'inc' ? s + 1 : 0, emit: c[0] ?? '' }),
      key: (s: number) => String(s),
    });
    expect(r.outcomes.some((o) => o.kind === 'nonterminating')).toBe(true);
    expect(r.outcomes.some((o) => o.kind === 'complete' && o.output === 'ii')).toBe(true);
  });

  it('stops at the state cap', () => {
    const r = explore({ ...spec, maxStates: 3 });
    expect(r.truncated).toBe(true);
    expect(r.outcomes.some((o) => o.kind === 'truncated')).toBe(true);
  });
});
