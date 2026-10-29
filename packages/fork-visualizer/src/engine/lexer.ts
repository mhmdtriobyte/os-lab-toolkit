import { CError } from './errors';

export type TokenKind = 'num' | 'str' | 'ident' | 'kw' | 'op' | 'eof';

export interface Token {
  kind: TokenKind;
  value: string;
  /** Numeric value for `num` tokens (also used for char literals and #define constants). */
  num: number;
  line: number;
  col: number;
}

const KEYWORDS = new Set([
  'int',
  'void',
  'char',
  'float',
  'double',
  'long',
  'short',
  'unsigned',
  'signed',
  'const',
  'static',
  'pid_t',
  'if',
  'else',
  'while',
  'for',
  'do',
  'return',
  'break',
  'continue',
  'switch',
  'case',
  'default',
  'struct',
  'union',
  'enum',
  'goto',
  'typedef',
  'sizeof',
  'bool',
  'size_t',
]);

// Longest operators first so that "<<=" wins over "<<" and "<".
const OPERATORS = [
  '<<=',
  '>>=',
  '...',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<<',
  '>>',
  '->',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '=',
  '!',
  '~',
  '&',
  '|',
  '^',
  '?',
  ':',
  ';',
  ',',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  '.',
];

/** Constants every program can use without a #define. */
const BUILTIN_CONSTANTS: Record<string, number> = {
  NULL: 0,
  EXIT_SUCCESS: 0,
  EXIT_FAILURE: 1,
  SIGKILL: 9,
  SIGTERM: 15,
  SIGINT: 2,
  WNOHANG: 1,
  stdout: 1,
  stderr: 2,
  true: 1,
  false: 0,
};

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
  '\\': '\\',
  "'": "'",
  '"': '"',
  a: '\u0007',
};

const ALLOWED_HEADERS =
  /^<\s*(stdio|unistd|stdlib|sys\/wait|sys\/types|signal|wait|stdbool)\.h\s*>$/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const defines = new Map<string, number>(Object.entries(BUILTIN_CONSTANTS));
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let atLineStart = true;

  const col = () => i - lineStart + 1;
  const err = (msg: string): never => {
    throw new CError(msg, line, col());
  };
  const newline = () => {
    line++;
    lineStart = i + 1;
    atLineStart = true;
  };

  const readEscape = (): string => {
    const c = source[i + 1] ?? '';
    const mapped = ESCAPES[c];
    if (mapped === undefined) err(`Unknown escape sequence "\\${c}".`);
    i += 2;
    return mapped as string;
  };

  while (i < source.length) {
    const c = source[i] as string;
    if (c === '\n') {
      newline();
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const start = line;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') newline();
        i++;
      }
      if (i >= source.length) throw new CError('This /* comment is never closed with */.', start);
      i += 2;
      continue;
    }
    if (c === '#' && atLineStart) {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      const directive = source.slice(i + 1, end).trim();
      const include = /^include\s*(.*)$/.exec(directive);
      const define = /^define\s+([A-Za-z_]\w*)\s+(-?\d+)\s*$/.exec(directive);
      if (include) {
        const header = (include[1] ?? '').trim();
        if (!ALLOWED_HEADERS.test(header) && !/^".*"$/.test(header)) {
          err(
            `#include ${header}: only standard headers like <stdio.h>, <unistd.h>, <stdlib.h> and <sys/wait.h> are accepted.`,
          );
        }
      } else if (define) {
        defines.set(define[1] as string, Number(define[2]));
      } else {
        err('Only #include and simple constants like "#define N 3" are supported.');
      }
      i = end;
      continue;
    }
    atLineStart = false;
    const startCol = col();

    if (/[0-9]/.test(c)) {
      const m = /^(0[xX][0-9a-fA-F]+|\d+)([uUlL]*)/.exec(source.slice(i)) as RegExpExecArray;
      const text = m[0];
      const next = source[i + text.length] ?? '';
      if (next === '.' || /[eE]/.test(next)) {
        err('Floating point numbers are not supported yet; only integers (int) are.');
      }
      const raw = m[1] as string;
      tokens.push({ kind: 'num', value: raw, num: Number(raw) | 0, line, col: startCol });
      i += text.length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(source.slice(i)) as RegExpExecArray;
      const word = m[0];
      i += word.length;
      const constant = defines.get(word);
      if (constant !== undefined) {
        tokens.push({ kind: 'num', value: word, num: constant, line, col: startCol });
      } else {
        tokens.push({
          kind: KEYWORDS.has(word) ? 'kw' : 'ident',
          value: word,
          num: 0,
          line,
          col: startCol,
        });
      }
      continue;
    }
    if (c === '"') {
      let value = '';
      i++;
      while (source[i] !== '"') {
        if (i >= source.length || source[i] === '\n')
          err('This string is missing its closing quote (").');
        if (source[i] === '\\') value += readEscape();
        else value += source[i++];
      }
      i++;
      tokens.push({ kind: 'str', value, num: 0, line, col: startCol });
      continue;
    }
    if (c === "'") {
      i++;
      let ch: string;
      if (source[i] === '\\') ch = readEscape();
      else ch = source[i++] ?? '';
      if (source[i] !== "'" || ch.length !== 1)
        err("A character literal like 'a' must contain exactly one character.");
      i++;
      tokens.push({ kind: 'num', value: `'${ch}'`, num: ch.charCodeAt(0), line, col: startCol });
      continue;
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) err(`Unexpected character "${c}".`);
    tokens.push({ kind: 'op', value: op as string, num: 0, line, col: startCol });
    i += (op as string).length;
  }
  tokens.push({ kind: 'eof', value: '', num: 0, line, col: col() });
  return tokens;
}
