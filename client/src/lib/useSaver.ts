import { useEffect, useRef } from 'react';
import { api } from '../api';
import { useApp } from '../store';

export type Flush = { current: null | (() => Promise<void>) };

/** Debounced autosave of answers. `flush.current()` sends anything still waiting (called before submitting). */
export function useSaver(roundN: number, flush: Flush) {
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<number | undefined>(undefined);
  const { notify } = useApp();

  const send = async () => {
    const answers = pending.current;
    if (!Object.keys(answers).length) return;
    pending.current = {};
    try {
      await api(`/rounds/${roundN}/answers`, { method: 'PUT', body: { answers } });
    } catch (e) {
      pending.current = { ...answers, ...pending.current }; // keep for a retry
      notify('error', (e as Error).message);
      throw e;
    }
  };
  flush.current = send;

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (id: string, value: unknown, delay = 600) => {
    pending.current[id] = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void send().catch(() => {}), delay);
  };
}


