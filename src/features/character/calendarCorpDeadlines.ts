/**
 * The Calendar's corporation events: fuel running out, structure timers, moon
 * chunks and corp jobs, for every corporation the account can read.
 *
 * The rows are Due soon's own (`loadCorpDeadlinesAll` → `buildCorpBoard`), so
 * the two can never disagree. Each source is read per corporation through a
 * Character whose roles and grant open it there, so no request is made that
 * could only 403; a corporation that cannot be read for a source is left out
 * of it. A kind no corporation can be read for stays `undefined`: not
 * readable, never a zero.
 */
import type { BoardClockSource, BoardCorporation } from '@/engine/character/board';
import { toCorpCalendarSources } from '@/engine/character/corpCalendar';
import { mergeCorpBoards } from '@/engine/corp/board';
import {
  boardOf,
  readableSources,
  type CorpDeadlineSource,
} from '@/features/overview/widgets/data/corpDeadlineSources';

export interface CorpCalendarRead {
  structureFuel?: BoardClockSource[];
  structureTimers?: BoardClockSource[];
  moonChunks?: BoardClockSource[];
  corpJobs?: BoardClockSource[];
  /** The corporations with at least one readable source, by name: the filter's choices. */
  corporations: BoardCorporation[];
  /** When each read landed, for the page's Data Age. */
  fetched: Date[];
  fromCache: boolean;
}

const NOTHING_READABLE: CorpCalendarRead = { corporations: [], fetched: [], fromCache: false };

/** Starbases and sovereignty windows are not Calendar kinds yet, so they are not read. */
const CALENDAR_SOURCES: readonly CorpDeadlineSource[] = ['structures', 'moonChunks', 'jobs'];

export async function loadCorpCalendar(nowMs: number): Promise<CorpCalendarRead> {
  // Lazy: the corp loaders are a chunk of their own, and most pilots read no corporation.
  const { loadCorpDeadlinesAll } = await import('@/features/overview/widgets/data/corpFeedLoaders');
  let feed: Awaited<ReturnType<typeof loadCorpDeadlinesAll>>;
  try {
    feed = await loadCorpDeadlinesAll(CALENDAR_SOURCES);
  } catch {
    // Every corp read failed: the pilot's own clocks still draw.
    return NOTHING_READABLE;
  }
  const reads = feed.corporations
    .map((slice) => ({
      corporationId: slice.corporationId,
      read: readableSources(slice, nowMs),
    }))
    .filter(({ read }) => read.readable);
  if (reads.length === 0) return NOTHING_READABLE;

  const sources = toCorpCalendarSources(
    mergeCorpBoards(
      reads.map(({ corporationId, read }) => ({
        corporationId,
        items: boardOf(read.sources, nowMs, { includeRunningJobs: true }),
      }))
    ),
    feed.labels
  );
  const readable = (source: 'structures' | 'extractions' | 'jobs') =>
    reads.some(({ read }) => read.sources[source] !== undefined);
  return {
    structureFuel: readable('structures') ? sources.structureFuel : undefined,
    structureTimers: readable('structures') ? sources.structureTimers : undefined,
    moonChunks: readable('extractions') ? sources.moonChunks : undefined,
    corpJobs: readable('jobs') ? sources.corpJobs : undefined,
    corporations: reads
      .map(({ corporationId }) => {
        const label = feed.labels.get(corporationId);
        return {
          id: corporationId,
          name: label?.name ?? String(corporationId),
          ticker: label?.ticker ?? String(corporationId),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    fetched: reads.flatMap(({ read }) => read.fetched),
    fromCache: reads.some(({ read }) => read.fromCache),
  };
}
