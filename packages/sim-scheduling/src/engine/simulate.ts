import { ALGORITHMS, type AlgorithmId, type Candidate } from './algorithms';
import type {
  Metrics,
  ProcessResult,
  ProcessSpec,
  ScheduleResult,
  SchedOptions,
  Segment,
  Tick,
} from './types';

export const DEFAULT_OPTIONS: SchedOptions = {
  quantum: 2,
  priorityPreemptive: false,
  lowerIsHigher: true,
};

const MAX_TIME = 10_000;

/** Validates the input table; returns a message for the first problem found. */
export function validate(processes: readonly ProcessSpec[], options: SchedOptions): string | null {
  if (processes.length === 0) return 'Add at least one process.';
  for (const [i, p] of processes.entries()) {
    const name = p.name || `row ${i + 1}`;
    if (!Number.isInteger(p.arrival) || p.arrival < 0)
      return `${name}: arrival time must be a whole number ≥ 0.`;
    if (!Number.isInteger(p.burst) || p.burst < 1)
      return `${name}: burst time must be a whole number ≥ 1.`;
    if (!Number.isInteger(p.priority)) return `${name}: priority must be a whole number.`;
  }
  const total =
    processes.reduce((s, p) => s + p.burst, 0) + Math.max(...processes.map((p) => p.arrival));
  if (total > MAX_TIME) return `The schedule would be longer than ${MAX_TIME} time units.`;
  if (!Number.isInteger(options.quantum) || options.quantum < 1)
    return 'The time quantum must be at least 1.';
  return null;
}

/** Simulates one algorithm, one time unit at a time. Input must pass validate(). */
export function simulate(
  processes: readonly ProcessSpec[],
  algorithmId: AlgorithmId,
  options: SchedOptions = DEFAULT_OPTIONS,
): ScheduleResult {
  const algorithm = ALGORITHMS[algorithmId];
  const preemptive = algorithm.preemptive(options);
  const quantum = algorithm.quantum?.(options) ?? Infinity;
  const n = processes.length;
  const remaining = processes.map((p) => p.burst);
  const start = new Array<number>(n).fill(-1);
  const completion = new Array<number>(n).fill(-1);
  const arrivalOrder = processes
    .map((_, i) => i)
    .sort(
      (a, b) =>
        (processes[a] as ProcessSpec).arrival - (processes[b] as ProcessSpec).arrival || a - b,
    );

  const candidate = (i: number): Candidate => ({
    index: i,
    spec: processes[i] as ProcessSpec,
    remaining: remaining[i] as number,
  });
  const better = (a: number, b: number) =>
    algorithm.order ? algorithm.order(candidate(a), candidate(b), options) < 0 : false;
  const sortQueue = (q: number[]) =>
    algorithm.order
      ? q.sort((a, b) =>
          (algorithm.order as NonNullable<typeof algorithm.order>)(
            candidate(a),
            candidate(b),
            options,
          ),
        )
      : q;

  let queue: number[] = [];
  let running: number | null = null;
  let slice = 0;
  let nextArrival = 0;
  let done = 0;
  let switches = 0;
  let lastRan: number | null = null;
  const ticks: Tick[] = [];

  for (let t = 0; done < n; t++) {
    const arrived: number[] = [];
    while (
      nextArrival < n &&
      (processes[arrivalOrder[nextArrival] as number] as ProcessSpec).arrival === t
    ) {
      arrived.push(arrivalOrder[nextArrival] as number);
      nextArrival++;
    }
    queue.push(...arrived);

    let preempted: number | null = null;
    if (running !== null && slice >= quantum) {
      // Quantum expired: back of the queue, after this instant's arrivals.
      queue.push(running);
      preempted = running;
      running = null;
    }
    sortQueue(queue);
    if (running === null) {
      running = queue.shift() ?? null;
      slice = 0;
    } else if (preemptive && queue.length > 0 && better(queue[0] as number, running)) {
      preempted = running;
      queue.push(running);
      running = queue.shift() as number;
      sortQueue(queue);
      slice = 0;
    }

    ticks.push({
      time: t,
      running,
      queue: [...queue],
      remaining: [...remaining],
      arrived,
      preempted,
    });
    if (running === null) continue;

    if (lastRan !== null && lastRan !== running) switches++;
    lastRan = running;
    if (start[running] === -1) start[running] = t;
    remaining[running] = (remaining[running] as number) - 1;
    slice++;
    if (remaining[running] === 0) {
      completion[running] = t + 1;
      done++;
      running = null;
    }
  }

  const results: ProcessResult[] = processes.map((p, i) => {
    const turnaround = (completion[i] as number) - p.arrival;
    return {
      index: i,
      name: p.name,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      start: start[i] as number,
      completion: completion[i] as number,
      turnaround,
      waiting: turnaround - p.burst,
      response: (start[i] as number) - p.arrival,
    };
  });
  const makespan = ticks.length;
  return {
    ticks,
    segments: toSegments(ticks),
    processes: results,
    metrics: metrics(results, switches),
    makespan,
  };
}

function toSegments(ticks: readonly Tick[]): Segment[] {
  const segments: Segment[] = [];
  for (const tick of ticks) {
    const last = segments[segments.length - 1];
    if (last && last.proc === tick.running) last.end = tick.time + 1;
    else segments.push({ proc: tick.running, start: tick.time, end: tick.time + 1 });
  }
  return segments;
}

function metrics(results: readonly ProcessResult[], contextSwitches: number): Metrics {
  const avg = (f: (r: ProcessResult) => number) =>
    results.reduce((s, r) => s + f(r), 0) / results.length;
  const busy = results.reduce((s, r) => s + r.burst, 0);
  const span =
    Math.max(...results.map((r) => r.completion)) - Math.min(...results.map((r) => r.arrival));
  return {
    avgTurnaround: avg((r) => r.turnaround),
    avgWaiting: avg((r) => r.waiting),
    avgResponse: avg((r) => r.response),
    utilization: span > 0 ? busy / span : 1,
    contextSwitches,
  };
}
