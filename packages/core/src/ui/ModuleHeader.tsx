import { useRef, useState, type ReactNode } from 'react';
import type { Example } from '../engine';
import { Icon } from './Icon';
import { Alert, Button, Select } from './primitives';

export interface ModuleHeaderProps<T> {
  title: string;
  description: ReactNode;
  moduleId: string;
  examples: readonly Example[];
  exampleId: string | undefined;
  onLoadExample: (id: string) => void;
  input: T;
  /** Called with parsed JSON from "Import JSON"; return false if it was not a valid input. */
  onImport: (raw: unknown) => boolean;
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Title, examples dropdown and share bar (copy link, export/import JSON) shown by every module. */
export function ModuleHeader<T>({
  title,
  description,
  moduleId,
  examples,
  exampleId,
  onLoadExample,
  input,
  onImport,
}: ModuleHeaderProps<T>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const flash = (tone: 'success' | 'error', text: string) => {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice(null), 3000);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash('success', 'Link copied. Anyone opening it sees this exact exercise.');
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  };

  const importFile = async (file: File) => {
    try {
      const ok = onImport(JSON.parse(await file.text()) as unknown);
      flash(
        ok ? 'success' : 'error',
        ok ? 'Imported.' : 'That file is not a valid input for this module.',
      );
    } catch {
      flash('error', 'Could not read that file as JSON.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {examples.length > 0 && (
            <Select
              aria-label="Load an example"
              value={exampleId ?? ''}
              onChange={(e) => e.target.value && onLoadExample(e.target.value)}
            >
              <option value="">Examples…</option>
              {examples.map((ex) => (
                <option key={ex.id} value={ex.id} title={ex.description}>
                  {ex.title}
                </option>
              ))}
            </Select>
          )}
          <Button onClick={copyLink} title="Copy a link with this input preloaded">
            <Icon name="link" />
            Share link
          </Button>
          <Button
            onClick={() => download(`${moduleId}-input.json`, JSON.stringify(input, null, 2))}
            title="Download the current input as JSON"
          >
            Export JSON
          </Button>
          <Button onClick={() => fileRef.current?.click()} title="Load an input from a JSON file">
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
    </div>
  );
}
