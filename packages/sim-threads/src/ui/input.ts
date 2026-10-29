export type ThreadMode = 'random' | 'manual' | 'exhaustive';

export interface ThreadsInput {
  code: string;
  mode: ThreadMode;
  /** Seed of the random scheduler, so a shared link replays the same run. */
  seed: number;
  maxStates: number;
}

export const DEFAULT_CODE = `# counter++ is really three instructions: load, add, store.
shared counter = 0

thread A
  LOAD r, counter
  ADD r, 1
  STORE counter, r

thread B
  LOAD r, counter
  ADD r, 1
  STORE counter, r
`;

export const DEFAULT_INPUT: ThreadsInput = {
  code: DEFAULT_CODE,
  mode: 'exhaustive',
  seed: 1,
  maxStates: 50_000,
};

const MODES: ThreadMode[] = ['random', 'manual', 'exhaustive'];

const int = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.trunc(v)))
    : fallback;

export function sanitizeInput(raw: unknown): ThreadsInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string') return null;
  return {
    code: r.code,
    mode: MODES.includes(r.mode as ThreadMode) ? (r.mode as ThreadMode) : DEFAULT_INPUT.mode,
    seed: int(r.seed, 1, 0, 1_000_000),
    maxStates: int(r.maxStates, DEFAULT_INPUT.maxStates, 100, 500_000),
  };
}
