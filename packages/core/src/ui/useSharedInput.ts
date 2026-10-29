import { useCallback, useEffect, useState } from 'react';
import { decodeState, encodeState, formatHash, parseHash, type Example } from '../engine';

export interface SharedInput<T> {
  input: T;
  setInput: (next: T) => void;
  /** Id of the example the input came from, until the user edits it. */
  exampleId: string | undefined;
  loadExample: (id: string) => void;
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
  const [state, setState] = useState<{ input: T; exampleId: string | undefined }>(() => {
    const params = parseHash(window.location.hash);
    if (params.s) {
      const decoded = sanitize(decodeState(params.s));
      if (decoded) return { input: decoded, exampleId: undefined };
    }
    const example = examples.find((e) => e.id === params.ex);
    const fromExample = example ? sanitize(example.input) : null;
    if (example && fromExample) return { input: fromExample, exampleId: example.id };
    return { input: fallback, exampleId: undefined };
  });

  useEffect(() => {
    const hash = state.exampleId
      ? formatHash({ ex: state.exampleId })
      : formatHash({ s: encodeState(state.input) });
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(window.history.state, '', url);
  }, [state]);

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
