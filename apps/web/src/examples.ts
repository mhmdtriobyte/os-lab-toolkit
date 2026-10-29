import type { Example } from '@oslab/core';

// Presets live in /examples/<module>/<id>.json and are bundled at build time (so they work offline).
const files = import.meta.glob<Example>('../../../examples/*/*.json', {
  eager: true,
  import: 'default',
});

const byModule = new Map<string, Example[]>();
for (const [path, example] of Object.entries(files)) {
  const moduleId = path.split('/').at(-2) ?? '';
  const list = byModule.get(moduleId) ?? [];
  list.push(example);
  byModule.set(moduleId, list);
}
for (const list of byModule.values()) list.sort((a, b) => a.title.localeCompare(b.title));

export function examplesFor(moduleId: string): Example[] {
  return byModule.get(moduleId) ?? [];
}
