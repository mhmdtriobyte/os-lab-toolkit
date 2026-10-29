# Contributing

Thanks for helping! Teachers and students are the main audience, so clarity beats cleverness.

## Getting started

```bash
pnpm i
```

```bash
pnpm dev
```

Before opening a pull request, run the same checks as CI:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

## Ground rules

- **Engines are pure TypeScript.** Code under `packages/*/src/engine` must not import React or any UI
  library (ESLint enforces it). Engines are deterministic: randomness always comes from a seed
  (`rng(seed)` in `@oslab/core/engine`).
- **Engines produce steps.** A simulation returns an array of immutable snapshots; the UI walks it with
  the shared `StepPlayer`. See [docs/architecture.md](docs/architecture.md).
- **Every behaviour change has a test.** Prefer textbook examples with known answers.
- **Friendly errors.** Unsupported input must produce a clear message (with a line number for code),
  never a crash.
- **Accessible UI.** Keyboard reachable controls, labels on inputs, readable in light, dark and
  presentation modes, usable down to tablet width.
- Keep files small and focused, and match the style around them (Prettier formats everything).

## Adding content

- New preset exercise: [docs/adding-an-example.md](docs/adding-an-example.md).
- New simulator: [docs/adding-a-module.md](docs/adding-a-module.md).

## Reporting bugs

For a simulation bug, include a **Share link** (or the exported JSON) and what you expected to see.
