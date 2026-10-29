import { useEffect, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { Button } from './primitives';

export interface StepPlayerProps {
  /** Number of steps in the trace. */
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** Description of the current step. */
  label?: string;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

/** Walks an array of immutable steps: play, pause, step, reset and speed. */
export function StepPlayer({ count, index, onIndexChange, label }: StepPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(2);
  const last = Math.max(0, count - 1);
  const speed = SPEEDS[speedIndex] ?? 1;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => onIndexChange(Math.min(last, index + 1)), 800 / speed);
    return () => window.clearTimeout(id);
  }, [playing, index, last, speed, onIndexChange]);

  const go = (i: number) => onIndexChange(Math.max(0, Math.min(last, i)));
  const togglePlay = () => {
    if (!playing && index >= last) go(0);
    setPlaying((p) => !p);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const actions: Record<string, () => void> = {
      ArrowRight: () => go(index + 1),
      ArrowLeft: () => go(index - 1),
      Home: () => go(0),
      End: () => go(last),
      ' ': togglePlay,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Step player (arrow keys step, space plays)"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          aria-label="Reset"
          title="Reset (Home)"
          onClick={() => {
            setPlaying(false);
            go(0);
          }}
        >
          <Icon name="first" />
        </Button>
        <Button
          aria-label="Step back"
          title="Step back (←)"
          onClick={() => go(index - 1)}
          disabled={index <= 0}
        >
          <Icon name="prev" />
        </Button>
        <Button
          variant="primary"
          aria-label={playing ? 'Pause' : 'Play'}
          title="Play / pause (space)"
          onClick={togglePlay}
          disabled={count <= 1}
          className="w-24"
        >
          <Icon name={playing ? 'pause' : 'play'} />
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          aria-label="Step forward"
          title="Step forward (→)"
          onClick={() => go(index + 1)}
          disabled={index >= last}
        >
          <Icon name="next" />
        </Button>
        <Button
          aria-label="Go to end"
          title="End"
          onClick={() => go(last)}
          disabled={index >= last}
        >
          <Icon name="last" />
        </Button>
        <span className="ml-1 text-sm tabular-nums text-slate-600 dark:text-slate-300">
          Step {count === 0 ? 0 : index + 1} / {count}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          Speed
          <input
            type="range"
            min={0}
            max={SPEEDS.length - 1}
            value={speedIndex}
            onChange={(e) => setSpeedIndex(Number(e.target.value))}
            aria-valuetext={`${speed}x`}
            className="w-24 accent-indigo-600"
          />
          <span className="w-8 tabular-nums">{speed}x</span>
        </label>
      </div>
      <input
        type="range"
        aria-label="Timeline"
        min={0}
        max={last}
        value={Math.min(index, last)}
        onChange={(e) => go(Number(e.target.value))}
        className="w-full accent-indigo-600"
        disabled={count <= 1}
      />
      {label && (
        <p className="min-h-5 text-sm text-slate-800 dark:text-slate-100" aria-live="polite">
          {label}
        </p>
      )}
    </div>
  );
}

/** Index state for a trace that resets to 0 whenever the trace identity changes. */
export function useStepIndex(traceIdentity: unknown, initial = 0): [number, (i: number) => void] {
  const [state, setState] = useState({ identity: traceIdentity, index: initial });
  if (state.identity !== traceIdentity) {
    const next = { identity: traceIdentity, index: initial };
    setState(next);
    return [next.index, (i) => setState({ identity: traceIdentity, index: i })];
  }
  return [state.index, (i: number) => setState({ identity: traceIdentity, index: i })];
}
