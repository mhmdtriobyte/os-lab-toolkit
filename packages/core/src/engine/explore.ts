/**
 * Exhaustive interleaving explorer.
 *
 * For every reachable state it computes the map "future output -> number of interleavings that
 * produce it". The key of a state must NOT include the output printed so far, so that states reached
 * through different histories are shared (memoised).
 */
export interface ExploreSpec<S, C> {
  initial: S;
  /** Possible next moves (for example: which ready process runs next). Empty means terminal. */
  choices(state: S): readonly C[];
  /** Apply a move. `emit` is the visible output produced by it. */
  apply(state: S, choice: C): { next: S; emit: string };
  /** Canonical key of the full system state, excluding past output. */
  key(state: S): string;
  /** Text appended at a terminal state (for example final shared values or "deadlock"). */
  outcome?(state: S): string;
  /** Stop after this many distinct states (default 50 000). */
  maxStates?: number;
  /** Stop a single path after this many moves (default 5 000). */
  maxDepth?: number;
  /** Keep at most this many distinct outputs per state (default 500); further ones are dropped. */
  maxOutcomes?: number;
}

export type OutcomeKind = 'complete' | 'nonterminating' | 'truncated';

export interface Outcome<C> {
  /** Output text with markers removed. */
  output: string;
  kind: OutcomeKind;
  /** Number of interleavings (paths) producing this output. */
  count: number;
  /** One sequence of choices that produces it, from the initial state. */
  path: C[];
}

export interface ExploreResult<C> {
  outcomes: Outcome<C>[];
  statesExplored: number;
  totalInterleavings: number;
  /** True if maxStates or maxDepth was hit, so some outcomes may be missing. */
  truncated: boolean;
  /** True if maxOutcomes was hit: there are more distinct outputs than the ones listed. */
  outcomesCapped: boolean;
}

const LOOP = '\u0000loop';
const TRUNC = '\u0000trunc';

export function explore<S, C>(spec: ExploreSpec<S, C>): ExploreResult<C> {
  const maxStates = spec.maxStates ?? 50_000;
  const maxDepth = spec.maxDepth ?? 5_000;
  const maxOutcomes = spec.maxOutcomes ?? 500;
  const memo = new Map<string, Map<string, number>>();
  const onPath = new Set<string>();
  let truncated = false;
  let outcomesCapped = false;

  const visit = (state: S, depth: number): Map<string, number> => {
    const k = spec.key(state);
    const known = memo.get(k);
    if (known) return known;
    if (onPath.has(k)) return new Map([[LOOP, 1]]);
    if (memo.size >= maxStates || depth >= maxDepth) {
      truncated = true;
      return new Map([[TRUNC, 1]]);
    }
    const choices = spec.choices(state);
    const result = new Map<string, number>();
    if (choices.length === 0) {
      result.set(spec.outcome ? spec.outcome(state) : '', 1);
    } else {
      onPath.add(k);
      for (const choice of choices) {
        const { next, emit } = spec.apply(state, choice);
        for (const [suffix, count] of visit(next, depth + 1)) {
          const out = emit + suffix;
          const prev = result.get(out);
          if (prev !== undefined) result.set(out, prev + count);
          else if (result.size < maxOutcomes) result.set(out, count);
          else outcomesCapped = true;
        }
      }
      onPath.delete(k);
    }
    memo.set(k, result);
    return result;
  };

  const root = visit(spec.initial, 0);

  const pathFor = (target: string): C[] => {
    const path: C[] = [];
    const seen = new Set<string>();
    let state = spec.initial;
    let remaining = target;
    while (path.length < maxDepth) {
      const k = spec.key(state);
      if ((remaining === LOOP && seen.has(k)) || !memo.has(k)) break;
      seen.add(k);
      let moved = false;
      for (const choice of spec.choices(state)) {
        const { next, emit } = spec.apply(state, choice);
        if (!remaining.startsWith(emit)) continue;
        const rest = remaining.slice(emit.length);
        const nextKey = spec.key(next);
        const sub = memo.get(nextKey);
        const fits = (rest === LOOP && seen.has(nextKey)) || (sub ? sub.has(rest) : rest === TRUNC);
        if (!fits) continue;
        path.push(choice);
        state = next;
        remaining = rest;
        moved = true;
        break;
      }
      if (!moved) break;
    }
    return path;
  };

  const outcomes: Outcome<C>[] = [];
  let total = 0;
  for (const [raw, count] of root) {
    total += count;
    const kind: OutcomeKind = raw.endsWith(TRUNC)
      ? 'truncated'
      : raw.endsWith(LOOP)
        ? 'nonterminating'
        : 'complete';
    const output = raw.replace(TRUNC, '').replace(LOOP, '');
    outcomes.push({ output, kind, count, path: pathFor(raw) });
  }
  outcomes.sort((a, b) => b.count - a.count || a.output.localeCompare(b.output));
  return {
    outcomes,
    statesExplored: memo.size,
    totalInterleavings: total,
    truncated,
    outcomesCapped,
  };
}
