export function SupportedSyntax() {
  return (
    <details className="rounded-md border border-slate-200 p-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
      <summary className="cursor-pointer font-medium">Which C is supported?</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <code>#include</code> lines (ignored) and <code>#define NAME 3</code>.
        </li>
        <li>
          Integer variables (<code>int</code>, <code>pid_t</code>, <code>long</code>…), globals,
          functions with int parameters, recursion.
        </li>
        <li>
          <code>if / else</code>, <code>while</code>, <code>do-while</code>, <code>for</code>,{' '}
          <code>break</code>, <code>continue</code>, all integer operators, <code>?:</code>. 0 is
          false, anything else is true.
        </li>
        <li>
          <code>printf</code> with <code>%d %i %u %x %c %s %%</code>; <code>fork</code>,{' '}
          <code>getpid</code>, <code>getppid</code>, <code>wait(NULL)</code>,{' '}
          <code>wait(&amp;status)</code>, <code>waitpid</code>, <code>WEXITSTATUS</code>,{' '}
          <code>sleep</code>, <code>exit</code>, <code>kill</code>.
        </li>
        <li>
          Not yet: arrays, pointers, <code>char</code> variables, <code>scanf</code> (no keyboard
          input), exec.
        </li>
        <li>
          Output is unbuffered: each <code>printf</code> appears at once. (In real C, text printed
          without <code>\n</code> before a <code>fork()</code> can appear twice because of stdio
          buffering.)
        </li>
        <li>
          <code>sleep(n)</code> uses a virtual clock: time only moves when no process is ready, then
          jumps to the next wake-up.
        </li>
      </ul>
    </details>
  );
}
