import type { BinaryOp, Declarator, Expr, FuncDecl, ProgramAst, Stmt } from './ast';
import type { CompiledFunction, Instr, Program, Slot, SysCall } from './bytecode';
import { CError } from './errors';
import { binaryOp } from './intmath';
import { parse } from './parser';
import { parseFormat } from './printf';

/** Fixed arity of each system/library call. */
const SYSCALL_ARITY: Record<Exclude<SysCall, 'printf'>, number> = {
  fork: 0,
  getpid: 0,
  getppid: 0,
  wait: 1,
  waitpid: 3,
  sleep: 1,
  exit: 1,
  kill: 2,
  fflush: 1,
  WEXITSTATUS: 1,
  WIFEXITED: 1,
  abs: 1,
};

const ALIASES: Record<string, SysCall> = { _exit: 'exit' };

// TODO(stdin): simulate standard input so scanf/getchar can be supported.
const NO_STDIN =
  'is not supported yet: the simulator has no keyboard input (stdin). Give the variable a value in the code instead.';

const UNSUPPORTED_CALLS: Record<string, string> = {
  scanf: `scanf() ${NO_STDIN}`,
  getchar: `getchar() ${NO_STDIN}`,
  gets: `gets() ${NO_STDIN}`,
  fgets: `fgets() ${NO_STDIN}`,
  execl: 'exec*() is not supported yet: the simulator cannot load other programs.',
  execlp: 'exec*() is not supported yet: the simulator cannot load other programs.',
  execv: 'exec*() is not supported yet: the simulator cannot load other programs.',
  execvp: 'exec*() is not supported yet: the simulator cannot load other programs.',
  execve: 'exec*() is not supported yet: the simulator cannot load other programs.',
  system: 'system() is not supported: the simulator cannot run shell commands.',
  malloc: 'malloc() is not supported yet (pointers are not simulated).',
  free: 'free() is not supported yet (pointers are not simulated).',
  pthread_create: 'Threads are covered by the Threads module; this one simulates processes.',
};

/** Compiles C source into VM bytecode. Throws CError with a line number on any problem. */
export function compile(source: string): Program {
  return new Compiler(parse(source), source).program();
}

interface LoopCtx {
  breaks: number[];
  continues: number[];
}

class Compiler {
  private code: Instr[] = [{ op: 'halt' }];
  private functions: CompiledFunction[] = [];
  private fnIndex = new Map<string, { index: number; decl: FuncDecl }>();
  private globals = new Map<string, number>();
  private globalNames: string[] = [];
  private globalInit: number[] = [];
  // Per-function state.
  private scopes: Map<string, number>[] = [];
  private slotNames: string[] = [];
  private loops: LoopCtx[] = [];

  constructor(
    private readonly ast: ProgramAst,
    private readonly source: string,
  ) {}

  program(): Program {
    for (const g of this.ast.globals) this.declareGlobal(g);
    this.ast.functions.forEach((decl, index) => {
      if (this.fnIndex.has(decl.name))
        throw new CError(`Function ${decl.name}() is defined twice.`, decl.line);
      this.fnIndex.set(decl.name, { index, decl });
    });
    const main = this.fnIndex.get('main');
    if (!main)
      throw new CError('The program needs a main function, for example: int main() { ... }', 1);
    if (main.decl.params.length > 0)
      throw new CError('main() takes no parameters in this simulator.', main.decl.line);
    for (const decl of this.ast.functions) this.functions.push(this.compileFunction(decl));
    return {
      code: this.code,
      functions: this.functions,
      globalNames: this.globalNames,
      globalInit: this.globalInit,
      main: main.index,
      source: this.source,
    };
  }

  private declareGlobal(d: Declarator) {
    if (this.globals.has(d.name))
      throw new CError(`Global variable ${d.name} is declared twice.`, d.line);
    this.globals.set(d.name, this.globalNames.length);
    this.globalNames.push(d.name);
    this.globalInit.push(d.init ? constant(d.init) : 0);
  }

  private emit(instr: Instr): number {
    this.code.push(instr);
    return this.code.length - 1;
  }

  private patch(at: number) {
    const instr = this.code[at];
    if (instr && (instr.op === 'jmp' || instr.op === 'jz' || instr.op === 'jnz'))
      instr.to = this.code.length;
  }

  private compileFunction(decl: FuncDecl): CompiledFunction {
    this.scopes = [new Map()];
    this.slotNames = [];
    this.loops = [];
    for (const p of decl.params) this.declareLocal(p, decl.line);
    const entry = this.code.length;
    this.block(decl.body, false);
    // Falling off the end returns 0 (C99 semantics for main; harmless for void functions).
    this.emit({ op: 'push', value: 0 });
    this.emit({ op: 'ret' });
    return {
      name: decl.name,
      entry,
      params: decl.params.length,
      locals: this.slotNames.length,
      slotNames: this.slotNames,
    };
  }

  private declareLocal(name: string, line: number): number {
    const scope = this.scopes[this.scopes.length - 1] as Map<string, number>;
    if (scope.has(name))
      throw new CError(`Variable ${name} is declared twice in the same block.`, line);
    const index = this.slotNames.length;
    scope.set(name, index);
    this.slotNames.push(name);
    return index;
  }

  private resolve(name: string, line: number): Slot {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const index = this.scopes[i]?.get(name);
      if (index !== undefined) return { index, global: false };
    }
    const g = this.globals.get(name);
    if (g !== undefined) return { index: g, global: true };
    if (this.fnIndex.has(name) || name in SYSCALL_ARITY) {
      throw new CError(`${name} is a function; call it with parentheses: ${name}()`, line);
    }
    throw new CError(
      `Variable "${name}" is not declared. Declare it first, for example: int ${name} = 0;`,
      line,
    );
  }

  private block(b: Stmt & { k: 'block' }, newScope = true) {
    if (newScope) this.scopes.push(new Map());
    for (const s of b.body) this.statement(s);
    if (newScope) this.scopes.pop();
  }

  private statement(s: Stmt) {
    switch (s.k) {
      case 'block':
        return this.block(s);
      case 'empty':
        return;
      case 'decl':
        for (const d of s.decls) {
          if (d.init) {
            this.emit({ op: 'stmt', line: d.line });
            this.expr(d.init);
          } else {
            this.emit({ op: 'push', value: 0 });
          }
          this.emit({
            op: 'store',
            slot: { index: this.declareLocal(d.name, d.line), global: false },
          });
          this.emit({ op: 'pop' });
        }
        return;
      case 'expr':
        this.emit({ op: 'stmt', line: s.line });
        this.expr(s.expr);
        this.emit({ op: 'pop' });
        return;
      case 'if': {
        this.emit({ op: 'stmt', line: s.line });
        this.expr(s.test);
        const toElse = this.emit({ op: 'jz', to: -1 });
        this.statement(s.then);
        if (s.else) {
          const toEnd = this.emit({ op: 'jmp', to: -1 });
          this.patch(toElse);
          this.statement(s.else);
          this.patch(toEnd);
        } else {
          this.patch(toElse);
        }
        return;
      }
      case 'while': {
        const top = this.emit({ op: 'stmt', line: s.line });
        this.expr(s.test);
        const toEnd = this.emit({ op: 'jz', to: -1 });
        this.loopBody(s.body, top, [toEnd]);
        return;
      }
      case 'dowhile': {
        const top = this.code.length;
        const loop: LoopCtx = { breaks: [], continues: [] };
        this.loops.push(loop);
        this.statement(s.body);
        this.loops.pop();
        loop.continues.forEach((j) => this.patch(j));
        this.emit({ op: 'stmt', line: s.test.line });
        this.expr(s.test);
        this.emit({ op: 'jnz', to: top });
        loop.breaks.forEach((j) => this.patch(j));
        return;
      }
      case 'for': {
        this.scopes.push(new Map());
        if (s.init) this.statement(s.init);
        const top = this.emit({ op: 'stmt', line: s.line });
        const exits: number[] = [];
        if (s.test) {
          this.expr(s.test);
          exits.push(this.emit({ op: 'jz', to: -1 }));
        }
        const loop: LoopCtx = { breaks: [], continues: [] };
        this.loops.push(loop);
        this.statement(s.body);
        this.loops.pop();
        loop.continues.forEach((j) => this.patch(j));
        if (s.update) {
          this.emit({ op: 'stmt', line: s.line });
          this.expr(s.update);
          this.emit({ op: 'pop' });
        }
        this.emit({ op: 'jmp', to: top });
        exits.forEach((j) => this.patch(j));
        loop.breaks.forEach((j) => this.patch(j));
        this.scopes.pop();
        return;
      }
      case 'return':
        this.emit({ op: 'stmt', line: s.line });
        if (s.value) this.expr(s.value);
        else this.emit({ op: 'push', value: 0 });
        this.emit({ op: 'ret' });
        return;
      case 'break':
      case 'continue': {
        const loop = this.loops[this.loops.length - 1];
        if (!loop) throw new CError(`"${s.k}" can only be used inside a loop.`, s.line);
        const j = this.emit({ op: 'jmp', to: -1 });
        (s.k === 'break' ? loop.breaks : loop.continues).push(j);
        return;
      }
    }
  }

  /** Body of a while loop whose condition starts at `top`; `exits` jump past the loop. */
  private loopBody(body: Stmt, top: number, exits: number[]) {
    const loop: LoopCtx = { breaks: [], continues: [] };
    this.loops.push(loop);
    this.statement(body);
    this.loops.pop();
    this.emit({ op: 'jmp', to: top });
    for (const j of loop.continues) {
      const instr = this.code[j];
      if (instr && instr.op === 'jmp') instr.to = top;
    }
    exits.forEach((j) => this.patch(j));
    loop.breaks.forEach((j) => this.patch(j));
  }

  private expr(e: Expr): void {
    switch (e.k) {
      case 'num':
        this.emit({ op: 'push', value: e.value });
        return;
      case 'str':
        throw new CError(
          'Strings can only be used as printf arguments (there are no char* variables).',
          e.line,
        );
      case 'var':
        this.emit({ op: 'load', slot: this.resolve(e.name, e.line) });
        return;
      case 'assign': {
        const slot = this.resolve(e.name, e.line);
        if (e.op === '=') {
          this.expr(e.value);
        } else {
          this.emit({ op: 'load', slot });
          this.expr(e.value);
          this.emit({ op: 'bin', o: e.op.slice(0, -1) as BinaryOp });
        }
        this.emit({ op: 'store', slot });
        return;
      }
      case 'incdec': {
        const slot = this.resolve(e.name, e.line);
        const o = e.op === '++' ? '+' : '-';
        if (!e.prefix) this.emit({ op: 'load', slot });
        this.emit({ op: 'load', slot });
        this.emit({ op: 'push', value: 1 });
        this.emit({ op: 'bin', o });
        this.emit({ op: 'store', slot });
        if (!e.prefix) this.emit({ op: 'pop' });
        return;
      }
      case 'unary':
        this.expr(e.arg);
        if (e.op === '-') this.emit({ op: 'neg' });
        else if (e.op === '!') this.emit({ op: 'not' });
        else if (e.op === '~') this.emit({ op: 'bnot' });
        return;
      case 'binary':
        this.expr(e.left);
        this.expr(e.right);
        this.emit({ op: 'bin', o: e.op });
        return;
      case 'logical': {
        // Short-circuit: the right side (maybe a fork()) only runs when needed.
        const and = e.op === '&&';
        const jump = and ? 'jz' : 'jnz';
        this.expr(e.left);
        const j1 = this.emit({ op: jump, to: -1 });
        this.expr(e.right);
        const j2 = this.emit({ op: jump, to: -1 });
        this.emit({ op: 'push', value: and ? 1 : 0 });
        const toEnd = this.emit({ op: 'jmp', to: -1 });
        this.patch(j1);
        this.patch(j2);
        this.emit({ op: 'push', value: and ? 0 : 1 });
        this.patch(toEnd);
        return;
      }
      case 'cond': {
        this.expr(e.test);
        const toElse = this.emit({ op: 'jz', to: -1 });
        this.expr(e.then);
        const toEnd = this.emit({ op: 'jmp', to: -1 });
        this.patch(toElse);
        this.expr(e.else);
        this.patch(toEnd);
        return;
      }
      case 'addr':
        throw new CError(
          '"&" (address-of) is only supported as wait(&status) or waitpid(pid, &status, 0).',
          e.line,
        );
      case 'call':
        return this.call(e);
    }
  }

  private call(e: Expr & { k: 'call' }) {
    const user = this.fnIndex.get(e.name);
    if (user) {
      if (e.args.length !== user.decl.params.length) {
        throw new CError(
          `${e.name}() expects ${user.decl.params.length} argument(s) but got ${e.args.length}.`,
          e.line,
        );
      }
      if (e.name === 'main') throw new CError('Calling main() again is not supported.', e.line);
      e.args.forEach((a) => this.expr(a));
      this.emit({ op: 'call', fn: user.index, argc: e.args.length });
      return;
    }
    const unsupported = UNSUPPORTED_CALLS[e.name];
    if (unsupported) throw new CError(unsupported, e.line);
    if (e.name === 'printf' || e.name === 'puts') return this.printf(e);
    const name = ALIASES[e.name] ?? (e.name as SysCall);
    const arity = SYSCALL_ARITY[name as Exclude<SysCall, 'printf'>];
    if (arity === undefined) {
      throw new CError(
        `Unknown function ${e.name}(). Define it before main, or check the spelling.`,
        e.line,
      );
    }
    if (e.args.length !== arity) {
      throw new CError(`${e.name}() takes ${arity} argument(s) but got ${e.args.length}.`, e.line);
    }
    e.args.forEach((a, i) => {
      const statusArg = (name === 'wait' && i === 0) || (name === 'waitpid' && i === 1);
      if (statusArg && a.k === 'addr') this.emit({ op: 'ref', slot: this.resolve(a.name, a.line) });
      else if (statusArg && !(a.k === 'num' && a.value === 0)) {
        throw new CError(`${e.name}() needs NULL or &status here.`, e.line);
      } else this.expr(a);
    });
    this.emit({ op: 'sys', name, argc: arity, line: e.line });
  }

  private printf(e: Expr & { k: 'call' }) {
    const [fmt, ...args] = e.args;
    if (!fmt || fmt.k !== 'str') {
      throw new CError(
        `The first argument of ${e.name}() must be a string literal like "x = %d\\n".`,
        e.line,
      );
    }
    const format = e.name === 'puts' ? `${fmt.value.replace(/%/g, '%%')}\n` : fmt.value;
    if (e.name === 'puts' && args.length > 0)
      throw new CError('puts() takes exactly one string.', e.line);
    const { specs } = parseFormat(format, e.line);
    const wanted = specs.filter((s) => s.conv !== '%');
    if (wanted.length !== args.length) {
      throw new CError(
        `printf has ${wanted.length} format specifier(s) (like %d) but ${args.length} value(s) after the string.`,
        e.line,
      );
    }
    wanted.forEach((spec, i) => {
      const a = args[i] as Expr;
      if (spec.conv === 's') {
        if (a.k !== 'str')
          throw new CError(
            '%s needs a string literal argument here (there are no char* variables).',
            e.line,
          );
        this.emit({ op: 'str', value: a.value });
      } else {
        if (a.k === 'str')
          throw new CError(`%${spec.conv} expects an integer, but a string was given.`, e.line);
        this.expr(a);
      }
    });
    this.emit({ op: 'sys', name: 'printf', argc: args.length, line: e.line, format });
  }
}

/** Evaluates a constant expression (global initialisers must be constants in C). */
function constant(e: Expr): number {
  switch (e.k) {
    case 'num':
      return e.value;
    case 'unary': {
      const v = constant(e.arg);
      return e.op === '-' ? -v | 0 : e.op === '!' ? Number(v === 0) : e.op === '~' ? ~v : v;
    }
    case 'binary': {
      const r = binaryOp(e.op, constant(e.left), constant(e.right));
      if (r === null) throw new CError('Division by zero in a constant.', e.line);
      return r;
    }
    default:
      throw new CError('Global variables can only be initialised with constant values.', e.line);
  }
}
