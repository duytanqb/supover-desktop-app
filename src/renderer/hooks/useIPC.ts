import { useState, useCallback, useRef } from 'react';

interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface UseIPCReturn<T> {
  invoke: (params?: any) => Promise<IPCResponse<T>>;
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: (params?: any) => Promise<void>;
}

export function useIPC<T = any>(channel: string, autoParams?: any): UseIPCReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastParamsRef = useRef<any>(autoParams);

  const invoke = useCallback(async (params?: any): Promise<IPCResponse<T>> => {
    setLoading(true);
    setError(null);
    lastParamsRef.current = params ?? lastParamsRef.current;

    try {
      if (!window.electron?.ipcRenderer) {
        throw new Error('IPC not available — app is still loading, please retry');
      }
      const response: IPCResponse<T> = await window.electron.ipcRenderer.invoke(
        channel,
        lastParamsRef.current
      );

      if (response.success) {
        setData(response.data ?? null);
      } else {
        setError(response.error ?? 'Unknown error');
      }

      setLoading(false);
      return response;
    } catch (err: any) {
      const message = err?.message ?? 'IPC call failed';
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    }
  }, [channel]);

  const refresh = useCallback(async (params?: any) => {
    await invoke(params);
  }, [invoke]);

  return { invoke, data, loading, error, refresh };
}
