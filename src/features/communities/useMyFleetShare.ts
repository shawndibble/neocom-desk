import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { FleetShare } from '@/engine/communities/fleetPayouts';
import { loadMyFleetShare } from './fleetPayoutStore';

export type MyFleetShare =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; share: FleetShare | null };

export function useMyFleetShare(
  characterId: number,
  communityId: string,
  payoutId: string
): MyFleetShare {
  const load = useCallback(
    () => loadMyFleetShare(characterId, communityId, payoutId),
    [characterId, communityId, payoutId]
  );
  const loaded = useKeyedLoad(`${characterId}:${communityId}:${payoutId}`, load);
  if (loaded.status === 'ready') return { status: 'ready', share: loaded.data };
  return loaded.status === 'failed' ? { status: 'failed' } : { status: 'loading' };
}
