/**
 * The Overview's corp reads, loaded behind `import()` from `boardData.ts`.
 *
 * **Gated before it fetches** (`features/corp/corpReadAccess.ts`, the same
 * gate the Calendar's moon read uses): no corp call at all unless the roles
 * and grant cover it. CCP role-gates these endpoints server-side, and the
 * board loads every card on every visit, so a pilot with no corp role must
 * never make a request that can only 403.
 */
import { loadCorporationStructures } from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
import { CorpReadFailed } from '@/features/corp/corpRead';
import {
  accountCorpReaders,
  corpReadersFor,
  loadAccountCorpAccess,
  resolveCorpReadAccess,
  type AccountCorpAccess,
} from '@/features/corp/corpReadAccess';
import { loadCorpLabels } from '@/features/corp/corpTicker';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadMoonChunks } from '@/features/character/calendarMoonChunks';
import type { MoonChunksBoardData, StructuresBoardData } from './boardData';

const UNREADABLE_STRUCTURES: StructuresBoardData = {
  structures: null,
  structureCount: 0,
  needsReauth: false,
  fetchedAt: null,
};

export async function loadStructuresBoardData(characterId: number): Promise<StructuresBoardData> {
  const access = await resolveCorpReadAccess(characterId);
  if (access === null || !access.can('canReadStructures')) return UNREADABLE_STRUCTURES;
  const result = await loadCorporationStructures(characterId, access.corporationId);
  if (result.cached === null) {
    if (result.needsReauth) return { ...UNREADABLE_STRUCTURES, needsReauth: true };
    // Allowed and empty-handed: an outage, so the widget offers Retry rather than "your roles don't cover this".
    throw new CorpReadFailed('structures');
  }
  const structures = result.cached.data;
  return {
    structures: toBoardStructures(structures),
    structureCount: structures.length,
    needsReauth: result.needsReauth,
    fetchedAt: result.cached.fetchedAt,
  };
}

/** The Calendar's moon read, as-is: it already gates, names refineries and picks arrival or decay. */
export async function loadMoonChunksBoardData(characterId: number): Promise<MoonChunksBoardData> {
  const loadedAt = Date.now();
  const { result, sources, extractions, failed } = await loadMoonChunks(characterId, loadedAt);
  if (failed) throw new CorpReadFailed('moon extractions');
  return {
    chunks: sources ?? null,
    extractions,
    needsReauth: result.needsReauth,
    fetchedAt: result.cached?.fetchedAt ?? null,
    loadedAt,
  };
}

// --- All characters: every corporation the pilot's Characters can read -----------------

/** The oldest of the reads' timestamps: the merged list is only as fresh as its stalest corporation. */
function oldest(dates: readonly (Date | null)[]): Date | null {
  const known = dates.filter((date): date is Date => date !== null);
  return known.length === 0 ? null : new Date(Math.min(...known.map((date) => date.getTime())));
}

/**
 * Settles one read per corporation. A corporation that failed is left out while
 * another answered ("nothing from this corporation", the others still list); only
 * when every one failed does the widget get its Retry.
 */
async function settleCorps<T>(
  readers: ReadonlyMap<number, number>,
  what: string,
  load: (characterId: number) => Promise<T>
): Promise<{ reads: (T & { corporationId: number })[]; partlyFailed: boolean }> {
  const settled = await Promise.allSettled(
    [...readers].map(async ([corporationId, characterId]) => ({
      ...(await load(characterId)),
      corporationId,
    }))
  );
  const reads = settled.flatMap((outcome) =>
    outcome.status === 'fulfilled' ? [outcome.value] : []
  );
  if (reads.length === 0 && readers.size > 0) throw new CorpReadFailed(what);
  return { reads, partlyFailed: reads.length < readers.size };
}

/** The active Character reads its own corporation, sharing the cache rows `/corp` warmed. */
const activeReader = () => useActiveCharacter.getState().activeCharacterId ?? undefined;

/** Every readable corporation's structures as one list, for a widget scoped to All characters. */
export async function loadAllStructuresBoardData(): Promise<StructuresBoardData> {
  const { reads, partlyFailed } = await settleCorps(
    await accountCorpReaders('canReadStructures', activeReader()),
    'structures',
    loadStructuresBoardData
  );
  const readable = reads.filter((read) => read.structures !== null);
  if (readable.length === 0) {
    return { ...UNREADABLE_STRUCTURES, needsReauth: reads.some((read) => read.needsReauth) };
  }
  return {
    // Each structure keeps its corporation, so a row read across several can name it.
    structures: readable.flatMap(({ structures, corporationId }) =>
      (structures ?? []).map((structure) => ({ ...structure, corporationId }))
    ),
    structureCount: readable.reduce((sum, read) => sum + read.structureCount, 0),
    needsReauth: readable.some((read) => read.needsReauth),
    fetchedAt: oldest(readable.map((read) => read.fetchedAt)),
    corporations: await loadCorpLabels(readable.map((read) => read.corporationId)),
    partlyFailed,
  };
}

/** Several corporations' moon reads as one list; null chunks when none was readable. */
function mergeMoonChunks(
  reads: readonly MoonChunksBoardData[],
  needsReauth: boolean,
  loadedAt: number
): MoonChunksBoardData {
  const readable = reads.filter((read) => read.chunks !== null);
  if (readable.length === 0) return { chunks: null, needsReauth, fetchedAt: null, loadedAt };
  return {
    chunks: readable.flatMap((read) => read.chunks ?? []),
    extractions: readable.flatMap((read) => read.extractions ?? []),
    needsReauth: readable.some((read) => read.needsReauth),
    fetchedAt: oldest(readable.map((read) => read.fetchedAt)),
    loadedAt,
  };
}

/** A book read that has not answered by then is left out, so it never holds a widget back. */
const BOOK_READ_LIMIT_MS = 15_000;

/** Feeder pops by corporation, once the caller knows which corporations ESI answered for. */
export type FeederChunks = (
  esiCorporations: ReadonlySet<number>
) => Map<number, MoonChunksBoardData>;

const NO_FEEDER_CHUNKS: FeederChunks = () => new Map();

/**
 * Starts reading the Corp Tax Books these Characters view (#6116), beside the caller's ESI
 * reads. Best effort and bounded: a book that fails, or is slower than the limit, adds nothing.
 * A pilot whose Characters view no book makes no request at all.
 */
export async function startFeederChunks(
  accounts: readonly AccountCorpAccess[],
  preferred?: number
): Promise<FeederChunks> {
  if (!accounts.some(({ access }) => access.viewsTaxBook)) return NO_FEEDER_CHUNKS;
  try {
    // Lazy: the book client is Firebase, and most pilots run no book.
    const { readFeederBooks, feederChunkReads } =
      await import('@/features/corp/taxBook/feederBookChunks');
    const books = await Promise.race([
      readFeederBooks(accounts, preferred),
      new Promise<[]>((resolve) => setTimeout(() => resolve([]), BOOK_READ_LIMIT_MS)),
    ]);
    if (books.length === 0) return NO_FEEDER_CHUNKS;
    return (esi) => feederChunkReads(books, esi);
  } catch {
    return NO_FEEDER_CHUNKS;
  }
}

/** A Feeder's rows say whose they are in the widget: "Efa - Tatara [TICK]". */
async function namedByCorporation(
  reads: ReadonlyMap<number, MoonChunksBoardData>
): Promise<MoonChunksBoardData[]> {
  if (reads.size === 0) return [];
  const labels = await loadCorpLabels([...reads.keys()]).catch(
    () => new Map<number, { ticker: string }>()
  );
  return [...reads].map(([corporationId, read]) => {
    const ticker = labels.get(corporationId)?.ticker;
    if (!ticker) return read;
    const named = (subject: string) => `${subject} [${ticker}]`;
    return {
      ...read,
      chunks: read.chunks?.map((c) => ({ ...c, subject: named(c.subject) })) ?? null,
      ...(read.extractions
        ? { extractions: read.extractions.map((x) => ({ ...x, subject: named(x.subject) })) }
        : {}),
    };
  });
}

/** One Character's moon read, plus its book's Feeder pops when it views a Corp Tax Book. */
export async function loadMoonChunksWithBook(characterId: number): Promise<MoonChunksBoardData> {
  const access = await resolveCorpReadAccess(characterId);
  if (!access?.viewsTaxBook) return loadMoonChunksBoardData(characterId);
  const [own, feeders] = await Promise.all([
    loadMoonChunksBoardData(characterId).then(
      (read) => ({ read }),
      (error: unknown) => ({ error })
    ),
    startFeederChunks([{ characterId, access }], characterId),
  ]);
  const book = await namedByCorporation(feeders(new Set([access.corporationId])));
  // The own read failed and no book answered: the widget's Retry.
  if ('error' in own) {
    if (book.length === 0) throw own.error;
    return mergeMoonChunks(book, false, Date.now());
  }
  if (book.length === 0) return own.read;
  return mergeMoonChunks([own.read, ...book], own.read.needsReauth, own.read.loadedAt);
}

/** Every readable corporation's moon drills as one list, for a widget scoped to All characters. */
export async function loadAllMoonChunksBoardData(): Promise<MoonChunksBoardData> {
  const accounts = await loadAccountCorpAccess();
  const preferred = activeReader();
  const readers = corpReadersFor(accounts, 'canReadMoonExtractions', preferred);
  const [esiRead, feeders] = await Promise.all([
    settleCorps(readers, 'moon extractions', loadMoonChunksBoardData).then(
      ({ reads }) => ({ reads, failed: null as unknown }),
      (error: unknown) => ({
        reads: [] as (MoonChunksBoardData & { corporationId: number })[],
        failed: error,
      })
    ),
    startFeederChunks(accounts, preferred),
  ]);
  const { reads, failed } = esiRead;
  const esi = new Set(reads.filter((r) => r.chunks !== null).map((r) => r.corporationId));
  const book = await namedByCorporation(feeders(esi));
  // Every ESI read failed and no book answered: the widget's Retry.
  if (failed !== null && book.length === 0) throw failed;
  return mergeMoonChunks(
    [...reads, ...book],
    reads.some((read) => read.needsReauth),
    Date.now()
  );
}
