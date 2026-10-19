import { useEffect, useState } from 'react';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';

/**
 * Jumps away from where the Character is now, on the saved route preference
 * (the Travel route rule), per clone location. Filled in after the first
 * paint: a progressive enhancement, so a slow graph never holds the clones
 * back. `undefined` until the current inputs have resolved.
 */
export function useCloneJumpsAway(
  systemIds: ReadonlyMap<number, number | null>,
  characterSystemId: number | null,
  loadedAt: number
): ReadonlyMap<number, JumpsAwayResult> | undefined {
  const basis = useJumpBasis();
  const [jumpsAway, setJumpsAway] = useState<{
    key: string;
    byLocation: ReadonlyMap<number, JumpsAwayResult>;
  } | null>(null);
  const jumpsKey = `${basis.key}:${characterSystemId}:${loadedAt}`;
  useEffect(() => {
    if (!basis.hydrated || loadedAt === 0) return;
    let cancelled = false;
    void Promise.all(
      [...systemIds].map(async ([locationId, systemId]): Promise<[number, JumpsAwayResult]> => {
        if (characterSystemId === null) {
          return [locationId, { kind: 'unknown', reason: 'noLocation' }];
        }
        if (systemId === null) return [locationId, { kind: 'unknown', reason: 'noRoute' }];
        return [locationId, await jumpsBetween(characterSystemId, systemId, basis)];
      })
    ).then((entries) => {
      if (!cancelled) setJumpsAway({ key: jumpsKey, byLocation: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [basis, characterSystemId, systemIds, loadedAt, jumpsKey]);
  return jumpsAway?.key === jumpsKey ? jumpsAway.byLocation : undefined;
}
