import { useEffect, useState } from 'react';
import type { FleetShare } from '@/engine/communities/fleetPayouts';
import { loadMyFleetShare } from './fleetPayoutStore';

export type MyFleetShare =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; share: FleetShare | null };

/** The viewer's own Share in one Fleet Payout (the rules deny a non-boss the rest). */
export function useMyFleetShare(
  characterId: number,
  communityId: string,
  payoutId: string
): MyFleetShare {
  const [loaded, setLoaded] = useState<{ key: string; result: MyFleetShare } | null>(null);
  const key = `${characterId}:${communityId}:${payoutId}`;
  useEffect(() => {
    let cancelled = false;
    loadMyFleetShare(characterId, communityId, payoutId).then(
      (share) => !cancelled && setLoaded({ key, result: { status: 'ready', share } }),
      () => !cancelled && setLoaded({ key, result: { status: 'failed' } })
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, payoutId, key]);
  return loaded?.key === key ? loaded.result : { status: 'loading' };
}
