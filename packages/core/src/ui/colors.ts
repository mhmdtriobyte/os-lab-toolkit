/** Categorical colours for processes/threads, readable on light and dark backgrounds with white text. */
const SERIES = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#65a30d',
  '#c026d3',
  '#4f46e5',
];

export function seriesColor(index: number): string {
  return SERIES[((index % SERIES.length) + SERIES.length) % SERIES.length] as string;
}
