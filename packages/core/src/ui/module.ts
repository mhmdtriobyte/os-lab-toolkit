import type { Example } from '../engine';

/** Props the web app passes to every module component. */
export interface ModuleProps {
  examples: readonly Example[];
}
