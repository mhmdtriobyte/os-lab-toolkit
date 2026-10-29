import {
  Alert,
  Button,
  Field,
  Icon,
  ModuleHeader,
  NumberInput,
  OutcomeList,
  Panel,
  randomSeed,
  seriesColor,
  StepPlayer,
  Tabs,
  useSharedInput,
  type ExploreResult,
  type ModuleProps,
} from '@oslab/core';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  advance,
  AsmError,
  assemble,
  enabled,
  exploreThreads,
  replayThreads,
  runRandom,
  startStep,
  type ThreadsProgram,
  type ThreadStep,
} from '../engine';
import { DEFAULT_INPUT, sanitizeInput, type ThreadMode, type ThreadsInput } from './input';
import { SharedState } from './SharedState';
import { Swimlanes } from './Swimlanes';
import { ThreadColumns } from './ThreadColumns';

const MODE_OPTIONS: { value: ThreadMode; label: string }[] = [
  { value: 'exhaustive', label: 'All interleavings' },
  { value: 'random', label: 'Random scheduler' },
  { value: 'manual', label: 'You are the scheduler' },
];

interface View {
  key: object;
  steps: ThreadStep[];
  index: number;
}

function SyntaxHelp() {
  return (
    <details className="rounded-md border border-slate-200 p-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
      <summary className="cursor-pointer font-medium">Instruction reference</summary>
      <div className="mt-2 grid gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-2">
        <span>shared x = 0 · mutex m</span>
        <span>semaphore s = 1 · condition c</span>
        <span>thread NAME</span>
        <span>label:</span>
        <span>LOAD r, x → r = x</span>
        <span>STORE x, r → x = r</span>
        <span>MOV r, 5 · ADD r, 1 · SUB r, r2</span>
        <span>JMP l · JZ r, l · JNZ r, l</span>
        <span>LOCK m · UNLOCK m</span>
        <span>WAIT s · SIGNAL s (P / V)</span>
        <span>CWAIT c, m · CSIGNAL c</span>
        <span>CBROADCAST c · PRINT text</span>
      </div>
      <p className="mt-2">
        Every instruction is atomic. Registers (r, i, …) are private to each thread and start at 0.
        Comments start with ; or #.
      </p>
    </details>
  );
}

export function ThreadsModule({ examples }: ModuleProps) {
  const shared = useSharedInput(examples, DEFAULT_INPUT, sanitizeInput);
  const { input, setInput } = shared;
  const update = (patch: Partial<ThreadsInput>) => setInput({ ...input, ...patch });

  const code = useDeferredValue(input.code);
  const compiled = useMemo((): { program: ThreadsProgram } | { error: AsmError } => {
    try {
      return { program: assemble(code) };
    } catch (e) {
      if (e instanceof AsmError) return { error: e };
      throw e;
    }
  }, [code]);
  const program = 'program' in compiled ? compiled.program : null;
  const traceKey = useMemo(
    () => ({ program, mode: input.mode, seed: input.seed, maxStates: input.maxStates }),
    [program, input.mode, input.seed, input.maxStates],
  );

  const random = useMemo(
    () => (program && input.mode === 'random' ? runRandom(program, input.seed) : null),
    [program, input.mode, input.seed],
  );
  const defaultSteps = useMemo(
    () => random?.steps ?? (program ? [startStep(program)] : []),
    [random, program],
  );

  const [view, setView] = useState<View | null>(null);
  const active: View =
    view && view.key === traceKey ? view : { key: traceKey, steps: defaultSteps, index: 0 };
  const steps = active.steps;
  const index = Math.min(active.index, Math.max(0, steps.length - 1));
  const current = steps[index];
  const setIndex = (i: number) => setView({ ...active, index: i });

  const [explored, setExplored] = useState<{
    key: object;
    result: ExploreResult<number>;
    selected: number | null;
  } | null>(null);
  const [exploring, setExploring] = useState(false);
  const results = explored && explored.key === traceKey ? explored : null;

  const showOutcome = (result: ExploreResult<number>, i: number) => {
    const outcome = result.outcomes[i];
    if (!program || !outcome) return;
    setExplored({ key: traceKey, result, selected: i });
    setView({ key: traceKey, steps: replayThreads(program, outcome.path), index: 0 });
  };

  const runExplorer = () => {
    if (!program) return;
    setExploring(true);
    window.setTimeout(() => {
      const result = exploreThreads(program, input.maxStates);
      setExploring(false);
      if (result.outcomes.length > 0) showOutcome(result, 0);
    }, 30);
  };

  const choose = (t: number) => {
    if (!program || !current) return;
    const next = [...steps.slice(0, index + 1), advance(program, current, t)];
    setView({ key: traceKey, steps: next, index: next.length - 1 });
  };

  const ready = program && current ? enabled(program, current.state.world) : [];

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        title="Threads and synchronization"
        description="Race conditions, mutexes, semaphores and condition variables, one atomic instruction at a time."
        moduleId="threads"
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Program">
            <div className="flex flex-col gap-2">
              <textarea
                value={input.code}
                onChange={(e) => update({ code: e.target.value })}
                spellCheck={false}
                rows={18}
                aria-label="Thread program"
                className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
              {'error' in compiled && (
                <Alert tone="error">
                  Line {compiled.error.line}: {compiled.error.message}
                </Alert>
              )}
              <SyntaxHelp />
            </div>
          </Panel>
          <Panel title="Scheduler">
            <div className="flex flex-col gap-3">
              <Tabs
                label="Scheduling mode"
                value={input.mode}
                onChange={(mode) => update({ mode })}
                options={MODE_OPTIONS}
              />
              {input.mode === 'random' && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Seed">
                    <NumberInput
                      value={input.seed}
                      min={0}
                      max={1000000}
                      onValueChange={(seed) => update({ seed })}
                      className="w-28"
                    />
                  </Field>
                  <Button onClick={() => update({ seed: randomSeed() })}>
                    <Icon name="shuffle" />
                    Another run
                  </Button>
                  {random?.truncated && (
                    <Alert tone="warning">Stopped after {steps.length} steps.</Alert>
                  )}
                </div>
              )}
              {input.mode === 'exhaustive' && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="State cap">
                    <NumberInput
                      value={input.maxStates}
                      min={100}
                      max={500000}
                      onValueChange={(maxStates) => update({ maxStates })}
                      className="w-28"
                    />
                  </Field>
                  <Button variant="primary" onClick={runExplorer} disabled={!program || exploring}>
                    {exploring ? 'Exploring…' : 'Explore all interleavings'}
                  </Button>
                </div>
              )}
              {input.mode === 'manual' && current && (
                <div className="flex flex-wrap items-center gap-2">
                  {ready.length > 0 ? (
                    ready.map((t) => (
                      <Button
                        key={t}
                        onClick={() => choose(t)}
                        className="border-2"
                        style={{ borderColor: seriesColor(t) }}
                      >
                        Run {program?.threads[t]?.name}
                      </Button>
                    ))
                  ) : (
                    <span className="text-sm">No thread can run.</span>
                  )}
                </div>
              )}
            </div>
          </Panel>
          {results && (
            <Panel title="Possible outcomes">
              <OutcomeList
                result={results.result}
                selected={results.selected}
                onSelect={(i) => showOutcome(results.result, i)}
                maxStates={input.maxStates}
              />
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {program && current && (
            <>
              <StepPlayer
                count={steps.length}
                index={index}
                onIndexChange={setIndex}
                label={current.label}
              />
              {current.state.end && (
                <Alert tone={/^(DEADLOCK|ERROR)/.test(current.state.end) ? 'error' : 'success'}>
                  {current.state.end}
                </Alert>
              )}
              <Panel title="Threads">
                <div className="overflow-x-auto">
                  <ThreadColumns program={program} snap={current.state} />
                </div>
              </Panel>
              <div className="grid gap-3 md:grid-cols-2">
                <Panel title="Shared state">
                  <SharedState program={program} world={current.state.world} />
                </Panel>
                <Panel title="Output (PRINT)">
                  {current.state.output ? (
                    <pre className="max-h-48 overflow-auto rounded bg-slate-950 p-2 text-sm text-slate-100">
                      {current.state.output}
                    </pre>
                  ) : (
                    <p className="text-sm italic text-slate-500">Nothing printed yet.</p>
                  )}
                </Panel>
              </div>
              <Panel title="Timeline">
                <Swimlanes program={program} steps={steps} index={index} onSelect={setIndex} />
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
