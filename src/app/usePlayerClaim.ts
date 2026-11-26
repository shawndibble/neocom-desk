import { useEffect, useRef } from 'react';
import { reportFailure } from '@/observability/reportFailure';
import { isSyncConfigured } from './syncStatus';

export const PLAYER_CLAIM_DELAY_MS = 15_000;

export function usePlayerClaim(characterIds: readonly number[]): void {
  const claimed = useRef(new Set<string>());
  const key = [...characterIds].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (characterIds.length < 1 || !isSyncConfigured() || claimed.current.has(key)) return;
    const timer = window.setTimeout(() => {
      claimed.current.add(key);
      void import('@/features/corpTaxBook/playerApi')
        .then((m) => m.claimPlayerCharacters(characterIds))
        .catch((e: unknown) => reportFailure('sync', e));
    }, PLAYER_CLAIM_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
