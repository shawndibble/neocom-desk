/**
 * Shared Pops on the Calendar (issue #6224; scope: docs/context/decisions/
 * 20261115-122511-corp-tax-book-shares-moon-pop-schedules.md): the "Shared moon pop" Clock Kind,
 * as board rows. Pure: the read and the names come from `calendarSharedPopsRead.ts`; the detail
 * and its Survey start link are `sharedPopDetail.ts` (kept out of the boot graph: the start link
 * module reaches Firebase).
 *
 * A Shared Pop shows from its Extraction's start until it is Expired. Before the Pop Time the
 * row counts down to it; after, to the belt's expiry, so a late fleet still sees the field (the
 * `moonChunk` arrival-then-decay pattern). A moon the pilot already reads as a corp `moonChunk`
 * row (ESI or their own book) is left out: that row wins.
 */
import type { BoardClockSource, BoardCorporation } from '@/engine/character/board';
import type { SharedPopView } from '@/sync/sharedPops';

/** One Shared Pop with every name it shows already resolved. Plain data: the route snapshot keeps it. */
export interface SharedPopEntry {
  pop: SharedPopView;
  moonName: string | null;
  corporation: BoardCorporation;
  /** The ore make-up by name, when the book shares it. Never ISK. */
  ore: { name: string; quantity: number }[] | null;
}

/** The row's and the modal's title: the refinery (it carries the system), else the moon. */
export function sharedPopTitle(entry: SharedPopEntry): string {
  return entry.pop.refineryName ?? entry.moonName ?? `#${entry.pop.structureId}`;
}

/** Live between the Extraction's start and the belt's expiry. */
export function sharedPopIsShown(pop: SharedPopView, nowMs: number): boolean {
  const start = Date.parse(pop.startedAt);
  const end = Date.parse(pop.expiresAt);
  return start <= nowMs && nowMs < end;
}

/**
 * The Calendar rows. `readableRefineries` are the refineries the pilot already reads as corp
 * moon chunks: those pops are left out. One refinery holds one moon's drill at a time.
 */
export function toSharedPopSources(
  entries: readonly SharedPopEntry[],
  readableRefineries: ReadonlySet<number>,
  nowMs: number
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const entry of entries) {
    const { pop } = entry;
    if (!sharedPopIsShown(pop, nowMs) || readableRefineries.has(pop.structureId)) continue;
    const popAtMs = Date.parse(pop.popAt);
    if (Number.isNaN(popAtMs)) continue;
    const popped = nowMs >= popAtMs;
    sources.push({
      id: pop.id,
      subject: sharedPopTitle(entry),
      detail: popped ? 'expires' : pop.popTime === 'ready' ? 'ready' : 'autoFracture',
      deadlineMs: popped ? Date.parse(pop.expiresAt) : popAtMs,
      sharedBy: entry.corporation,
      ...(pop.refineryName !== null && entry.moonName !== null ? { subtitle: entry.moonName } : {}),
    });
  }
  return sources;
}
