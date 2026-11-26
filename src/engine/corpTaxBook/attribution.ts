import type { OreLine } from './types';
import { DAY_MS } from '@/lib/age';

export const CONFLICT_RESOLVE_DAYS = 14;

export interface BookObservation {
  bookId: string;
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
  share: readonly OreLine[];
  free: readonly OreLine[];
  conflictSince?: string;
  now: string;
}

export interface BookShare {
  fromFree: OreLine[];
  freeLeft: OreLine[];
  conflict: OreLine[];
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
