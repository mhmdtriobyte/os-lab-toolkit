/** One immutable snapshot produced by an engine. The StepPlayer only walks an array of these. */
export interface Step<S> {
  readonly state: S;
  /** One-line, human readable description of what happened in this step. */
  readonly label: string;
}

export type Trace<S> = readonly Step<S>[];

/** A preset loaded from `examples/<module>/<id>.json`. */
export interface Example<T = unknown> {
  id: string;
  title: string;
  description?: string;
  input: T;
}
