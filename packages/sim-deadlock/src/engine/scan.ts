import { add, fmt, leq, type Matrix, type Vector } from './vector';

/** One check of the safety / detection loop. */
export interface ScanStep {
  /** 1-based pass over the process list. */
  pass: number;
  process: number;
  /** Need (Banker) or Request (detection) row of `process`. */
  demand: number[];
  /** Work before this check. */
  work: number[];
  /** Whether demand <= work, so the process can finish and release its allocation. */
  canFinish: boolean;
  /** Finish vector after this check. */
  finish: boolean[];
  /** Work after this check. */
  workAfter: number[];
  note: string;
}

export interface ScanResult {
  steps: ScanStep[];
  /** Order in which processes were able to finish. */
  sequence: number[];
  finish: boolean[];
  /** Processes that can never finish. */
  stuck: number[];
}

/**
 * The loop shared by the Banker's safety algorithm and the deadlock detection algorithm:
 * scan processes in index order, repeatedly, until a whole pass makes no progress.
 * A process whose demand fits in Work finishes and returns its allocation to Work.
 */
export function scan(
  demand: Matrix,
  allocation: Matrix,
  available: Vector,
  initialFinish: readonly boolean[],
  names: readonly string[],
): ScanResult {
  const n = demand.length;
  let work = [...available];
  const finish = [...initialFinish];
  const steps: ScanStep[] = [];
  const sequence: number[] = [];
  for (let pass = 1, progress = true; progress; pass++) {
    progress = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      const d = [...(demand[i] ?? [])];
      const name = names[i] ?? `P${i}`;
      const before = work;
      const ok = leq(d, work);
      if (ok) {
        work = add(work, allocation[i] ?? []);
        finish[i] = true;
        sequence.push(i);
        progress = true;
      }
      steps.push({
        pass,
        process: i,
        demand: d,
        work: before,
        canFinish: ok,
        finish: [...finish],
        workAfter: work,
        note: ok
          ? `${name}: ${fmt(d)} ≤ Work ${fmt(before)}, so ${name} can finish and release ${fmt(allocation[i] ?? [])}. Work = ${fmt(work)}.`
          : `${name}: ${fmt(d)} is not ≤ Work ${fmt(before)}, so ${name} must wait.`,
      });
    }
  }
  const stuck = finish.flatMap((f, i) => (f ? [] : [i]));
  return { steps, sequence, finish, stuck };
}
