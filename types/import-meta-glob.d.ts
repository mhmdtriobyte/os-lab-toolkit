// Vite's import.meta.glob, used by tests to read the JSON presets in /examples.
interface ImportMeta {
  glob<T>(pattern: string, options: { eager: true; import: 'default' }): Record<string, T>;
}
