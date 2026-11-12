/**
 * Corporation deadlines as Calendar clocks.
 *
 * The input is the corp ops board's own rows (`engine/corp/board.ts`, merged
 * across corporations by `mergeCorpBoards`), so the Calendar and Due soon can
 * never disagree about a deadline. This only sorts those rows into the
 * Calendar's kinds and names each one's corporation.
 */
import type { CorpBoardItem, CorpBoardItemKind } from '../corp/board';
import type { BoardClockSource, BoardCorporation } from './board';

export interface CorpCalendarSources {
  structureFuel: BoardClockSource[];
  structureTimers: BoardClockSource[];
  moonChunks: BoardClockSource[];
  corpJobs: BoardClockSource[];
}

/** Sovereignty rows and offline services are absent: not Calendar kinds. */
const SOURCE_OF: Partial<Record<CorpBoardItemKind, keyof CorpCalendarSources>> = {
  structureFuel: 'structureFuel',
  structureTimer: 'structureTimers',
  moonExtraction: 'moonChunks',
  jobDelivery: 'corpJobs',
};

export function toCorpCalendarSources(
  items: readonly CorpBoardItem[],
  corporations: ReadonlyMap<number, Omit<BoardCorporation, 'id'>>
): CorpCalendarSources {
  const sources: CorpCalendarSources = {
    structureFuel: [],
    structureTimers: [],
    moonChunks: [],
    corpJobs: [],
  };
  for (const item of items) {
    const key = SOURCE_OF[item.kind];
    // No instant, no day to put it on: a structure already dry has no date.
    if (key === undefined || item.deadlineMs === null) continue;
    const id = item.corporationId;
    const label = id === undefined ? undefined : corporations.get(id);
    sources[key].push({
      id: item.id,
      subject: item.subject,
      // A job row carries no detail of its own; the Calendar says whether it still runs.
      detail:
        item.kind === 'jobDelivery'
          ? (item.remainingMs ?? 0) > 0
            ? 'active'
            : 'ready'
          : item.detail,
      deadlineMs: item.deadlineMs,
      ...(id === undefined
        ? {}
        : {
            corporation: {
              id,
              name: label?.name ?? String(id),
              ticker: label?.ticker ?? String(id),
            },
          }),
    });
  }
  return sources;
}
