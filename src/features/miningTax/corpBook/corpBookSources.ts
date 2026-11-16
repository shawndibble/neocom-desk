/**
 * The reads behind a Corp Tax Book view (`buildCorpBookView`): the member's books, their
 * corporations' names, and each book's prices. Shared by the Tax tab's `useCorpBookView`, which
 * stages them so the ledger never waits, and `loadOwedBalances`, which the Overview awaits whole.
 * Every read degrades to "nothing": a book never breaks the personal ledger.
 */
import { resolveNames } from '@/features/character/names';
import { loadDatedUnitPricesByHub, type DatedUnitPrices } from '@/features/miningTax/pricing';
import { loadCorpBooks, trackedCharacterCorporations, type LoadedCorpBook } from './corpBookStore';

/** The Corp Tax Books of the tracked Characters' corporations; none when they cannot be read. */
export function loadTrackedCorpBooks(): Promise<LoadedCorpBook[]> {
  return trackedCharacterCorporations().then(loadCorpBooks, () => []);
}

/** Each book's corporation name; empty when the lookup fails (callers fall back to `#id`). */
export function loadCorpNames(books: readonly LoadedCorpBook[]): Promise<Map<number, string>> {
  return resolveNames(books.map((b) => b.corporationId)).catch(() => new Map<number, string>());
}

/** Prices for each book at its own hub and Ore Form, for the days it observed; a failed book is left out. */
export async function loadBookPrices(
  books: readonly LoadedCorpBook[]
): Promise<Map<number, DatedUnitPrices>> {
  const entries = await Promise.all(
    books.map(async (book) => {
      const typeIds = [...new Set(book.observed.flatMap((o) => o.oreLines.map((l) => l.typeId)))];
      const dates = [...new Set(book.observed.map((o) => o.date))];
      const prices = await loadDatedUnitPricesByHub(
        typeIds,
        [book.hubId],
        dates,
        book.oreForm === 'compressed'
      ).catch(() => null);
      return prices ? ([book.corporationId, prices] as const) : null;
    })
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}
