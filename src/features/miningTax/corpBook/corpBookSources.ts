import { resolveNames } from '@/features/character/names';
import { loadDatedUnitPricesByHub, type DatedUnitPrices } from '@/features/miningTax/pricing';
import {
  readCorpBooks,
  trackedCharacterCorporations,
  type CorpBooksRead,
  type LoadedCorpBook,
} from './corpBookStore';

export async function loadTrackedCorpBooks(): Promise<LoadedCorpBook[]> {
  return (await readTrackedCorpBooks()).books;
}

export function readTrackedCorpBooks(): Promise<CorpBooksRead & { unreadable: boolean }> {
  return trackedCharacterCorporations().then(
    async (characters) => ({ ...(await readCorpBooks(characters)), unreadable: false }),
    () => ({ books: [], failed: [], unreadable: true })
  );
}

export function withStoredBooks(
  read: CorpBooksRead & { unreadable: boolean },
  stored: readonly LoadedCorpBook[]
): LoadedCorpBook[] {
  if (read.unreadable) return [...stored];
  const kept = stored.filter((b) => read.failed.includes(b.corporationId));
  return [...read.books, ...kept];
}

export function loadCorpNames(books: readonly LoadedCorpBook[]): Promise<Map<number, string>> {
  return resolveNames(books.map((b) => b.corporationId)).catch(() => new Map<number, string>());
}

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
