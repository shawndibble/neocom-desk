/**
 * Moon owners' pops from the Corp Tax Books a pilot's Characters can view (#6116), as moon
 * chunk reads per moon owner corporation, for the Calendar, Due soon and the Moon extractions
 * widget. A CEO who runs one book for several corporations sees every corporation's coming
 * chunks there, though only the book's grants (not a stored Character) read those corporations.
 *
 * A corporation some Character reads from ESI is left out (`esiCorporations`): ESI is fresher,
 * and a pop never shows twice. A book that fails to read is left out; the rest still draws.
 * Firebase: reach this only through `await import(...)`.
 */
import { moonOwnerChunksByCorporation } from '@/engine/corpTaxBook/moonOwnerChunks';
import { MINUTE_MS } from '@/lib/age';
import { toMoonChunkSources } from '@/features/character/calendarBoardSources';
import type { MoonChunksBoardData } from '@/features/overview/data/boardData';
import type { AccountCorpAccess } from '../corpReadAccess';
import { readMoonOwnerChunkParts, type MoonOwnerChunkParts } from './bookClient';

/** A book read is reused this long: the Calendar and the widgets reload often, the book rarely moves. */
const REUSE_MS = 5 * MINUTE_MS;
const held = new Map<string, { at: number; read: Promise<MoonOwnerChunkParts | null> }>();

function readBook(characterId: number, corporationId: number, now: number) {
  const key = `${characterId}:${corporationId}`;
  const hit = held.get(key);
  if (hit && now - hit.at < REUSE_MS) return hit.read;
  const read = readMoonOwnerChunkParts(characterId, corporationId);
  held.set(key, { at: now, read });
  // A failed read is not reused: the next load asks again.
  read.catch(() => held.delete(key));
  return read;
}

/** One reader per book: the preferred Character when it views it, else the first that does. */
function bookReaders(accounts: readonly AccountCorpAccess[], preferred?: number) {
  const readers = new Map<number, number>();
  for (const { characterId, access } of accounts) {
    if (!access.viewsTaxBook) continue;
    if (!readers.has(access.corporationId) || characterId === preferred) {
      readers.set(access.corporationId, characterId);
    }
  }
  return readers;
}

export async function loadBookMoonChunks(
  accounts: readonly AccountCorpAccess[],
  esiCorporations: ReadonlySet<number>,
  preferred?: number,
  now: number = Date.now()
): Promise<Map<number, MoonChunksBoardData>> {
  const books = await Promise.all(
    [...bookReaders(accounts, preferred)].map(([corporationId, characterId]) =>
      readBook(characterId, corporationId, now).catch(() => null)
    )
  );
  const parts = books.filter((b): b is MoonOwnerChunkParts => b !== null);
  const byCorporation = moonOwnerChunksByCorporation({
    extractions: parts.flatMap((b) => b.extractions),
    feeders: parts.flatMap((b) => b.feeders),
    skip: esiCorporations,
  });
  const out = new Map<number, MoonChunksBoardData>();
  for (const [corporationId, extractions] of byCorporation) {
    out.set(corporationId, {
      chunks: toMoonChunkSources(extractions, now),
      extractions,
      needsReauth: false,
      fetchedAt: new Date(now),
      loadedAt: now,
    });
  }
  return out;
}

/** Forget every held book read (tests, sign-out). */
export function clearBookMoonChunks(): void {
  held.clear();
}
