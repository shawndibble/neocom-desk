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
import { loadCorpLabels, type CorpLabel } from '@/features/corp/corpTicker';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
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
    throw new CorpReadFailed('structures');
  }
  const structures = result.cached.data;
  return {
    structures: toBoardStructures(structures),
    structureCount: structures.length,
    needsReauth: result.needsReauth,
    fetchedAt: result.cached.fetchedAt,
    ...(result.cached.expiresAt ? { expiresAt: result.cached.expiresAt } : {}),
  };
}

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

export function oldest(dates: readonly (Date | null)[]): Date | null {
  const known = dates.filter((date): date is Date => date !== null);
  return known.length === 0 ? null : new Date(Math.min(...known.map((date) => date.getTime())));
}

export async function settleCorps<T>(
  readers: ReadonlyMap<number, number>,
  what: string,
  load: (characterId: number) => Promise<T>,
  concurrency = ESI_FANOUT_CONCURRENCY
): Promise<{ reads: (T & { corporationId: number })[]; partlyFailed: boolean }> {
  const entries = [...readers];
  const settled: ((T & { corporationId: number }) | null)[] = entries.map(() => null);
  await mapWithConcurrencyLimit(
    entries.map((entry, index) => ({ entry, index })),
    concurrency,
    async ({ entry: [corporationId, characterId], index }) => {
      try {
        settled[index] = { ...(await load(characterId)), corporationId };
      } catch {}
    }
  );
  const reads = settled.filter((read) => read !== null);
  if (reads.length === 0 && readers.size > 0) throw new CorpReadFailed(what);
  return { reads, partlyFailed: reads.length < readers.size };
}

export const activeReader = () => useActiveCharacter.getState().activeCharacterId ?? undefined;

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
    structures: readable.flatMap(({ structures, corporationId }) =>
      (structures ?? []).map((structure) => ({ ...structure, corporationId }))
    ),
    structureCount: readable.reduce((sum, read) => sum + read.structureCount, 0),
    needsReauth: readable.some((read) => read.needsReauth),
    fetchedAt: oldest(readable.map((read) => read.fetchedAt)),
    expiresAtByCorp: new Map(
      readable.flatMap(({ corporationId, expiresAt }) =>
        expiresAt ? [[corporationId, expiresAt] as const] : []
      )
    ),
    corporations: await loadCorpLabels(readable.map((read) => read.corporationId)),
    partlyFailed,
  };
}

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

const BOOK_READ_LIMIT_MS = 15_000;

export type FeederChunks = ((
  esiCorporations: ReadonlySet<number>
) => Map<number, MoonChunksBoardData>) & { shareMarks?: MoonChunksBoardData['shareMarks'] };

const NO_FEEDER_CHUNKS: FeederChunks = () => new Map();

export async function startFeederChunks(
  accounts: readonly AccountCorpAccess[],
  preferred?: number
): Promise<FeederChunks> {
  if (!accounts.some(({ access }) => access.can('canViewTaxBook'))) return NO_FEEDER_CHUNKS;
  try {
    const { readFeederBooks, feederChunkReads, feederShareMarks } =
      await import('@/features/corp/taxBook/feederBookChunks');
    const books = await Promise.race([
      readFeederBooks(accounts, preferred),
      new Promise<[]>((resolve) => setTimeout(() => resolve([]), BOOK_READ_LIMIT_MS)),
    ]);
    if (books.length === 0) return NO_FEEDER_CHUNKS;
    const reads: FeederChunks = (esi) => feederChunkReads(books, esi);
    const shareMarks = feederShareMarks(books);
    return Object.keys(shareMarks).length > 0 ? Object.assign(reads, { shareMarks }) : reads;
  } catch {
    return NO_FEEDER_CHUNKS;
  }
}

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

function openToOfficer(read: MoonChunksBoardData): MoonChunksBoardData {
  return read.chunks === null && !read.needsReauth
    ? { ...read, chunks: [], extractions: [] }
    : read;
}

const withShareMarks =
  (shareMarks: MoonChunksBoardData['shareMarks']) =>
  (read: MoonChunksBoardData): MoonChunksBoardData =>
    shareMarks ? { ...read, shareMarks } : read;

export async function loadMoonChunksWithBook(characterId: number): Promise<MoonChunksBoardData> {
  const access = await resolveCorpReadAccess(characterId);
  if (!access?.can('canViewTaxBook')) return loadMoonChunksBoardData(characterId);
  const [own, feeders] = await Promise.all([
    loadMoonChunksBoardData(characterId).then(
      (read) => ({ read }),
      (error: unknown) => ({ error })
    ),
    startFeederChunks([{ characterId, access }], characterId),
  ]);
  const book = await namedByCorporation(feeders(new Set([access.corporationId])));
  const marked = withShareMarks(feeders.shareMarks);
  if ('error' in own) {
    if (book.length === 0) throw own.error;
    return marked(mergeMoonChunks(book, false, Date.now()));
  }
  if (book.length === 0) return marked(openToOfficer(own.read));
  return marked(mergeMoonChunks([own.read, ...book], own.read.needsReauth, own.read.loadedAt));
}

function withCorporation(
  read: MoonChunksBoardData,
  id: number,
  label: CorpLabel | undefined
): MoonChunksBoardData {
  const corporation = { id, name: label?.name ?? String(id), ticker: label?.ticker ?? String(id) };
  return {
    ...read,
    chunks: read.chunks?.map((chunk) => ({ ...chunk, corporation })) ?? null,
  };
}

export async function loadAllMoonChunksBoardData(): Promise<MoonChunksBoardData> {
  const accounts = await loadAccountCorpAccess();
  const preferred = activeReader();
  const readers = corpReadersFor(accounts, 'canReadMoonExtractions', preferred);
  const [esiRead, feeders] = await Promise.all([
    settleCorps(readers, 'moon extractions', loadMoonChunksBoardData).then(
      ({ reads, partlyFailed }) => ({ reads, partlyFailed, failed: null as unknown }),
      (error: unknown) => ({
        reads: [] as (MoonChunksBoardData & { corporationId: number })[],
        partlyFailed: true,
        failed: error,
      })
    ),
    startFeederChunks(accounts, preferred),
  ]);
  const { reads, partlyFailed, failed } = esiRead;
  const esi = new Set(reads.filter((r) => r.chunks !== null).map((r) => r.corporationId));
  const bookReads = feeders(esi);
  const book = await namedByCorporation(bookReads);
  if (failed !== null && book.length === 0) throw failed;
  const sources: [number, MoonChunksBoardData][] = [
    ...reads.map((read): [number, MoonChunksBoardData] => [read.corporationId, read]),
    ...[...bookReads.keys()].map((id, i): [number, MoonChunksBoardData] => [id, book[i]!]),
  ];
  const labels = await loadCorpLabels([
    ...new Set(sources.filter(([, read]) => read.chunks !== null).map(([id]) => id)),
  ]);
  const merged = mergeMoonChunks(
    sources.map(([id, read]) => withCorporation(read, id, labels.get(id))),
    reads.some((read) => read.needsReauth),
    Date.now()
  );
  const view = accounts.some(({ access }) => access.can('canViewTaxBook'))
    ? openToOfficer(merged)
    : merged;
  const marked = withShareMarks(feeders.shareMarks)(view);
  return partlyFailed ? { ...marked, partlyFailed: true } : marked;
}
