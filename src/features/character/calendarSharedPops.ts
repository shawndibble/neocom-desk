/**
 * Shared Pops on the Calendar (issue #6224; scope: docs/context/decisions/
 * 20261115-122511-corp-tax-book-shares-moon-pop-schedules.md): the "Shared moon pop" Clock Kind,
 * its detail and its Survey start link. Pure: the read and the names come from
 * `calendarSharedPopsRead.ts`.
 *
 * A Shared Pop shows from its Extraction's start until it is Expired. Before the Pop Time the
 * row counts down to it; after, to the belt's expiry, so a late fleet still sees the field (the
 * `moonChunk` arrival-then-decay pattern). A moon the pilot already reads as a corp `moonChunk`
 * row (ESI or their own book) is left out: that row wins.
 */
import type { BoardClockSource, BoardCorporation } from '@/engine/character/board';
import type { RowDetailModel } from '@/features/overview/widgets/data/types';
import { startLinkPath } from '@/features/survey/startLink';
import type { SharedPopView } from '@/sync/sharedPops';
import { formatDuration } from '@/lib/duration';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import type { Translate } from '@/lib/translate';

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
      ...(entry.pop.refineryName !== null && entry.moonName !== null
        ? { subtitle: entry.moonName }
        : {}),
    });
  }
  return sources;
}

/**
 * The Survey start link: the refinery as location, the sharing corporation as payee, the
 * book's rate. Built when shown, so a settings change reaches every link.
 */
export function sharedPopStartLink(entry: SharedPopEntry): string {
  const { pop } = entry;
  return startLinkPath({
    place: {
      id: pop.structureId,
      name: pop.refineryName ?? entry.moonName ?? '',
      kind: 'structure',
    },
    payee: { id: pop.corporationId, name: '' },
    rate: pop.ratePct,
    notes: '',
  });
}

const POP_TIME_KEY = {
  ready: 'calendar.sharedPop.popTime.ready',
  'auto-fracture': 'calendar.sharedPop.popTime.autoFracture',
} as const;

/** The detail modal: refinery, moon, Pop Time and countdown, ore make-up, notes, start link. */
export function sharedPopDetail(
  entry: SharedPopEntry,
  nowMs: number,
  t: Translate,
  zone: string | undefined
): RowDetailModel {
  const { pop } = entry;
  const popAtMs = Date.parse(pop.popAt);
  const popped = nowMs >= popAtMs;
  const facts = [
    ...(entry.moonName === null
      ? []
      : [{ label: t('calendar.sharedPop.moon'), value: entry.moonName }]),
    {
      label: t(POP_TIME_KEY[pop.popTime]),
      value: formatCalendarTimestamp(new Date(popAtMs), zone),
    },
    {
      label: t('calendar.sharedPop.expires'),
      value: formatCalendarTimestamp(new Date(Date.parse(pop.expiresAt)), zone),
    },
    { label: t('calendar.sharedPop.taxedBy'), value: entry.corporation.name },
    {
      label: t('calendar.sharedPop.rate'),
      value: t('calendar.sharedPop.ratePct', { rate: pop.ratePct }),
    },
  ];
  return {
    title: sharedPopTitle(entry),
    status: {
      badge: t(POP_TIME_KEY[pop.popTime]),
      tone: popped ? 'success' : 'neutral',
      text: popped
        ? t(
            pop.fractured || pop.popTime === 'auto-fracture'
              ? 'calendar.sharedPop.fractured'
              : 'calendar.sharedPop.arrived'
          )
        : t('calendar.due', { duration: formatDuration((popAtMs - nowMs) / 1000) }),
      ...(pop.notes.trim() === '' ? {} : { note: pop.notes }),
    },
    facts,
    ...(entry.ore === null || entry.ore.length === 0
      ? {}
      : {
          list: {
            title: t('calendar.sharedPop.ore'),
            items: entry.ore.map((line) => ({
              key: line.name,
              text: line.name,
              value: t('calendar.sharedPop.units', { count: line.quantity }),
            })),
          },
        }),
    ...(pop.solarSystemId === null
      ? {}
      : { place: { systemId: pop.solarSystemId, name: sharedPopTitle(entry) } }),
    link: { label: t('calendar.sharedPop.startSurvey'), to: sharedPopStartLink(entry) },
  };
}
