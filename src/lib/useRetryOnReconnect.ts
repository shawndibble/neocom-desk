import { useEffect } from 'react';
import { onReconnect } from '@/stores/network';

/**
 * Calls `retry` once when the connection returns, for as long as `failed` is
 * true — the "a failure while offline mends itself" effect, so each view
 * doesn't spell out its own subscription.
 */
export function useRetryOnReconnect(failed: boolean, retry: () => void): void {
  useEffect(() => (failed ? onReconnect(retry) : undefined), [failed, retry]);
}
