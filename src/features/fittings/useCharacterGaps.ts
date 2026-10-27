import { useEffect, useMemo, useState } from 'react';
import type { Fitting } from '@/engine/fittings/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useReconnectCount } from '@/stores/network';
import { canFlyForCharacter } from './canFlyForCharacter';
import {
  cachedFittingGap,
  fittingGapForCharacter,
  type FittingGapAnswer,
} from './fittingGapForCharacter';

export interface GapCharacter {
  characterId: number;
  name: string;
}

export type CharacterGapRow = { characterId: number; name: string } & (
  FittingGapAnswer | { state: 'pending' }
);

/** Can fly: nothing known is missing and every requirement was confirmed. */
export const canFly = (row: CharacterGapRow): boolean =>
  row.state === 'ready' && row.gap.missingCount === 0;

export interface CharacterGaps {
  rows: CharacterGapRow[];
  /** "n of m can fly"; null until every Character has an answer. */
  headline: { canFly: number; total: number } | null;
}

/**
 * Each Character's gap to the Fitting. Closed, only the cheap can-fly yes/no is
 * worked out (shared with Fitting Compare); gaps and training times wait for
 * `enabled`. Answers outlive a Fitting edit until new ones arrive.
 */
export function useCharacterGaps(
  fitting: Fitting,
  characters: readonly GapCharacter[],
  enabled: boolean
): CharacterGaps {
  const reconnects = useReconnectCount();
  const [gaps, setGaps] = useState<ReadonlyMap<number, FittingGapAnswer>>(new Map());
  // null: asked, but the requirements couldn't be determined.
  const [flies, setFlies] = useState<ReadonlyMap<number, boolean | null>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async ({ characterId }) => {
      if (cancelled) return;
      if (enabled) {
        const answer = await fittingGapForCharacter(fitting, characterId).catch(
          (): FittingGapAnswer => ({ state: 'unloaded' })
        );
        if (!cancelled) setGaps((prev) => new Map(prev).set(characterId, answer));
      } else {
        const answer = await canFlyForCharacter(fitting, characterId).catch(() => null);
        if (!cancelled) setFlies((prev) => new Map(prev).set(characterId, answer));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fitting, characters, enabled, reconnects]);
  return useMemo(() => {
    const rows = characters.map(({ characterId, name }): CharacterGapRow => {
      const answer = cachedFittingGap(fitting, characterId) ?? gaps.get(characterId);
      return { characterId, name, ...(answer ?? { state: 'pending' as const }) };
    });
    let count = 0;
    let waiting = false;
    rows.forEach((row) => {
      const cheap = flies.get(row.characterId);
      if (row.state !== 'pending') count += canFly(row) ? 1 : 0;
      else if (cheap === undefined) waiting = true;
      else count += cheap ? 1 : 0;
    });
    return { rows, headline: waiting ? null : { canFly: count, total: rows.length } };
  }, [characters, fitting, gaps, flies]);
}
