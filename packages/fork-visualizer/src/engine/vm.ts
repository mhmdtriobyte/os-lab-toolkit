import type { Instr, Program, Slot } from './bytecode';
import { binaryOp } from './intmath';
import { formatPrintf } from './printf';

/**
 * `ready` processes can be scheduled. Which one ran last is tracked by the scheduler and shown as
 * "running" in the UI.
 */
export type ProcState = 'ready' | 'sleeping' | 'waiting' | 'zombie' | 'terminated';

export interface Ref {
  ref: Slot;
}

export type Value = number | string | Ref;

export interface Frame {
  fn: number;
  slots: number[];
  /** Return address. */
  ret: number;
}

export interface Process {
  pid: number;
  ppid: number;
  /** Pid of the process that forked this one (unlike ppid, it never changes). */
  creator: number;
  kind: 'init' | 'shell' | 'user';
  name: string;
  state: ProcState;
  pc: number;
  frames: Frame[];
  stack: Value[];
  globals: number[];
  /** Virtual time at which a sleeping process wakes up. */
  wakeAt: number | null;
  /** Pid a waiting process waits for (-1: any child). */
  waitFor: number | null;
  exitCode: number | null;
  /** Signal that terminated the process, if any (SIGKILL, SIGFPE, ...). */
  signal: string | null;
  /** True once the process has been re-parented to init. */
  orphaned: boolean;
  /** Line of the last statement this process started. */
  line: number;
  /** Explanation of a runtime error that killed the process. */
  error: string | null;
}

export interface OutChunk {
  pid: number;
  text: string;
}

export interface VmConfig {
  /** Pid of the program's first process. init is 1, the shell is pidStart - 1. */
  pidStart: number;
  /** After this many successful forks, fork() returns -1 (null: never fails). */
  forkLimit: number | null;
}

export interface System {
  procs: readonly Process[];
  clock: number;
  nextPid: number;
  forks: number;
  stdout: readonly OutChunk[];
}

export type ForkEvent =
  | { k: 'exec'; pid: number; line: number }
  | { k: 'fork'; pid: number; child: number }
  | { k: 'fork-fail'; pid: number }
  | { k: 'print'; pid: number; text: string }
  | { k: 'exit'; pid: number; code: number | null; signal: string | null }
  | { k: 'zombie'; pid: number }
  | { k: 'reap'; pid: number; by: number; byName: string }
  | { k: 'orphan'; pid: number; oldPpid: number }
  | { k: 'sleep'; pid: number; until: number }
  | { k: 'wake'; pid: number }
  | { k: 'block'; pid: number; waitFor: number }
  | { k: 'clock'; time: number }
  | { k: 'kill'; pid: number; by: number | null; signal: string }
  | { k: 'error'; pid: number; message: string };

export interface StepResult {
  sys: System;
  events: ForkEvent[];
  /** Text printed during the step. */
  emit: string;
}

const MAX_INSTRUCTIONS_PER_STEP = 100_000;
const MAX_CALL_DEPTH = 256;

const SIGNALS: Record<number, string> = {
  2: 'SIGINT',
  8: 'SIGFPE',
  9: 'SIGKILL',
  11: 'SIGSEGV',
  15: 'SIGTERM',
};
const SIGNAL_NUMBERS: Record<string, number> = {
  SIGINT: 2,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGTERM: 15,
};

export function signalName(sig: number): string {
  return SIGNALS[sig] ?? `signal ${sig}`;
}

export const DEFAULT_CONFIG: VmConfig = { pidStart: 1000, forkLimit: null };

export function shellPid(config: VmConfig): number {
  return config.pidStart - 1;
}

function blankProcess(pid: number, ppid: number, kind: Process['kind'], name: string): Process {
  return {
    pid,
    ppid,
    creator: ppid,
    kind,
    name,
    state: 'waiting',
    pc: 0,
    frames: [],
    stack: [],
    globals: [],
    wakeAt: null,
    waitFor: -1,
    exitCode: null,
    signal: null,
    orphaned: false,
    line: 0,
    error: null,
  };
}

/** Initial system: init (PID 1), a shell, and the program about to run its first statement. */
export function boot(program: Program, config: VmConfig = DEFAULT_CONFIG): System {
  const main = program.functions[program.main];
  if (!main) throw new Error('program has no main');
  const shell = shellPid(config);
  const proc: Process = {
    ...blankProcess(config.pidStart, shell, 'user', 'a.out'),
    state: 'ready',
    waitFor: null,
    pc: main.entry,
    frames: [{ fn: program.main, slots: new Array<number>(main.locals).fill(0), ret: 0 }],
    globals: [...program.globalInit],
    line: firstLine(program, main.entry),
  };
  return {
    procs: [blankProcess(1, 0, 'init', 'init'), blankProcess(shell, 1, 'shell', 'bash'), proc],
    clock: 0,
    nextPid: config.pidStart + 1,
    forks: 0,
    stdout: [],
  };
}

function firstLine(program: Program, pc: number): number {
  for (let i = pc; i < program.code.length; i++) {
    const instr = program.code[i];
    if (instr?.op === 'stmt') return instr.line;
  }
  return 0;
}

/** Line a process will execute next (the line of the statement it is in). */
export function nextLine(program: Program, p: Process): number {
  const instr = program.code[p.pc];
  return instr?.op === 'stmt' ? instr.line : p.line;
}

export function findProc(sys: System, pid: number): Process | undefined {
  return sys.procs.find((p) => p.pid === pid);
}

export function isAlive(p: Process): boolean {
  return p.state !== 'zombie' && p.state !== 'terminated';
}

/** Pids of user processes that can run now. */
export function runnable(sys: System): number[] {
  return sys.procs.filter((p) => p.kind === 'user' && p.state === 'ready').map((p) => p.pid);
}

function cloneProc(p: Process): Process {
  return {
    ...p,
    frames: p.frames.map((f) => ({ ...f, slots: f.slots.slice() })),
    stack: p.stack.slice(),
    globals: p.globals.slice(),
  };
}

/** Copy-on-write view of a system while one step is applied. */
class Mutation {
  procs: Process[];
  private cloned = new Set<number>();
  events: ForkEvent[] = [];
  stdout: OutChunk[] | null = null;
  emit = '';
  clock: number;
  nextPid: number;
  forks: number;

  constructor(
    private readonly base: System,
    readonly config: VmConfig,
  ) {
    this.procs = base.procs.slice();
    this.clock = base.clock;
    this.nextPid = base.nextPid;
    this.forks = base.forks;
  }

  get(pid: number): Process | undefined {
    return this.procs.find((p) => p.pid === pid);
  }

  mut(pid: number): Process {
    const i = this.procs.findIndex((p) => p.pid === pid);
    if (i < 0) throw new Error(`no process ${pid}`);
    if (!this.cloned.has(pid)) {
      this.procs[i] = cloneProc(this.procs[i] as Process);
      this.cloned.add(pid);
    }
    return this.procs[i] as Process;
  }

  add(p: Process) {
    this.procs.push(p);
    this.cloned.add(p.pid);
  }

  print(pid: number, text: string) {
    if (!text) return;
    this.stdout ??= this.base.stdout.slice();
    this.stdout.push({ pid, text });
    this.emit += text;
    this.events.push({ k: 'print', pid, text });
  }

  /** Terminates a process: zombie (or reaped), children re-parented to init, parent woken. */
  terminate(pid: number, code: number | null, signal: string | null) {
    const t = this.mut(pid);
    t.state = 'zombie';
    t.exitCode = code;
    t.signal = signal;
    t.frames = [];
    t.stack = [];
    t.wakeAt = null;
    t.waitFor = null;
    this.events.push({ k: 'exit', pid, code, signal });
    for (const child of this.procs.filter((c) => c.ppid === pid && c.state !== 'terminated')) {
      const c = this.mut(child.pid);
      c.ppid = 1;
      c.orphaned = true;
      this.events.push({ k: 'orphan', pid: c.pid, oldPpid: pid });
      if (c.state === 'zombie') {
        c.state = 'terminated';
        this.events.push({ k: 'reap', pid: c.pid, by: 1, byName: 'init (PID 1)' });
      }
    }
    const parent = this.get(t.ppid);
    if (!parent || parent.kind !== 'user') {
      // init and the shell are always waiting, so they reap at once.
      t.state = 'terminated';
      this.events.push({
        k: 'reap',
        pid,
        by: t.ppid,
        byName: parent ? `${parent.name} (PID ${parent.pid})` : 'init (PID 1)',
      });
      return;
    }
    this.events.push({ k: 'zombie', pid });
    if (parent.state === 'waiting' && (parent.waitFor === -1 || parent.waitFor === pid)) {
      const pp = this.mut(parent.pid);
      pp.state = 'ready';
      pp.waitFor = null;
      this.events.push({ k: 'wake', pid: pp.pid });
    }
  }

  finish(): StepResult {
    return {
      sys: {
        procs: this.procs,
        clock: this.clock,
        nextPid: this.nextPid,
        forks: this.forks,
        stdout: this.stdout ?? this.base.stdout,
      },
      events: this.events,
      emit: this.emit,
    };
  }
}

function num(v: Value | undefined): number {
  return typeof v === 'number' ? v : 0;
}

function crash(m: Mutation, p: Process, signal: string, message: string) {
  p.error = message;
  m.events.push({ k: 'error', pid: p.pid, message });
  m.terminate(p.pid, null, signal);
}

/** Runs one atomic step (one statement) of process `pid`. */
export function step(
  program: Program,
  sys: System,
  pid: number,
  config: VmConfig = DEFAULT_CONFIG,
): StepResult {
  const m = new Mutation(sys, config);
  const p = m.mut(pid);
  if (p.kind !== 'user' || p.state !== 'ready') throw new Error(`process ${pid} is not ready`);
  let executed = 0;
  while (p.state === 'ready') {
    const instr = program.code[p.pc] as Instr;
    if (executed > 0 && instr.op === 'stmt') break;
    if (++executed > MAX_INSTRUCTIONS_PER_STEP) {
      crash(m, p, 'SIGKILL', 'Killed: one statement ran for too long.');
      break;
    }
    exec(program, m, p, instr);
  }
  return m.finish();
}

function exec(program: Program, m: Mutation, p: Process, instr: Instr) {
  const frame = p.frames[p.frames.length - 1] as Frame;
  const read = (s: Slot) => (s.global ? p.globals[s.index] : frame.slots[s.index]) ?? 0;
  const write = (s: Slot, v: number) => {
    if (s.global) p.globals[s.index] = v;
    else frame.slots[s.index] = v;
  };
  switch (instr.op) {
    case 'stmt':
      p.line = instr.line;
      m.events.push({ k: 'exec', pid: p.pid, line: instr.line });
      break;
    case 'push':
      p.stack.push(instr.value);
      break;
    case 'str':
      p.stack.push(instr.value);
      break;
    case 'load':
      p.stack.push(read(instr.slot));
      break;
    case 'store':
      write(instr.slot, num(p.stack[p.stack.length - 1]));
      break;
    case 'ref':
      p.stack.push({ ref: instr.slot });
      break;
    case 'pop':
      p.stack.pop();
      break;
    case 'bin': {
      const b = num(p.stack.pop());
      const a = num(p.stack.pop());
      const r = binaryOp(instr.o, a, b);
      if (r === null) return crash(m, p, 'SIGFPE', 'Floating point exception: division by zero.');
      p.stack.push(r);
      break;
    }
    case 'neg':
      p.stack.push(-num(p.stack.pop()) | 0);
      break;
    case 'not':
      p.stack.push(Number(num(p.stack.pop()) === 0));
      break;
    case 'bnot':
      p.stack.push(~num(p.stack.pop()));
      break;
    case 'jmp':
      p.pc = instr.to;
      return;
    case 'jz':
      if (num(p.stack.pop()) === 0) {
        p.pc = instr.to;
        return;
      }
      break;
    case 'jnz':
      if (num(p.stack.pop()) !== 0) {
        p.pc = instr.to;
        return;
      }
      break;
    case 'call': {
      const fn = program.functions[instr.fn];
      if (!fn) throw new Error('bad function');
      if (p.frames.length >= MAX_CALL_DEPTH) {
        return crash(
          m,
          p,
          'SIGSEGV',
          'Segmentation fault: too many nested calls (stack overflow).',
        );
      }
      const args = p.stack.splice(p.stack.length - instr.argc, instr.argc).map(num);
      const slots = new Array<number>(fn.locals).fill(0);
      args.forEach((a, i) => (slots[i] = a));
      p.frames.push({ fn: instr.fn, slots, ret: p.pc + 1 });
      p.pc = fn.entry;
      return;
    }
    case 'ret': {
      const value = p.stack.pop() ?? 0;
      const done = p.frames.pop() as Frame;
      p.pc = done.ret;
      p.stack.push(value);
      return;
    }
    case 'halt':
      return m.terminate(p.pid, num(p.stack.pop()) & 0xff, null);
    case 'sys':
      return sysCall(m, p, instr);
  }
  p.pc++;
}

function sysCall(m: Mutation, p: Process, instr: Instr & { op: 'sys' }) {
  const args = p.stack.slice(p.stack.length - instr.argc);
  const done = (result: number) => {
    p.stack.length -= instr.argc;
    p.stack.push(result);
    p.pc++;
  };
  switch (instr.name) {
    case 'printf': {
      const text = formatPrintf(instr.format ?? '', args as (number | string)[]);
      m.print(p.pid, text);
      return done(text.length);
    }
    case 'fork': {
      if (m.config.forkLimit !== null && m.forks >= m.config.forkLimit) {
        m.events.push({ k: 'fork-fail', pid: p.pid });
        return done(-1);
      }
      const childPid = m.nextPid++;
      m.forks++;
      const child = cloneProc(p);
      child.pid = childPid;
      child.ppid = p.pid;
      child.creator = p.pid;
      child.orphaned = false;
      child.stack.push(0);
      child.pc++;
      m.add(child);
      m.events.push({ k: 'fork', pid: p.pid, child: childPid });
      return done(childPid);
    }
    case 'getpid':
      return done(p.pid);
    case 'getppid':
      return done(p.ppid);
    case 'wait':
    case 'waitpid': {
      const target = instr.name === 'wait' ? -1 : num(args[0]);
      const status = instr.name === 'wait' ? args[0] : args[1];
      const options = instr.name === 'waitpid' ? num(args[2]) : 0;
      const children = m.procs.filter(
        (c) => c.ppid === p.pid && c.state !== 'terminated' && (target <= 0 || c.pid === target),
      );
      if (children.length === 0) return done(-1);
      const zombie = children.find((c) => c.state === 'zombie');
      if (zombie) {
        m.mut(zombie.pid).state = 'terminated';
        m.events.push({ k: 'reap', pid: zombie.pid, by: p.pid, byName: `P${p.pid}` });
        if (status && typeof status === 'object') {
          const code = zombie.signal
            ? (SIGNAL_NUMBERS[zombie.signal] ?? 9)
            : ((zombie.exitCode ?? 0) & 0xff) << 8;
          const frame = p.frames[p.frames.length - 1] as Frame;
          if (status.ref.global) p.globals[status.ref.index] = code;
          else frame.slots[status.ref.index] = code;
        }
        return done(zombie.pid);
      }
      if (options & 1) return done(0); // WNOHANG
      p.state = 'waiting';
      p.waitFor = target > 0 ? target : -1;
      m.events.push({ k: 'block', pid: p.pid, waitFor: p.waitFor });
      return; // the call is retried when a child terminates
    }
    case 'sleep': {
      const n = num(args[0]);
      done(0);
      if (n > 0) {
        p.state = 'sleeping';
        p.wakeAt = m.clock + n;
        m.events.push({ k: 'sleep', pid: p.pid, until: p.wakeAt });
      }
      return;
    }
    case 'exit':
      return m.terminate(p.pid, num(args[0]) & 0xff, null);
    case 'kill': {
      const target = m.get(num(args[0]));
      const sig = num(args[1]);
      if (!target || !isAlive(target) || target.kind !== 'user') return done(-1);
      done(0);
      if (sig !== 0) {
        m.events.push({ k: 'kill', pid: target.pid, by: p.pid, signal: signalName(sig) });
        m.terminate(target.pid, null, signalName(sig));
      }
      return;
    }
    case 'fflush':
      return done(0);
    case 'WEXITSTATUS':
      return done((num(args[0]) >> 8) & 0xff);
    case 'WIFEXITED':
      return done(Number((num(args[0]) & 0x7f) === 0));
    case 'abs':
      return done(Math.abs(num(args[0])) | 0);
  }
}

/** Terminates a process from outside the program, like `kill -9 <pid>` in a terminal. */
export function killProcess(
  sys: System,
  pid: number,
  config: VmConfig = DEFAULT_CONFIG,
): StepResult {
  const m = new Mutation(sys, config);
  const target = m.get(pid);
  if (!target || !isAlive(target) || target.kind !== 'user') return m.finish();
  m.events.push({ k: 'kill', pid, by: null, signal: 'SIGKILL' });
  m.terminate(pid, null, 'SIGKILL');
  return m.finish();
}

/**
 * When no process is ready but some sleep, virtual time jumps to the earliest wake-up.
 * Returns null when the clock does not need to move.
 */
export function advanceClock(sys: System, config: VmConfig = DEFAULT_CONFIG): StepResult | null {
  if (runnable(sys).length > 0) return null;
  const sleepers = sys.procs.filter((p) => p.state === 'sleeping' && p.wakeAt !== null);
  if (sleepers.length === 0) return null;
  const m = new Mutation(sys, config);
  m.clock = Math.min(...sleepers.map((p) => p.wakeAt as number));
  m.events.push({ k: 'clock', time: m.clock });
  for (const s of sleepers) {
    if ((s.wakeAt as number) <= m.clock) {
      const w = m.mut(s.pid);
      w.state = 'ready';
      w.wakeAt = null;
      m.events.push({ k: 'wake', pid: w.pid });
    }
  }
  return m.finish();
}

/** Canonical key of everything that affects the future (not the output printed so far). */
export function stateKey(sys: System): string {
  return JSON.stringify([
    sys.clock,
    sys.nextPid,
    sys.forks,
    sys.procs.map((p) => [
      p.pid,
      p.ppid,
      p.state,
      p.pc,
      p.frames,
      p.stack,
      p.globals,
      p.wakeAt,
      p.waitFor,
      p.exitCode,
      p.signal,
    ]),
  ]);
}
