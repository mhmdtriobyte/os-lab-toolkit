import { Alert, Button, Field, NumberInput, Panel, Select } from '@oslab/core';
import { useMemo, useState } from 'react';
import {
  fmt,
  requestResources,
  safety,
  totalInstances,
  validateBanker,
  type RequestResult,
} from '../engine';
import type { DeadlockInput } from './input';
import { MatrixEditor, nextLabel, nextResource, resizeCols, resizeRows } from './MatrixEditor';
import { ScanView } from './ScanView';

type Banker = DeadlockInput['banker'];

export function BankerView({ state, onChange }: { state: Banker; onChange: (s: Banker) => void }) {
  const n = state.processes.length;
  const m = state.resources.length;
  const error = validateBanker(state);
  const result = useMemo(() => (error ? null : safety(state)), [error, state]);
  const [outcome, setOutcome] = useState<{ for: Banker; result: RequestResult } | null>(null);
  const request = outcome && outcome.for === state ? outcome.result : null;

  const setProcesses = (count: number) => {
    const processes = Array.from(
      { length: count },
      (_, i) => state.processes[i] ?? nextLabel(state.processes, 'P', i),
    );
    onChange({
      ...state,
      processes,
      allocation: resizeRows(state.allocation, count, m),
      max: resizeRows(state.max, count, m),
      requestProcess: Math.min(state.requestProcess, count - 1),
    });
  };
  const setResources = (count: number) => {
    const resources = Array.from(
      { length: count },
      (_, j) => state.resources[j] ?? nextResource(state.resources),
    );
    onChange({
      ...state,
      resources,
      allocation: resizeCols(state.allocation, count),
      max: resizeCols(state.max, count),
      available: resizeCols([state.available], count)[0] as number[],
      requestVector: resizeCols([state.requestVector], count)[0] as number[],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="State"
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
            caption="Max"
            rows={state.processes}
            cols={state.resources}
            values={state.max}
            onChange={(max) => onChange({ ...state, max })}
          />
          {result && (
            <MatrixEditor
              caption="Need = Max − Allocation"
              rows={state.processes}
              cols={state.resources}
              values={result.need}
            />
          )}
          <div className="flex flex-col gap-3">
            <MatrixEditor
              caption="Available"
              rows={['']}
              cols={state.resources}
              values={[state.available]}
              onChange={([available]) => onChange({ ...state, available: available as number[] })}
            />
            {!error && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Total instances: <span className="font-mono">{fmt(totalInstances(state))}</span>
              </p>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
      </Panel>

      {result && (
        <Panel title="Safety algorithm, step by step">
          <ScanView
            result={result}
            processes={state.processes}
            resources={state.resources}
            demand={result.need}
            demandLabel="Need"
            summary={result.summary}
            ok={result.safe}
          />
        </Panel>
      )}

      {!error && (
        <Panel title="Resource-request algorithm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Process">
                <Select
                  value={state.requestProcess}
                  onChange={(e) => onChange({ ...state, requestProcess: Number(e.target.value) })}
                >
                  {state.processes.map((p, i) => (
                    <option key={`${p}-${i}`} value={i}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              {state.resources.map((r, j) => (
                <Field key={r} label={`Request ${r}`}>
                  <NumberInput
                    value={state.requestVector[j] ?? 0}
                    min={0}
                    max={999}
                    onValueChange={(v) =>
                      onChange({
                        ...state,
                        requestVector: state.requestVector.map((x, k) => (k === j ? v : x)),
                      })
                    }
                    className="w-16"
                  />
                </Field>
              ))}
              <Button
                variant="primary"
                onClick={() =>
                  setOutcome({
                    for: state,
                    result: requestResources(state, state.requestProcess, state.requestVector),
                  })
                }
              >
                Request
              </Button>
            </div>
            <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-300">
              <li>If Request &gt; Need: error, the process exceeded its maximum claim.</li>
              <li>If Request &gt; Available: the process must wait.</li>
              <li>
                Pretend to allocate, then run the safety algorithm: grant if safe, otherwise restore
                and wait.
              </li>
            </ol>
            {request && (
              <>
                <Alert
                  tone={
                    request.granted
                      ? 'success'
                      : request.verdict === 'must-wait'
                        ? 'warning'
                        : 'error'
                  }
                >
                  {request.reason}
                </Alert>
                {request.next && (
                  <div>
                    <Button onClick={() => request.next && onChange({ ...state, ...request.next })}>
                      Apply: make this the new state
                    </Button>
                  </div>
                )}
                {request.safety && (
                  <details className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                    <summary className="cursor-pointer text-sm font-medium">
                      Safety check of the pretend state
                    </summary>
                    <div className="mt-2">
                      <ScanView
                        result={request.safety}
                        processes={state.processes}
                        resources={state.resources}
                        demand={request.safety.need}
                        demandLabel="Need"
                        summary={request.safety.summary}
                        ok={request.safety.safe}
                      />
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
