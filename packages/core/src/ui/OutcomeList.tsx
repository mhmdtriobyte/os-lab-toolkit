import type { ExploreResult } from '../engine';
import { Alert, Button, cx } from './primitives';

/** Results of an exhaustive exploration: each distinct outcome, its count, and a trace button. */
export function OutcomeList<C>({
  result,
  selected,
  onSelect,
  maxStates,
}: {
  result: ExploreResult<C>;
  selected: number | null;
  onSelect: (index: number) => void;
  maxStates: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-700 dark:text-slate-200">
        <strong>{result.outcomes.length}</strong> distinct output(s) from{' '}
        <strong>{result.totalInterleavings.toLocaleString()}</strong> interleavings (
        {result.statesExplored.toLocaleString()} distinct states).
      </p>
      {result.truncated && (
        <Alert tone="warning">
          Stopped after {maxStates.toLocaleString()} states: the results below are incomplete. Raise
          the state cap or simplify the program.
        </Alert>
      )}
      <ol className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
        {result.outcomes.map((o, i) => (
          <li
            key={i}
            className={cx(
              'rounded-md border p-2',
              selected === i
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                : 'border-slate-200 dark:border-slate-700',
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Output #{i + 1} · {o.count.toLocaleString()} interleaving(s)
                {o.kind === 'nonterminating' && ' · never terminates'}
                {o.kind === 'truncated' && ' · partial (cap reached)'}
              </span>
              <Button
                className="!py-0.5 text-xs"
                onClick={() => onSelect(i)}
                aria-pressed={selected === i}
              >
                Show a trace
              </Button>
            </div>
            <pre className="overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-100">
              {o.output || '(no output)'}
            </pre>
          </li>
        ))}
      </ol>
    </div>
  );
}
