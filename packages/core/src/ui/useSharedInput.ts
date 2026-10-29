import { useCallback, useEffect, useState } from 'react';
import { decodeState, encodeState, formatHash, parseHash, type Example } from '../engine';

export interface SharedInput<T> {
  input: T;
  setInput: (next: T) => void;
  /** Id of the example the input came from, until the user edits it. */
  exampleId: string | undefined;
  loadExample: (id: string) => void;
}

interface State<T> {
  input: T;
  exampleId: string | undefined;
}

function fromHash<T>(
  hash: string,
  examples: readonly Example[],
  sanitize: (raw: unknown) => T | null,
): State<T> | null {
  const params = parseHash(hash);
  if (params.s) {
    const decoded = sanitize(decodeState(params.s));
    if (decoded) return { input: decoded, exampleId: undefined };
  }
  const example = examples.find((e) => e.id === params.ex);
  const fromExample = example ? sanitize(example.input) : null;
  return example && fromExample ? { input: fromExample, exampleId: example.id } : null;
}

/**
 * Module input that lives in the URL hash, so the current exercise can be shared as a link.
 * `sanitize` turns untrusted decoded JSON (from a link or an imported file) into a valid input.
 */
export function useSharedInput<T>(
  examples: readonly Example[],
  fallback: T,
  sanitize: (raw: unknown) => T | null,
): SharedInput<T> {
  const [state, setState] = useState<State<T>>(
    () =>
      fromHash(window.location.hash, examples, sanitize) ?? {
        input: fallback,
        exampleId: undefined,
      },
  );

  useEffect(() => {
    const hash = state.exampleId
      ? formatHash({ ex: state.exampleId })
      : formatHash({ s: encodeState(state.input) });
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    // replaceState does not fire "hashchange", so this never loops.
    window.history.replaceState(window.history.state, '', url);
  }, [state]);

  // A link pasted into the same tab only changes the hash: load it without a page reload.
  useEffect(() => {
    const onHashChange = () => {
      const next = fromHash(window.location.hash, examples, sanitize);
      if (next) setState(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [examples, sanitize]);

  const setInput = useCallback((input: T) => setState({ input, exampleId: undefined }), []);

  const loadExample = useCallback(
    (id: string) => {
      const example = examples.find((e) => e.id === id);
      const input = example ? sanitize(example.input) : null;
      if (example && input) setState({ input, exampleId: id });
    },
    [examples, sanitize],
  );

  return { input: state.input, setInput, exampleId: state.exampleId, loadExample };
}
