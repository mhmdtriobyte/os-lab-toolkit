import { cx } from './primitives';

/**
 * Line icons drawn as inline SVG (24x24, stroked with currentColor), so they follow the text colour
 * in every theme and never render as platform emoji.
 */
const PATHS = {
  tree: 'M10 3h4v4h-4z M12 7v4 M6 11h12 M6 11v3 M18 11v3 M4 14h4v4H4z M16 14h4v4h-4z',
  chart: 'M4 20h16 M7 16v-5 M12 16V6 M17 16v-8',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 7.5-1.9',
  threads: 'M3 7h18 M3 12h18 M3 17h18 M7 5v4 M14 10v4 M10 15v4',
  memory: 'M6 6h12v12H6z M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  shuffle: 'M3 7h4l10 10h4 M3 17h4l3-3 M14 10l3-3h4 M18 4l3 3-3 3 M18 14l3 3-3 3',
  first: 'M6 5v14 M18 5l-9 7 9 7z',
  prev: 'M15 5l-7 7 7 7',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 5h3v14H7z M14 5h3v14h-3z',
  next: 'M9 5l7 7-7 7',
  last: 'M18 5v14 M6 5l9 7-9 7z',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  close: 'M6 6l12 12 M18 6 6 18',
  github:
    'M9 19c-4 1.5-4-2-6-2.5 M15 22v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.7 12.7 0 0 0-6.6 0C5.7 1.9 4.6 2.2 4.6 2.2a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3 9.4c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V22',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className,
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('inline-block h-4 w-4 shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
