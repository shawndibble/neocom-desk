/**
 * How a member's personal Mining Ledger Entry meets the Corp Tax Books that
 * observed it (D12, D30). The personal ledger knows only the solar system, so
 * several books in one system on one day split the entry by what each
 * observed; ore no book claims is Unattributed, owed to no one. When the
 * member already gave the day to another Payee, a book's share comes from the
 * Unattributed part first; the rest is a visible conflict, not owed, that
 * resolves to the corp 14 days after it was raised.
 */
import type { OreLine } from './types';
import { DAY_MS } from '@/lib/age';

export const CONFLICT_RESOLVE_DAYS = 14;

export interface BookObservation {
  bookId: string;
  /** What the book observed for this character, day and system, summed over its refineries there. */
  oreLines: readonly OreLine[];
}

export interface BookSplit {
  byBook: Map<string, OreLine[]>;
  unattributed: OreLine[];
}

function quantityOf(lines: readonly OreLine[], typeId: number): number {
  return lines.find((l) => l.typeId === typeId)?.quantity ?? 0;
}

export function splitAcrossBooks(
  personal: readonly OreLine[],
  books: readonly BookObservation[]
): BookSplit {
  const byBook = new Map<string, OreLine[]>();
  const unattributed: OreLine[] = [];
  for (const line of personal) {
    const claims = books.map((b) => quantityOf(b.oreLines, line.typeId));
    const claimed = claims.reduce((sum, q) => sum + q, 0);
    let given: number[];
    if (claimed <= line.quantity) {
      given = claims;
    } else {
      // Proportional by observed quantity, largest remainder, so no unit is lost or invented.
      const exact = claims.map((q) => (q * line.quantity) / claimed);
      given = exact.map(Math.floor);
      let left = line.quantity - given.reduce((sum, q) => sum + q, 0);
      const order = exact
        .map((q, i) => ({ i, frac: q - Math.floor(q) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
      for (const { i } of order) {
        if (left <= 0) break;
        given[i] += 1;
        left -= 1;
      }
    }
    books.forEach((book, i) => {
      if (given[i] <= 0) return;
      const lines = byBook.get(book.bookId) ?? [];
      lines.push({ typeId: line.typeId, quantity: given[i] });
      byBook.set(book.bookId, lines);
    });
    const rest = line.quantity - given.reduce((sum, q) => sum + q, 0);
    if (rest > 0) unattributed.push({ typeId: line.typeId, quantity: rest });
  }
  return { byBook, unattributed };
}

export interface BookShareInput {
  /** The book's share of the personal entry (`splitAcrossBooks`). */
  share: readonly OreLine[];
  /** The personal entry's ore the member has given to no Payee. */
  free: readonly OreLine[];
  /** When the conflict was first raised; absent when it is new. */
  conflictSince?: string;
  now: string;
}

export interface BookShare {
  /** Covered by ore the member had not given to anyone. */
  fromFree: OreLine[];
  /** The free ore this book did not take — pass it to the next book in the system. */
  freeLeft: OreLine[];
  /** Ore the member gave another Payee that this book also observed. */
  conflict: OreLine[];
  /** The conflict has run its 14 days and now belongs to the corp. */
  conflictOwed: boolean;
  conflictResolvesAt?: string;
}

export function resolveBookShare(input: BookShareInput): BookShare {
  const fromFree: OreLine[] = [];
  const conflict: OreLine[] = [];
  for (const line of input.share) {
    const free = Math.min(line.quantity, quantityOf(input.free, line.typeId));
    if (free > 0) fromFree.push({ typeId: line.typeId, quantity: free });
    if (line.quantity > free)
      conflict.push({ typeId: line.typeId, quantity: line.quantity - free });
  }
  const freeLeft = input.free
    .map((line) => ({
      typeId: line.typeId,
      quantity: line.quantity - quantityOf(fromFree, line.typeId),
    }))
    .filter((line) => line.quantity > 0);
  if (conflict.length === 0) return { fromFree, freeLeft, conflict, conflictOwed: false };
  const resolvesAt = Date.parse(input.conflictSince ?? input.now) + CONFLICT_RESOLVE_DAYS * DAY_MS;
  return {
    fromFree,
    freeLeft,
    conflict,
    conflictOwed: Date.parse(input.now) >= resolvesAt,
    conflictResolvesAt: new Date(resolvesAt).toISOString(),
  };
}
