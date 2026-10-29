export type Vector = readonly number[];
export type Matrix = readonly Vector[];

export const leq = (a: Vector, b: Vector): boolean => a.every((x, i) => x <= (b[i] ?? 0));
export const add = (a: Vector, b: Vector): number[] => a.map((x, i) => x + (b[i] ?? 0));
export const sub = (a: Vector, b: Vector): number[] => a.map((x, i) => x - (b[i] ?? 0));
export const isZero = (a: Vector): boolean => a.every((x) => x === 0);
export const fmt = (a: Vector): string => `(${a.join(', ')})`;

/** Need = Max - Allocation. */
export function needMatrix(max: Matrix, allocation: Matrix): number[][] {
  return max.map((row, i) => sub(row, allocation[i] ?? []));
}

/** Column sums. */
export function columnTotals(matrix: Matrix, width: number): number[] {
  return Array.from({ length: width }, (_, j) => matrix.reduce((s, row) => s + (row[j] ?? 0), 0));
}
