import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs one request at a time in a fresh Web Worker, so a long search never freezes the page.
 * `create` must return a new worker each call; starting a new job or unmounting stops the old one.
 */
export function useWorkerJob<Req, Res>(create: () => Worker) {
  const worker = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (request: Req, onDone: (result: Res) => void) => {
      cancel();
      const w = create();
      worker.current = w;
      setRunning(true);
      setError(null);
      w.onmessage = (e: MessageEvent<Res>) => {
        cancel();
        onDone(e.data);
      };
      w.onerror = (e) => {
        cancel();
        setError(e.message || 'The search failed.');
      };
      w.postMessage(request);
    },
    [cancel, create],
  );

  return { run, cancel, running, error };
}
