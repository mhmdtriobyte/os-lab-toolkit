import { compile } from './compiler';
import { runDeterministic, type Policy } from './scheduler';
import { DEFAULT_CONFIG, type System, type VmConfig } from './vm';

/** Runs a program to completion with a deterministic policy and returns the final system. */
export function runToFinal(
  source: string,
  policy: Policy = 'parent-first',
  config: VmConfig = DEFAULT_CONFIG,
): System {
  const run = runDeterministic(compile(source), policy, config);
  const last = run.steps[run.steps.length - 1];
  if (!last) throw new Error('empty trace');
  return last.state.sys;
}

export function stdoutText(sys: System): string {
  return sys.stdout.map((c) => c.text).join('');
}

/** Wraps statements into a complete program. */
export function mainWith(body: string, prelude = ''): string {
  return `#include <stdio.h>\n#include <unistd.h>\n#include <sys/wait.h>\n${prelude}\nint main() {\n${body}\nreturn 0;\n}\n`;
}
