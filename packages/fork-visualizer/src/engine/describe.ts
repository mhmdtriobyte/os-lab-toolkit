import type { ForkEvent } from './vm';

const P = (pid: number) => `P${pid}`;

function quote(text: string): string {
  return JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text);
}

function describeEvent(e: ForkEvent): string {
  switch (e.k) {
    case 'exec':
      return `${P(e.pid)} runs line ${e.line}`;
    case 'fork':
      return `${P(e.pid)} forks child ${P(e.child)} (fork returns ${e.child} in the parent, 0 in the child)`;
    case 'fork-fail':
      return `fork() fails in ${P(e.pid)} and returns -1`;
    case 'print':
      return `${P(e.pid)} prints ${quote(e.text)}`;
    case 'exit':
      return e.signal
        ? `${P(e.pid)} is terminated by ${e.signal}`
        : `${P(e.pid)} exits with code ${e.code ?? 0}`;
    case 'zombie':
      return `${P(e.pid)} is a zombie until its parent calls wait()`;
    case 'reap':
      return `${e.byName} reaps ${P(e.pid)}`;
    case 'orphan':
      return `${P(e.pid)} is an orphan: its parent ${P(e.oldPpid)} is gone, so it is re-parented to init (PID 1)`;
    case 'sleep':
      return `${P(e.pid)} sleeps until t=${e.until}`;
    case 'wake':
      return `${P(e.pid)} becomes ready`;
    case 'block':
      return e.waitFor === -1
        ? `${P(e.pid)} blocks in wait() until a child terminates`
        : `${P(e.pid)} blocks in waitpid() until ${P(e.waitFor)} terminates`;
    case 'clock':
      return `No process is ready: the clock advances to t=${e.time}`;
    case 'kill':
      return e.by === null ? `kill -9 ${e.pid}` : `${P(e.by)} sends ${e.signal} to ${P(e.pid)}`;
    case 'error':
      return `${P(e.pid)}: ${e.message}`;
  }
}

/** One readable line for a step. */
export function describe(events: readonly ForkEvent[]): string {
  const exec = events.find((e) => e.k === 'exec');
  const others = events.filter((e) => e.k !== 'exec');
  if (others.length === 0) return exec ? (describeEvent(exec) as string) : '';
  // "runs line N" is noise when something more interesting happened on that line.
  return (exec ? `Line ${exec.line}: ` : '') + others.map(describeEvent).join(' · ');
}
