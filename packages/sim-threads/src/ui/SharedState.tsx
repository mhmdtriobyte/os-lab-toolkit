import type { ReactNode } from 'react';
import { Icon, tableClass } from '@oslab/core';
import type { ThreadsProgram, World } from '../engine';

/** Shared variables and synchronisation objects at the current step. */
export function SharedState({ program, world }: { program: ThreadsProgram; world: World }) {
  const name = (t: number | null | undefined) =>
    t === null || t === undefined ? 'free' : program.threads[t]?.name;
  const rows: [string, string, ReactNode][] = [
    ...Object.entries(world.shared).map(([k, v]): [string, string, ReactNode] => [
      k,
      'shared variable',
      String(v),
    ]),
    ...Object.entries(world.mutexes).map(([k, v]): [string, string, ReactNode] => [
      k,
      'mutex',
      v === null ? (
        <span className="inline-flex items-center gap-1">
          <Icon name="unlock" /> free
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <Icon name="lock" /> held by {name(v)}
        </span>
      ),
    ]),
    ...Object.entries(world.semaphores).map(([k, v]): [string, string, ReactNode] => [
      k,
      'semaphore',
      String(v),
    ]),
    ...Object.entries(world.conditions).map(([k, v]): [string, string, ReactNode] => [
      k,
      'condition',
      v.length ? `waiting: ${v.map(name).join(', ')}` : 'no waiters',
    ]),
  ];
  if (rows.length === 0)
    return <p className="text-sm italic text-slate-500">No shared state declared.</p>;
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Kind</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, kind, v]) => (
          <tr key={k}>
            <td className="font-mono font-semibold">{k}</td>
            <td className="text-slate-600 dark:text-slate-300">{kind}</td>
            <td className="font-mono">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
