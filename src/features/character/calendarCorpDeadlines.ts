import type { BoardClockSource, BoardCorporation } from '@/engine/character/board';
import { toCorpCalendarSources } from '@/engine/character/corpCalendar';
import { mergeCorpBoards } from '@/engine/corp/board';
import type { CorpDeadlineSource } from '@/features/overview/widgets/data/corpDeadlineSources';

export interface CorpCalendarRead {
  structureFuel?: BoardClockSource[];
  structureTimers?: BoardClockSource[];
  moonChunks?: BoardClockSource[];
  corpJobs?: BoardClockSource[];
  corporations: BoardCorporation[];
  refineryIds: number[];
  fetched: Date[];
  fromCache: boolean;
}

const NOTHING_READABLE: CorpCalendarRead = {
  corporations: [],
  refineryIds: [],
  fetched: [],
  fromCache: false,
};

const CALENDAR_SOURCES: readonly CorpDeadlineSource[] = [
  'structures',
  'starbases',
  'moonChunks',
  'jobs',
];

export async function loadCorpCalendar(nowMs: number): Promise<CorpCalendarRead> {
  const [{ loadCorpDeadlinesAll }, { boardOf, readableSources }] = await Promise.all([
    import('@/features/overview/widgets/data/corpFeedLoaders'),
    import('@/features/overview/widgets/data/corpDeadlineSources'),
  ]);
  let feed: Awaited<ReturnType<typeof loadCorpDeadlinesAll>>;
  try {
    feed = await loadCorpDeadlinesAll(CALENDAR_SOURCES);
  } catch {
    return NOTHING_READABLE;
  }
  const reads = feed.corporations
    .map((slice) => ({
      corporationId: slice.corporationId,
      read: readableSources(slice, nowMs),
    }))
    .filter(({ read }) => read.readable);
  if (reads.length === 0) return NOTHING_READABLE;

  const corporations = new Map<number, BoardCorporation>();
  for (const { corporationId } of reads) {
    const label = feed.labels.get(corporationId);
    if (label) corporations.set(corporationId, { id: corporationId, ...label });
  }
  const sources = toCorpCalendarSources(
    mergeCorpBoards(
      reads.map(({ corporationId, read }) => ({
        corporationId,
        items: boardOf(read.sources, nowMs, { includeRunningJobs: true }),
      }))
    ),
    corporations
  );
  const readable = (source: 'structures' | 'starbases' | 'extractions' | 'jobs') =>
    reads.some(({ read }) => read.sources[source] !== undefined);
  const structureClocks = readable('structures') || readable('starbases');
  return {
    structureFuel: structureClocks ? sources.structureFuel : undefined,
    structureTimers: structureClocks ? sources.structureTimers : undefined,
    moonChunks: readable('extractions') ? sources.moonChunks : undefined,
    corpJobs: readable('jobs') ? sources.corpJobs : undefined,
    corporations: [...corporations.values()].sort((a, b) => a.name.localeCompare(b.name)),
    refineryIds: reads.flatMap(({ read }) =>
      (read.sources.extractions ?? []).map((x) => x.structureId)
    ),
    fetched: reads.flatMap(({ read }) => read.fetched),
    fromCache: reads.some(({ read }) => read.fromCache),
  };
}
