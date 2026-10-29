# OS Lab Toolkit

**Open source teaching tools for operating systems courses.** Paste C code that calls `fork()` and
watch the process tree grow, step through CPU schedulers, run the Banker's algorithm, and hunt race
conditions and deadlocks. Everything is simulated in the browser: no install, no server, no VM, and it
keeps working offline once loaded.

Built for an Operating Systems lab course (Linux commands, C, process creation, scheduling, deadlock,
threads and memory), and neutral enough for any university to use or fork.

![Home page](docs/screenshots/home.png)

## Modules

| Module              | What students can do                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fork visualizer** | Paste C with `fork`, `getpid`, `getppid`, `wait`, `waitpid`, `sleep`, `exit`, `kill`. See the process tree, a `ps -af` table with a **kill** button, zombies and orphans re-parented to init. Run with a fixed scheduler, be the scheduler yourself, or **explore every interleaving** to list all possible outputs. Includes a fork **quiz** generator. |
| **CPU scheduling**  | FCFS, SJF, SRTF, Priority (preemptive or not) and Round Robin with an animated Gantt chart (idle gaps included), the ready queue at every time unit, waiting/turnaround/response times, CPU utilization, and a **compare all** mode that names the winner per metric.                                                                                    |
| **Deadlock**        | Banker's algorithm (Need, step-by-step safety algorithm with Work/Finish, resource-request algorithm), multi-instance deadlock detection, and a drag-and-drop **resource allocation graph** editor that detects cycles and only reports a deadlock when graph reduction confirms it.                                                                     |
| **Threads**         | A tiny atomic instruction set shown as pseudo-code. Race conditions (`counter++` losing updates), mutexes, semaphores, condition variables, producer-consumer, readers-writers and dining philosophers. Random, manual or exhaustive scheduling, with swimlanes and blocked markers.                                                                     |
| **Memory**          | Page replacement with FIFO, LRU, Optimal and Clock (frame table, faults, hit ratio, reference bits and hand), a **Belady's anomaly** chart, and first / best / worst fit allocation with frees, hole merging and external fragmentation.                                                                                                                 |

![Fork visualizer](docs/screenshots/fork.png)

## Use it in class

- **Examples menu.** Every module has presets from the course (Fork Example 1 and 2, the orphan
  exercise, the textbook scheduling and Banker's examples, dining philosophers…).
- **Share link.** Every input lives in the URL. Set up an exercise, press **Share link**, and paste the
  link in your LMS or chat: students open exactly that exercise. Links to presets look like
  `/fork#ex=orphan`.
- **Export / Import JSON.** Save an exercise as a file and load it later.
- **Presentation mode.** The header toggle enlarges text and contrast for projectors. Light and dark
  themes are available too.
- **Reproducible randomness.** Random tables and random thread schedules use a visible seed, so the
  same link always shows the same run.
- **Offline.** The site is a PWA: after the first visit it works without a network connection and can
  be installed like an app.

### The orphan exercise, step by step

1. Open **Fork visualizer → Examples → Exercise Part A: parent and child**.
2. Step forward until both processes are `sleeping` (parent and child are in `sleep(30)`).
3. Press **kill** next to the parent in the `ps -af` table.
4. Keep stepping: the child's PPID becomes **1** (re-parented to init) and it prints its new parent.

## Run locally

Requirements: Node.js 20+ and [pnpm](https://pnpm.io) 9.

```bash
pnpm i
```

```bash
pnpm dev
```

Then open http://localhost:5173. Other scripts:

| Command          | Does                                 |
| ---------------- | ------------------------------------ |
| `pnpm test`      | Unit tests (Vitest) for every engine |
| `pnpm lint`      | ESLint                               |
| `pnpm format`    | Prettier                             |
| `pnpm typecheck` | `tsc --noEmit` in every package      |
| `pnpm build`     | Production build in `apps/web/dist`  |

## Deploy to Vercel

The repository includes `vercel.json`, so importing it is enough:

1. Push the repository to GitHub (or your fork of it).
2. In Vercel, **Add New → Project**, import the repository and keep the defaults (Vercel reads the
   install/build commands and the `apps/web/dist` output directory from `vercel.json`).
3. Optionally set `VITE_REPO_URL` to your repository URL so the GitHub link in the header points to
   your fork.

Any static host works: build with `pnpm build` and serve `apps/web/dist`, rewriting unknown paths to
`index.html`.

## Add an example

Examples are plain JSON files in `examples/<module>/`. No code needed: see
[docs/adding-an-example.md](docs/adding-an-example.md).

## Project layout

```
apps/web/               Vite + React shell: home page, router, PWA
packages/core/          Shared engine utilities (explorer, RNG, URL sharing) and UI kit
packages/fork-visualizer/
packages/sim-scheduling/
packages/sim-deadlock/
packages/sim-threads/
packages/sim-memory/
examples/               JSON presets, one folder per module
docs/                   Architecture and contributor guides
```

Every module package exports a pure TypeScript `engine` (no React, fully unit-tested) and a React
`Module`. Read [docs/architecture.md](docs/architecture.md) for the design and
[docs/adding-a-module.md](docs/adding-a-module.md) to add a new simulator.

## Contributing

Bug reports, examples and new modules are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
