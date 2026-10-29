export type PagingAlgorithm = 'fifo' | 'lru' | 'optimal' | 'clock';

export const PAGING_ALGORITHMS: { id: PagingAlgorithm; name: string; rule: string }[] = [
  { id: 'fifo', name: 'FIFO', rule: 'Replace the page that has been in memory the longest.' },
  { id: 'lru', name: 'LRU', rule: 'Replace the page that has not been used for the longest time.' },
  {
    id: 'optimal',
    name: 'Optimal (OPT)',
    rule: 'Replace the page that will not be used for the longest time in the future (ties: lowest frame). Needs the future, so it is a benchmark.',
  },
  {
    id: 'clock',
    name: 'Clock (second chance)',
    rule: 'A hand sweeps the frames: a page with reference bit 1 gets a second chance (bit cleared), the first page with bit 0 is replaced. Loading or using a page sets its bit to 1.',
  },
];

export interface PageStep {
  /** Position in the reference string. */
  index: number;
  page: number;
  /** Frame contents after this reference (null = empty). */
  frames: (number | null)[];
  hit: boolean;
  /** Frame that received the page on a fault. */
  loadedInto: number | null;
  /** Page evicted on this fault, if any. */
  victim: number | null;
  /** Clock only: reference bits and hand position after this reference. */
  refBits: boolean[] | null;
  hand: number | null;
  note: string;
}

export interface PagingResult {
  steps: PageStep[];
  faults: number;
  hits: number;
}

/** Parses "7 0 1 2" or "7,0,1,2" into page numbers; returns null if anything else is present. */
export function parseReferenceString(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

export function simulatePaging(
  refs: readonly number[],
  frameCount: number,
  algorithm: PagingAlgorithm,
): PagingResult {
  const frames: (number | null)[] = new Array<number | null>(frameCount).fill(null);
  const loadedAt = new Array<number>(frameCount).fill(-1);
  const usedAt = new Array<number>(frameCount).fill(-1);
  const refBits = new Array<boolean>(frameCount).fill(false);
  let hand = 0;
  let faults = 0;
  const steps: PageStep[] = [];

  refs.forEach((page, t) => {
    const at = frames.indexOf(page);
    let loadedInto: number | null = null;
    let victim: number | null = null;
    let note: string;
    if (at >= 0) {
      usedAt[at] = t;
      refBits[at] = true;
      note = `Page ${page} is already in frame ${at}: hit.`;
    } else {
      faults++;
      const empty = frames.indexOf(null);
      let slot: number;
      if (empty >= 0) {
        slot = empty;
        note = `Page fault: ${page} goes into empty frame ${slot}.`;
        if (algorithm === 'clock') hand = (slot + 1) % frameCount;
      } else {
        if (algorithm === 'clock') {
          // Second chance: clear bits until the hand finds a 0.
          while (refBits[hand]) {
            refBits[hand] = false;
            hand = (hand + 1) % frameCount;
          }
          slot = hand;
          hand = (hand + 1) % frameCount;
        } else {
          slot = chooseVictim(algorithm, { frames, loadedAt, usedAt, refs, t });
        }
        victim = frames[slot] as number;
        note = `Page fault: ${page} replaces ${victim} in frame ${slot}.`;
      }
      frames[slot] = page;
      loadedAt[slot] = t;
      usedAt[slot] = t;
      refBits[slot] = true;
      loadedInto = slot;
    }
    steps.push({
      index: t,
      page,
      frames: [...frames],
      hit: at >= 0,
      loadedInto,
      victim,
      refBits: algorithm === 'clock' ? [...refBits] : null,
      hand: algorithm === 'clock' ? hand : null,
      note,
    });
  });
  return { steps, faults, hits: refs.length - faults };
}

interface VictimContext {
  frames: readonly (number | null)[];
  loadedAt: readonly number[];
  usedAt: readonly number[];
  refs: readonly number[];
  t: number;
}

function argMin(values: readonly number[]): number {
  let best = 0;
  values.forEach((v, i) => {
    if (v < (values[best] as number)) best = i;
  });
  return best;
}

function chooseVictim(algorithm: Exclude<PagingAlgorithm, 'clock'>, c: VictimContext): number {
  switch (algorithm) {
    case 'fifo':
      return argMin(c.loadedAt);
    case 'lru':
      return argMin(c.usedAt);
    case 'optimal': {
      // Next use of each page; never used again counts as infinitely far. Pick the farthest.
      const next = c.frames.map((p) => {
        const k = c.refs.indexOf(p as number, c.t + 1);
        return k === -1 ? Infinity : k;
      });
      return argMin(next.map((n) => -n));
    }
  }
}

/** FIFO page faults for 1..maxFrames frames, and where Belady's anomaly shows up. */
export function beladyCurve(
  refs: readonly number[],
  maxFrames: number,
  algorithm: PagingAlgorithm = 'fifo',
): { frames: number; faults: number; anomaly: boolean }[] {
  const out: { frames: number; faults: number; anomaly: boolean }[] = [];
  for (let f = 1; f <= maxFrames; f++) {
    const faults = simulatePaging(refs, f, algorithm).faults;
    const prev = out[out.length - 1];
    out.push({ frames: f, faults, anomaly: prev !== undefined && faults > prev.faults });
  }
  return out;
}
