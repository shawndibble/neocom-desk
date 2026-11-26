import { feederChunksByCorporation } from '@/engine/corpTaxBook/feederChunks';
import { MINUTE_MS } from '@/lib/age';
import { toMoonChunkSources } from '@/features/character/calendarBoardSources';
import type { MoonChunksBoardData } from '@/features/overview/data/boardData';
import type { AccountCorpAccess } from '../corpReadAccess';
import { readFeederChunkParts, type FeederChunkParts } from './bookClient';

const REUSE_MS = 5 * MINUTE_MS;
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
    () => null
  );
  bookReads.set(key, entry);
  return entry.read;
}

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
      fetchedAt: readAt === undefined ? null : new Date(readAt),
      loadedAt: now,
      fromBook: true,
    });
  }
  return out;
}

export function feederShareMarks(
  books: readonly FeederChunkParts[]
): NonNullable<FeederChunkParts['shareMarks']> {
  return Object.assign({}, ...books.map((b) => b.shareMarks ?? {}));
}

export function clearFeederBookReads(): void {
  bookReads.clear();
}
