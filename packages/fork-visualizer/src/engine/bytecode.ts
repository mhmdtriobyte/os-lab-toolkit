import type { BinaryOp } from './ast';

/** Built-in library and system calls the VM implements. */
export type SysCall =
  | 'printf'
  | 'fork'
  | 'getpid'
  | 'getppid'
  | 'wait'
  | 'waitpid'
  | 'sleep'
  | 'exit'
  | 'kill'
  | 'fflush'
  | 'WEXITSTATUS'
  | 'WIFEXITED'
  | 'abs';

/** A variable slot: frame local or process global. */
export interface Slot {
  index: number;
  global: boolean;
}

export type Instr =
  /** Start of a statement: one atomic step runs from one `stmt` to the next. */
  | { op: 'stmt'; line: number }
  | { op: 'push'; value: number }
  | { op: 'str'; value: string }
  | { op: 'load'; slot: Slot }
  /** Pops a value, stores it, and pushes it back (assignments are expressions in C). */
  | { op: 'store'; slot: Slot }
  /** Pushes a reference to a variable (only used for wait(&status)). */
  | { op: 'ref'; slot: Slot }
  | { op: 'pop' }
  | { op: 'bin'; o: BinaryOp }
  | { op: 'neg' }
  | { op: 'not' }
  | { op: 'bnot' }
  | { op: 'jmp'; to: number }
  /** Pops; jumps if zero. */
  | { op: 'jz'; to: number }
  /** Pops; jumps if non-zero. */
  | { op: 'jnz'; to: number }
  | { op: 'call'; fn: number; argc: number }
  | { op: 'ret' }
  | { op: 'sys'; name: SysCall; argc: number; line: number; format?: string }
  /** End of the program after main returns: pops the exit code. */
  | { op: 'halt' };

export interface CompiledFunction {
  name: string;
  entry: number;
  params: number;
  /** Total number of local slots (params first). */
  locals: number;
  /** Names of local slots, for the variables panel. */
  slotNames: string[];
}

export interface Program {
  code: Instr[];
  functions: CompiledFunction[];
  globalNames: string[];
  /** Initial values of the globals (C requires constant initialisers). */
  globalInit: number[];
  /** Index into `functions` of main. */
  main: number;
  /** Source lines, for the UI. */
  source: string;
}
