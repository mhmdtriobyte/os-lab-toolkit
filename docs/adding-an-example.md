# Adding an example

Examples (presets) are JSON files in `examples/<module>/`. They appear in the module's **Examples**
menu and on the home page, and can be linked to directly with `/<module>#ex=<id>`.

```json
{
  "id": "orphan",
  "title": "Orphan demo",
  "description": "The parent exits first; the child is re-parented to init (PID 1).",
  "input": { "code": "..." }
}
```

- `id` must equal the file name without `.json` (tests check this).
- `title` is shown in the menu; `description` is a one-line hint.
- `input` is the module's input. Missing fields get their defaults, so only set what matters.

The quickest way to get a valid `input` is to set the exercise up in the app and press **Export
JSON**, then wrap the exported object in the format above.

## Inputs per module

| Folder                | `input` fields                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/fork`       | `code` (C source), optional `mode` (`deterministic`, `exhaustive`, `manual`), `policy` (`parent-first`, `child-first`, `round-robin`), `pidStart`, `forkLimit` (number or `null`), `maxStates`                                                                                   |
| `examples/scheduling` | `processes` (`[{ "name", "arrival", "burst", "priority" }]`), optional `algorithm` (`fcfs`, `sjf`, `srtf`, `priority`, `rr`), `quantum`, `priorityPreemptive`, `lowerIsHigher`, `view` (`single`, `compare`)                                                                     |
| `examples/deadlock`   | `tab` (`banker`, `detection`, `rag`) and the matching object: `banker` (`processes`, `resources`, `allocation`, `max`, `available`, `requestProcess`, `requestVector`), `detection` (`processes`, `resources`, `allocation`, `request`, `available`) or `rag` (`nodes`, `edges`) |
| `examples/threads`    | `code` (thread program), optional `mode` (`exhaustive`, `random`, `manual`), `seed`, `maxStates`                                                                                                                                                                                 |

## Checking it

Every preset is loaded by a unit test in its module (`examples.test.ts` or the module's main test), so
run:

```bash
pnpm test
```

A preset that does not parse or that gives a different result than its description fails the build.
When you add a deadlock preset, add its expected verdict to
`packages/sim-deadlock/src/engine/examples.test.ts`.
