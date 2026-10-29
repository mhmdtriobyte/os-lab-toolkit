import { describe, expect, it } from 'vitest';
import { compile } from './compiler';
import { runDeterministic } from './scheduler';
import { DEFAULT_CONFIG } from './vm';

interface Preset {
  id: string;
  input: { code: string };
}

const presets = import.meta.glob<Preset>('../../../../examples/fork/*.json', {
  eager: true,
  import: 'default',
});

describe('fork presets', () => {
  const entries = Object.entries(presets);

  it('exist', () => expect(entries.length).toBeGreaterThanOrEqual(9));

  it.each(entries)('%s compiles and runs to completion', (path, preset) => {
    expect(path.endsWith(`/${preset.id}.json`)).toBe(true);
    const run = runDeterministic(compile(preset.input.code), 'parent-first', DEFAULT_CONFIG);
    expect(run.truncated).toBe(false);
  });
});
