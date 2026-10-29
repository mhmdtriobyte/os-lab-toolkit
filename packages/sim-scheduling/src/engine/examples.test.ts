import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, simulate, validate } from './simulate';
import type { ProcessSpec } from './types';

interface Preset {
  id: string;
  input: { processes: ProcessSpec[]; quantum?: number };
}

const presets = import.meta.glob<Preset>('../../../../examples/scheduling/*.json', {
  eager: true,
  import: 'default',
});

describe('scheduling presets', () => {
  it.each(Object.entries(presets))('%s is valid', (path, preset) => {
    expect(path.endsWith(`/${preset.id}.json`)).toBe(true);
    const options = {
      ...DEFAULT_OPTIONS,
      quantum: preset.input.quantum ?? DEFAULT_OPTIONS.quantum,
    };
    expect(validate(preset.input.processes, options)).toBeNull();
    expect(simulate(preset.input.processes, 'rr', options).processes).toHaveLength(
      preset.input.processes.length,
    );
  });
});
