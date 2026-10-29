import { scan, type ScanResult } from './scan';
import { add, columnTotals, fmt, leq, needMatrix, sub, type Vector } from './vector';

export interface BankerState {
  processes: string[];
  resources: string[];
  allocation: number[][];
  max: number[][];
  available: number[];
}

export interface SafetyResult extends ScanResult {
  safe: boolean;
  need: number[][];
  summary: string;
}

function shapeError(state: BankerState): string | null {
  const n = state.processes.length;
  const m = state.resources.length;
  if (n === 0 || m === 0) return 'Add at least one process and one resource type.';
  const okRow = (row: Vector | undefined) =>
    row?.length === m && row.every((x) => Number.isInteger(x) && x >= 0);
  if (state.allocation.length !== n || !state.allocation.every(okRow))
    return 'Allocation must hold whole numbers ≥ 0.';
  if (state.max.length !== n || !state.max.every(okRow)) return 'Max must hold whole numbers ≥ 0.';
  if (!okRow(state.available)) return 'Available must hold whole numbers ≥ 0.';
  return null;
}

export function validateBanker(state: BankerState): string | null {
  const shape = shapeError(state);
  if (shape) return shape;
  for (const [i, row] of state.allocation.entries()) {
    if (!leq(row, state.max[i] ?? [])) {
      return `${state.processes[i]} holds more than its Max claim (Allocation ${fmt(row)} > Max ${fmt(state.max[i] ?? [])}).`;
    }
  }
  return null;
}

/** Total instances of each resource type = Available + all allocations. */
export function totalInstances(state: BankerState): number[] {
  return add(state.available, columnTotals(state.allocation, state.resources.length));
}

export function safety(state: BankerState): SafetyResult {
  const need = needMatrix(state.max, state.allocation);
  const result = scan(
    need,
    state.allocation,
    state.available,
    state.processes.map(() => false),
    state.processes,
  );
  const safe = result.stuck.length === 0;
  const names = (ids: number[]) => ids.map((i) => state.processes[i]).join(', ');
  return {
    ...result,
    safe,
    need,
    summary: safe
      ? `SAFE: every process can finish in the order <${names(result.sequence)}>.`
      : `UNSAFE: ${names(result.stuck)} can never be sure to get their maximum claim${result.sequence.length ? ` (only ${names(result.sequence)} can finish)` : ''}. The system might deadlock.`,
  };
}

export type RequestVerdict = 'granted' | 'exceeds-need' | 'must-wait' | 'unsafe';

export interface RequestResult {
  verdict: RequestVerdict;
  granted: boolean;
  reason: string;
  /** Safety check of the pretend state (only for the last check). */
  safety?: SafetyResult;
  /** The state after granting (only when granted). */
  next?: BankerState;
}

/** The resource-request algorithm: Request <= Need, Request <= Available, then pretend and check safety. */
export function requestResources(
  state: BankerState,
  process: number,
  request: Vector,
): RequestResult {
  const name = state.processes[process] ?? `P${process}`;
  const need = needMatrix(state.max, state.allocation)[process] ?? [];
  if (!leq(request, need)) {
    return {
      verdict: 'exceeds-need',
      granted: false,
      reason: `Error: ${name} asks for ${fmt(request)} but its remaining Need is only ${fmt(need)}. A process may not exceed its maximum claim.`,
    };
  }
  if (!leq(request, state.available)) {
    return {
      verdict: 'must-wait',
      granted: false,
      reason: `${name} must wait: ${fmt(request)} is not ≤ Available ${fmt(state.available)}.`,
    };
  }
  const pretend: BankerState = {
    ...state,
    available: sub(state.available, request),
    allocation: state.allocation.map((row, i) => (i === process ? add(row, request) : [...row])),
  };
  const check = safety(pretend);
  if (!check.safe) {
    return {
      verdict: 'unsafe',
      granted: false,
      safety: check,
      reason: `Denied: granting ${fmt(request)} to ${name} would leave the system in an UNSAFE state, so ${name} waits and the old state is restored.`,
    };
  }
  return {
    verdict: 'granted',
    granted: true,
    safety: check,
    next: pretend,
    reason: `Granted: after giving ${fmt(request)} to ${name} the state is still SAFE (<${check.sequence.map((i) => pretend.processes[i]).join(', ')}>).`,
  };
}

export function emptyMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}
