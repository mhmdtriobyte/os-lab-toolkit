import { cx, seriesColor } from '@oslab/core';
import { blockedReason, pseudo, type ThreadsProgram, type ThreadStep } from '../engine';

const WINDOW = 40;

/** Timeline: one row per thread, one column per step; ⏸ marks a thread that is blocked. */
export function Swimlanes({
  program,
  steps,
  index,
  onSelect,
}: {
  program: ThreadsProgram;
  steps: readonly ThreadStep[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const from = Math.max(1, index - WINDOW);
  const to = Math.min(steps.length, index + WINDOW + 1);
  const columns = steps.slice(from, to).map((s, k) => ({ step: s, i: from + k }));
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-1 text-left dark:bg-slate-900">Step</th>
            {columns.map(({ i }) => (
              <th
                key={i}
                className={cx(
                  'px-1 font-normal tabular-nums',
                  i === index && 'font-bold text-indigo-600 dark:text-indigo-300',
                )}
              >
                {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {program.threads.map((t, ti) => (
            <tr key={t.name}>
              <th
                className="sticky left-0 bg-white px-1 text-left dark:bg-slate-900"
                style={{ color: seriesColor(ti) }}
              >
                {t.name}
              </th>
              {columns.map(({ step, i }) => {
                const ran = step.state.ran === ti;
                const instr = step.state.instr;
                const prev = steps[i - 1]?.state.world;
                const blocked =
                  !ran &&
                  prev &&
                  prev.threads[ti]?.status !== 'done' &&
                  blockedReason(program, prev, ti) !== null;
                return (
                  <td key={i} className="p-0">
                    <button
                      type="button"
                      onClick={() => onSelect(i)}
                      title={
                        ran
                          ? step.label
                          : blocked && prev
                            ? `${t.name} ${blockedReason(program, prev, ti)}`
                            : undefined
                      }
                      className={cx(
                        'block h-7 w-24 truncate rounded px-1 text-left font-mono',
                        ran ? 'text-white' : 'text-slate-500',
                        i === index && 'ring-2 ring-indigo-500',
                        !ran && 'bg-slate-100 dark:bg-slate-800',
                      )}
                      style={ran ? { background: seriesColor(ti) } : undefined}
                    >
                      {ran
                        ? instr === null
                          ? 're-lock'
                          : t.instrs[instr]
                            ? pseudo(t.instrs[instr])
                            : ''
                        : blocked
                          ? '⏸'
                          : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {steps.length > WINDOW * 2 && (
        <p className="mt-1 text-xs text-slate-500">
          Showing steps {from}–{to - 1} around the current step.
        </p>
      )}
    </div>
  );
}
