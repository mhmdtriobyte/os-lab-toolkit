import { detect, type DetectionResult } from './detection';
import { columnTotals, sub } from './vector';

export interface RagNode {
  id: string;
  kind: 'process' | 'resource';
  name: string;
  /** Number of instances (resources only). */
  instances: number;
  x: number;
  y: number;
}

/** Process -> resource is a request edge; resource -> process is an assignment edge. */
export interface RagEdge {
  id: string;
  from: string;
  to: string;
  /** How many instances are requested / assigned. */
  count: number;
}

export interface Rag {
  nodes: RagNode[];
  edges: RagEdge[];
}

export type RagVerdict = 'no-cycle' | 'deadlock' | 'cycle-no-deadlock';

export interface RagAnalysis {
  errors: string[];
  verdict: RagVerdict;
  explanation: string;
  /** One example cycle as a list of node ids (first node repeated at the end), if any. */
  cycle: string[];
  /** Nodes that lie on some cycle. */
  onCycle: Set<string>;
  deadlocked: Set<string>;
  /** The graph translated to matrices for the detection algorithm. */
  detection: DetectionResult;
  processIds: string[];
  resourceIds: string[];
  allocation: number[][];
  request: number[][];
  available: number[];
}

export function edgeKind(rag: Rag, edge: RagEdge): 'request' | 'assignment' | 'invalid' {
  const from = rag.nodes.find((n) => n.id === edge.from);
  const to = rag.nodes.find((n) => n.id === edge.to);
  if (!from || !to || from.kind === to.kind) return 'invalid';
  return from.kind === 'process' ? 'request' : 'assignment';
}

/** Tarjan's strongly connected components; nodes in a component of size > 1 lie on a cycle. */
function nodesOnCycles(ids: string[], next: Map<string, string[]>): Set<string> {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result = new Set<string>();
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of next.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) component.forEach((c) => result.add(c));
    }
  };
  for (const id of ids) if (!index.has(id)) visit(id);
  return result;
}

/** One cycle through the given cycle nodes, found by DFS. */
function findCycle(start: string, next: Map<string, string[]>, allowed: Set<string>): string[] {
  const path: string[] = [];
  const onPath = new Set<string>();
  const dfs = (v: string): string[] | null => {
    path.push(v);
    onPath.add(v);
    for (const w of next.get(v) ?? []) {
      if (!allowed.has(w)) continue;
      if (onPath.has(w)) return [...path.slice(path.indexOf(w)), w];
      const found = dfs(w);
      if (found) return found;
    }
    path.pop();
    onPath.delete(v);
    return null;
  };
  return dfs(start) ?? [];
}

export function analyzeRag(rag: Rag): RagAnalysis {
  const processes = rag.nodes.filter((n) => n.kind === 'process');
  const resources = rag.nodes.filter((n) => n.kind === 'resource');
  const pIndex = new Map(processes.map((p, i) => [p.id, i]));
  const rIndex = new Map(resources.map((r, i) => [r.id, i]));
  const allocation = processes.map(() => new Array<number>(resources.length).fill(0));
  const request = processes.map(() => new Array<number>(resources.length).fill(0));
  const errors: string[] = [];
  const next = new Map<string, string[]>();

  for (const e of rag.edges) {
    const kind = edgeKind(rag, e);
    if (kind === 'invalid') {
      errors.push('Edges must connect a process and a resource.');
      continue;
    }
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
    if (kind === 'request') {
      const row = request[pIndex.get(e.from) as number] as number[];
      row[rIndex.get(e.to) as number] = (row[rIndex.get(e.to) as number] as number) + e.count;
    } else {
      const row = allocation[pIndex.get(e.to) as number] as number[];
      row[rIndex.get(e.from) as number] = (row[rIndex.get(e.from) as number] as number) + e.count;
    }
  }
  const assigned = columnTotals(allocation, resources.length);
  resources.forEach((r, j) => {
    if ((assigned[j] as number) > r.instances) {
      errors.push(`${r.name} has ${r.instances} instance(s) but ${assigned[j]} are assigned.`);
    }
  });
  const available = sub(
    resources.map((r) => r.instances),
    assigned,
  ).map((x) => Math.max(0, x));

  const detection = detect({
    processes: processes.map((p) => p.name),
    resources: resources.map((r) => r.name),
    allocation,
    request,
    available,
  });
  const onCycle = nodesOnCycles(
    rag.nodes.map((n) => n.id),
    next,
  );
  const firstOnCycle = rag.nodes.find((n) => onCycle.has(n.id));
  const cycle = firstOnCycle ? findCycle(firstOnCycle.id, next, onCycle) : [];
  const deadlocked = new Set(detection.deadlocked.map((i) => (processes[i] as RagNode).id));
  const cycleResources = resources.filter((r) => onCycle.has(r.id));
  const singleInstance = cycleResources.every((r) => r.instances === 1);
  const nameOf = (id: string) => rag.nodes.find((n) => n.id === id)?.name ?? id;
  const cycleText = cycle.map(nameOf).join(' → ');

  let verdict: RagVerdict;
  let explanation: string;
  if (onCycle.size === 0) {
    verdict = 'no-cycle';
    explanation = 'The graph has no cycle, so there is no deadlock.';
  } else if (deadlocked.size > 0) {
    verdict = 'deadlock';
    explanation = singleInstance
      ? `Cycle ${cycleText}. Every resource on the cycle has a single instance, so a cycle means deadlock.`
      : `Cycle ${cycleText}. Some resources have several instances, so a cycle alone does not prove deadlock; the detection algorithm (graph reduction) confirms that ${[...deadlocked].map(nameOf).join(', ')} can never proceed.`;
  } else {
    verdict = 'cycle-no-deadlock';
    explanation = `Cycle ${cycleText}, but there is NO deadlock: some resources have several instances, and reducing the graph lets every process finish (<${detection.sequence.map((i) => processes[i]?.name).join(', ')}>).`;
  }
  return {
    errors,
    verdict,
    explanation,
    cycle,
    onCycle,
    deadlocked,
    detection,
    processIds: processes.map((p) => p.id),
    resourceIds: resources.map((r) => r.id),
    allocation,
    request,
    available,
  };
}
