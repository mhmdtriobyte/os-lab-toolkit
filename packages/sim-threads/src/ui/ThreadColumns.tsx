import { cx, seriesColor } from '@oslab/core';
import { blockedReason, pseudo, type ThreadsProgram, type ThreadSnapshot } from '../engine';

/** One column per thread: its instructions as pseudo-code, with the program counter. */
export function ThreadColumns({
  program,
  snap,
}: {
  program: ThreadsProgram;
  snap: ThreadSnapshot;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${program.threads.length}, minmax(12rem, 1fr))` }}
    >
      {program.threads.map((t, ti) => {
        const th = snap.world.threads[ti];
        const reason = blockedReason(program, snap.world, ti);
        const status =
          th?.status === 'done'
            ? 'finished'
            : th?.status === 'error'
              ? 'crashed'
              : reason
                ? `⏸ ${reason}`
                : snap.ran === ti
                  ? '▶ just ran'
                  : 'ready';
        return (
          <div
            key={t.name}
            className="min-w-0 rounded-md border-2 p-2"
            style={{ borderColor: seriesColor(ti) }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: seriesColor(ti) }}>
                {t.name}
              </span>
              <span
                className={cx(
                  'rounded px-1.5 text-xs font-medium',
                  reason && th?.status !== 'done'
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                )}
              >
                {status}
              </span>
            </div>
            <ol className="font-mono text-xs">
              {t.instrs.map((instr, i) => {
                const atPc = th?.pc === i && th.status !== 'done';
                const justRan = snap.ran === ti && snap.instr === i;
                return (
                  <li
                    key={i}
                    className={cx(
                      'flex gap-1 rounded px-1 py-0.5',
                      justRan && 'bg-emerald-100 dark:bg-emerald-900/60',
                      atPc && !justRan && 'bg-sky-100 dark:bg-sky-900/60',
                    )}
                  >
                    <span className="w-3 shrink-0" aria-hidden>
                      {atPc ? '→' : ''}
                    </span>
                    <span className="truncate" title={pseudo(instr)}>
                      {pseudo(instr)}
                    </span>
                  </li>
                );
              })}
            </ol>
            {th && Object.keys(th.regs).length > 0 && (
              <p className="mt-1 border-t border-slate-200 pt-1 font-mono text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {Object.entries(th.regs)
                  .map(([k, v]) => `${k}=${v}`)
                  .join('  ')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
