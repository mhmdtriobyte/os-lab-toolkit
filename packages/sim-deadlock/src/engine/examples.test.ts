import { describe, expect, it } from 'vitest';
import { safety, validateBanker, type BankerState } from './banker';
import { detect, validateDetection, type DetectionState } from './detection';
import { analyzeRag, type Rag } from './rag';

interface Preset {
  id: string;
  input: { tab: string; banker?: BankerState; detection?: DetectionState; rag?: Rag };
}

const presets = import.meta.glob<Preset>('../../../../examples/deadlock/*.json', {
  eager: true,
  import: 'default',
});

const expected: Record<string, boolean> = {
  'banker-classic': true,
  'banker-request-denied': true,
  'banker-unsafe': false,
  'detection-no-deadlock': true,
  'detection-deadlock': false,
  'rag-single-deadlock': false,
  'rag-cycle-no-deadlock': true,
  'rag-multi-deadlock': false,
};

describe('deadlock presets', () => {
  it.each(Object.values(presets))('$id gives the documented verdict', (preset) => {
    const { banker, detection, rag } = preset.input;
    let ok: boolean;
    if (banker) {
      expect(validateBanker(banker)).toBeNull();
      ok = safety(banker).safe;
    } else if (detection) {
      expect(validateDetection(detection)).toBeNull();
      ok = detect(detection).deadlocked.length === 0;
    } else {
      const analysis = analyzeRag(rag as Rag);
      expect(analysis.errors).toEqual([]);
      ok = analysis.verdict !== 'deadlock';
    }
    expect(ok).toBe(expected[preset.id]);
  });
});
