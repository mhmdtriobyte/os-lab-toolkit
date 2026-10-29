import type { BinaryOp } from './ast';

/** 32-bit C int arithmetic. Returns null for division by zero (SIGFPE). */
export function binaryOp(op: BinaryOp, a: number, b: number): number | null {
  switch (op) {
    case '+':
      return (a + b) | 0;
    case '-':
      return (a - b) | 0;
    case '*':
      return Math.imul(a, b);
    case '/':
      return b === 0 ? null : Math.trunc(a / b) | 0;
    case '%':
      return b === 0 ? null : (a % b) | 0;
    case '<':
      return Number(a < b);
    case '>':
      return Number(a > b);
    case '<=':
      return Number(a <= b);
    case '>=':
      return Number(a >= b);
    case '==':
      return Number(a === b);
    case '!=':
      return Number(a !== b);
    case '&':
      return a & b;
    case '|':
      return a | b;
    case '^':
      return a ^ b;
    case '<<':
      return a << (b & 31);
    case '>>':
      return a >> (b & 31);
  }
}
