import { Alert, Button, Panel } from '@oslab/core';
import { useMemo } from 'react';
import { detect, validateDetection, type DetectionState } from '../engine';
import { MatrixEditor, nextLabel, nextResource, resizeCols, resizeRows } from './MatrixEditor';
import { ScanView } from './ScanView';

export function DetectionView({
  state,
  onChange,
}: {
  state: DetectionState;
  onChange: (s: DetectionState) => void;
}) {
  const n = state.processes.length;
  const m = state.resources.length;
  const error = validateDetection(state);
  const result = useMemo(() => (error ? null : detect(state)), [error, state]);

  const setProcesses = (count: number) =>
    onChange({
      ...state,
      processes: Array.from(
        { length: count },
        (_, i) => state.processes[i] ?? nextLabel(state.processes, 'P', i),
      ),
      allocation: resizeRows(state.allocation, count, m),
      request: resizeRows(state.request, count, m),
    });
  const setResources = (count: number) =>
    onChange({
      ...state,
      resources: Array.from(
        { length: count },
        (_, j) => state.resources[j] ?? nextResource(state.resources),
      ),
      allocation: resizeCols(state.allocation, count),
      request: resizeCols(state.request, count),
      available: resizeCols([state.available], count)[0] as number[],
    });

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="State (several instances per resource type)"
        actions={
          <>
            <Button onClick={() => setProcesses(n + 1)} disabled={n >= 12}>
              + Process
            </Button>
            <Button onClick={() => setProcesses(n - 1)} disabled={n <= 1}>
              − Process
            </Button>
            <Button onClick={() => setResources(m + 1)} disabled={m >= 12}>
              + Resource
            </Button>
            <Button onClick={() => setResources(m - 1)} disabled={m <= 1}>
              − Resource
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-6">
          <MatrixEditor
            caption="Allocation"
            rows={state.processes}
            cols={state.resources}
            values={state.allocation}
            onChange={(allocation) => onChange({ ...state, allocation })}
          />
          <MatrixEditor
            caption="Request"
            rows={state.processes}
            cols={state.resources}
            values={state.request}
            onChange={(request) => onChange({ ...state, request })}
          />
          <MatrixEditor
            caption="Available"
            rows={['']}
            cols={state.resources}
            values={[state.available]}
            onChange={([available]) => onChange({ ...state, available: available as number[] })}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Unlike the Banker&apos;s algorithm there is no Max: Request is what each process is
          waiting for right now. A process that holds nothing starts with Finish = true.
        </p>
        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
      </Panel>
      {result && (
        <Panel title="Detection algorithm, step by step">
          <ScanView
            result={result}
            processes={state.processes}
            resources={state.resources}
            demand={state.request}
            demandLabel="Request"
            summary={result.summary}
            ok={result.deadlocked.length === 0}
          />
        </Panel>
      )}
    </div>
  );
}
