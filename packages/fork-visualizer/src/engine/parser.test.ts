import { describe, expect, it } from 'vitest';
import { compile } from './compiler';
import { CError } from './errors';
import { tokenize } from './lexer';
import { parse } from './parser';
import { mainWith } from './testing';

function errorOf(source: string): CError {
  try {
    compile(source);
  } catch (e) {
    if (e instanceof CError) return e;
    throw e;
  }
  throw new Error('expected a compile error');
}

describe('lexer', () => {
  it('ignores includes and comments, expands #define', () => {
    const tokens = tokenize('#include <stdio.h>\n#define N 3\n// hi\n/* multi\nline */ int x = N;');
    expect(tokens.map((t) => t.value)).toEqual(['int', 'x', '=', 'N', ';', '']);
    expect(tokens[3]?.num).toBe(3);
    expect(tokens[0]?.line).toBe(5);
  });

  it('decodes string escapes and char literals', () => {
    const [str, chr] = tokenize('"a\\tb\\n" \'x\'');
    expect(str?.value).toBe('a\tb\n');
    expect(chr?.num).toBe(120);
  });
});

describe('parser', () => {
  it('parses the supported subset', () => {
    const ast = parse(
      mainWith(`
        int a = 1, b;
        pid_t pid;
        for (int i = 0; i < 3; i++) { a += i; }
        while (a > 0) a--;
        do { b++; } while (b < 2);
        if (a == 0 && !b) b = 1; else if (b) b = 2; else b = 3;
        b = a ? 1 : 2;
      `),
    );
    expect(ast.functions.map((f) => f.name)).toEqual(['main']);
    expect(ast.functions[0]?.body.body.length).toBe(8);
  });

  it('accepts the different main signatures', () => {
    for (const sig of [
      'int main()',
      'void main()',
      'int main(void)',
      'int main(int argc, char *argv[])',
    ]) {
      expect(() => compile(`${sig} { return 0; }`)).not.toThrow();
    }
  });

  it('accepts user functions with int parameters', () => {
    expect(() =>
      compile('int square(int x) { return x * x; }\nint main() { printf("%d\\n", square(3)); }'),
    ).not.toThrow();
  });
});

describe('friendly errors for unsupported syntax', () => {
  it.each([
    ['int a[3];', /arrays are not supported/i, 6],
    ['int *p;', /pointers are not supported/i, 6],
    ['char c = 1;', /char.*not supported/i, 6],
    ['float f = 1.5;', /float.*not supported/i, 6],
    ['int x; scanf("%d", &x);', /scanf\(\) is not supported/i, 6],
    ['switch (1) { }', /switch statements are not supported/i, 6],
    ['y = 3;', /"y" is not declared/, 6],
    ['printf("%d\\n");', /1 format specifier/, 6],
    ['int x = 1', /Expected ";"/, 6],
  ])('%s', (body, message, line) => {
    const err = errorOf(mainWith(body));
    expect(err.message).toMatch(message);
    expect(err.line).toBe(line);
  });

  it('reports a missing main', () => {
    expect(errorOf('int f() { return 1; }').message).toMatch(/needs a main function/);
  });

  it('reports an unclosed block', () => {
    expect(errorOf('int main() {\n  fork();\n').message).toMatch(/never closed/);
  });
});
