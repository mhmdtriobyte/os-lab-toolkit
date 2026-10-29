import { explore, rng, type ExploreResult, type Step } from '@oslab/core/engine';
import type { ThreadsProgram } from './asm';
import { describeEnd, enabled, initialWorld, stepThread, worldKey, type World } from './machine';

export interface ThreadSnapshot {
  world: World;
  /** Thread that ran in this step, and which instruction (null for re-acquiring a mutex). */
  ran: number | null;
  instr: number | null;
  /** Everything printed so far. */
  output: string;
  /** Set on the last step: final values, deadlock or error. */
  end: string | null;
}

export type ThreadStep = Step<ThreadSnapshot>;

export const MAX_STEPS = 2000;

function withEnd(p: ThreadsProgram, step: ThreadStep): ThreadStep {
  const w = step.state.world;
  if (enabled(p, w).length > 0) return step;
  const end = describeEnd(p, w);
  return { state: { ...step.state, end }, label: `${step.label} · ${end}` };
}

export function startStep(p: ThreadsProgram): ThreadStep {
  return withEnd(p, {
    state: { world: initialWorld(p), ran: null, instr: null, output: '', end: null },
    label: 'All threads are ready to start.',
  });
}

export function advance(p: ThreadsProgram, prev: ThreadStep, t: number): ThreadStep {
  const r = stepThread(p, prev.state.world, t);
  return withEnd(p, {
    state: {
      world: r.world,
      ran: t,
      instr: r.instr,
      output: prev.state.output + r.emit,
      end: null,
    },
    label: r.text,
  });
}

/** A run where the scheduler picks a random enabled thread (reproducible with the seed). */
export function runRandom(
  p: ThreadsProgram,
  seed: number,
): { steps: ThreadStep[]; truncated: boolean } {
  const r = rng(seed);
  const steps = [startStep(p)];
  while (steps.length < MAX_STEPS) {
    const last = steps[steps.length - 1] as ThreadStep;
    const choices = enabled(p, last.state.world);
    if (choices.length === 0) return { steps, truncated: false };
    steps.push(advance(p, last, r.pick(choices)));
  }
  return { steps, truncated: true };
}

export function replayThreads(p: ThreadsProgram, choices: readonly number[]): ThreadStep[] {
  const steps = [startStep(p)];
  for (const t of choices) steps.push(advance(p, steps[steps.length - 1] as ThreadStep, t));
  return steps;
}

/** Every interleaving of atomic instructions; outcomes are printed text plus the final state. */
export function exploreThreads(p: ThreadsProgram, maxStates = 50_000): ExploreResult<number> {
  return explore<World, number>({
    initial: initialWorld(p),
    choices: (w) => enabled(p, w),
    apply: (w, t) => {
      const r = stepThread(p, w, t);
      return { next: r.world, emit: r.emit };
    },
    key: worldKey,
    outcome: (w) => describeEnd(p, w),
    maxStates,
  });
}
