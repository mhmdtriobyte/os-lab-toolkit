import type { Step } from '@oslab/core/engine';
import type { Program } from './bytecode';
import { describe } from './describe';
import {
  advanceClock,
  boot,
  findProc,
  killProcess,
  runnable,
  step,
  type ForkEvent,
  type StepResult,
  type System,
  type VmConfig,
} from './vm';

export type Policy = 'parent-first' | 'child-first' | 'round-robin';

export const POLICIES: { value: Policy; label: string; help: string }[] = [
  {
    value: 'parent-first',
    label: 'Parent first',
    help: 'After fork() the parent keeps running; other ready processes wait in FIFO order.',
  },
  {
    value: 'child-first',
    label: 'Child first',
    help: 'After fork() the new child runs immediately; the parent goes to the front of the queue.',
  },
  {
    value: 'round-robin',
    label: 'Round robin',
    help: 'Each ready process runs one statement, then goes to the back of the queue.',
  },
];

/** What the step player shows: the system plus what just happened and the scheduler state. */
export interface ForkSnapshot {
  sys: System;
  events: readonly ForkEvent[];
  /** Pid that ran in this step (null for clock ticks, kills and the initial state). */
  ran: number | null;
  /** Ready queue of the deterministic scheduler. */
  queue: readonly number[];
  /** Process that keeps the CPU under parent-first / child-first. */
  current: number | null;
}

export type ForkStep = Step<ForkSnapshot>;

export function initialStep(program: Program, config: VmConfig): ForkStep {
  const sys = boot(program, config);
  const main = runnable(sys);
  return {
    state: { sys, events: [], ran: null, queue: main, current: null },
    label: `bash starts the program as P${config.pidStart}. Press play or step forward.`,
  };
}

function readyPids(sys: System): Set<number> {
  return new Set(runnable(sys));
}

function nextQueue(prev: readonly number[], sys: System, skip: number[]): number[] {
  const ready = readyPids(sys);
  const queue = prev.filter((q) => ready.has(q) && !skip.includes(q));
  for (const pid of ready) if (!queue.includes(pid) && !skip.includes(pid)) queue.push(pid);
  return queue;
}

/** Which process a deterministic policy runs next, or null if none is ready. */
export function chooseNext(snap: ForkSnapshot, policy: Policy): number | null {
  const ready = readyPids(snap.sys);
  if (policy !== 'round-robin' && snap.current !== null && ready.has(snap.current))
    return snap.current;
  return snap.queue.find((q) => ready.has(q)) ?? null;
}

/** Runs one statement of `pid` and updates the ready queue according to `policy`. */
export function runStep(
  program: Program,
  snap: ForkSnapshot,
  pid: number,
  policy: Policy,
  config: VmConfig,
): ForkStep {
  const r = step(program, snap.sys, pid, config);
  const children = r.events.flatMap((e) => (e.k === 'fork' ? [e.child] : []));
  const stillReady = readyPids(r.sys).has(pid);
  const rest = nextQueue(snap.queue, r.sys, [pid, ...children]);
  let queue: number[];
  let current: number | null;
  if (policy === 'round-robin') {
    queue = [...rest, ...children, ...(stillReady ? [pid] : [])];
    current = null;
  } else if (policy === 'child-first' && children.length > 0) {
    queue = [...(stillReady ? [pid] : []), ...children.slice(0, -1), ...rest];
    current = children[children.length - 1] as number;
  } else {
    queue = [...rest, ...children];
    current = stillReady ? pid : null;
  }
  return toStep(r, pid, queue, current);
}

function toStep(
  r: StepResult,
  ran: number | null,
  queue: number[],
  current: number | null,
): ForkStep {
  return {
    state: { sys: r.sys, events: r.events, ran, queue, current },
    label: describe(r.events),
  };
}

/** A step for the virtual clock jumping forward, or null if some process is ready. */
export function clockStep(snap: ForkSnapshot, config: VmConfig): ForkStep | null {
  const r = advanceClock(snap.sys, config);
  if (!r) return null;
  return toStep(r, null, nextQueue(snap.queue, r.sys, []), snap.current);
}

export function killStep(snap: ForkSnapshot, pid: number, config: VmConfig): ForkStep {
  const r = killProcess(snap.sys, pid, config);
  const current = snap.current === pid ? null : snap.current;
  return toStep(r, null, nextQueue(snap.queue, r.sys, []), current);
}

export interface RunResult {
  steps: ForkStep[];
  /** True if the run stopped at maxSteps (probably an infinite loop). */
  truncated: boolean;
}

/** Continues a trace with a deterministic policy until every process has finished. */
export function runToEnd(
  program: Program,
  prefix: readonly ForkStep[],
  policy: Policy,
  config: VmConfig,
  maxSteps = 3000,
): RunResult {
  const steps = [...prefix];
  while (steps.length < maxSteps) {
    const last = (steps[steps.length - 1] as ForkStep).state;
    const pid = chooseNext(last, policy);
    const next =
      pid !== null ? runStep(program, last, pid, policy, config) : clockStep(last, config);
    if (!next) return { steps, truncated: false };
    steps.push(next);
  }
  return { steps, truncated: true };
}

export function runDeterministic(
  program: Program,
  policy: Policy,
  config: VmConfig,
  maxSteps?: number,
): RunResult {
  return runToEnd(program, [initialStep(program, config)], policy, config, maxSteps);
}

/** Replays a list of chosen pids (from the explorer or manual mode), inserting clock ticks. */
export function replay(program: Program, choices: readonly number[], config: VmConfig): ForkStep[] {
  const steps = [initialStep(program, config)];
  const last = () => (steps[steps.length - 1] as ForkStep).state;
  for (const pid of choices) {
    for (let tick = clockStep(last(), config); tick; tick = clockStep(last(), config))
      steps.push(tick);
    if (!findProc(last().sys, pid)) break;
    steps.push(runStep(program, last(), pid, 'parent-first', config));
  }
  for (let tick = clockStep(last(), config); tick; tick = clockStep(last(), config))
    steps.push(tick);
  return steps;
}
