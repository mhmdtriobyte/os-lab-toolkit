import { rng } from '@oslab/core/engine';
import type { ProcessSpec } from './types';

/** A random but reproducible process table. */
export function randomProcesses(seed: number, count?: number): ProcessSpec[] {
  const r = rng(seed);
  const n = count ?? r.int(4, 6);
  return Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    arrival: i === 0 ? 0 : r.int(0, 8),
    burst: r.int(1, 9),
    priority: r.int(1, 5),
  }));
}
