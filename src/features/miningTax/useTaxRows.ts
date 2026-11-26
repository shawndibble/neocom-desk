import { useMemo } from 'react';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import { buildDisplayRows, isBookRow } from './corpBook/corpRows';
import type { CorpBookView } from './corpBook/corpBookView';
import type { TaxSnapshot } from './taxSnapshot';
import type { TrackedCharacter } from './snapshot';

export function useTaxRows(
  data: TaxSnapshot | null,
  corpView: CorpBookView | null,
  characters: readonly TrackedCharacter[],
  resolvedCharacterFilter: MultiSelectFilter<number>
) {
  const allDisplayRows = useMemo(
    () =>
      buildDisplayRows(
        data?.entries ?? [],
        corpView?.overlay ?? null,
        (id) => characters.find((c) => c.characterId === id)?.characterName ?? `#${id}`
      ),
    [data, corpView, characters]
  );
  const personalRows = useMemo(
    () => allDisplayRows.filter((dr) => !isBookRow(dr)),
    [allDisplayRows]
  );
  const characterFiltered = useMemo(
    () =>
      allDisplayRows.filter(
        (dr) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(dr.row.characterId)
      ),
    [allDisplayRows, resolvedCharacterFilter]
  );
  return { allDisplayRows, personalRows, characterFiltered };
}
