import { useCallback, useState } from 'react';
import { useRetryOnReconnect } from './useRetryOnReconnect';

export function useRetryableLoad() {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  const fail = useCallback(() => setFailed(true), []);
  const clear = useCallback(() => setFailed(false), []);
  useRetryOnReconnect(failed, retry);
  return { failed, attempt, fail, clear, retry };
}
