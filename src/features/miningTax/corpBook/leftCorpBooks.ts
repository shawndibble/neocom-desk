import type { LoadedCorpBook } from './corpBookStore';

export const isLeftBook = (book: LoadedCorpBook): boolean =>
  book.characterIds.length > 0 && book.memberCharacterIds.length === 0;

export interface LeftCorpBook {
  corporationId: number;
  corpName: string;
  owed: number;
  characterIds: number[];
}

export function leftCorpBooksOf(
  books: readonly LoadedCorpBook[],
  nameOf: (corporationId: number) => string,
  owedOf: (corporationId: number) => number
): LeftCorpBook[] {
  return books.filter(isLeftBook).map((b) => ({
    corporationId: b.corporationId,
    corpName: nameOf(b.corporationId),
    owed: owedOf(b.corporationId),
    characterIds: b.characterIds,
  }));
}

export const withoutHiddenLeft = (
  books: readonly LoadedCorpBook[],
  hidden: ReadonlySet<number>
): LoadedCorpBook[] => books.filter((b) => !(hidden.has(b.corporationId) && isLeftBook(b)));

export function hiddenLeftBooksOf(
  books: readonly LoadedCorpBook[],
  hidden: ReadonlySet<number>,
  nameOf: (corporationId: number) => string
): { corporationId: number; corpName: string }[] {
  return books
    .filter((b) => hidden.has(b.corporationId) && isLeftBook(b))
    .map((b) => ({ corporationId: b.corporationId, corpName: nameOf(b.corporationId) }));
}
