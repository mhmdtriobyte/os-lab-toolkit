import {
  Alert,
  Button,
  cx,
  Icon,
  Field,
  NumberInput,
  Panel,
  Select,
  seriesColor,
  StepPlayer,
  tableClass,
  TextInput,
  useStepIndex,
} from '@oslab/core';
import { useMemo } from 'react';
import {
  FIT_STRATEGIES,
  initialSegments,
  simulateAllocation,
  type FitStrategy,
  type MemoryOp,
  type Segment,
} from '../engine';
import { parseBlocks, type MemoryInput } from './input';

function MemoryBar({
  segments,
  names,
  highlight,
}: {
  segments: readonly Segment[];
  names: string[];
  highlight: number | null;
}) {
  const total = segments.reduce((s, x) => s + x.size, 0) || 1;
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex h-14 w-full overflow-hidden rounded border border-slate-300 dark:border-slate-600"
        role="img"
        aria-label={segments.map((s) => `${s.owner ?? 'hole'} ${s.size}`).join(', ')}
      >
        {segments.map((s, i) => {
          const prev = segments[i - 1];
          return (
            <div
              key={`${s.start}-${i}`}
              className={cx(
                'flex min-w-0 flex-col items-center justify-center overflow-hidden text-xs font-semibold',
                s.owner ? 'text-white' : 'text-slate-700 dark:text-slate-200',
                prev &&
                  prev.block !== s.block &&
                  'border-l-4 border-slate-900 dark:border-slate-100',
                i === highlight && 'outline outline-2 -outline-offset-2 outline-amber-400',
              )}
              style={{
                width: `${(s.size / total) * 100}%`,
                background: s.owner
                  ? seriesColor(Math.max(0, names.indexOf(s.owner)))
                  : 'repeating-linear-gradient(45deg, #e2e8f0 0 5px, #cbd5e1 5px 10px)',
              }}
              title={`${s.owner ?? 'hole'}: ${s.size} at ${s.start}`}
            >
              <span className="truncate">{s.owner ?? 'free'}</span>
              <span className="truncate font-normal">{s.size}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Thick lines separate the original partitions; holes never merge across them.
      </p>
    </div>
  );
}

function OpsEditor({ ops, onChange }: { ops: MemoryOp[]; onChange: (ops: MemoryOp[]) => void }) {
  const set = (i: number, op: MemoryOp) => onChange(ops.map((o, j) => (j === i ? op : o)));
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-x-auto">
        <table className={cx(tableClass, 'w-auto')}>
          <thead>
            <tr>
              <th>#</th>
              <th>Action</th>
              <th>Process</th>
              <th>Size</th>
              <th className="sr-only">Remove</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op, i) => (
              <tr key={i}>
                <td className="tabular-nums">{i + 1}</td>
                <td>
                  <Select
                    aria-label={`Action ${i + 1}`}
                    value={op.kind}
                    onChange={(e) =>
                      set(
                        i,
                        e.target.value === 'free'
                          ? { kind: 'free', name: op.name }
                          : { kind: 'alloc', name: op.name, size: 100 },
                      )
                    }
                  >
                    <option value="alloc">allocate</option>
                    <option value="free">free</option>
                  </Select>
                </td>
                <td>
                  <TextInput
                    aria-label={`Process ${i + 1}`}
                    value={op.name}
                    maxLength={12}
                    onChange={(e) => set(i, { ...op, name: e.target.value })}
                    className="w-20"
                  />
                </td>
                <td>
                  {op.kind === 'alloc' && (
                    <NumberInput
                      aria-label={`Size ${i + 1}`}
                      value={op.size}
                      min={1}
                      max={9999999}
                      onValueChange={(size) => set(i, { ...op, size })}
                      className="w-24"
                    />
                  )}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    aria-label={`Remove action ${i + 1}`}
                    onClick={() => onChange(ops.filter((_, j) => j !== i))}
                  >
                    <Icon name="close" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() =>
            onChange([...ops, { kind: 'alloc', name: `P${ops.length + 1}`, size: 100 }])
          }
          disabled={ops.length >= 40}
        >
          + Allocate
        </Button>
        <Button
          onClick={() =>
            onChange([
              ...ops,
              { kind: 'free', name: ops.find((o) => o.kind === 'alloc')?.name ?? 'P1' },
            ])
          }
          disabled={ops.length >= 40}
        >
          + Free
        </Button>
      </div>
    </div>
  );
}

export function AllocationView({
  input,
  update,
}: {
  input: MemoryInput;
  update: (p: Partial<MemoryInput>) => void;
}) {
  const blocks = useMemo(() => parseBlocks(input.blocks), [input.blocks]);
  const names = [...new Set(input.ops.map((o) => o.name))];
  const single = input.strategy === 'compare' ? null : input.strategy;
  const result = useMemo(
    () => (blocks && single ? simulateAllocation(blocks, input.ops, single) : null),
    [blocks, single, input.ops],
  );
  // Step 0 is the empty memory, then one step per action.
  const [index, setIndex] = useStepIndex(result);
  const step = index > 0 ? result?.steps[index - 1] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Input">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Free partitions (in address order)">
              <TextInput
                value={input.blocks}
                onChange={(e) => update({ blocks: e.target.value })}
                className="w-72 max-w-full font-mono"
              />
            </Field>
            <Field label="Strategy">
              <Select
                value={input.strategy}
                onChange={(e) => update({ strategy: e.target.value as FitStrategy | 'compare' })}
              >
                {FIT_STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="compare">Compare all</option>
              </Select>
            </Field>
          </div>
          {!blocks && (
            <Alert tone="error">
              Partitions must be positive sizes separated by commas or spaces.
            </Alert>
          )}
          {single && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>{FIT_STRATEGIES.find((s) => s.id === single)?.name}:</strong>{' '}
              {FIT_STRATEGIES.find((s) => s.id === single)?.rule}
            </p>
          )}
          <OpsEditor ops={input.ops} onChange={(ops) => update({ ops })} />
        </div>
      </Panel>

      {blocks && result && (
        <Panel title="Memory">
          <div className="flex flex-col gap-3">
            <StepPlayer
              count={result.steps.length + 1}
              index={index}
              onIndexChange={setIndex}
              label={step ? step.note : 'Initial memory: every partition is a hole.'}
            />
            <MemoryBar
              segments={step?.segments ?? initialSegments(blocks)}
              names={names}
              highlight={step?.changed ?? null}
            />
            {step && !step.ok && <Alert tone="warning">{step.note}</Alert>}
            {index >= result.steps.length && (
              <p className="text-sm">
                Could not allocate:{' '}
                <strong>{result.failed.length ? result.failed.join(', ') : 'none'}</strong> · Free
                memory: <strong>{result.freeTotal}</strong> · Largest hole:{' '}
                <strong>{result.largestHole}</strong>
                {result.fragmented &&
                  ' (external fragmentation: enough free memory in total, but not in one piece)'}
              </p>
            )}
          </div>
        </Panel>
      )}

      {blocks && input.strategy === 'compare' && (
        <Panel title="All strategies, final memory">
          <div className="flex flex-col gap-4">
            {FIT_STRATEGIES.map((s) => {
              const r = simulateAllocation(blocks, input.ops, s.id);
              const last = r.steps[r.steps.length - 1]?.segments ?? initialSegments(blocks);
              return (
                <div key={s.id} className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">
                    {s.name}:{' '}
                    {r.failed.length
                      ? `could not allocate ${r.failed.join(', ')}`
                      : 'every request fit'}{' '}
                    · largest hole {r.largestHole}
                  </h3>
                  <MemoryBar segments={last} names={names} highlight={null} />
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
