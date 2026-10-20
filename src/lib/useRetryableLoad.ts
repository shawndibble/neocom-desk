import { useCallback, useState } from 'react';
import { useRetryOnReconnect } from './useRetryOnReconnect';

/**
 * The bookkeeping every "load, and if it fails, say so and let the pilot retry"
 * view repeats: a failed flag, an attempt counter the load effect depends on,
 * and an automatic retry the moment the connection returns.
 *
 * The load effect lists `attempt` in its dependencies, calls `clear()` as it
 * starts (a new key or Character supersedes an old failure, so the reconnect
 * subscription does not linger) and `fail()` from its rejection handler.
 */
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
