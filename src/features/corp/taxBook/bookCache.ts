/**
 * This tab's copy of a Corp Tax Book (issue #5047), so re-opening an unchanged
 * book reads its settings document and little else: the officer view's whole
 * book, and each member's own lines on the Mining Tax tab (#5050), under
 * separate keys.
 *
 * The server restamps `corps/{id}` on every write to the book: a version per
 * subcollection it touched (functions/src/corpTaxBookVersionKeys.ts). A part
 * of the book read here is reused only while its subcollection's stamp is the
 * one it was read under, so an edit — this officer's or another's — re-reads
 * exactly what it wrote. The stamp is read *before* the part, so a write that
 * lands in between is in the copy and still moves the stamp past it.
 *
 * In memory, per tab: nothing officer-only outlives the page, and a Character
 * switch or removal needs no cleanup. Nothing is trusted without a stamp —
 * the client can ship before the functions that write it — and no copy is
 * served past {@link BOOK_CACHE_MAX_AGE_MS}, which bounds the cost of a stamp
 * the server failed to write.
 */
import {
  BOOK_VERSION_FIELD,
  COLLECTION_VERSIONS_FIELD,
} from '../../../../functions/src/corpTaxBookVersionKeys';

export const BOOK_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

/** The marker on `corps/{id}`. */
export interface BookVersions {
  book: string;
  /** Subcollection name → its current stamp. */
  collections: Record<string, string>;
}

/** The marker off the book document, or null when the server has never stamped it. */
export function bookVersionsOf(d: Record<string, unknown> | undefined): BookVersions | null {
  const book = d?.[BOOK_VERSION_FIELD];
  if (typeof book !== 'string') return null;
  const raw = d?.[COLLECTION_VERSIONS_FIELD];
  const collections: Record<string, string> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [name, stamp] of Object.entries(raw)) {
      if (typeof stamp === 'string') collections[name] = stamp;
    }
  }
  return { book, collections };
}

interface Copy {
  version: string;
  at: number;
  data: unknown;
}

/** Caller's key (officer `${characterId}:${corporationId}`, member `member:…`) → slot → copy. */
const copies = new Map<string, Map<string, Copy>>();

export function clearBookCache(): void {
  copies.clear();
}

/**
 * One part of a book, guarded by the stamp of `collection`: the copy when that
 * stamp still matches and the copy is young enough, otherwise `read()`, kept
 * for next time. `slot` names the copy when one stamp guards more than one
 * shape (a feeder's rows with their payouts, beside its raw records). Callers
 * get their own structured clone, so nothing they do to it reaches the copy.
 */
export async function cachedPart<T>(
  key: string,
  collection: string,
  versions: BookVersions | null,
  read: () => Promise<T>,
  { now = Date.now(), slot = collection }: { now?: number; slot?: string } = {}
): Promise<T> {
  const version = versions?.collections[collection];
  const book = copies.get(key);
  const held = book?.get(slot);
  if (version !== undefined && held?.version === version && now - held.at <= BOOK_CACHE_MAX_AGE_MS)
    return structuredClone(held.data as T);
  const data = await read();
  if (version === undefined) {
    book?.delete(slot);
  } else {
    if (!copies.has(key)) copies.set(key, new Map());
    copies.get(key)!.set(slot, { version, at: now, data: structuredClone(data) });
  }
  return data;
}
