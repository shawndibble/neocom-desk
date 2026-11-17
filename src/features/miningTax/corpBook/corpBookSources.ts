/**
 * The reads behind a Corp Tax Book view (`buildCorpBookView`): the member's books, their
 * corporations' names, and each book's prices. Shared by the Tax tab's `useCorpBookView`, which
 * stages them so the ledger never waits, and `loadOwedBalances`, which the Overview awaits whole.
 * Every read degrades to "nothing": a book never breaks the personal ledger.
 */
import { resolveNames } from '@/features/character/names';
import { loadDatedUnitPricesByHub, type DatedUnitPrices } from '@/features/miningTax/pricing';
import {
  readCorpBooks,
  trackedCharacterCorporations,
  type CorpBooksRead,
  type LoadedCorpBook,
} from './corpBookStore';

/** The Corp Tax Books of the tracked Characters' corporations; none when they cannot be read. */
export async function loadTrackedCorpBooks(): Promise<LoadedCorpBook[]> {
  return (await readTrackedCorpBooks()).books;
}

/** `CorpBooksRead` for the tracked Characters; `unreadable` when even their corporations could not be listed. */
export function readTrackedCorpBooks(): Promise<CorpBooksRead & { unreadable: boolean }> {
  return trackedCharacterCorporations().then(
    async (characters) => ({ ...(await readCorpBooks(characters)), unreadable: false }),
    () => ({ books: [], failed: [], unreadable: true })
  );
}

/**
 * The books to show: what was read, plus the last good copy of any book whose read failed (offline,
 * a lapsed session). A book that is gone or hidden was not a failure and is not kept.
 */
export function withStoredBooks(
  read: CorpBooksRead & { unreadable: boolean },
  stored: readonly LoadedCorpBook[]
): LoadedCorpBook[] {
  if (read.unreadable) return [...stored];
  const kept = stored.filter((b) => read.failed.includes(b.corporationId));
  return [...read.books, ...kept];
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
