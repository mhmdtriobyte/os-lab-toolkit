import type { Process } from '../engine';

/** Distinct colours for processes, assigned by pid order so they stay stable across steps. */
const PALETTE = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#65a30d',
  '#c026d3',
  '#4f46e5',
];

export function pidColor(pid: number, pidStart: number): string {
  const i = Math.max(0, pid - pidStart);
  return PALETTE[i % PALETTE.length] as string;
}

export type DisplayState = Process['state'] | 'running';

export const STATE_STYLES: Record<
  DisplayState,
  { label: string; stat: string; className: string }
> = {
  running: {
    label: 'running',
    stat: 'R',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  },
  ready: {
    label: 'ready',
    stat: 'R',
    className: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  },
  sleeping: {
    label: 'sleeping',
    stat: 'S',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  },
  waiting: {
    label: 'waiting',
    stat: 'S',
    className: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  },
  zombie: {
    label: 'zombie',
    stat: 'Z',
    className: 'bg-stone-300 text-stone-900 dark:bg-stone-600 dark:text-stone-50',
  },
  terminated: {
    label: 'terminated',
    stat: '-',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
};

export function displayState(p: Process, ran: number | null): DisplayState {
  return p.pid === ran && p.state === 'ready' ? 'running' : p.state;
}
