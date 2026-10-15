import { useEffect, useState } from 'react';
import type { SharedItem } from '@/engine/communities/requests';
import { loadMemberLibraries } from './communityStore';

export type SharedBlueprintTypes =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; items: readonly SharedItem[] };

/**
 * The blueprints (type and runs) this Member has shared with a Community: what the
 * library they publish to this Community holds, the same list the Community Library shows
 * under their name, so "I can fill" agrees with it. One read of their own
 * library, once `enabled`.
 */
export function useSharedBlueprintTypes(
  characterId: number,
  communityId: string,
  myUid: string,
  enabled: boolean
): SharedBlueprintTypes {
  const [loaded, setLoaded] = useState<{
    key: string;
    value: SharedBlueprintTypes;
  } | null>(null);
  const key = `${characterId}:${communityId}:${myUid}`;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadMemberLibraries(characterId, communityId, [myUid], { strict: true }).then(
      (libraries) =>
        !cancelled &&
        setLoaded({
          key,
          value: {
            status: 'ready',
            items: libraries.flatMap((l) => l.items.map(({ typeId, runs }) => ({ typeId, runs }))),
          },
        }),
      () => !cancelled && setLoaded({ key, value: { status: 'failed' } })
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, myUid, enabled, key]);
  return loaded?.key === key ? loaded.value : { status: 'loading' };
}
