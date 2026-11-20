import { useEffect, useRef } from 'react';
import { reportFailure } from '@/observability/reportFailure';
import { isSyncConfigured } from './syncStatus';

/** Waits out the boot work before the one claim, so it never competes with the first route. */
export const PLAYER_CLAIM_DELAY_MS = 15_000;

/**
 * Proves this device's stored Characters as one Player (even one: a later owner-hash change
 * drops a sold Character from its old owner, and only a claim for its token runs that), once per page load and set of Characters.
 * Only short-lived access tokens are sent (`features/corpTaxBook/playerApi.ts`); a Character whose
 * login expired is skipped. Quiet: a failure is reported, never shown, and the next load retries.
 */
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
    // `key` stands for the list: a fresh array of the same ids must not restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
