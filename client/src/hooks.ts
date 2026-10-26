import { useEffect, useRef, useState } from 'react';
import { useApp } from './store';

/**
 * Fetch data and keep it fresh.
 * - `live` (default true): refetch automatically when the server announces a data change (WebSocket).
 * - `reload()` refetches on demand.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = [], live = true) {
  const { version } = useApp();
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({
    data: null,
    error: '',
    loading: true,
  });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    fnRef
      .current()
      .then((data) => !cancelled && setState({ data, error: '', loading: false }))
      .catch((e: Error) => !cancelled && setState((s) => ({ data: s.data, error: e.message, loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, live ? version : 0]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
