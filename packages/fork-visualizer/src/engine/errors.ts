/** A friendly compile error that points at a line of the student's code. */
export class CError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col = 1,
  ) {
    super(message);
    this.name = 'CError';
  }
}
