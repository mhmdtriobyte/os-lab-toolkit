import { exploreThreads, type ThreadsProgram } from '../engine';

export interface ExploreRequest {
  program: ThreadsProgram;
  maxStates: number;
}

self.onmessage = (e: MessageEvent<ExploreRequest>) => {
  const { program, maxStates } = e.data;
  self.postMessage(exploreThreads(program, maxStates));
};
