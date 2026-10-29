import { scan, type ScanResult } from './scan';
import { isZero } from './vector';

/** Input of the deadlock detection algorithm (several instances per resource type). */
export interface DetectionState {
  processes: string[];
  resources: string[];
  allocation: number[][];
  request: number[][];
  available: number[];
}

export interface DetectionResult extends ScanResult {
  deadlocked: number[];
  summary: string;
}

export function validateDetection(state: DetectionState): string | null {
  const n = state.processes.length;
  const m = state.resources.length;
  if (n === 0 || m === 0) return 'Add at least one process and one resource type.';
  const okRow = (row: readonly number[] | undefined) =>
    row?.length === m && row.every((x) => Number.isInteger(x) && x >= 0);
  if (state.allocation.length !== n || !state.allocation.every(okRow))
    return 'Allocation must hold whole numbers ≥ 0.';
  if (state.request.length !== n || !state.request.every(okRow))
    return 'Request must hold whole numbers ≥ 0.';
  if (!okRow(state.available)) return 'Available must hold whole numbers ≥ 0.';
  return null;
}

/**
 * Work = Available; Finish[i] = true when process i holds nothing (it cannot be part of a deadlock).
 * Then repeatedly let any process whose Request <= Work finish. Whoever is left is deadlocked.
 */
export function detect(state: DetectionState): DetectionResult {
  const initial = state.allocation.map((row) => isZero(row));
  const result = scan(state.request, state.allocation, state.available, initial, state.processes);
  const names = (ids: number[]) => ids.map((i) => state.processes[i]).join(', ');
  const deadlocked = result.stuck;
  const skipped = initial.flatMap((f, i) => (f ? [i] : []));
  return {
    ...result,
    deadlocked,
    summary:
      (deadlocked.length > 0
        ? `DEADLOCK: ${names(deadlocked)} are deadlocked; none of their requests can ever be satisfied.`
        : `No deadlock: all processes can finish in the order <${names(result.sequence)}>.`) +
      (skipped.length
        ? ` (${names(skipped)} hold nothing, so Finish starts as true for them.)`
        : ''),
  };
}
