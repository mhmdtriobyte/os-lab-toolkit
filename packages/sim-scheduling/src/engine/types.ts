export interface ProcessSpec {
  name: string;
  arrival: number;
  burst: number;
  priority: number;
}

export interface SchedOptions {
  /** Round Robin time quantum. */
  quantum: number;
  /** Priority scheduling: may a higher-priority arrival preempt the running process? */
  priorityPreemptive: boolean;
  /** Priority scheduling: true when a lower number means a higher priority (the usual convention). */
  lowerIsHigher: boolean;
}

/** One time unit of the simulation (what the step player shows). */
export interface Tick {
  time: number;
  /** Index of the process on the CPU during [time, time + 1), or null when idle. */
  running: number | null;
  /** Ready queue at the start of this time unit (excluding the running process), in pick order. */
  queue: number[];
  /** Remaining burst of every process at the start of this time unit. */
  remaining: number[];
  /** Processes that arrived at `time`. */
  arrived: number[];
  /** Process preempted at `time`, if any. */
  preempted: number | null;
}

export interface Segment {
  /** Process index, or null for an idle CPU. */
  proc: number | null;
  start: number;
  end: number;
}

export interface ProcessResult {
  index: number;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
  /** First time on the CPU. */
  start: number;
  completion: number;
  turnaround: number;
  waiting: number;
  response: number;
}

export interface Metrics {
  avgTurnaround: number;
  avgWaiting: number;
  avgResponse: number;
  /** Busy time / (last completion - first arrival), in [0, 1]. */
  utilization: number;
  contextSwitches: number;
}

export interface ScheduleResult {
  ticks: Tick[];
  segments: Segment[];
  processes: ProcessResult[];
  metrics: Metrics;
  /** Time when the last process completes. */
  makespan: number;
}
