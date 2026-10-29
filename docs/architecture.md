# Architecture

OS Lab Toolkit is a static, client-side web app. Every operating-system behaviour is simulated in
TypeScript in the browser; there is no backend, no VM and no real process.

## Packages

| Package                    | Contents                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                 | Vite + React shell: router, home page, module launcher, PWA setup           |
| `packages/core`            | Pure utilities (`@oslab/core/engine`) and the shared UI kit (`@oslab/core`) |
| `packages/fork-visualizer` | C-subset compiler + process VM, interleaving explorer, quiz generator, UI   |
| `packages/sim-scheduling`  | CPU scheduling algorithms, compare mode, Gantt UI                           |
| `packages/sim-deadlock`    | Resource allocation graphs, Banker's algorithm, detection algorithm         |
| `packages/sim-threads`     | Mini-assembly thread VM, mutex/semaphore/condition variables, explorer      |
| `packages/sim-memory`      | Page replacement and contiguous memory allocation                           |
| `examples/<module>/*.json` | Presets, loaded by the web app and passed to modules                        |

Each module package exports:

- `engine` - pure logic (also available as the `@oslab/<pkg>/engine` subpath). Engines never import
  React; an ESLint rule (`no-restricted-imports` on `**/engine/**`) enforces it.
- `Module` - the React component the web app lazy-loads.

Packages are consumed as TypeScript source (`exports` points at `src/`), so there is no per-package
build step: Vite compiles everything for the app, Vitest runs tests directly and `tsc --noEmit`
type-checks each package.

## The engine / step contract

Every engine turns an input into an immutable array of steps:

```ts
interface Step<S> {
  state: S; // full snapshot after this step (never mutated afterwards)
  label: string; // one-line human description ("P1001 forks P1002")
}
type Trace<S> = Step<S>[];
```

`StepPlayer` (in `@oslab/core`) only knows the number of steps and the current index: play, pause,
step forward/back, reset and a speed slider all just move the index. A module renders
`trace[index].state`. Because the snapshots are immutable, stepping backwards is free and a module can
branch from any step (for example the fork module's "kill this process" button builds a new trace that
shares the prefix of the old one).

Snapshots use structural sharing: a step copies only the objects it changes (for the fork VM, the
process that ran one statement), so long traces stay cheap.

## Shared utilities (`@oslab/core/engine`)

- `rng(seed)` - mulberry32 seedable PRNG. Every "random" button in the toolkit takes a seed, so a
  shared link reproduces the same exercise.
- `explore(spec)` - generic exhaustive interleaving explorer used by the fork and threads modules.
  A spec gives `initial`, `choices(state)`, `apply(state, choice) -> { next, emit }`, `key(state)` and
  `outcome(state)` for terminal states. The explorer does a memoised DFS: for each state it computes the
  map _future output -> number of interleavings_ (the past output is not part of the key, so states
  reached through different histories are shared). It stops at `maxStates` (default 50 000) and reports
  that the result is partial. A cycle on the current DFS path (an infinite loop) yields the outcome
  `"... (does not terminate)"`. Example traces are rebuilt afterwards by walking the memo table, so only
  one successor per output is stored.
- `encodeState / decodeState` - lz-string `compressToEncodedURIComponent` of the JSON module input.

## Shareable links and examples

URLs look like `/fork#s=<lz-string>` or `/fork#ex=orphan`. `useSharedInput(moduleId, examples, fallback)`
in `@oslab/core` reads the hash once on load, and every input change rewrites the hash with
`history.replaceState` (no history spam). The share bar copies the URL and offers Export/Import JSON
of the same input object.

Examples are JSON files `examples/<module>/<id>.json`:

```json
{ "id": "orphan", "title": "Orphan demo", "description": "...", "input": { ... } }
```

The web app loads them with `import.meta.glob` at build time (so they are cached by the PWA) and passes
the list to the module as a prop.

## Fork visualizer design

1. **Tokenizer** (`lexer.ts`) - C tokens with line/column, `//` and `/* */` comments, `#include`
   (ignored) and simple `#define NAME <integer>`.
2. **Parser** (`parser.ts`) - recursive descent to an AST with source lines. Anything outside the subset
   raises a `CError` with a friendly message and the line ("arrays are not supported yet"). Supported:
   `int`/`pid_t`/`long`/`unsigned`/`short` scalars, functions with `int` parameters (including
   recursion), `if/else`, `while`, `do-while`, `for`, `break`, `continue`, `return`, all integer
   operators, `?:`, compound assignment, `++/--`.
3. **Compiler** (`compiler.ts`) - AST to a small stack bytecode. Variables are resolved to frame slots
   at compile time (block scoping and shadowing are handled there). Each statement starts with a
   `STMT line` instruction; one _atomic step_ runs a process from one `STMT` to the next, so a
   `printf` is atomic and `fork()` inside an expression (`fork() && fork()`) works naturally: the child
   is a copy of the parent's frames and operand stack, with `0` pushed instead of the pid.
4. **VM** (`vm.ts`) - the system state: processes (pid, ppid, state, pc, call stack, operand stack,
   exit code, wake time), the virtual clock, the next pid and the stdout log. `step(system, pid)` returns
   a new system. Rules:
   - PIDs are sequential from `pidStart` (default 1000). PID 1 is `init`, the program is started by a
     simulated `bash` (pid `shellPid`, default 900) that waits for it.
   - `fork()` returns 0 / child pid / -1 (when the optional "fork fails after N" limit is reached).
   - A process that exits becomes a **zombie** until its parent waits; if the parent is already gone
     the child was re-parented to init, which reaps immediately.
   - When a process exits, its children are **re-parented to PID 1** and marked as orphans.
   - `sleep(n)` moves the process to `sleeping` until `clock + n`. The clock only advances when no
     process is ready (it jumps to the earliest wake-up), so sleep imposes the ordering students expect.
   - `wait`/`waitpid` block while the caller has living children and none is a zombie; with no
     children they return -1. `wait(&status)` stores `exit_code << 8`; `WEXITSTATUS`/`WIFEXITED` work.
   - Runtime errors (division by zero, step limit) kill the offending process like a signal would.
   - stdout is unbuffered: every `printf` appears immediately. (Real `printf` without `\n` before a
     `fork()` can be duplicated by stdio buffering; this is out of scope and mentioned in the UI help.)
5. **Schedulers** - deterministic policies (`parent-first`, `child-first`, `round-robin`) keep a ready
   queue outside the system state; manual mode lets the user choose the pid; exhaustive mode feeds the
   VM to `explore()` with "which ready process runs next" as the choice.
6. **Quiz** - a seeded template generator nests `fork()` in sequences, `if`, loops and `&&`/`||`, then
   uses the engine (deterministic run for counts, exhaustive run for "which output is possible") to
   compute answers.

## Taste decisions (chosen for simplicity)

- **CodeMirror 6** instead of Monaco: smaller, works offline in the PWA without workers.
- **Tailwind v4** via `@tailwindcss/vite`; dark mode is a `.dark` class on `<html>`, presentation mode a
  `.presentation` class that scales the root font size and raises contrast.
- **React Flow (`@xyflow/react`)** with our own tidy-tree layout (no dagre dependency).
- **React Router** with `BrowserRouter`; `vercel.json` rewrites every route to `index.html`.
- Tie-breaking rules for scheduling: FCFS by arrival then input order; SJF/SRTF by (remaining) burst,
  then arrival, then input order, and a running process is not preempted by an equal one; Priority uses
  lower number = higher priority by default (toggle), ties by arrival then input order; Round Robin adds
  processes that arrive at time _t_ to the queue before the process preempted at _t_. CPU utilisation is
  busy time / (last completion - first arrival).
- Banker's / detection algorithms scan processes in index order, repeatedly, until a full pass makes no
  progress (this gives `<P1, P3, P4, P0, P2>` on the classic Silberschatz example).
- MLFQ is not implemented yet; the scheduling `Algorithm` interface is designed so it can be added as one
  more entry in the registry.
