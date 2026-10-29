import { CError } from './errors';

export interface FormatSpec {
  /** Literal text before this specifier. */
  text: string;
  flags: string;
  width: number;
  conv: 'd' | 'i' | 'u' | 'x' | 'X' | 'c' | 's' | '%';
}

const SPEC = /%([-0+ ]*)(\d*)(?:hh|h|ll|l|z)?([diuxXcs%])/y;

/** Splits a printf format string into specifiers. The trailing literal text has no specifier. */
export function parseFormat(format: string, line: number): { specs: FormatSpec[]; tail: string } {
  const specs: FormatSpec[] = [];
  let text = '';
  let i = 0;
  while (i < format.length) {
    if (format[i] !== '%') {
      text += format[i++];
      continue;
    }
    SPEC.lastIndex = i;
    const m = SPEC.exec(format);
    if (!m) {
      const bad = format.slice(i, i + 3);
      throw new CError(
        `Unsupported format "${bad}" in printf. Supported: %d %i %u %x %c %s %% (with optional width).`,
        line,
      );
    }
    specs.push({
      text,
      flags: m[1] ?? '',
      width: Number(m[2] || 0),
      conv: m[3] as FormatSpec['conv'],
    });
    text = '';
    i += m[0].length;
  }
  return { specs, tail: text };
}

function pad(s: string, spec: FormatSpec): string {
  if (s.length >= spec.width) return s;
  if (spec.flags.includes('-')) return s.padEnd(spec.width);
  if (spec.flags.includes('0') && spec.conv !== 's' && spec.conv !== 'c') {
    const neg = s.startsWith('-');
    return (neg ? '-' : '') + s.slice(neg ? 1 : 0).padStart(spec.width - (neg ? 1 : 0), '0');
  }
  return s.padStart(spec.width);
}

/** Formats already-validated arguments (numbers, or strings for %s). */
export function formatPrintf(format: string, args: readonly (number | string)[]): string {
  const parsed = parseFormat(format, 0);
  let out = '';
  let argIndex = 0;
  for (const spec of parsed.specs) {
    out += spec.text;
    if (spec.conv === '%') {
      out += '%';
      continue;
    }
    const arg = args[argIndex++] ?? 0;
    let s: string;
    if (spec.conv === 's') s = String(arg);
    else {
      const n = typeof arg === 'number' ? arg : 0;
      if (spec.conv === 'c') s = String.fromCharCode(n & 0xff);
      else if (spec.conv === 'u') s = String(n >>> 0);
      else if (spec.conv === 'x') s = (n >>> 0).toString(16);
      else if (spec.conv === 'X') s = (n >>> 0).toString(16).toUpperCase();
      else s = (spec.flags.includes('+') && n >= 0 ? '+' : '') + String(n);
    }
    out += pad(s, spec);
  }
  return out + parsed.tail;
}
