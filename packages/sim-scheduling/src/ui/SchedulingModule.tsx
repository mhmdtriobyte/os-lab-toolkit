import {
  Alert,
  cx,
  Field,
  ModuleHeader,
  NumberInput,
  Panel,
  Select,
  StepPlayer,
  tableClass,
  Tabs,
  Toggle,
  useSharedInput,
  useStepIndex,
  type ModuleProps,
} from '@oslab/core';
import { useMemo } from 'react';
import {
  ALGORITHM_IDS,
  ALGORITHMS,
  compareAll,
  METRICS,
  simulate,
  validate,
  winners,
  type AlgorithmId,
  type ComparisonRow,
  type Metrics,
  type ProcessSpec,
  type ScheduleResult,
  type SchedOptions,
  type Tick,
} from '../engine';
import { GanttChart, procColor } from './GanttChart';
import { DEFAULT_INPUT, sanitizeInput, type SchedInput } from './input';
import { ProcessTableEditor } from './ProcessTableEditor';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const fmtMetric = (key: keyof Metrics, n: number) =>
  key === 'utilization' ? `${(n * 100).toFixed(1)}%` : fmt(n);

function ProcChip({ index, processes }: { index: number; processes: readonly ProcessSpec[] }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-semibold text-white"
      style={{ background: procColor(index) }}
    >
      {processes[index]?.name}
    </span>
  );
}

function TickView({ tick, processes }: { tick: Tick; processes: readonly ProcessSpec[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          CPU during [{tick.time}, {tick.time + 1})
        </h3>
        {tick.running === null ? (
          <span className="text-sm italic text-slate-500">idle</span>
        ) : (
          <ProcChip index={tick.running} processes={processes} />
        )}
        {tick.preempted !== null && (
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
            {processes[tick.preempted]?.name} was preempted at t={tick.time}.
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          Ready queue (next first)
        </h3>
        <div className="flex flex-wrap gap-1">
          {tick.queue.length === 0 ? (
            <span className="text-sm italic text-slate-500">empty</span>
          ) : (
            tick.queue.map((i) => (
              <span key={i} className="flex items-center gap-1">
                <ProcChip index={i} processes={processes} />
                <span className="text-xs text-slate-500">({tick.remaining[i]} left)</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsTable({ result }: { result: ScheduleResult }) {
  const m = result.metrics;
  return (
    <div className="overflow-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Process</th>
            <th>Arrival</th>
            <th>Burst</th>
            <th>Priority</th>
            <th>Completion</th>
            <th title="Completion − Arrival">Turnaround</th>
            <th title="Turnaround − Burst">Waiting</th>
            <th title="First run − Arrival">Response</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {result.processes.map((p) => (
            <tr key={p.index}>
              <td>
                <ProcChip index={p.index} processes={result.processes} />
              </td>
              <td>{p.arrival}</td>
              <td>{p.burst}</td>
              <td>{p.priority}</td>
              <td>{p.completion}</td>
              <td>{p.turnaround}</td>
              <td>{p.waiting}</td>
              <td>{p.response}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={5}>Average</td>
            <td>{fmt(m.avgTurnaround)}</td>
            <td>{fmt(m.avgWaiting)}</td>
            <td>{fmt(m.avgResponse)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
        CPU utilization: <strong>{fmtMetric('utilization', m.utilization)}</strong> (busy time ÷
        time from first arrival to last completion) · Context switches:{' '}
        <strong>{m.contextSwitches}</strong>
      </p>
    </div>
  );
}

function CompareView({ rows, processes }: { rows: ComparisonRow[]; processes: ProcessSpec[] }) {
  const best = Object.fromEntries(METRICS.map((m) => [m.key, winners(rows, m.key)]));
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Metrics side by side (winner per metric highlighted)">
        <div className="overflow-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Algorithm</th>
                {METRICS.map((m) => (
                  <th key={m.key}>
                    {m.label}{' '}
                    <span className="font-normal text-slate-500">({m.better} is better)</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="font-medium">{r.label}</td>
                  {METRICS.map((m) => {
                    const win = best[m.key]?.includes(r.label);
                    return (
                      <td
                        key={m.key}
                        className={cx(
                          win &&
                            'bg-emerald-100 font-bold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
                        )}
                      >
                        {fmtMetric(m.key, r.result.metrics[m.key])}
                        {win && <span className="sr-only"> (best)</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Gantt charts">
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.label}>
              <h3 className="mb-1 text-sm font-semibold">{r.label}</h3>
              <GanttChart
                segments={r.result.segments}
                processes={processes}
                makespan={r.result.makespan}
                compact
              />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function SchedulingModule({ examples }: ModuleProps) {
  const shared = useSharedInput(examples, DEFAULT_INPUT, sanitizeInput);
  const { input, setInput } = shared;
  const update = (patch: Partial<SchedInput>) => setInput({ ...input, ...patch });
  const options: SchedOptions = useMemo(
    () => ({
      quantum: input.quantum,
      priorityPreemptive: input.priorityPreemptive,
      lowerIsHigher: input.lowerIsHigher,
    }),
    [input.quantum, input.priorityPreemptive, input.lowerIsHigher],
  );
  const error = validate(input.processes, options);
  const result = useMemo(
    () => (error ? null : simulate(input.processes, input.algorithm, options)),
    [error, input.processes, input.algorithm, options],
  );
  const rows = useMemo(
    () => (error || input.view !== 'compare' ? null : compareAll(input.processes, options)),
    [error, input.view, input.processes, options],
  );
  const [index, setIndex] = useStepIndex(result);
  const algorithm = ALGORITHMS[input.algorithm];
  const tick = result?.ticks[Math.min(index, result.ticks.length - 1)];
  const finished = result && tick && index >= result.ticks.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        title="CPU scheduling"
        description="FCFS, SJF, SRTF, Priority and Round Robin: Gantt chart, ready queue and metrics."
        moduleId="scheduling"
        examples={examples}
        exampleId={shared.exampleId}
        onLoadExample={shared.loadExample}
        input={input}
        onImport={(raw) => {
          const parsed = sanitizeInput(raw);
          if (parsed) setInput(parsed);
          return parsed !== null;
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Processes">
            <ProcessTableEditor
              processes={input.processes}
              onChange={(processes) => update({ processes })}
            />
          </Panel>
          <Panel title="Algorithm">
            <div className="flex flex-col gap-3">
              <Tabs
                label="View"
                value={input.view}
                onChange={(view) => update({ view })}
                options={[
                  { value: 'single', label: 'One algorithm' },
                  { value: 'compare', label: 'Compare all' },
                ]}
              />
              <div className="flex flex-wrap items-end gap-3">
                {input.view === 'single' && (
                  <Field label="Algorithm">
                    <Select
                      value={input.algorithm}
                      onChange={(e) => update({ algorithm: e.target.value as AlgorithmId })}
                    >
                      {ALGORITHM_IDS.map((id) => (
                        <option key={id} value={id}>
                          {ALGORITHMS[id].name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {(input.view === 'compare' || input.algorithm === 'rr') && (
                  <Field label="Time quantum">
                    <NumberInput
                      value={input.quantum}
                      min={1}
                      max={100}
                      onValueChange={(quantum) => update({ quantum })}
                    />
                  </Field>
                )}
              </div>
              {(input.view === 'compare' || input.algorithm === 'priority') && (
                <div className="flex flex-col gap-1">
                  {input.view === 'single' && (
                    <Toggle
                      checked={input.priorityPreemptive}
                      onChange={(priorityPreemptive) => update({ priorityPreemptive })}
                      label="Preemptive priority"
                    />
                  )}
                  <Toggle
                    checked={input.lowerIsHigher}
                    onChange={(lowerIsHigher) => update({ lowerIsHigher })}
                    label="Lower number = higher priority"
                  />
                </div>
              )}
              {input.view === 'single' && (
                <Alert tone="info">
                  <strong>{algorithm.short} rules:</strong> {algorithm.rules}
                </Alert>
              )}
              {input.view === 'compare' && (
                <Alert tone="info">
                  Tie-breaking everywhere: earlier arrival first, then table order. RR queues new
                  arrivals before the process whose quantum just expired.
                </Alert>
              )}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {error && <Alert tone="error">{error}</Alert>}
          {result && input.view === 'single' && tick && (
            <>
              <Panel title={`Gantt chart: ${algorithm.name}`}>
                <GanttChart
                  segments={result.segments}
                  processes={input.processes}
                  makespan={result.makespan}
                  upTo={tick.time + 1}
                />
              </Panel>
              <StepPlayer
                count={result.ticks.length}
                index={index}
                onIndexChange={setIndex}
                label={`t = ${tick.time}${tick.arrived.length ? ` · arrived: ${tick.arrived.map((i) => input.processes[i]?.name).join(', ')}` : ''}${tick.running === null ? ' · CPU idle' : ` · running ${input.processes[tick.running]?.name}`}`}
              />
              <Panel title="At this moment">
                <TickView tick={tick} processes={input.processes} />
              </Panel>
              <Panel
                title={
                  finished ? 'Results' : 'Results (play to the end to see the full schedule above)'
                }
              >
                <ResultsTable result={result} />
              </Panel>
            </>
          )}
          {rows && <CompareView rows={rows} processes={input.processes} />}
        </div>
      </div>
    </div>
  );
}
