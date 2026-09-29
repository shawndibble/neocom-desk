/**
 * The judgements behind the Overview's two corp cards, Structures and Moon
 * extractions. Every clock and severity here comes from the corp engine
 * (`engine/corp/board.ts`) or the Calendar's moon-chunk adapter; this module
 * only counts them and picks which one may lead the summary strip.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/severity';
import { DAY_MS } from '@/lib/age';
import { buildCorpBoard, type CorpBoardItem } from '@/engine/corp/board';
import type { BoardClockSource } from '@/engine/character/board';
import type { MoonChunksBoardData, StructuresBoardData, StructuresView } from './boardData';

/** CCP caches the corp endpoints for about an hour — the Corp page's own window. */
export const CORP_CACHE_WINDOW_MS = 3_600_000;

/**
 * The structures' board items as of `nowMs`. Built per render, not at load:
 * `withinStaleWindow` asks whether a clock is shorter than the cache it was
 * read from, and a timer 65 minutes out at load is 50 minutes out a quarter
 * of an hour later — frozen, it would tick below the window as if live.
 */
export function structuresView(data: StructuresBoardData, nowMs: number): StructuresView {
  const { structures, ...rest } = data;
  return {
    ...rest,
    items:
      structures === null
        ? null
        : buildCorpBoard({ nowMs, staleWindowMs: CORP_CACHE_WINDOW_MS, structures }),
  };
}

export interface StructureCounts {
  /** Reinforcement (and other state) timers running. */
  timers: number;
  /** Fuel running out within three days, or already out. */
  lowFuel: number;
  /** Services switched off. */
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

/** Null while loading and while unreadable — a card that could not look makes no claim. */
export function structuresSeverity(data: StructuresView | null): DeadlineSeverity | null {
  if (data === null || data.items === null) return null;
  return worstSeverity(data.items.map((item) => item.severity));
}

/**
 * The structure clock the summary strip may count down: the soonest one still
 * ahead, and only one the snapshot can honestly tick. A clock shorter than
 * CCP's hour-long cache may already be over (`withinStaleWindow`), and a dry
 * structure has no instant at all — the card still shows both, the strip
 * does not.
 */
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

/**
 * A chunk that has landed is waiting to be fractured and mined before it
 * decays, so it is `warning`; one arriving within a day is `watch`.
 */
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

/** The soonest chunk clock still ahead — an arrival, or a landed chunk's decay. */
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
