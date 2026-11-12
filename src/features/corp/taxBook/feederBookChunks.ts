/**
 * Feeder pops from the Corp Tax Books a pilot's Characters can view (#6116), as moon chunk
 * reads per Feeder corporation, for the Calendar, Due soon and the Moon extractions widget. A
 * CEO who runs one book for several corporations sees every corporation's coming chunks there,
 * though only the book's grants (not a stored Character) read those corporations.
 *
 * Two steps, so a caller can start the book reads beside its ESI reads: `readFeederBooks`, then
 * `feederChunkReads` once it knows which corporations ESI answered for (ESI is fresher, and a
 * pop never shows twice). A book that fails or has none is left out; the rest still draws.
 * Firebase: reach this only through `await import(...)`.
 */
import { feederChunksByCorporation } from '@/engine/corpTaxBook/feederChunks';
import { MINUTE_MS } from '@/lib/age';
import { toMoonChunkSources } from '@/features/character/calendarBoardSources';
import type { MoonChunksBoardData } from '@/features/overview/data/boardData';
import type { AccountCorpAccess } from '../corpReadAccess';
import { readFeederChunkParts, type FeederChunkParts } from './bookClient';

/**
 * A book read, refused read or failed read is reused this long: the Calendar and the widgets
 * reload often, the book rarely moves, and a refusal must not cost an officer check every load.
 */
const REUSE_MS = 5 * MINUTE_MS;
/** "This corporation has no book" is reused longer: most officers' corporations run none. */
const NO_BOOK_REUSE_MS = 60 * MINUTE_MS;
const bookReads = new Map<
  string,
  { at: number; ttl: number; read: Promise<FeederChunkParts | null> }
>();

function readBook(characterId: number, corporationId: number, now: number) {
  const key = `${characterId}:${corporationId}`;
  const hit = bookReads.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.read;
  const entry = { at: now, ttl: REUSE_MS, read: Promise.resolve<FeederChunkParts | null>(null) };
  entry.read = readFeederChunkParts(characterId, corporationId).then(
    (parts) => {
      if (parts === null) entry.ttl = NO_BOOK_REUSE_MS;
      return parts;
    },
    // Left out, and held like a read so a refusal is not re-asked every load.
    () => null
  );
  bookReads.set(key, entry);
  return entry.read;
}

/** One reader per book: the preferred Character when it views it, else the first that does. */
function bookReaders(accounts: readonly AccountCorpAccess[], preferred?: number) {
  const readers = new Map<number, number>();
  for (const { characterId, access } of accounts) {
    if (!access.can('canViewTaxBook')) continue;
    if (!readers.has(access.corporationId) || characterId === preferred) {
      readers.set(access.corporationId, characterId);
    }
  }
  return readers;
}

/** Every book these Characters view, read (or reused); never rejects. */
export async function readFeederBooks(
  accounts: readonly AccountCorpAccess[],
  preferred?: number,
  now: number = Date.now()
): Promise<FeederChunkParts[]> {
  const books = await Promise.all(
    [...bookReaders(accounts, preferred)].map(([corporationId, characterId]) =>
      readBook(characterId, corporationId, now)
    )
  );
  return books.filter((b): b is FeederChunkParts => b !== null);
}

/** The books' live Feeder chunks, per Feeder corporation ESI did not answer for. */
export function feederChunkReads(
  books: readonly FeederChunkParts[],
  esiCorporations: ReadonlySet<number>,
  now: number = Date.now()
): Map<number, MoonChunksBoardData> {
  const byCorporation = feederChunksByCorporation({ books, skip: esiCorporations, now });
  const lastRead = new Map(
    books.flatMap((b) => b.feeders).map((f) => [f.corporationId, f.lastReadWellAt])
  );
  const out = new Map<number, MoonChunksBoardData>();
  for (const [corporationId, extractions] of byCorporation) {
    const readAt = lastRead.get(corporationId);
    out.set(corporationId, {
      chunks: toMoonChunkSources(extractions, now),
      extractions,
      needsReauth: false,
      // As old as the book's last read of this Feeder, not this load.
      fetchedAt: readAt === undefined ? null : new Date(readAt),
      loadedAt: now,
      fromBook: true,
    });
  }
  return out;
}

/** Forget every held book read (tests). */
export function clearFeederBookReads(): void {
  bookReads.clear();
}
