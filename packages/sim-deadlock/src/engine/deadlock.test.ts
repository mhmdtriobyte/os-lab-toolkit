import { describe, expect, it } from 'vitest';
import {
  requestResources,
  safety,
  totalInstances,
  validateBanker,
  type BankerState,
} from './banker';
import { detect, type DetectionState } from './detection';
import { analyzeRag, type Rag, type RagNode } from './rag';

// Silberschatz, Operating System Concepts: 5 processes, A=10, B=5, C=7 instances.
const classic: BankerState = {
  processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
  resources: ['A', 'B', 'C'],
  allocation: [
    [0, 1, 0],
    [2, 0, 0],
    [3, 0, 2],
    [2, 1, 1],
    [0, 0, 2],
  ],
  max: [
    [7, 5, 3],
    [3, 2, 2],
    [9, 0, 2],
    [2, 2, 2],
    [4, 3, 3],
  ],
  available: [3, 3, 2],
};

const names = (state: { processes: string[] }, ids: number[]) => ids.map((i) => state.processes[i]);

describe("Banker's algorithm", () => {
  it('computes Need and finds the classic state safe', () => {
    const r = safety(classic);
    expect(r.need).toEqual([
      [7, 4, 3],
      [1, 2, 2],
      [6, 0, 0],
      [0, 1, 1],
      [4, 3, 1],
    ]);
    expect(r.safe).toBe(true);
    expect(names(classic, r.sequence)).toEqual(['P1', 'P3', 'P4', 'P0', 'P2']);
    expect(totalInstances(classic)).toEqual([10, 5, 7]);
  });

  it('records Work and Finish for every check', () => {
    const r = safety(classic);
    expect(r.steps[0]).toMatchObject({ process: 0, canFinish: false, work: [3, 3, 2] });
    expect(r.steps[1]).toMatchObject({ process: 1, canFinish: true, workAfter: [5, 3, 2] });
    expect(r.steps[r.steps.length - 1]?.finish.every(Boolean)).toBe(true);
  });

  it('grants P1 requesting (1,0,2)', () => {
    const r = requestResources(classic, 1, [1, 0, 2]);
    expect(r.verdict).toBe('granted');
    expect(r.next?.available).toEqual([2, 3, 0]);
    expect(r.next?.allocation[1]).toEqual([3, 0, 2]);
  });

  it('then makes P4 wait for (3,3,0) and denies P0 (0,2,0) as unsafe', () => {
    const after = requestResources(classic, 1, [1, 0, 2]).next as BankerState;
    expect(requestResources(after, 4, [3, 3, 0]).verdict).toBe('must-wait');
    const p0 = requestResources(after, 0, [0, 2, 0]);
    expect(p0.verdict).toBe('unsafe');
    expect(p0.granted).toBe(false);
  });

  it('rejects a request above the remaining need', () => {
    expect(requestResources(classic, 3, [1, 0, 0]).verdict).toBe('exceeds-need');
  });

  it('detects an unsafe state (textbook: 12 tape drives)', () => {
    const safeState: BankerState = {
      processes: ['P0', 'P1', 'P2'],
      resources: ['tape'],
      allocation: [[5], [2], [2]],
      max: [[10], [4], [9]],
      available: [3],
    };
    expect(names(safeState, safety(safeState).sequence)).toEqual(['P1', 'P0', 'P2']);
    // Giving P2 one more drive makes the state unsafe.
    const r = safety({ ...safeState, allocation: [[5], [2], [3]], available: [2] });
    expect(r.safe).toBe(false);
    expect(names(safeState, r.stuck)).toEqual(['P0', 'P2']);
  });

  it('validates that allocation does not exceed max', () => {
    expect(
      validateBanker({ ...classic, allocation: [[8, 0, 0], ...classic.allocation.slice(1)] }),
    ).toMatch(/more than its Max/);
    expect(validateBanker(classic)).toBeNull();
  });
});

const detectionExample: DetectionState = {
  processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
  resources: ['A', 'B', 'C'],
  allocation: [
    [0, 1, 0],
    [2, 0, 0],
    [3, 0, 3],
    [2, 1, 1],
    [0, 0, 2],
  ],
  request: [
    [0, 0, 0],
    [2, 0, 2],
    [0, 0, 0],
    [1, 0, 0],
    [0, 0, 2],
  ],
  available: [0, 0, 0],
};

describe('deadlock detection (several instances)', () => {
  it('finds no deadlock in the textbook example', () => {
    const r = detect(detectionExample);
    expect(r.deadlocked).toEqual([]);
    expect(names(detectionExample, r.sequence)).toEqual(['P0', 'P2', 'P3', 'P4', 'P1']);
  });

  it('finds P1..P4 deadlocked when P2 requests one more C', () => {
    const r = detect({
      ...detectionExample,
      request: detectionExample.request.map((row, i) => (i === 2 ? [0, 0, 1] : row)),
    });
    expect(names(detectionExample, r.deadlocked)).toEqual(['P1', 'P2', 'P3', 'P4']);
  });
});

const node = (id: string, kind: RagNode['kind'], instances = 1): RagNode => ({
  id,
  kind,
  name: id,
  instances,
  x: 0,
  y: 0,
});
const edge = (from: string, to: string) => ({ id: `${from}-${to}`, from, to, count: 1 });

describe('resource allocation graph', () => {
  it('no cycle means no deadlock', () => {
    const rag: Rag = {
      nodes: [node('P1', 'process'), node('P2', 'process'), node('R1', 'resource')],
      edges: [edge('R1', 'P1'), edge('P2', 'R1')],
    };
    expect(analyzeRag(rag).verdict).toBe('no-cycle');
  });

  it('a cycle with single-instance resources is a deadlock', () => {
    const rag: Rag = {
      nodes: [
        node('P1', 'process'),
        node('P2', 'process'),
        node('R1', 'resource'),
        node('R2', 'resource'),
      ],
      edges: [edge('R1', 'P1'), edge('P1', 'R2'), edge('R2', 'P2'), edge('P2', 'R1')],
    };
    const a = analyzeRag(rag);
    expect(a.verdict).toBe('deadlock');
    expect([...a.deadlocked].sort()).toEqual(['P1', 'P2']);
    expect(a.cycle[0]).toBe(a.cycle[a.cycle.length - 1]);
    expect(a.cycle.length).toBe(5);
  });

  it('textbook: a cycle with multi-instance resources but no deadlock', () => {
    const rag: Rag = {
      nodes: [
        node('P1', 'process'),
        node('P2', 'process'),
        node('P3', 'process'),
        node('P4', 'process'),
        node('R1', 'resource', 2),
        node('R2', 'resource', 2),
      ],
      edges: [
        edge('P1', 'R1'),
        edge('R1', 'P2'),
        edge('R1', 'P3'),
        edge('P3', 'R2'),
        edge('R2', 'P1'),
        edge('R2', 'P4'),
      ],
    };
    const a = analyzeRag(rag);
    expect(a.onCycle.size).toBeGreaterThan(0);
    expect(a.verdict).toBe('cycle-no-deadlock');
  });

  it('textbook: a multi-instance graph that is deadlocked', () => {
    const rag: Rag = {
      nodes: [
        node('P1', 'process'),
        node('P2', 'process'),
        node('P3', 'process'),
        node('R1', 'resource'),
        node('R2', 'resource', 2),
        node('R3', 'resource'),
      ],
      edges: [
        edge('P1', 'R1'),
        edge('R1', 'P2'),
        edge('P2', 'R3'),
        edge('R3', 'P3'),
        edge('P3', 'R2'),
        edge('R2', 'P1'),
        edge('R2', 'P2'),
      ],
    };
    const a = analyzeRag(rag);
    expect(a.verdict).toBe('deadlock');
    expect(a.deadlocked.size).toBe(3);
  });

  it('reports over-assigned resources', () => {
    const rag: Rag = {
      nodes: [node('P1', 'process'), node('P2', 'process'), node('R1', 'resource')],
      edges: [edge('R1', 'P1'), edge('R1', 'P2')],
    };
    expect(analyzeRag(rag).errors[0]).toMatch(/1 instance\(s\) but 2 are assigned/);
  });
});
