import { useEffect, useState } from 'react';
import { loadMemberLibraries } from './communityStore';

export type SharedBlueprintTypes =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; typeIds: ReadonlySet<number> };

/**
 * The blueprint types this Member has shared with a Community: what their
 * own published library holds, the same list the Community Library shows
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
    loadMemberLibraries(characterId, communityId, [myUid]).then(
      (libraries) =>
        !cancelled &&
        setLoaded({
          key,
          value: {
            status: 'ready',
            typeIds: new Set(libraries.flatMap((l) => l.items.map((item) => item.typeId))),
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
