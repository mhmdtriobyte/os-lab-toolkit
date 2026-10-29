import type { AssignOp, BinaryOp, Declarator, Expr, FuncDecl, ProgramAst, Stmt } from './ast';
import { CError } from './errors';
import { tokenize, type Token } from './lexer';

const INT_TYPES = new Set([
  'int',
  'long',
  'short',
  'unsigned',
  'signed',
  'const',
  'static',
  'pid_t',
  'bool',
  'size_t',
]);

const UNSUPPORTED_TYPES: Record<string, string> = {
  char: '`char` variables are not supported yet (only integer types). You can still print text with printf("...") and %c.',
  float: '`float` is not supported yet; only integer types are.',
  double: '`double` is not supported yet; only integer types are.',
  struct: 'Structs are not supported yet.',
  union: 'Unions are not supported yet.',
  enum: 'Enums are not supported yet; use #define NAME value instead.',
  typedef: 'typedef is not supported yet.',
};

const UNSUPPORTED_STATEMENTS: Record<string, string> = {
  switch: 'switch statements are not supported yet; use if / else if / else.',
  case: 'switch/case is not supported yet; use if / else if / else.',
  default: 'switch/case is not supported yet; use if / else if / else.',
  goto: 'goto is not supported.',
};

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

/** Binary operator precedence levels, lowest first. */
const BINARY_LEVELS: BinaryOp[][] = [
  ['|'],
  ['^'],
  ['&'],
  ['==', '!='],
  ['<', '>', '<=', '>='],
  ['<<', '>>'],
  ['+', '-'],
  ['*', '/', '%'],
];

export function parse(source: string): ProgramAst {
  return new Parser(tokenize(source)).program();
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private get tok(): Token {
    return this.tokens[this.pos] as Token;
  }

  private peek(offset = 1): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)] as Token;
  }

  private error(message: string, at: Token = this.tok): never {
    throw new CError(message, at.line, at.col);
  }

  private is(value: string): boolean {
    return (this.tok.kind === 'op' || this.tok.kind === 'kw') && this.tok.value === value;
  }

  private eat(value: string): boolean {
    if (this.is(value)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(value: string, hint?: string): Token {
    if (!this.is(value)) {
      const found = this.tok.kind === 'eof' ? 'the end of the code' : `"${this.tok.value}"`;
      const prev = this.tokens[this.pos - 1];
      // A missing ";" is reported on the line that is missing it, like gcc does.
      const at = value === ';' && prev ? { ...prev, col: prev.col + prev.value.length } : this.tok;
      this.error(hint ?? `Expected "${value}" but found ${found}.`, at as Token);
    }
    return this.tokens[this.pos++] as Token;
  }

  private ident(what: string): Token {
    if (this.tok.kind !== 'ident') {
      if (this.tok.kind === 'num' && /^[A-Za-z_]/.test(this.tok.value)) {
        this.error(`"${this.tok.value}" is a predefined constant and cannot be used as a ${what}.`);
      }
      this.error(`Expected a ${what} name but found "${this.tok.value || 'end of code'}".`);
    }
    return this.tokens[this.pos++] as Token;
  }

  private isTypeStart(): boolean {
    return (
      this.tok.kind === 'kw' &&
      (INT_TYPES.has(this.tok.value) ||
        this.tok.value === 'void' ||
        this.tok.value in UNSUPPORTED_TYPES)
    );
  }

  /** Parses a type and returns whether it is `void`. Only integer types are accepted. */
  private type(): boolean {
    let isVoid = false;
    let any = false;
    while (this.tok.kind === 'kw') {
      const v = this.tok.value;
      const unsupported = UNSUPPORTED_TYPES[v];
      if (unsupported) this.error(unsupported);
      if (v === 'void') isVoid = true;
      else if (!INT_TYPES.has(v)) break;
      any = true;
      this.pos++;
    }
    if (!any) this.error(`Expected a type such as int but found "${this.tok.value}".`);
    if (this.is('*')) this.error('Pointers are not supported yet.');
    return isVoid;
  }

  program(): ProgramAst {
    const globals: Declarator[] = [];
    const functions: FuncDecl[] = [];
    while (this.tok.kind !== 'eof') {
      const start = this.tok;
      if (!this.isTypeStart()) {
        this.error(`Expected a function like "int main() { ... }" but found "${start.value}".`);
      }
      const isVoid = this.type();
      const name = this.ident('function or variable');
      if (this.is('(')) {
        const fn = this.functionRest(name, isVoid);
        if (fn) functions.push(fn);
      } else {
        if (isVoid) this.error('A variable cannot have type void.', name);
        globals.push(...this.declaratorsRest(name));
      }
    }
    return { globals, functions };
  }

  /** After `type name`, parses `(params) { body }` or a prototype `(params);` (returns null). */
  private functionRest(name: Token, returnsVoid: boolean): FuncDecl | null {
    this.expect('(');
    const params: string[] = [];
    if (name.value === 'main' && !this.is(')') && !(this.is('void') && this.peek().value === ')')) {
      // int main(int argc, char *argv[]): accepted, the parameters are not simulated.
      let depth = 1;
      while (depth > 0 && this.tok.kind !== 'eof') {
        if (this.is('(')) depth++;
        if (this.is(')')) depth--;
        if (depth > 0) this.pos++;
      }
    } else if (this.is('void') && this.peek().value === ')') {
      this.pos++;
    } else if (!this.is(')')) {
      do {
        if (this.is('...')) this.error('Variadic functions are not supported.');
        if (this.type()) this.error('A parameter cannot have type void.');
        params.push(this.ident('parameter').value);
        if (this.is('[')) this.error('Arrays are not supported yet.');
      } while (this.eat(','));
    }
    this.expect(')');
    if (this.eat(';')) return null;
    if (!this.is('{')) this.error(`Expected "{" to start the body of ${name.value}().`);
    const body = this.block();
    return { name: name.value, returnsVoid, params, body, line: name.line };
  }

  /** After `type name`, parses `= init, other = 1;`. */
  private declaratorsRest(first: Token): Declarator[] {
    const decls: Declarator[] = [];
    let name = first;
    for (;;) {
      if (this.is('[')) this.error('Arrays are not supported yet.');
      if (this.is('('))
        this.error('Functions must be declared at the top level, outside other functions.');
      const decl: Declarator = { name: name.value, line: name.line };
      if (this.eat('=')) decl.init = this.assignment();
      decls.push(decl);
      if (!this.eat(',')) break;
      if (this.is('*')) this.error('Pointers are not supported yet.');
      name = this.ident('variable');
    }
    this.expect(';');
    return decls;
  }

  private block(): Stmt & { k: 'block' } {
    const open = this.expect('{');
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.tok.kind === 'eof') this.error('A "{" was never closed with "}".', open);
      body.push(this.statement());
    }
    this.pos++;
    return { k: 'block', body, line: open.line };
  }

  private statement(): Stmt {
    const t = this.tok;
    const line = t.line;
    if (t.kind === 'kw') {
      const unsupported = UNSUPPORTED_STATEMENTS[t.value];
      if (unsupported) this.error(unsupported);
    }
    if (this.is('{')) return this.block();
    if (this.isTypeStart()) {
      if (this.type()) this.error('A variable cannot have type void.');
      return { k: 'decl', decls: this.declaratorsRest(this.ident('variable')), line };
    }
    if (this.eat(';')) return { k: 'empty', line };
    if (this.eat('if')) {
      const test = this.parenExpr('if');
      const then = this.statement();
      const elseStmt = this.eat('else') ? this.statement() : undefined;
      return elseStmt
        ? { k: 'if', test, then, else: elseStmt, line }
        : { k: 'if', test, then, line };
    }
    if (this.eat('while')) {
      const test = this.parenExpr('while');
      return { k: 'while', test, body: this.statement(), line };
    }
    if (this.eat('do')) {
      const body = this.statement();
      this.expect('while', 'Expected "while (...)" after the body of do { ... }.');
      const test = this.parenExpr('do-while');
      this.expect(';');
      return { k: 'dowhile', body, test, line };
    }
    if (this.eat('for')) return this.forRest(line);
    if (this.eat('return')) {
      if (this.eat(';')) return { k: 'return', line };
      const value = this.expression();
      this.expect(';');
      return { k: 'return', value, line };
    }
    if (this.eat('break')) {
      this.expect(';');
      return { k: 'break', line };
    }
    if (this.eat('continue')) {
      this.expect(';');
      return { k: 'continue', line };
    }
    if (this.is('else')) this.error('This "else" has no matching "if".');
    const expr = this.expression();
    this.expect(';');
    return { k: 'expr', expr, line };
  }

  private forRest(line: number): Stmt {
    this.expect('(', 'Expected "(" after for.');
    let init: Stmt | undefined;
    if (this.isTypeStart()) {
      const declLine = this.tok.line;
      if (this.type()) this.error('A variable cannot have type void.');
      init = { k: 'decl', decls: this.declaratorsRest(this.ident('variable')), line: declLine };
    } else if (!this.eat(';')) {
      init = { k: 'expr', expr: this.expression(), line: this.tok.line };
      this.expect(';');
    }
    const test = this.is(';') ? undefined : this.expression();
    this.expect(';');
    const update = this.is(')') ? undefined : this.expression();
    this.expect(')');
    const body = this.statement();
    const stmt: Stmt = { k: 'for', body, line };
    if (init) stmt.init = init;
    if (test) stmt.test = test;
    if (update) stmt.update = update;
    return stmt;
  }

  private parenExpr(what: string): Expr {
    this.expect('(', `Expected "(" after ${what}.`);
    const e = this.expression();
    this.expect(')');
    return e;
  }

  private expression(): Expr {
    const e = this.assignment();
    if (this.is(',')) this.error('The comma operator is not supported; write separate statements.');
    return e;
  }

  private assignment(): Expr {
    const left = this.conditional();
    if (this.tok.kind === 'op' && ASSIGN_OPS.has(this.tok.value)) {
      const opTok = this.tok;
      if (left.k !== 'var') this.error('The left side of an assignment must be a variable.', opTok);
      this.pos++;
      return {
        k: 'assign',
        op: opTok.value as AssignOp,
        name: left.name,
        value: this.assignment(),
        line: opTok.line,
      };
    }
    return left;
  }

  private conditional(): Expr {
    const test = this.logical('||');
    if (!this.is('?')) return test;
    const line = this.tok.line;
    this.pos++;
    const then = this.assignment();
    this.expect(':', 'Expected ":" in the conditional expression (a ? b : c).');
    return { k: 'cond', test, then, else: this.conditional(), line };
  }

  private logical(op: '||' | '&&'): Expr {
    let left = op === '||' ? this.logical('&&') : this.binary(0);
    while (this.is(op)) {
      const line = this.tok.line;
      this.pos++;
      const right = op === '||' ? this.logical('&&') : this.binary(0);
      left = { k: 'logical', op, left, right, line };
    }
    return left;
  }

  private binary(level: number): Expr {
    const ops = BINARY_LEVELS[level];
    if (!ops) return this.unary();
    let left = this.binary(level + 1);
    while (this.tok.kind === 'op' && (ops as string[]).includes(this.tok.value)) {
      const t = this.tokens[this.pos++] as Token;
      left = {
        k: 'binary',
        op: t.value as BinaryOp,
        left,
        right: this.binary(level + 1),
        line: t.line,
      };
    }
    return left;
  }

  private unary(): Expr {
    const t = this.tok;
    if (t.kind === 'op') {
      if (t.value === '-' || t.value === '+' || t.value === '!' || t.value === '~') {
        this.pos++;
        return { k: 'unary', op: t.value, arg: this.unary(), line: t.line };
      }
      if (t.value === '++' || t.value === '--') {
        this.pos++;
        const target = this.unary();
        if (target.k !== 'var') this.error(`${t.value} can only be applied to a variable.`, t);
        return { k: 'incdec', op: t.value, prefix: true, name: target.name, line: t.line };
      }
      if (t.value === '&') {
        this.pos++;
        const name = this.ident('variable');
        return { k: 'addr', name: name.value, line: t.line };
      }
      if (t.value === '*') this.error('Pointers are not supported yet.');
      if (t.value === '(' && this.peek().kind === 'kw' && INT_TYPES.has(this.peek().value)) {
        // A cast like (int) or (pid_t): all supported types are integers, so it is a no-op.
        this.pos++;
        this.type();
        this.expect(')');
        return this.unary();
      }
    }
    if (t.kind === 'kw' && t.value === 'sizeof') this.error('sizeof is not supported yet.');
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.tok;
      if (t.kind !== 'op') return e;
      if (t.value === '++' || t.value === '--') {
        if (e.k !== 'var') this.error(`${t.value} can only be applied to a variable.`);
        this.pos++;
        e = { k: 'incdec', op: t.value, prefix: false, name: e.name, line: t.line };
      } else if (t.value === '(') {
        if (e.k !== 'var') this.error('Only named functions can be called.');
        this.pos++;
        const args: Expr[] = [];
        if (!this.is(')')) {
          do args.push(this.assignment());
          while (this.eat(','));
        }
        this.expect(')', `Expected ")" to close the call to ${e.name}().`);
        e = { k: 'call', name: e.name, args, line: e.line };
      } else if (t.value === '[') {
        this.error('Arrays are not supported yet.');
      } else if (t.value === '.' || t.value === '->') {
        this.error('Structs are not supported yet.');
      } else {
        return e;
      }
    }
  }

  private primary(): Expr {
    const t = this.tok;
    if (t.kind === 'num') {
      this.pos++;
      return { k: 'num', value: t.num, line: t.line };
    }
    if (t.kind === 'str') {
      this.pos++;
      let value = t.value;
      // Adjacent string literals are concatenated, as in C.
      while (this.tok.kind === 'str') value += (this.tokens[this.pos++] as Token).value;
      return { k: 'str', value, line: t.line };
    }
    if (t.kind === 'ident') {
      this.pos++;
      return { k: 'var', name: t.value, line: t.line };
    }
    if (this.eat('(')) {
      const e = this.expression();
      this.expect(')');
      return e;
    }
    if (t.kind === 'eof') this.error('The code ends unexpectedly; is a "}" or ";" missing?');
    this.error(`Unexpected "${t.value}".`);
  }
}
