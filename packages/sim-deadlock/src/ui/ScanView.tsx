import { Alert, cx, StepPlayer, tableClass, useStepIndex } from '@oslab/core';
import { fmt, type ScanResult } from '../engine';

/** Step-by-step view of the safety / detection loop: Work, Finish and the process being checked. */
export function ScanView({
  result,
  processes,
  resources,
  demand,
  demandLabel,
  summary,
  ok,
}: {
  result: ScanResult;
  processes: readonly string[];
  resources: readonly string[];
  demand: readonly (readonly number[])[];
  demandLabel: string;
  summary: string;
  ok: boolean;
}) {
  // One extra step at the end shows the verdict.
  const [index, setIndex] = useStepIndex(result);
  const count = result.steps.length + 1;
  const step = result.steps[Math.min(index, result.steps.length - 1)];
  const done = index >= result.steps.length || !step;
  const finish = done ? result.finish : step.finish;
  const work = done ? (result.steps[result.steps.length - 1]?.workAfter ?? []) : step.workAfter;
  const sequence = result.sequence.slice(
    0,
    done ? undefined : result.steps.slice(0, index + 1).filter((s) => s.canFinish).length,
  );

  return (
    <div className="flex flex-col gap-3">
      <StepPlayer
        count={count}
        index={index}
        onIndexChange={setIndex}
        label={done ? summary : `Pass ${step.pass}: ${step.note}`}
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative overflow-auto">
          <table className={cx(tableClass, 'tabular-nums')}>
            <thead>
              <tr>
                <th>Process</th>
                <th>
                  {demandLabel} ({resources.join(' ')})
                </th>
                <th>Finish</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((p, i) => (
                <tr
                  key={`${p}-${i}`}
                  className={cx(
                    !done &&
                      step.process === i &&
                      (step.canFinish
                        ? 'bg-emerald-100 dark:bg-emerald-900/60'
                        : 'bg-amber-100 dark:bg-amber-900/60'),
                  )}
                >
                  <td className="font-medium">{p}</td>
                  <td>{fmt(demand[i] ?? [])}</td>
                  <td>{finish[i] ? '✓ true' : '✗ false'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div>
            <span className="font-semibold">Work</span> ({resources.join(' ')}):{' '}
            <span className="font-mono">{fmt(work)}</span>
          </div>
          <div>
            <span className="font-semibold">Sequence so far:</span>{' '}
            <span className="font-mono">
              &lt;{sequence.map((i) => processes[i]).join(', ')}&gt;
            </span>
          </div>
        </div>
      </div>
      {done && <Alert tone={ok ? 'success' : 'error'}>{summary}</Alert>}
    </div>
  );
}
