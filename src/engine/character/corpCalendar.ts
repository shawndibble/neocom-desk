import type { CorpBoardItem, CorpBoardItemKind } from '../corp/board';
import type { BoardClockSource, BoardCorporation } from './board';

export interface CorpCalendarSources {
  structureFuel: BoardClockSource[];
  structureTimers: BoardClockSource[];
  moonChunks: BoardClockSource[];
  corpJobs: BoardClockSource[];
}

const SOURCE_OF: Partial<Record<CorpBoardItemKind, keyof CorpCalendarSources>> = {
  structureFuel: 'structureFuel',
  structureTimer: 'structureTimers',
  moonExtraction: 'moonChunks',
  jobDelivery: 'corpJobs',
};

export function toCorpCalendarSources(
  items: readonly CorpBoardItem[],
  corporations: ReadonlyMap<number, BoardCorporation>
): CorpCalendarSources {
  const sources: CorpCalendarSources = {
    structureFuel: [],
    structureTimers: [],
    moonChunks: [],
    corpJobs: [],
  };
  for (const item of items) {
    const key = SOURCE_OF[item.kind];
    if (key === undefined || item.deadlineMs === null) continue;
    const corporation =
      item.corporationId === undefined ? undefined : corporations.get(item.corporationId);
    sources[key].push({
      id: item.id,
      subject: item.subject,
      detail:
        item.kind === 'jobDelivery'
          ? (item.remainingMs ?? 0) > 0
            ? 'active'
            : 'ready'
          : item.detail,
      deadlineMs: item.deadlineMs,
      ...(corporation ? { corporation } : {}),
    });
  }
  return sources;
}
