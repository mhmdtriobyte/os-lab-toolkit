import { exploreAll, type Program, type VmConfig } from '../engine';

export interface ExploreRequest {
  program: Program;
  config: VmConfig;
  maxStates: number;
}

self.onmessage = (e: MessageEvent<ExploreRequest>) => {
  const { program, config, maxStates } = e.data;
  self.postMessage(exploreAll(program, config, maxStates));
};
