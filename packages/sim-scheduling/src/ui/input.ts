import { ALGORITHM_IDS, DEFAULT_OPTIONS, type AlgorithmId, type ProcessSpec } from '../engine';

export interface SchedInput {
  processes: ProcessSpec[];
  algorithm: AlgorithmId;
  quantum: number;
  priorityPreemptive: boolean;
  lowerIsHigher: boolean;
  view: 'single' | 'compare';
}

export const DEFAULT_INPUT: SchedInput = {
  processes: [
    { name: 'P1', arrival: 0, burst: 8, priority: 3 },
    { name: 'P2', arrival: 1, burst: 4, priority: 1 },
    { name: 'P3', arrival: 2, burst: 9, priority: 4 },
    { name: 'P4', arrival: 3, burst: 5, priority: 2 },
  ],
  algorithm: 'fcfs',
  ...DEFAULT_OPTIONS,
  view: 'single',
};

const int = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.trunc(v)))
    : fallback;

export function sanitizeInput(raw: unknown): SchedInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.processes) || r.processes.length > 50) return null;
  const processes: ProcessSpec[] = [];
  for (const [i, p] of (r.processes as unknown[]).entries()) {
    if (!p || typeof p !== 'object') return null;
    const q = p as Record<string, unknown>;
    processes.push({
      name: typeof q.name === 'string' ? q.name.slice(0, 12) : `P${i + 1}`,
      arrival: int(q.arrival, 0, 0, 1000),
      burst: int(q.burst, 1, 1, 1000),
      priority: int(q.priority, 0, -1000, 1000),
    });
  }
  return {
    processes,
    algorithm: ALGORITHM_IDS.includes(r.algorithm as AlgorithmId)
      ? (r.algorithm as AlgorithmId)
      : 'fcfs',
    quantum: int(r.quantum, DEFAULT_OPTIONS.quantum, 1, 100),
    priorityPreemptive: typeof r.priorityPreemptive === 'boolean' ? r.priorityPreemptive : false,
    lowerIsHigher: typeof r.lowerIsHigher === 'boolean' ? r.lowerIsHigher : true,
    view: r.view === 'compare' ? 'compare' : 'single',
  };
}
