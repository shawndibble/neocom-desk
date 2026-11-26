import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { SharedItem } from '@/engine/communities/requests';
import { loadMemberLibraries } from './communityStore';

export type SharedBlueprintTypes =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; items: readonly SharedItem[] };

export function useSharedBlueprintTypes(
  characterId: number,
  communityId: string,
  myUid: string,
  enabled: boolean
): SharedBlueprintTypes {
  const load = useCallback(
    async () =>
      (await loadMemberLibraries(characterId, communityId, [myUid], { strict: true })).flatMap(
        (l) => l.items.map(({ typeId, runs }) => ({ typeId, runs }))
      ),
    [characterId, communityId, myUid]
  );
  const loaded = useKeyedLoad(`${characterId}:${communityId}:${myUid}`, load, !enabled);
  if (loaded.status === 'ready') return { status: 'ready', items: loaded.data };
  return loaded.status === 'failed' ? { status: 'failed' } : { status: 'loading' };
}
