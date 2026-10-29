import { explore, type ExploreResult } from '@oslab/core/engine';
import type { Program } from './bytecode';
import { advanceClock, boot, runnable, stateKey, step, type System, type VmConfig } from './vm';

/** Lets the virtual clock run until some process is ready (or nothing can ever run again). */
function settle(sys: System, config: VmConfig): System {
  let current = sys;
  for (let r = advanceClock(current, config); r; r = advanceClock(current, config)) current = r.sys;
  return current;
}

/**
 * Explores every interleaving of the program at statement granularity.
 * A choice is the pid of the ready process that runs the next statement.
 */
export function exploreAll(
  program: Program,
  config: VmConfig,
  maxStates = 50_000,
): ExploreResult<number> {
  return explore<System, number>({
    initial: settle(boot(program, config), config),
    choices: (sys) => runnable(sys),
    apply: (sys, pid) => {
      const r = step(program, sys, pid, config);
      return { next: settle(r.sys, config), emit: r.emit };
    },
    key: stateKey,
    maxStates,
  });
}
