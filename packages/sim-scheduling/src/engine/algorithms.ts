import type { ProcessSpec, SchedOptions } from './types';

export type AlgorithmId = 'fcfs' | 'sjf' | 'srtf' | 'priority' | 'rr';

/** What an algorithm may look at when ordering the ready queue. */
export interface Candidate {
  index: number;
  spec: ProcessSpec;
  remaining: number;
}

/**
 * A scheduling algorithm is described declaratively; `simulate()` does the rest.
 * - `order` ranks candidates (lower first). Without it the ready queue is FIFO.
 * - `preemptive` lets a better-ranked ready process take the CPU at any time unit.
 * - `quantum` makes the running process go to the back of the queue after that many units.
 *
 * To add an algorithm, add an entry to ALGORITHMS (and to compareVariants to include it in compare mode).
 */
// TODO(mlfq): Multilevel Feedback Queue. It needs several ready queues, so extend Algorithm with a list
// of levels (each with its own quantum and demotion rule) and teach simulate() to use them.
export interface Algorithm {
  id: AlgorithmId;
  name: string;
  short: string;
  /** Tie-breaking and preemption rules, shown in the UI because they cause confusion in class. */
  rules: string;
  preemptive(options: SchedOptions): boolean;
  order?(a: Candidate, b: Candidate, options: SchedOptions): number;
  quantum?(options: SchedOptions): number;
}

const byArrivalThenIndex = (a: Candidate, b: Candidate) =>
  a.spec.arrival - b.spec.arrival || a.index - b.index;

export const ALGORITHMS: Record<AlgorithmId, Algorithm> = {
  fcfs: {
    id: 'fcfs',
    name: 'First Come, First Served',
    short: 'FCFS',
    rules:
      'Non-preemptive. Earliest arrival first; equal arrivals run in table order (P1 before P2).',
    preemptive: () => false,
    order: byArrivalThenIndex,
  },
  sjf: {
    id: 'sjf',
    name: 'Shortest Job First (non-preemptive)',
    short: 'SJF',
    rules:
      'Non-preemptive. When the CPU is free, the ready process with the shortest burst runs. Ties: earlier arrival, then table order.',
    preemptive: () => false,
    order: (a, b) => a.spec.burst - b.spec.burst || byArrivalThenIndex(a, b),
  },
  srtf: {
    id: 'srtf',
    name: 'Shortest Remaining Time First (preemptive SJF)',
    short: 'SRTF',
    rules:
      'Preemptive. At every time unit the process with the least remaining time runs. A new process only preempts if its remaining time is strictly shorter. Ties: earlier arrival, then table order.',
    preemptive: () => true,
    order: (a, b) => a.remaining - b.remaining || byArrivalThenIndex(a, b),
  },
  priority: {
    id: 'priority',
    name: 'Priority',
    short: 'Priority',
    rules:
      'The highest-priority ready process runs (see the "lower number = higher priority" setting). Preemptive mode: a strictly higher priority arrival preempts. Ties: earlier arrival, then table order.',
    preemptive: (o) => o.priorityPreemptive,
    order: (a, b, o) =>
      (o.lowerIsHigher ? a.spec.priority - b.spec.priority : b.spec.priority - a.spec.priority) ||
      byArrivalThenIndex(a, b),
  },
  rr: {
    id: 'rr',
    name: 'Round Robin',
    short: 'RR',
    rules:
      'FIFO ready queue; each process runs for at most one time quantum, then goes to the back of the queue. Processes that arrive at the same moment a quantum expires are queued before the preempted process. Simultaneous arrivals are queued in table order.',
    preemptive: () => true,
    quantum: (o) => o.quantum,
  },
};

export const ALGORITHM_IDS = Object.keys(ALGORITHMS) as AlgorithmId[];

/** Algorithm variants run side by side in compare mode. */
export interface Variant {
  label: string;
  algorithm: AlgorithmId;
  options: Partial<SchedOptions>;
}

export function compareVariants(): Variant[] {
  return [
    { label: 'FCFS', algorithm: 'fcfs', options: {} },
    { label: 'SJF', algorithm: 'sjf', options: {} },
    { label: 'SRTF', algorithm: 'srtf', options: {} },
    {
      label: 'Priority (non-preemptive)',
      algorithm: 'priority',
      options: { priorityPreemptive: false },
    },
    {
      label: 'Priority (preemptive)',
      algorithm: 'priority',
      options: { priorityPreemptive: true },
    },
    { label: 'Round Robin', algorithm: 'rr', options: {} },
  ];
}
