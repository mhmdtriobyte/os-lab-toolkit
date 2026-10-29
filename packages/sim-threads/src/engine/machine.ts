import { pseudo, type Instr, type Operand, type ThreadsProgram } from './asm';

export type ThreadStatus = 'active' | 'cv-wait' | 'reacquire' | 'done' | 'error';

export interface ThreadState {
  pc: number;
  regs: Record<string, number>;
  status: ThreadStatus;
  /** Mutex to re-acquire after a condition wait. */
  mutex: string | null;
  error: string | null;
}

export interface World {
  shared: Record<string, number>;
  /** Owner (thread index) of each mutex, or null when free. */
  mutexes: Record<string, number | null>;
  semaphores: Record<string, number>;
  /** Threads waiting on each condition variable, in FIFO order. */
  conditions: Record<string, number[]>;
  threads: ThreadState[];
}

export function initialWorld(p: ThreadsProgram): World {
  return {
    shared: { ...p.shared },
    mutexes: Object.fromEntries(p.mutexes.map((m) => [m, null])),
    semaphores: { ...p.semaphores },
    conditions: Object.fromEntries(p.conditions.map((c) => [c, []])),
    threads: p.threads.map((t) => ({
      pc: 0,
      regs: {},
      status: t.instrs.length === 0 ? 'done' : 'active',
      mutex: null,
      error: null,
    })),
  };
}

function current(p: ThreadsProgram, w: World, t: number): Instr | undefined {
  return p.threads[t]?.instrs[w.threads[t]?.pc ?? 0];
}

/** Why a thread cannot run right now, or null if it can. */
export function blockedReason(p: ThreadsProgram, w: World, t: number): string | null {
  const th = w.threads[t] as ThreadState;
  if (th.status === 'done' || th.status === 'error')
    return th.status === 'done' ? 'finished' : 'crashed';
  if (th.status === 'cv-wait') return `waiting on a condition variable`;
  const owner = (m: string) => w.mutexes[m];
  if (th.status === 'reacquire') {
    return owner(th.mutex as string) === null
      ? null
      : `re-acquiring ${th.mutex} (held by ${p.threads[owner(th.mutex as string) as number]?.name})`;
  }
  const i = current(p, w, t);
  if (i?.op === 'LOCK' && owner(i.mutex) !== null) {
    const holder = owner(i.mutex) === t ? 'itself' : p.threads[owner(i.mutex) as number]?.name;
    return `blocked on lock(${i.mutex}), held by ${holder}`;
  }
  if (i?.op === 'WAIT' && (w.semaphores[i.sem] ?? 0) <= 0)
    return `blocked on sem_wait(${i.sem}) (value 0)`;
  return null;
}

export function enabled(p: ThreadsProgram, w: World): number[] {
  return w.threads.flatMap((_, t) => (blockedReason(p, w, t) === null ? [t] : []));
}

export interface StepOutcome {
  world: World;
  /** What happened, for the step label. */
  text: string;
  /** Text printed by PRINT (with a trailing newline). */
  emit: string;
  /** Index of the instruction that ran (null when re-acquiring after a condition wait). */
  instr: number | null;
}

/** Executes one atomic instruction of thread t (which must be enabled). */
export function stepThread(p: ThreadsProgram, w: World, t: number): StepOutcome {
  const prog = p.threads[t];
  const old = w.threads[t];
  if (!prog || !old) throw new Error(`no thread ${t}`);
  const th: ThreadState = { ...old, regs: { ...old.regs } };
  const next: World = { ...w, threads: w.threads.map((x, i) => (i === t ? th : x)) };
  const name = prog.name;

  if (th.status === 'reacquire') {
    next.mutexes = { ...w.mutexes, [th.mutex as string]: t };
    const text = `${name} wakes up and re-acquires ${th.mutex}`;
    th.status = 'active';
    th.mutex = null;
    return { world: finish(prog.instrs.length, th, next), text, emit: '', instr: null };
  }

  const pc = th.pc;
  const instr = prog.instrs[pc] as Instr;
  const val = (o: Operand) => (o.kind === 'imm' ? o.value : (th.regs[o.name] ?? 0));
  let emit = '';
  let text = `${name}: ${pseudo(instr)}`;
  th.pc = pc + 1;
  switch (instr.op) {
    case 'LOAD':
      th.regs[instr.reg] = w.shared[instr.shared] ?? 0;
      text += `  (${instr.reg} = ${th.regs[instr.reg]})`;
      break;
    case 'STORE':
      next.shared = { ...w.shared, [instr.shared]: val(instr.src) };
      text += `  (${instr.shared} is now ${val(instr.src)})`;
      break;
    case 'MOV':
      th.regs[instr.reg] = val(instr.src);
      break;
    case 'ADD':
      th.regs[instr.reg] = (th.regs[instr.reg] ?? 0) + val(instr.src);
      text += `  (${instr.reg} = ${th.regs[instr.reg]})`;
      break;
    case 'SUB':
      th.regs[instr.reg] = (th.regs[instr.reg] ?? 0) - val(instr.src);
      text += `  (${instr.reg} = ${th.regs[instr.reg]})`;
      break;
    case 'JMP':
      th.pc = instr.target;
      break;
    case 'JZ':
    case 'JNZ': {
      const zero = (th.regs[instr.reg] ?? 0) === 0;
      if (zero === (instr.op === 'JZ')) th.pc = instr.target;
      text += th.pc === instr.target ? '  (jump)' : '  (no jump)';
      break;
    }
    case 'LOCK':
      next.mutexes = { ...w.mutexes, [instr.mutex]: t };
      break;
    case 'UNLOCK':
      if (w.mutexes[instr.mutex] !== t) {
        th.status = 'error';
        th.error = `${name} called unlock(${instr.mutex}) without holding it.`;
        return { world: next, text: th.error, emit, instr: pc };
      }
      next.mutexes = { ...w.mutexes, [instr.mutex]: null };
      break;
    case 'WAIT':
      next.semaphores = { ...w.semaphores, [instr.sem]: (w.semaphores[instr.sem] ?? 0) - 1 };
      text += `  (${instr.sem} = ${next.semaphores[instr.sem]})`;
      break;
    case 'SIGNAL':
      next.semaphores = { ...w.semaphores, [instr.sem]: (w.semaphores[instr.sem] ?? 0) + 1 };
      text += `  (${instr.sem} = ${next.semaphores[instr.sem]})`;
      break;
    case 'CWAIT':
      if (w.mutexes[instr.mutex] !== t) {
        th.status = 'error';
        th.error = `${name} called cond_wait(${instr.cond}, ${instr.mutex}) without holding ${instr.mutex}.`;
        return { world: next, text: th.error, emit, instr: pc };
      }
      next.mutexes = { ...w.mutexes, [instr.mutex]: null };
      next.conditions = { ...w.conditions, [instr.cond]: [...(w.conditions[instr.cond] ?? []), t] };
      th.status = 'cv-wait';
      th.mutex = instr.mutex;
      text += `  (releases ${instr.mutex} and sleeps)`;
      break;
    case 'CSIGNAL':
    case 'CBROADCAST': {
      const waiters = w.conditions[instr.cond] ?? [];
      const woken = instr.op === 'CSIGNAL' ? waiters.slice(0, 1) : waiters;
      next.conditions = { ...w.conditions, [instr.cond]: waiters.slice(woken.length) };
      next.threads = next.threads.map((x, i) =>
        woken.includes(i) ? { ...x, status: 'reacquire' } : x,
      );
      text += woken.length
        ? `  (wakes ${woken.map((i) => p.threads[i]?.name).join(', ')})`
        : '  (nobody is waiting)';
      break;
    }
    case 'PRINT':
      emit = `${instr.text}\n`;
      break;
  }
  return { world: finish(prog.instrs.length, th, next), text, emit, instr: pc };
}

function finish(length: number, th: ThreadState, w: World): World {
  if (th.status === 'active' && th.pc >= length) th.status = 'done';
  return w;
}

/** Final shared values, or a deadlock / error description, for a state where nothing can run. */
export function describeEnd(p: ThreadsProgram, w: World): string {
  const errors = w.threads.flatMap((t) => (t.error ? [t.error] : []));
  if (errors.length) return `ERROR: ${errors.join(' ')}`;
  const stuck = w.threads.flatMap((t, i) =>
    t.status === 'done' ? [] : [`${p.threads[i]?.name} ${blockedReason(p, w, i)}`],
  );
  if (stuck.length) return `DEADLOCK: ${stuck.join('; ')}`;
  const values = Object.entries(w.shared).map(([k, v]) => `${k} = ${v}`);
  return values.length ? `final: ${values.join(', ')}` : 'all threads finished';
}

/** Canonical key of the whole state (used to memoise the explorer). */
export function worldKey(w: World): string {
  return JSON.stringify([
    w.shared,
    w.mutexes,
    w.semaphores,
    w.conditions,
    w.threads.map((t) => [t.pc, Object.entries(t.regs).sort(), t.status, t.mutex]),
  ]);
}
