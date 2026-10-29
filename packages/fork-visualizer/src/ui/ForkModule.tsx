import {
  Alert,
  Button,
  Field,
  ModuleHeader,
  NumberInput,
  Panel,
  Select,
  StepPlayer,
  Tabs,
  Toggle,
  useSharedInput,
  type ExploreResult,
  type ModuleProps,
} from '@oslab/core';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  CError,
  clockStep,
  compile,
  exploreAll,
  initialStep,
  killStep,
  nextLine,
  POLICIES,
  replay,
  runDeterministic,
  runnable,
  runStep,
  runToEnd,
  type ForkStep,
  type Policy,
  type Program,
  type VmConfig,
} from '../engine';
import { CodeEditor, type LineMark } from './CodeEditor';
import { pidColor } from './colors';
import { ExhaustivePanel } from './ExhaustivePanel';
import { DEFAULT_INPUT, sanitizeInput, type ForkInput, type Mode } from './input';
import { OutputPanel } from './OutputPanel';
import { ProcessTree } from './ProcessTree';
import { PsTable } from './PsTable';
import { QuizPanel } from './QuizPanel';
import { SupportedSyntax } from './SupportedSyntax';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'deterministic', label: 'Deterministic' },
  { value: 'exhaustive', label: 'All interleavings' },
  { value: 'manual', label: 'You are the scheduler' },
];

/** A trace the user changed (kill, manual choice, explorer example), valid for one `key`. */
interface View {
  key: object;
  steps: ForkStep[];
  index: number;
}

function withClockTicks(steps: ForkStep[], config: VmConfig): ForkStep[] {
  const out = [...steps];
  for (
    let t = clockStep((out[out.length - 1] as ForkStep).state, config);
    t;
    t = clockStep(t.state, config)
  )
    out.push(t);
  return out;
}

export function ForkModule({ examples }: ModuleProps) {
  const shared = useSharedInput(examples, DEFAULT_INPUT, sanitizeInput);
  const { input, setInput } = shared;
  const update = (patch: Partial<ForkInput>) => setInput({ ...input, ...patch });
  const [tab, setTab] = useState<'simulate' | 'quiz'>('simulate');

  const code = useDeferredValue(input.code);
  const compiled = useMemo((): { program: Program } | { error: CError } => {
    try {
      return { program: compile(code) };
    } catch (e) {
      if (e instanceof CError) return { error: e };
      throw e;
    }
  }, [code]);
  const program = 'program' in compiled ? compiled.program : null;

  const config = useMemo<VmConfig>(
    () => ({ pidStart: input.pidStart, forkLimit: input.forkLimit }),
    [input.pidStart, input.forkLimit],
  );
  // Identity of "the current experiment": any change resets kills, manual choices and results.
  const traceKey = useMemo(
    () => ({ program, config, mode: input.mode, policy: input.policy, maxStates: input.maxStates }),
    [program, config, input.mode, input.policy, input.maxStates],
  );

  const deterministic = useMemo(
    () =>
      program && input.mode === 'deterministic'
        ? runDeterministic(program, input.policy, config)
        : null,
    [program, input.mode, input.policy, config],
  );
  const defaultSteps = useMemo(
    () => deterministic?.steps ?? (program ? [initialStep(program, config)] : []),
    [deterministic, program, config],
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
    setView({ key: traceKey, steps: replay(program, outcome.path, config), index: 0 });
  };

  const runExplorer = () => {
    if (!program) return;
    setExploring(true);
    // Let React paint the "exploring" state before the (synchronous) search starts.
    window.setTimeout(() => {
      const result = exploreAll(program, config, input.maxStates);
      setExploring(false);
      if (result.outcomes.length > 0) showOutcome(result, 0);
      else setExplored({ key: traceKey, result, selected: null });
    }, 30);
  };

  const prefix = () => steps.slice(0, index + 1);

  const kill = (pid: number) => {
    if (!program || !current) return;
    const killed = [...prefix(), killStep(current.state, pid, config)];
    const next =
      input.mode === 'deterministic'
        ? runToEnd(program, killed, input.policy, config).steps
        : withClockTicks(killed, config);
    setView({ key: traceKey, steps: next, index: killed.length - 1 });
  };

  const choose = (pid: number) => {
    if (!program || !current) return;
    const next = withClockTicks(
      [...prefix(), runStep(program, current.state, pid, 'parent-first', config)],
      config,
    );
    setView({ key: traceKey, steps: next, index: next.length - 1 });
  };

  const marks = useMemo((): LineMark[] => {
    if (!program || !current) return [];
    const { sys, ran, events } = current.state;
    const executed = events.find((e) => e.k === 'exec');
    return sys.procs
      .filter((p) => p.kind === 'user' && p.state !== 'zombie' && p.state !== 'terminated')
      .map((p) => ({
        line: p.pid === ran && executed ? executed.line : nextLine(program, p),
        pid: p.pid,
        color: pidColor(p.pid, config.pidStart),
        active: p.pid === ran,
      }));
  }, [program, current, config.pidStart]);

  const ready = current ? runnable(current.state.sys) : [];
  const policyHelp = POLICIES.find((p) => p.value === input.policy)?.help;

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader
        title="Fork visualizer"
        description="Paste C code that uses fork(), wait(), sleep() and exit(), and see every process it creates."
        moduleId="fork"
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
      <Tabs
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'simulate', label: 'Simulate' },
          { value: 'quiz', label: 'Quiz' },
        ]}
      />

      {tab === 'quiz' ? (
        <QuizPanel
          onOpen={(quizCode) => {
            setInput({ ...input, code: quizCode });
            setTab('simulate');
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_minmax(0,4fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Panel title="C code">
              <div className="flex flex-col gap-2">
                <CodeEditor
                  value={input.code}
                  onChange={(c) => update({ code: c })}
                  marks={marks}
                  errorLine={'error' in compiled ? compiled.error.line : null}
                />
                {'error' in compiled && (
                  <Alert tone="error">
                    Line {compiled.error.line}: {compiled.error.message}
                  </Alert>
                )}
                <SupportedSyntax />
              </div>
            </Panel>
            <Panel title="Execution">
              <div className="flex flex-col gap-3">
                <Tabs
                  label="Execution mode"
                  value={input.mode}
                  onChange={(mode) => update({ mode })}
                  options={MODE_OPTIONS}
                />
                <div className="flex flex-wrap items-end gap-3">
                  {input.mode === 'deterministic' && (
                    <Field label="Scheduler">
                      <Select
                        value={input.policy}
                        onChange={(e) => update({ policy: e.target.value as Policy })}
                      >
                        {POLICIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="First PID">
                    <NumberInput
                      value={input.pidStart}
                      min={3}
                      max={99999}
                      onValueChange={(pidStart) => update({ pidStart })}
                    />
                  </Field>
                  {input.mode === 'exhaustive' && (
                    <Field label="State cap">
                      <NumberInput
                        value={input.maxStates}
                        min={100}
                        max={500000}
                        onValueChange={(maxStates) => update({ maxStates })}
                        className="w-28"
                      />
                    </Field>
                  )}
                  <div className="flex items-center gap-2 pb-1">
                    <Toggle
                      checked={input.forkLimit !== null}
                      onChange={(on) => update({ forkLimit: on ? 2 : null })}
                      label="fork() fails after"
                    />
                    {input.forkLimit !== null && (
                      <NumberInput
                        value={input.forkLimit}
                        min={0}
                        max={1000}
                        onValueChange={(forkLimit) => update({ forkLimit })}
                      />
                    )}
                  </div>
                </div>
                {input.mode === 'deterministic' && policyHelp && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">{policyHelp}</p>
                )}
                {input.mode === 'exhaustive' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      onClick={runExplorer}
                      disabled={!program || exploring}
                    >
                      {exploring ? 'Exploring…' : 'Explore all interleavings'}
                    </Button>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      One step = one statement; printf is atomic.
                    </span>
                  </div>
                )}
                {deterministic?.truncated && input.mode === 'deterministic' && (
                  <Alert tone="warning">
                    The run was stopped after {steps.length} steps. Is there an infinite loop?
                  </Alert>
                )}
              </div>
            </Panel>
            {current && (
              <StepPlayer
                count={steps.length}
                index={index}
                onIndexChange={setIndex}
                label={current.label}
              />
            )}
          </div>

          <Panel title="Process tree" className="min-h-[420px] lg:row-span-2 2xl:row-span-1">
            {current ? (
              <ProcessTree snapshot={current.state} pidStart={config.pidStart} />
            ) : (
              <p className="text-sm text-slate-500">Fix the code to see the processes.</p>
            )}
          </Panel>

          <div className="flex min-w-0 flex-col gap-3">
            {input.mode === 'manual' && current && (
              <Panel title="Pick the next process">
                {ready.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {ready.map((pid) => (
                      <Button
                        key={pid}
                        onClick={() => choose(pid)}
                        style={{ borderColor: pidColor(pid, config.pidStart) }}
                        className="border-2"
                      >
                        Run P{pid}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No process is ready: the program has finished.
                  </p>
                )}
                {index < steps.length - 1 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Choosing now replaces the steps after this one.
                  </p>
                )}
              </Panel>
            )}
            <Panel title="Output (stdout)">
              {current && (
                <OutputPanel stdout={current.state.sys.stdout} pidStart={config.pidStart} />
              )}
            </Panel>
            <Panel title="Processes">
              {current && (
                <PsTable
                  snapshot={current.state}
                  onKill={input.mode === 'exhaustive' ? null : kill}
                />
              )}
            </Panel>
            {input.mode === 'exhaustive' && results && (
              <Panel title="Possible outputs">
                <ExhaustivePanel
                  result={results.result}
                  selected={results.selected}
                  onSelect={(i) => showOutcome(results.result, i)}
                  maxStates={input.maxStates}
                />
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
