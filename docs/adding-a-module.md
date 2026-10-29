# Adding a module

A module is a workspace package with a pure engine and a React component. This walkthrough adds a
hypothetical `sim-disk` (disk scheduling) module.

## 1. Create the package

```
packages/sim-disk/
  package.json
  tsconfig.json
  src/
    index.ts
    engine/
      index.ts
      simulate.ts
      simulate.test.ts
    ui/
      DiskModule.tsx
      input.ts
```

Copy `package.json` and `tsconfig.json` from `packages/sim-scheduling`, change the name to
`@oslab/sim-disk`, and add any UI dependency you need. `src/index.ts` exports both halves:

```ts
export * as engine from './engine';
export { DiskModule as Module } from './ui/DiskModule';
```

## 2. Write the engine first

- Only import from `@oslab/core/engine` (ESLint blocks React and UI imports in `src/engine`).
- Return immutable steps, `Step<S>[]` from `@oslab/core/engine`: `{ state, label }`. The UI never
  recomputes a step, it only shows `steps[index].state`.
- Use `rng(seed)` for anything random so results are reproducible from a link.
- If the topic has nondeterminism (interleavings), use `explore()` from core: describe `choices`,
  `apply`, a state `key` and an `outcome`, and it returns every distinct outcome with counts and an
  example path.
- Validate input and return friendly messages instead of throwing.
- Test with textbook examples whose answers are known.

## 3. Write the UI

```tsx
import {
  ModuleHeader,
  StepPlayer,
  useSharedInput,
  useStepIndex,
  type ModuleProps,
} from '@oslab/core';

export function DiskModule({ examples }: ModuleProps) {
  const { input, setInput, exampleId, loadExample } = useSharedInput(
    examples,
    DEFAULT_INPUT,
    sanitizeInput,
  );
  // run the engine with useMemo, then render ModuleHeader, inputs, StepPlayer and the views
}
```

- `useSharedInput` keeps the input in the URL hash (share links), loads `#ex=<id>` presets and gives
  you `exampleId` / `loadExample` for `ModuleHeader`.
- `sanitizeInput(raw: unknown)` must turn untrusted JSON (links, imported files) into a valid input or
  return `null`.
- Use the primitives from `@oslab/core` (`Panel`, `Button`, `Field`, `NumberInput`, `Tabs`, `Alert`,
  `tableClass`, `seriesColor`) so the module matches the others in light, dark and presentation mode.

## 4. Register it

1. Add `"@oslab/sim-disk": "workspace:*"` to `apps/web/package.json` and run `pnpm i`.
2. Add an entry to `apps/web/src/modules.ts`:

```ts
{
  id: 'disk',
  title: 'Disk scheduling',
  summary: 'FCFS, SSTF, SCAN and C-SCAN head movement.',
  topics: ['seek time', 'SCAN'],
  icon: 'chart',
  Component: lazy(() => import('@oslab/sim-disk').then((m) => ({ default: m.Module }))),
},
```

The `id` is the route (`/disk`) and the examples folder (`examples/disk/`). The home page card, the
navigation link and the examples list appear automatically.

## 5. Add presets and docs

Add a few `examples/disk/*.json` files (see [adding-an-example.md](adding-an-example.md)), a test that
loads them, and a line in the README's module table.
