import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { buildCorpBoard, type BoardStarbaseSource, type CorpBoardItem } from '@/engine/corp/board';
import type { BoardClockSource } from '@/engine/character/board';
import type { MoonChunksBoardData, StructuresBoardData, StructuresView } from './boardData';

export const CORP_CACHE_WINDOW_MS = HOUR_MS;

export function structuresView(
  data: StructuresBoardData,
  nowMs: number,
  starbases?: readonly BoardStarbaseSource[]
): StructuresView {
  const { structures, ...rest } = data;
  const towers = starbases?.length ?? 0;
  return {
    ...rest,
    structureCount: rest.structureCount + towers,
    items:
      structures === null && towers === 0
        ? null
        : buildCorpBoard({
            nowMs,
            staleWindowMs: CORP_CACHE_WINDOW_MS,
            structures: structures ?? undefined,
            starbases,
          }),
  };
}

export interface StructureCounts {
  timers: number;
  lowFuel: number;
  offline: number;
}

export function structureCounts(items: readonly CorpBoardItem[]): StructureCounts {
  let timers = 0;
  let lowFuel = 0;
  let offline = 0;
  for (const item of items) {
    if (item.kind === 'structureTimer') timers += 1;
    else if (item.kind === 'structureFuel') {
      if (item.severity === 'critical' || item.severity === 'warning') lowFuel += 1;
    } else if (item.kind === 'serviceOffline') offline += 1;
  }
  return { timers, lowFuel, offline };
}

export function structuresSeverity(data: StructuresView | null): DeadlineSeverity | null {
  if (data === null || data.items === null) return null;
  return worstSeverity(data.items.map((item) => item.severity));
}

export function structuresDeadline(
  items: readonly CorpBoardItem[],
  nowMs: number
): {
  atMs: number;
  kind: 'structureTimer' | 'structureFuel';
  subject: string;
  severity: DeadlineSeverity;
} | null {
  let soonest: CorpBoardItem | null = null;
  for (const item of items) {
    if (item.kind !== 'structureTimer' && item.kind !== 'structureFuel') continue;
    if (item.timing !== 'timed' || item.deadlineMs === null) continue;
    if (item.withinStaleWindow || item.deadlineMs <= nowMs) continue;
    if (soonest === null || item.deadlineMs < (soonest.deadlineMs ?? Infinity)) soonest = item;
  }
  if (soonest === null || soonest.deadlineMs === null) return null;
  return {
    atMs: soonest.deadlineMs,
    kind: soonest.kind === 'structureTimer' ? 'structureTimer' : 'structureFuel',
    subject: soonest.subject,
    severity: soonest.severity,
  };
}

export function moonChunkSeverity(chunk: BoardClockSource, nowMs: number): DeadlineSeverity {
  if (chunk.detail === 'decay') return 'warning';
  return chunk.deadlineMs - nowMs <= DAY_MS ? 'watch' : 'clear';
}

export function moonChunksSeverity(
  data: MoonChunksBoardData | null,
  nowMs: number
): DeadlineSeverity | null {
  if (data === null || data.chunks === null) return null;
  return worstSeverity(data.chunks.map((chunk) => moonChunkSeverity(chunk, nowMs)));
}

export function moonChunksDeadline(
  chunks: readonly BoardClockSource[],
  nowMs: number
): BoardClockSource | null {
  return chunks
    .filter((chunk) => chunk.deadlineMs > nowMs)
    .reduce<BoardClockSource | null>(
      (soonest, chunk) =>
        soonest === null || chunk.deadlineMs < soonest.deadlineMs ? chunk : soonest,
      null
    );
}
