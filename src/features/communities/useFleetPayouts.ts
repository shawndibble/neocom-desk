import { useCallback, useEffect, useState } from 'react';
import type { FleetPayout } from '@/engine/communities/fleetPayouts';
import { loadFleetPayouts } from './fleetPayoutStore';

/**
 * A Community's Fleet Payouts, read once `enabled` is true and again on
 * `reload()` (Firestore here has no listeners). `payouts` is null until the
 * first read lands; a failed reload keeps the last list and sets `failed`.
 */
export function useFleetPayouts(characterId: number, communityId: string, enabled: boolean) {
  const [payouts, setPayouts] = useState<FleetPayout[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadFleetPayouts(characterId, communityId).then(
      (loaded) => {
        if (cancelled) return;
        setPayouts(loaded);
        setFailed(false);
      },
      (err) => {
        if (cancelled) return;
        console.warn('Fleet Payouts could not be read', err);
        setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, enabled, version]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { payouts, failed, reload };
}
