/** A tiny assembly for threads: every instruction is atomic. */
export type Instr =
  | { op: 'LOAD'; reg: string; shared: string }
  | { op: 'STORE'; shared: string; src: Operand }
  | { op: 'MOV' | 'ADD' | 'SUB'; reg: string; src: Operand }
  | { op: 'JMP'; target: number; label: string }
  | { op: 'JZ' | 'JNZ'; reg: string; target: number; label: string }
  | { op: 'LOCK' | 'UNLOCK'; mutex: string }
  | { op: 'WAIT' | 'SIGNAL'; sem: string }
  | { op: 'CWAIT'; cond: string; mutex: string }
  | { op: 'CSIGNAL' | 'CBROADCAST'; cond: string }
  | { op: 'PRINT'; text: string };

export type Operand = { kind: 'reg'; name: string } | { kind: 'imm'; value: number };

export interface ThreadProgram {
  name: string;
  instrs: Instr[];
  /** Source line of each instruction. */
  lines: number[];
}

export interface ThreadsProgram {
  shared: Record<string, number>;
  mutexes: string[];
  semaphores: Record<string, number>;
  conditions: string[];
  threads: ThreadProgram[];
}

export class AsmError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'AsmError';
  }
}

const IDENT = /^[A-Za-z_]\w*$/;
const INT = /^-?\d+$/;

/** Readable pseudo-code for an instruction, shown next to the assembly. */
export function pseudo(i: Instr): string {
  const v = (o: Operand) => (o.kind === 'imm' ? String(o.value) : o.name);
  switch (i.op) {
    case 'LOAD':
      return `${i.reg} = ${i.shared}`;
    case 'STORE':
      return `${i.shared} = ${v(i.src)}`;
    case 'MOV':
      return `${i.reg} = ${v(i.src)}`;
    case 'ADD':
      return `${i.reg} = ${i.reg} + ${v(i.src)}`;
    case 'SUB':
      return `${i.reg} = ${i.reg} - ${v(i.src)}`;
    case 'JMP':
      return `goto ${i.label}`;
    case 'JZ':
      return `if (${i.reg} == 0) goto ${i.label}`;
    case 'JNZ':
      return `if (${i.reg} != 0) goto ${i.label}`;
    case 'LOCK':
      return `lock(${i.mutex})`;
    case 'UNLOCK':
      return `unlock(${i.mutex})`;
    case 'WAIT':
      return `sem_wait(${i.sem})`;
    case 'SIGNAL':
      return `sem_post(${i.sem})`;
    case 'CWAIT':
      return `cond_wait(${i.cond}, ${i.mutex})`;
    case 'CSIGNAL':
      return `cond_signal(${i.cond})`;
    case 'CBROADCAST':
      return `cond_broadcast(${i.cond})`;
    case 'PRINT':
      return `print("${i.text}")`;
  }
}

const ALIASES: Record<string, string> = { P: 'WAIT', V: 'SIGNAL', POST: 'SIGNAL' };

/**
 * Parses a scenario:
 *   shared counter = 0      mutex m      semaphore empty = 3      condition c
 *   thread A
 *     LOAD r, counter
 *   loop:                   (labels are local to their thread)
 * Comments start with `;`, `#` or `//`. Registers are any other names and start at 0.
 */
export function assemble(source: string): ThreadsProgram {
  const program: ThreadsProgram = {
    shared: {},
    mutexes: [],
    semaphores: {},
    conditions: [],
    threads: [],
  };
  const declared = new Set<string>();
  // Pass 1: declarations, threads, raw instruction lines and labels.
  interface Raw {
    op: string;
    args: string[];
    line: number;
  }
  const raws: { name: string; line: number; items: Raw[]; labels: Map<string, number> }[] = [];
  const declare = (name: string, line: number) => {
    if (!IDENT.test(name)) throw new AsmError(`"${name}" is not a valid name.`, line);
    if (declared.has(name)) throw new AsmError(`"${name}" is declared twice.`, line);
    declared.add(name);
  };

  source.split('\n').forEach((rawLine, i) => {
    const line = i + 1;
    const text = rawLine.replace(/(;|#|\/\/).*$/, '').trim();
    if (!text) return;
    const words = text.split(/\s+/);
    const head = (words[0] as string).toLowerCase();
    const current = raws[raws.length - 1];
    let m: RegExpExecArray | null;
    if ((m = /^shared\s+([A-Za-z_]\w*)\s*(?:=\s*(-?\d+))?$/i.exec(text))) {
      declare(m[1] as string, line);
      program.shared[m[1] as string] = Number(m[2] ?? 0);
    } else if ((m = /^mutex\s+([A-Za-z_]\w*)$/i.exec(text))) {
      declare(m[1] as string, line);
      program.mutexes.push(m[1] as string);
    } else if ((m = /^semaphore\s+([A-Za-z_]\w*)\s*(?:=\s*(\d+))?$/i.exec(text))) {
      declare(m[1] as string, line);
      program.semaphores[m[1] as string] = Number(m[2] ?? 0);
    } else if ((m = /^condition\s+([A-Za-z_]\w*)$/i.exec(text))) {
      declare(m[1] as string, line);
      program.conditions.push(m[1] as string);
    } else if (head === 'thread') {
      const name = words.slice(1).join(' ').replace(/:$/, '');
      if (!name) throw new AsmError('A thread needs a name, for example: thread A', line);
      if (raws.some((t) => t.name === name))
        throw new AsmError(`Thread "${name}" is defined twice.`, line);
      raws.push({ name, line, items: [], labels: new Map() });
    } else if ((m = /^([A-Za-z_]\w*):$/.exec(text))) {
      if (!current) throw new AsmError('Labels must be inside a thread.', line);
      if (current.labels.has(m[1] as string))
        throw new AsmError(`Label "${m[1]}" is defined twice.`, line);
      current.labels.set(m[1] as string, current.items.length);
    } else if (['shared', 'mutex', 'semaphore', 'condition'].includes(head)) {
      throw new AsmError(
        `Write "${head} NAME${head === 'shared' || head === 'semaphore' ? ' = value' : ''}".`,
        line,
      );
    } else {
      if (!current) throw new AsmError('Instructions must come after "thread NAME".', line);
      const op = words[0]?.toUpperCase() ?? '';
      const rest = text.slice((words[0] as string).length).trim();
      const args = op === 'PRINT' ? [rest] : rest ? rest.split(/\s*,\s*|\s+/) : [];
      current.items.push({ op: ALIASES[op] ?? op, args, line });
    }
  });
  if (raws.length === 0) throw new AsmError('Define at least one thread, for example: thread A', 1);

  const kindOf = (name: string) =>
    name in program.shared
      ? 'shared'
      : program.mutexes.includes(name)
        ? 'mutex'
        : name in program.semaphores
          ? 'semaphore'
          : program.conditions.includes(name)
            ? 'condition'
            : 'register';

  // Pass 2: check operands and resolve labels.
  for (const t of raws) {
    const thread: ThreadProgram = { name: t.name, instrs: [], lines: [] };
    for (const { op, args, line } of t.items) {
      const need = (count: number, usage: string) => {
        if (args.length !== count || args.some((a) => !a))
          throw new AsmError(`Usage: ${usage}`, line);
      };
      const expect = (name: string, kind: string, usage: string) => {
        if (!IDENT.test(name))
          throw new AsmError(`"${name}" is not a valid name. Usage: ${usage}`, line);
        const actual = kindOf(name);
        if (actual !== kind) {
          throw new AsmError(
            kind === 'register'
              ? `"${name}" is a ${actual}; use a register (a local name like r) here.`
              : `"${name}" is not a declared ${kind}. Add "${kind} ${name}" at the top.`,
            line,
          );
        }
        return name;
      };
      const operand = (a: string, usage: string): Operand =>
        INT.test(a)
          ? { kind: 'imm', value: Number(a) }
          : { kind: 'reg', name: expect(a, 'register', usage) };
      const label = (name: string) => {
        const target = t.labels.get(name);
        if (target === undefined)
          throw new AsmError(`Unknown label "${name}" in thread ${t.name}.`, line);
        return target;
      };
      let instr: Instr;
      switch (op) {
        case 'LOAD':
          need(2, 'LOAD reg, shared');
          instr = {
            op,
            reg: expect(args[0] as string, 'register', 'LOAD reg, shared'),
            shared: expect(args[1] as string, 'shared', 'LOAD reg, shared'),
          };
          break;
        case 'STORE':
          need(2, 'STORE shared, reg|number');
          instr = {
            op,
            shared: expect(args[0] as string, 'shared', 'STORE shared, reg'),
            src: operand(args[1] as string, 'STORE shared, reg'),
          };
          break;
        case 'MOV':
        case 'ADD':
        case 'SUB':
          need(2, `${op} reg, reg|number`);
          instr = {
            op,
            reg: expect(args[0] as string, 'register', `${op} reg, value`),
            src: operand(args[1] as string, `${op} reg, value`),
          };
          break;
        case 'JMP':
          need(1, 'JMP label');
          instr = { op, label: args[0] as string, target: label(args[0] as string) };
          break;
        case 'JZ':
        case 'JNZ':
          need(2, `${op} reg, label`);
          instr = {
            op,
            reg: expect(args[0] as string, 'register', `${op} reg, label`),
            label: args[1] as string,
            target: label(args[1] as string),
          };
          break;
        case 'LOCK':
        case 'UNLOCK':
          need(1, `${op} mutex`);
          instr = { op, mutex: expect(args[0] as string, 'mutex', `${op} mutex`) };
          break;
        case 'WAIT':
        case 'SIGNAL':
          need(1, `${op} semaphore`);
          instr = { op, sem: expect(args[0] as string, 'semaphore', `${op} semaphore`) };
          break;
        case 'CWAIT':
          need(2, 'CWAIT condition, mutex');
          instr = {
            op,
            cond: expect(args[0] as string, 'condition', 'CWAIT condition, mutex'),
            mutex: expect(args[1] as string, 'mutex', 'CWAIT condition, mutex'),
          };
          break;
        case 'CSIGNAL':
        case 'CBROADCAST':
          need(1, `${op} condition`);
          instr = { op, cond: expect(args[0] as string, 'condition', `${op} condition`) };
          break;
        case 'PRINT':
          if (!args[0]) throw new AsmError('Usage: PRINT some text', line);
          instr = { op, text: args[0] };
          break;
        default:
          throw new AsmError(
            `Unknown instruction "${op}". Use LOAD, STORE, MOV, ADD, SUB, JMP, JZ, JNZ, LOCK, UNLOCK, WAIT, SIGNAL, CWAIT, CSIGNAL, CBROADCAST or PRINT.`,
            line,
          );
      }
      thread.instrs.push(instr);
      thread.lines.push(line);
    }
    program.threads.push(thread);
  }
  return program;
}
