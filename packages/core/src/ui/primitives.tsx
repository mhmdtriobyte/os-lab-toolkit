import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300 dark:disabled:bg-indigo-900',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost: 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-300',
};

export function Button({
  variant = 'secondary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        buttonStyles[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputClass, className)} {...rest} />;
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = Number(e.target.value);
        if (e.target.value === '' || !Number.isFinite(raw)) return;
        let v = Math.trunc(raw);
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        onValueChange(v);
      }}
      className={cx(inputClass, 'w-20 tabular-nums', className)}
      {...rest}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
      <input
        type="checkbox"
        className="h-4 w-4 accent-indigo-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex flex-wrap rounded-lg bg-slate-200 p-0.5 dark:bg-slate-800"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 py-1 text-sm font-medium transition-colors',
            o.value === value
              ? 'bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Tone = 'info' | 'warning' | 'error' | 'success';

const toneStyles: Record<Tone, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
  error:
    'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-md border px-3 py-2 text-sm', toneStyles[tone])}
    >
      {children}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
        className ?? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
      )}
    >
      {children}
    </span>
  );
}

/** Consistent table styling for result tables across modules. */
export const tableClass =
  'w-full border-collapse text-sm [&_td]:border-b [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-600';
