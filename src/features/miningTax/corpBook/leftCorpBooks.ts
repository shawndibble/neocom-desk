import type { LoadedCorpBook } from './corpBookStore';

/**
 * A corporation every tracked Character has left. `loadCorpBooks` also reads books remembered from
 * earlier loads (a leaver keeps read access to their own lines); `memberCharacterIds` holds only the
 * Characters in the corporation now or billed by its book, so none of them with lines read for the
 * member means they have all left.
 */
export const isLeftBook = (book: LoadedCorpBook): boolean =>
  book.characterIds.length > 0 && book.memberCharacterIds.length === 0;

export interface LeftCorpBook {
  corporationId: number;
  corpName: string;
  /** What the book still shows the member as open (the Pay amount); 0 when nothing is. */
  owed: number;
  /** The tracked Characters whose lines the book holds. */
  characterIds: number[];
}

/** The left books of `books` (the ones in view), with the open amount `owedOf` reads from the member's balances. */
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

/**
 * `books` without the left ones the member chose to stop showing. Applied before the Tax tab's view
 * is built, so a hidden book's rows, Conflicts and attention items go together. A book the member
 * is back in is never dropped.
 */
export const withoutHiddenLeft = (
  books: readonly LoadedCorpBook[],
  hidden: ReadonlySet<number>
): LoadedCorpBook[] => books.filter((b) => !(hidden.has(b.corporationId) && isLeftBook(b)));

/** The left books currently hidden, named, for the line that brings them back. */
export function hiddenLeftBooksOf(
  books: readonly LoadedCorpBook[],
  hidden: ReadonlySet<number>,
  nameOf: (corporationId: number) => string
): { corporationId: number; corpName: string }[] {
  return books
    .filter((b) => hidden.has(b.corporationId) && isLeftBook(b))
    .map((b) => ({ corporationId: b.corporationId, corpName: nameOf(b.corporationId) }));
}
