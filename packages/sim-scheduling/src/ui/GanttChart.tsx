import { seriesColor } from '@oslab/core';
import type { ProcessSpec, Segment } from '../engine';

export const procColor = seriesColor;

/**
 * Gantt chart with idle gaps. `upTo` (exclusive time) reveals the chart progressively for the
 * step player; pass the makespan to show everything.
 */
export function GanttChart({
  segments,
  processes,
  makespan,
  upTo = makespan,
  compact = false,
}: {
  segments: readonly Segment[];
  processes: readonly ProcessSpec[];
  makespan: number;
  upTo?: number;
  compact?: boolean;
}) {
  const pct = (t: number) => `${(t / makespan) * 100}%`;
  const boundaries = [...new Set(segments.flatMap((s) => [s.start, s.end]))];
  return (
    <div
      className="w-full"
      role="img"
      aria-label={`Gantt chart: ${segments.map((s) => `${s.proc === null ? 'idle' : processes[s.proc]?.name} ${s.start} to ${s.end}`).join(', ')}`}
    >
      <div
        className={`relative w-full overflow-hidden rounded border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 ${compact ? 'h-7' : 'h-12'}`}
      >
        {segments.map((s) => {
          const end = Math.min(s.end, upTo);
          if (end <= s.start) return null;
          return (
            <div
              key={s.start}
              className="absolute top-0 flex h-full items-center justify-center overflow-hidden border-r border-white/70 text-xs font-semibold text-white transition-[width] duration-300 dark:border-slate-900/70"
              style={{
                left: pct(s.start),
                width: pct(end - s.start),
                background:
                  s.proc === null
                    ? 'repeating-linear-gradient(45deg, #94a3b8 0 4px, #cbd5e1 4px 8px)'
                    : procColor(s.proc),
              }}
              title={`${s.proc === null ? 'idle' : processes[s.proc]?.name}: ${s.start}–${s.end}`}
            >
              <span className={s.proc === null ? 'text-slate-700' : ''}>
                {s.proc === null ? 'idle' : processes[s.proc]?.name}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative h-5 w-full text-[0.7rem] tabular-nums text-slate-600 dark:text-slate-300">
        {boundaries.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
