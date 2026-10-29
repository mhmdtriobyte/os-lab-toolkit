import type { OutChunk } from '../engine';
import { pidColor } from './colors';

/** stdout as one terminal, every chunk tagged with the pid that printed it. */
export function OutputPanel({
  stdout,
  pidStart,
}: {
  stdout: readonly OutChunk[];
  pidStart: number;
}) {
  if (stdout.length === 0) {
    return (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">Nothing printed yet.</p>
    );
  }
  // Group chunks into display lines; a chunk without "\n" continues the current line.
  const lines: { pid: number; text: string }[][] = [[]];
  for (const chunk of stdout) {
    const parts = chunk.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part)
        (lines[lines.length - 1] as { pid: number; text: string }[]).push({
          pid: chunk.pid,
          text: part,
        });
    });
  }
  if (lines[lines.length - 1]?.length === 0) lines.pop();
  return (
    <ol
      className="max-h-72 overflow-auto rounded-md bg-slate-950 p-2 font-mono text-sm text-slate-100"
      aria-label="Program output"
    >
      {lines.map((line, i) => (
        <li key={i} className="flex min-h-5 items-start gap-2 whitespace-pre-wrap">
          {line.map((part, j) => (
            <span key={j} className="inline-flex items-start gap-1">
              <span
                className="mt-0.5 shrink-0 rounded px-1 text-[0.7rem] font-semibold text-white"
                style={{ background: pidColor(part.pid, pidStart) }}
              >
                P{part.pid}
              </span>
              <span>{part.text}</span>
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
