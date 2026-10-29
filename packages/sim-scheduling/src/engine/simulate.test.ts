import { describe, expect, it } from 'vitest';
import { compareAll, winners } from './compare';
import { randomProcesses } from './random';
import { DEFAULT_OPTIONS, simulate, validate } from './simulate';
import type { ProcessSpec } from './types';

const procs = (rows: [number, number, number?][]): ProcessSpec[] =>
  rows.map(([arrival, burst, priority = 0], i) => ({
    name: `P${i + 1}`,
    arrival,
    burst,
    priority,
  }));

const gantt = (r: ReturnType<typeof simulate>) =>
  r.segments
    .map((s) => `${s.proc === null ? '-' : `P${s.proc + 1}`}:${s.start}-${s.end}`)
    .join(' ');

// Textbook examples (Silberschatz, Operating System Concepts, chapter 5).
describe('textbook examples', () => {
  it('FCFS: P1=24, P2=3, P3=3 gives average waiting 17', () => {
    const r = simulate(
      procs([
        [0, 24],
        [0, 3],
        [0, 3],
      ]),
      'fcfs',
    );
    expect(gantt(r)).toBe('P1:0-24 P2:24-27 P3:27-30');
    expect(r.metrics.avgWaiting).toBe(17);
    expect(r.metrics.avgTurnaround).toBe(27);
  });

  it('SJF: P1=6, P2=8, P3=7, P4=3 gives average waiting 7', () => {
    const r = simulate(
      procs([
        [0, 6],
        [0, 8],
        [0, 7],
        [0, 3],
      ]),
      'sjf',
    );
    expect(gantt(r)).toBe('P4:0-3 P1:3-9 P3:9-16 P2:16-24');
    expect(r.metrics.avgWaiting).toBe(7);
  });

  it('SRTF: arrivals 0..3 gives average waiting 6.5', () => {
    const r = simulate(
      procs([
        [0, 8],
        [1, 4],
        [2, 9],
        [3, 5],
      ]),
      'srtf',
    );
    expect(gantt(r)).toBe('P1:0-1 P2:1-5 P4:5-10 P1:10-17 P3:17-26');
    expect(r.metrics.avgWaiting).toBe(6.5);
  });

  it('Priority (non-preemptive): average waiting 8.2', () => {
    const r = simulate(
      procs([
        [0, 10, 3],
        [0, 1, 1],
        [0, 2, 4],
        [0, 1, 5],
        [0, 5, 2],
      ]),
      'priority',
    );
    expect(gantt(r)).toBe('P2:0-1 P5:1-6 P1:6-16 P3:16-18 P4:18-19');
    expect(r.metrics.avgWaiting).toBeCloseTo(8.2);
  });

  it('Priority (preemptive): a higher-priority arrival preempts', () => {
    const r = simulate(
      procs([
        [0, 4, 2],
        [1, 3, 1],
        [2, 1, 3],
      ]),
      'priority',
      { ...DEFAULT_OPTIONS, priorityPreemptive: true },
    );
    expect(gantt(r)).toBe('P1:0-1 P2:1-4 P1:4-7 P3:7-8');
    expect(r.metrics.avgWaiting).toBeCloseTo(8 / 3);
  });

  it('Priority with "higher number = higher priority"', () => {
    const r = simulate(
      procs([
        [0, 1, 1],
        [0, 1, 9],
      ]),
      'priority',
      { ...DEFAULT_OPTIONS, lowerIsHigher: false },
    );
    expect(gantt(r)).toBe('P2:0-1 P1:1-2');
  });

  it('Round Robin q=4: P1=24, P2=3, P3=3 gives average waiting 17/3', () => {
    const r = simulate(
      procs([
        [0, 24],
        [0, 3],
        [0, 3],
      ]),
      'rr',
      { ...DEFAULT_OPTIONS, quantum: 4 },
    );
    expect(gantt(r)).toBe('P1:0-4 P2:4-7 P3:7-10 P1:10-30');
    expect(r.metrics.avgWaiting).toBeCloseTo(17 / 3);
  });
});

describe('rules', () => {
  it('shows idle gaps and computes utilization', () => {
    const r = simulate(
      procs([
        [0, 2],
        [5, 1],
      ]),
      'fcfs',
    );
    expect(gantt(r)).toBe('P1:0-2 -:2-5 P2:5-6');
    expect(r.metrics.utilization).toBe(0.5);
  });

  it('RR queues new arrivals before the process whose quantum just expired', () => {
    const r = simulate(
      procs([
        [0, 4],
        [2, 2],
      ]),
      'rr',
      { ...DEFAULT_OPTIONS, quantum: 2 },
    );
    expect(gantt(r)).toBe('P1:0-2 P2:2-4 P1:4-6');
  });

  it('FCFS breaks arrival ties by table order', () => {
    expect(
      gantt(
        simulate(
          procs([
            [0, 1],
            [0, 1],
          ]),
          'fcfs',
        ),
      ),
    ).toBe('P1:0-1 P2:1-2');
  });

  it('SRTF does not preempt for an equal remaining time', () => {
    expect(
      gantt(
        simulate(
          procs([
            [0, 3],
            [1, 2],
          ]),
          'srtf',
        ),
      ),
    ).toBe('P1:0-3 P2:3-5');
  });

  it('records the ready queue per tick', () => {
    const r = simulate(
      procs([
        [0, 2],
        [0, 2],
      ]),
      'fcfs',
    );
    expect(r.ticks[0]).toMatchObject({ time: 0, running: 0, queue: [1], arrived: [0, 1] });
  });

  it('validates input', () => {
    expect(validate([], DEFAULT_OPTIONS)).toMatch(/at least one/);
    expect(validate(procs([[0, 0]]), DEFAULT_OPTIONS)).toMatch(/burst/);
    expect(validate(procs([[0, 1]]), { ...DEFAULT_OPTIONS, quantum: 0 })).toMatch(/quantum/);
    expect(validate(procs([[0, 1]]), DEFAULT_OPTIONS)).toBeNull();
  });
});

describe('compare mode', () => {
  it('runs every algorithm and finds winners', () => {
    const rows = compareAll(
      procs([
        [0, 8],
        [1, 4],
        [2, 9],
        [3, 5],
      ]),
      DEFAULT_OPTIONS,
    );
    expect(rows).toHaveLength(6);
    expect(winners(rows, 'avgWaiting')).toContain('SRTF');
  });

  it('random tables are reproducible and valid', () => {
    expect(randomProcesses(5)).toEqual(randomProcesses(5));
    expect(validate(randomProcesses(5), DEFAULT_OPTIONS)).toBeNull();
  });
});
