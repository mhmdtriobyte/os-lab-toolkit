import type { Policy } from '../engine';

export type Mode = 'deterministic' | 'exhaustive' | 'manual';

/** Everything that goes into a shareable link for this module. */
export interface ForkInput {
  code: string;
  mode: Mode;
  policy: Policy;
  pidStart: number;
  /** fork() fails after this many successful forks (null: never). */
  forkLimit: number | null;
  maxStates: number;
}

export const DEFAULT_CODE = `#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    printf("Before the fork\\n");
    pid_t pid = fork();
    if (pid == 0) {
        printf("Child: my pid is %d, my parent is %d\\n", getpid(), getppid());
    } else {
        wait(NULL);
        printf("Parent: my child %d has finished\\n", pid);
    }
    return 0;
}
`;

export const DEFAULT_INPUT: ForkInput = {
  code: DEFAULT_CODE,
  mode: 'deterministic',
  policy: 'parent-first',
  pidStart: 1000,
  forkLimit: null,
  maxStates: 50_000,
};

const MODES: Mode[] = ['deterministic', 'exhaustive', 'manual'];
const POLICIES: Policy[] = ['parent-first', 'child-first', 'round-robin'];

function int(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.trunc(v)))
    : fallback;
}

/** Validates untrusted input from a link, an example or an imported file. */
export function sanitizeInput(raw: unknown): ForkInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string') return null;
  return {
    code: r.code,
    mode: MODES.includes(r.mode as Mode) ? (r.mode as Mode) : DEFAULT_INPUT.mode,
    policy: POLICIES.includes(r.policy as Policy) ? (r.policy as Policy) : DEFAULT_INPUT.policy,
    pidStart: int(r.pidStart, DEFAULT_INPUT.pidStart, 3, 99_999),
    forkLimit:
      r.forkLimit === null || r.forkLimit === undefined ? null : int(r.forkLimit, 1, 0, 1000),
    maxStates: int(r.maxStates, DEFAULT_INPUT.maxStates, 100, 500_000),
  };
}
