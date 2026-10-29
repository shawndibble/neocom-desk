import { useMemo } from 'react';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import { buildDisplayRows, isBookRow } from './corpBook/corpRows';
import type { CorpBookView } from './corpBook/corpBookView';
import type { TaxSnapshot } from './taxSnapshot';
import type { TrackedCharacter } from './snapshot';

/** The ledger's display rows: every one, the personal ones the ledger writes to, and those in the Character filter's view. */
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
  // What the personal ledger writes to: the rows the book decided are display-only.
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
