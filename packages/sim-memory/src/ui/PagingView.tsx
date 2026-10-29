import {
  Alert,
  cx,
  Field,
  NumberInput,
  Panel,
  Select,
  StepPlayer,
  tableClass,
  TextInput,
  useStepIndex,
} from '@oslab/core';
import { useMemo } from 'react';
import {
  beladyCurve,
  PAGING_ALGORITHMS,
  parseReferenceString,
  simulatePaging,
  type PagingAlgorithm,
  type PagingResult,
} from '../engine';
import type { MemoryInput } from './input';

/** The textbook table: one column per reference, one row per frame, faults marked below. */
function FrameTable({
  refs,
  result,
  upTo,
  frames,
}: {
  refs: number[];
  result: PagingResult;
  upTo: number;
  frames: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-center font-mono text-sm tabular-nums">
        <thead>
          <tr>
            <th className="px-2 text-left font-sans text-xs text-slate-500">Reference</th>
            {refs.map((r, i) => (
              <th
                key={i}
                className={cx(
                  'min-w-8 border-b-2 px-1',
                  i === upTo
                    ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                    : 'border-transparent',
                )}
              >
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: frames }, (_, f) => (
            <tr key={f}>
              <th className="px-2 text-left font-sans text-xs font-normal text-slate-500">
                Frame {f}
              </th>
              {result.steps.map((s, i) => {
                const shown = i <= upTo;
                const page = s.frames[f];
                const loaded = s.loadedInto === f;
                return (
                  <td
                    key={i}
                    className={cx(
                      'h-8 border border-slate-200 dark:border-slate-700',
                      shown &&
                        loaded &&
                        'bg-rose-100 font-bold text-rose-900 dark:bg-rose-900/60 dark:text-rose-100',
                      i === upTo && 'outline outline-2 outline-indigo-500',
                    )}
                  >
                    {shown && page !== null ? page : ''}
                    {shown && s.refBits && page !== null && (
                      <sup className="text-[0.6rem] text-slate-500">{s.refBits[f] ? '1' : '0'}</sup>
                    )}
                    {shown && s.hand === f && (
                      <span className="text-[0.6rem] text-indigo-600"> ◀</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th className="px-2 text-left font-sans text-xs font-normal text-slate-500">Fault?</th>
            {result.steps.map((s, i) => (
              <td key={i} className="h-7 text-xs font-bold text-rose-600 dark:text-rose-400">
                {i <= upTo && !s.hit ? 'F' : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BeladyChart({ refs }: { refs: number[] }) {
  const maxFrames = Math.min(10, new Set(refs).size + 1);
  const fifo = beladyCurve(refs, maxFrames, 'fifo');
  const lru = beladyCurve(refs, maxFrames, 'lru');
  const top = Math.max(...fifo.map((p) => p.faults), 1);
  const anomaly = fifo.filter((p) => p.anomaly);
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-44 max-w-2xl items-end gap-3"
        role="img"
        aria-label="Page faults by number of frames for FIFO and LRU"
      >
        {fifo.map((p, i) => (
          <div key={p.frames} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-0.5">
              <div
                className={cx('w-1/2 rounded-t', p.anomaly ? 'bg-rose-500' : 'bg-indigo-500')}
                style={{ height: `${(p.faults / top) * 100}%` }}
                title={`FIFO, ${p.frames} frames: ${p.faults} faults`}
              />
              <div
                className="w-1/2 rounded-t bg-emerald-500"
                style={{ height: `${((lru[i]?.faults ?? 0) / top) * 100}%` }}
                title={`LRU, ${p.frames} frames: ${lru[i]?.faults} faults`}
              />
            </div>
            <span className="text-xs tabular-nums">{p.frames}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Frames on the x-axis. <span className="font-semibold text-indigo-600">■ FIFO</span>{' '}
        <span className="font-semibold text-emerald-600">■ LRU</span>{' '}
        <span className="font-semibold text-rose-600">■ FIFO getting worse with more frames</span>
      </p>
      <table className={cx(tableClass, 'w-auto tabular-nums')}>
        <thead>
          <tr>
            <th>Frames</th>
            {fifo.map((p) => (
              <th key={p.frames}>{p.frames}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>FIFO faults</th>
            {fifo.map((p) => (
              <td key={p.frames} className={cx(p.anomaly && 'font-bold text-rose-600')}>
                {p.faults}
              </td>
            ))}
          </tr>
          <tr>
            <th>LRU faults</th>
            {lru.map((p) => (
              <td key={p.frames}>{p.faults}</td>
            ))}
          </tr>
        </tbody>
      </table>
      {anomaly.length > 0 ? (
        <Alert tone="warning">
          Belady&apos;s anomaly: with FIFO, going from{' '}
          {anomaly.map((p) => `${p.frames - 1} to ${p.frames}`).join(' and ')} frames causes{' '}
          <strong>more</strong> page faults. LRU and OPT are stack algorithms and never do this.
        </Alert>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No anomaly for this string. Try <code>1 2 3 4 1 2 5 1 2 3 4 5</code>.
        </p>
      )}
    </div>
  );
}

export function PagingView({
  input,
  update,
}: {
  input: MemoryInput;
  update: (p: Partial<MemoryInput>) => void;
}) {
  const refs = useMemo(() => parseReferenceString(input.refs), [input.refs]);
  const single = input.algorithm === 'compare' ? null : input.algorithm;
  const result = useMemo(
    () => (refs && single ? simulatePaging(refs, input.frames, single) : null),
    [refs, single, input.frames],
  );
  const [index, setIndex] = useStepIndex(result);
  const step = result?.steps[Math.min(index, result.steps.length - 1)];
  const faultsSoFar = result ? result.steps.slice(0, index + 1).filter((s) => !s.hit).length : 0;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Input">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Reference string">
            <TextInput
              value={input.refs}
              onChange={(e) => update({ refs: e.target.value })}
              className="w-80 max-w-full font-mono"
            />
          </Field>
          <Field label="Frames">
            <NumberInput
              value={input.frames}
              min={1}
              max={12}
              onValueChange={(frames) => update({ frames })}
            />
          </Field>
          <Field label="Algorithm">
            <Select
              value={input.algorithm}
              onChange={(e) => update({ algorithm: e.target.value as PagingAlgorithm | 'compare' })}
            >
              {PAGING_ALGORITHMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value="compare">Compare all</option>
            </Select>
          </Field>
        </div>
        {!refs && (
          <div className="mt-3">
            <Alert tone="error">
              The reference string must be page numbers separated by spaces or commas.
            </Alert>
          </div>
        )}
        {single && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            <strong>{PAGING_ALGORITHMS.find((a) => a.id === single)?.name}:</strong>{' '}
            {PAGING_ALGORITHMS.find((a) => a.id === single)?.rule}
          </p>
        )}
      </Panel>

      {refs && result && step && (
        <Panel
          title={`Frames over time: ${faultsSoFar} fault(s) so far, ${result.faults} in total`}
        >
          <div className="flex flex-col gap-3">
            <StepPlayer
              count={result.steps.length}
              index={index}
              onIndexChange={setIndex}
              label={step.note}
            />
            <FrameTable refs={refs} result={result} upTo={index} frames={input.frames} />
            <p className="text-sm">
              Faults: <strong>{result.faults}</strong> · Hits: <strong>{result.hits}</strong> · Hit
              ratio: <strong>{((result.hits / refs.length) * 100).toFixed(1)}%</strong>
            </p>
          </div>
        </Panel>
      )}

      {refs && input.algorithm === 'compare' && (
        <Panel title={`All algorithms with ${input.frames} frame(s)`}>
          <table className={cx(tableClass, 'w-auto tabular-nums')}>
            <thead>
              <tr>
                <th>Algorithm</th>
                <th>Page faults</th>
                <th>Hit ratio</th>
              </tr>
            </thead>
            <tbody>
              {PAGING_ALGORITHMS.map((a) => {
                const r = simulatePaging(refs, input.frames, a.id);
                return (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{r.faults}</td>
                    <td>{((r.hits / refs.length) * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {refs && (
        <Panel title="Faults vs number of frames (Belady's anomaly)">
          <BeladyChart refs={refs} />
        </Panel>
      )}
    </div>
  );
}
