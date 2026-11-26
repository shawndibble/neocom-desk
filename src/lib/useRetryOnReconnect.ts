import { useEffect } from 'react';
import { onReconnect } from '@/stores/network';

export function useRetryOnReconnect(failed: boolean, retry: () => void): void {
  useEffect(() => (failed ? onReconnect(retry) : undefined), [failed, retry]);
}
