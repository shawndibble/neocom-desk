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

/**
 * Moon owners' pops from the Corp Tax Books these Characters view (#6116), for every moon owner
 * corporation not in `esiCorporations`. Best effort: a book that cannot be read adds nothing.
 */
export async function bookMoonChunks(
  accounts: readonly AccountCorpAccess[],
  esiCorporations: ReadonlySet<number>,
  preferred?: number
): Promise<Map<number, MoonChunksBoardData>> {
  if (!accounts.some(({ access }) => access.viewsTaxBook)) return new Map();
  try {
    // Lazy: the book client is Firebase, and most pilots run no book.
    const { loadBookMoonChunks } = await import('@/features/corp/taxBook/bookMoonChunks');
    return await loadBookMoonChunks(accounts, esiCorporations, preferred);
  } catch {
    return new Map();
  }
}

/** One Character's moon read, plus its book's moon owners' pops when it views a Corp Tax Book. */
export async function loadMoonChunksWithBook(characterId: number): Promise<MoonChunksBoardData> {
  const [own, access] = await Promise.all([
    loadMoonChunksBoardData(characterId),
    resolveCorpReadAccess(characterId),
  ]);
  if (!access?.viewsTaxBook) return own;
  const book = await bookMoonChunks(
    [{ characterId, access }],
    new Set([access.corporationId]),
    characterId
  );
  if (book.size === 0) return own;
  return mergeMoonChunks([own, ...book.values()], own.needsReauth, own.loadedAt);
}

/** Every readable corporation's moon drills as one list, for a widget scoped to All characters. */
export async function loadAllMoonChunksBoardData(): Promise<MoonChunksBoardData> {
  const accounts = await loadAccountCorpAccess();
  const preferred = activeReader();
  const readers = corpReadersFor(accounts, 'canReadMoonExtractions', preferred);
  let reads: (MoonChunksBoardData & { corporationId: number })[] = [];
  let failed: unknown = null;
  try {
    ({ reads } = await settleCorps(readers, 'moon extractions', loadMoonChunksBoardData));
  } catch (error) {
    failed = error;
  }
  const esi = new Set(reads.filter((r) => r.chunks !== null).map((r) => r.corporationId));
  const book = await bookMoonChunks(accounts, esi, preferred);
  // Every ESI read failed and no book answered: the widget's Retry.
  if (failed !== null && book.size === 0) throw failed;
  return mergeMoonChunks(
    [...reads, ...book.values()],
    reads.some((read) => read.needsReauth),
    Date.now()
  );
}
