import { useEffect, useRef } from 'react';
import { useIPC } from './useIPC';

interface UsePollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: (params?: any) => Promise<void>;
}

export function usePolling<T = any>(
  channel: string,
  intervalMs: number,
  params?: any
): UsePollingReturn<T> {
  const { data, loading, error, refresh, invoke } = useIPC<T>(channel);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    invoke(params);

    // Set up polling
    intervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        invoke(params);
      }
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [channel, intervalMs]);

  return { data, loading, error, refresh };
}
