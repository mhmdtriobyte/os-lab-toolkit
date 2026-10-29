import { Button, cx, tableClass } from '@oslab/core';
import type { ForkSnapshot } from '../engine';
import { displayState, STATE_STYLES } from './colors';

/** `ps -af`-style table of every process that still exists, with a kill button. */
export function PsTable({
  snapshot,
  onKill,
}: {
  snapshot: ForkSnapshot;
  onKill: ((pid: number) => void) | null;
}) {
  const { sys, ran } = snapshot;
  const rows = sys.procs.filter((p) => p.state !== 'terminated');
  return (
    <div className="overflow-auto">
      <p className="mb-1 font-mono text-xs text-slate-500 dark:text-slate-400">
        $ ps -af &nbsp; (virtual time t={sys.clock})
      </p>
      <table className={cx(tableClass, 'font-mono')}>
        <thead>
          <tr>
            <th>PID</th>
            <th>PPID</th>
            <th>STAT</th>
            <th>CMD</th>
            <th className="sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const state = displayState(p, ran);
            const style = STATE_STYLES[state];
            return (
              <tr key={p.pid}>
                <td>{p.pid}</td>
                <td className={cx(p.orphaned && 'font-bold text-rose-600 dark:text-rose-400')}>
                  {p.ppid}
                </td>
                <td>
                  <span className={cx('rounded px-1', style.className)} title={style.label}>
                    {style.stat} <span className="font-sans text-xs">{style.label}</span>
                  </span>
                </td>
                <td>
                  {p.kind === 'user'
                    ? p.state === 'zombie'
                      ? '[a.out] <defunct>'
                      : './a.out'
                    : p.kind === 'init'
                      ? '/sbin/init'
                      : '-bash'}
                </td>
                <td className="text-right">
                  {onKill && p.kind === 'user' && p.state !== 'zombie' && (
                    <Button
                      variant="danger"
                      className="!px-2 !py-0.5 text-xs"
                      onClick={() => onKill(p.pid)}
                      title={`kill -9 ${p.pid}`}
                    >
                      kill
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
