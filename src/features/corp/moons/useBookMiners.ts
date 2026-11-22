/**
 * The book's Miners for a picker. A page read for one Miner (`scopedMiner`) holds only that Miner,
 * so there the list and its names are read once (`readBookMiners`); elsewhere the view has them.
 */
import { useEffect, useState } from 'react';
import { resolveNames } from '@/features/character/names';
import { readBookMiners } from '../taxBook/bookClient';
import { useBook } from './useBook';

interface PickableMiner {
  id: string;
  mainCharacterId: number;
  characterIds: readonly number[];
}

export function useBookMiners(): {
  miners: readonly PickableMiner[];
  nameOf: (characterId: number) => string;
  /** Still reading a scoped page's list. */
  loading: boolean;
} {
  const { view, names, data, characterId, corporationId } = useBook();
  const scoped = data?.scopedMiner !== undefined;
  const [read, setRead] = useState<{
    miners: PickableMiner[];
    names: ReadonlyMap<number, string>;
  } | null>(null);
  useEffect(() => {
    if (!scoped) return;
    let cancelled = false;
    void (async () => {
      try {
        const miners = await readBookMiners(characterId, corporationId);
        const resolved = await resolveNames(miners.map((m) => m.mainCharacterId)).catch(
          () => new Map<number, string>()
        );
        if (!cancelled) setRead({ miners, names: resolved });
      } catch {
        // The page's own Miner is all there is to show; the dialog says nothing matches.
        if (!cancelled) setRead({ miners: [], names: new Map() });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scoped, characterId, corporationId]);
  if (!scoped) return { miners: view.miners, nameOf: names.character, loading: false };
  return {
    miners: read?.miners ?? [],
    nameOf: (id) => read?.names.get(id) ?? names.character(id),
    loading: read === null,
  };
}
