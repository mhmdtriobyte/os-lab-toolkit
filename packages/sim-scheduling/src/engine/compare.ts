import { ALGORITHMS, compareVariants } from './algorithms';
import { simulate } from './simulate';
import type { Metrics, ProcessSpec, ScheduleResult, SchedOptions } from './types';

export interface ComparisonRow {
  label: string;
  result: ScheduleResult;
}

export type MetricKey = keyof Metrics;

export const METRICS: {
  key: MetricKey;
  label: string;
  better: 'lower' | 'higher';
  percent?: boolean;
}[] = [
  { key: 'avgWaiting', label: 'Avg waiting', better: 'lower' },
  { key: 'avgTurnaround', label: 'Avg turnaround', better: 'lower' },
  { key: 'avgResponse', label: 'Avg response', better: 'lower' },
  { key: 'utilization', label: 'CPU utilization', better: 'higher', percent: true },
  { key: 'contextSwitches', label: 'Context switches', better: 'lower' },
];

/** Runs every algorithm variant on the same input. */
export function compareAll(
  processes: readonly ProcessSpec[],
  options: SchedOptions,
): ComparisonRow[] {
  return compareVariants().map((v) => ({
    label: v.algorithm === 'rr' ? `${ALGORITHMS.rr.short} (q=${options.quantum})` : v.label,
    result: simulate(processes, v.algorithm, { ...options, ...v.options }),
  }));
}

const EPSILON = 1e-9;

/** Labels of the best rows for a metric (several on a tie). */
export function winners(rows: readonly ComparisonRow[], key: MetricKey): string[] {
  const metric = METRICS.find((m) => m.key === key);
  const values = rows.map((r) => r.result.metrics[key]);
  const best = metric?.better === 'higher' ? Math.max(...values) : Math.min(...values);
  return rows.filter((r) => Math.abs(r.result.metrics[key] - best) < EPSILON).map((r) => r.label);
}
