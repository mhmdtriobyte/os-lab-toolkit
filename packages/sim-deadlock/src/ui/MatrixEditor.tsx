import { cx, NumberInput, tableClass } from '@oslab/core';

/** Editable (or read-only) integer matrix with row and column labels. */
export function MatrixEditor({
  caption,
  rows,
  cols,
  values,
  onChange,
  highlightRow = null,
}: {
  caption: string;
  rows: readonly string[];
  cols: readonly string[];
  values: readonly (readonly number[])[];
  onChange?: (values: number[][]) => void;
  highlightRow?: number | null;
}) {
  const set = (i: number, j: number, v: number) =>
    onChange?.(values.map((row, r) => row.map((x, c) => (r === i && c === j ? v : x))));
  return (
    <div className="min-w-0 overflow-auto">
      <table className={cx(tableClass, 'w-auto tabular-nums')}>
        <caption className="pb-1 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="text-center">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r}-${i}`}
              className={cx(i === highlightRow && 'bg-amber-100 dark:bg-amber-900/60')}
            >
              <th scope="row">{r}</th>
              {cols.map((c, j) => (
                <td key={c} className="text-center">
                  {onChange ? (
                    <NumberInput
                      aria-label={`${caption} ${r} ${c}`}
                      value={values[i]?.[j] ?? 0}
                      min={0}
                      max={999}
                      onValueChange={(v) => set(i, j, v)}
                      className="w-14"
                    />
                  ) : (
                    <span className={cx((values[i]?.[j] ?? 0) < 0 && 'font-bold text-rose-600')}>
                      {values[i]?.[j] ?? 0}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Helpers to grow/shrink every matrix when processes or resource types are added or removed. */
export function resizeRows(m: number[][], rows: number, cols: number): number[][] {
  return Array.from(
    { length: rows },
    (_, i) => m[i]?.slice(0, cols) ?? new Array<number>(cols).fill(0),
  );
}

export function resizeCols(m: number[][], cols: number): number[][] {
  return m.map((row) => Array.from({ length: cols }, (_, j) => row[j] ?? 0));
}

export function nextLabel(existing: readonly string[], prefix: string, start: number): string {
  for (let k = start; ; k++) if (!existing.includes(`${prefix}${k}`)) return `${prefix}${k}`;
}

export function nextResource(existing: readonly string[]): string {
  for (let k = 0; k < 26; k++) {
    const name = String.fromCharCode(65 + k);
    if (!existing.includes(name)) return name;
  }
  return nextLabel(existing, 'R', 1);
}
