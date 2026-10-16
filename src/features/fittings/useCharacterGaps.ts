import { useEffect, useMemo, useState } from 'react';
import type { Fitting } from '@/engine/fittings/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  cachedFittingGap,
  fittingGapForCharacter,
  type FittingGapResult,
} from './canFlyForCharacter';

export interface GapCharacter {
  characterId: number;
  name: string;
}

export type CharacterGapRow =
  | { characterId: number; name: string; state: 'pending' }
  | { characterId: number; name: string; state: 'unloaded' }
  | { characterId: number; name: string; state: 'ready'; gap: NonNullable<FittingGapResult> };

/**
 * Each Character's gap to the Fitting. Nothing is worked out unless `enabled`
 * (the section is open); answers already cached per Fitting + Character show
 * at once, so the headline stays up while the section is closed.
 */
export function useCharacterGaps(
  fitting: Fitting,
  characters: readonly GapCharacter[],
  enabled: boolean
): CharacterGapRow[] {
  const [results, setResults] = useState<{
    fitting: Fitting;
    byId: ReadonlyMap<number, FittingGapResult | 'unloaded'>;
  }>({ fitting, byId: new Map() });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async ({ characterId }) => {
      const gap = await fittingGapForCharacter(fitting, characterId).catch(() => null);
      if (cancelled) return;
      setResults((prev) => ({
        fitting,
        byId: new Map(prev.fitting === fitting ? prev.byId : []).set(
          characterId,
          gap ?? 'unloaded'
        ),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [fitting, characters, enabled]);
  const byId = results.fitting === fitting ? results.byId : null;
  return useMemo(
    () =>
      characters.map(({ characterId, name }): CharacterGapRow => {
        const answer = byId?.get(characterId) ?? cachedFittingGap(fitting, characterId);
        if (answer === 'unloaded') return { characterId, name, state: 'unloaded' };
        if (answer) return { characterId, name, state: 'ready', gap: answer };
        return { characterId, name, state: 'pending' };
      }),
    [byId, characters, fitting]
  );
}

/** Characters who can fly the Fitting now; null while any answer is still on its way. */
export function canFlyHeadline(
  rows: readonly CharacterGapRow[]
): { canFly: number; total: number } | null {
  if (rows.some((row) => row.state === 'pending')) return null;
  return {
    canFly: rows.filter((row) => row.state === 'ready' && row.gap.missingCount === 0).length,
    total: rows.length,
  };
}
