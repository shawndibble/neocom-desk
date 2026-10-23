/**
 * The Sovereignty widget (issue #4775): corp skyhooks and sov hubs with their
 * raid windows, and the adapter that lends those windows to Due soon. Same
 * contract as `models.ts`: pure, derived at render time.
 *
 * ESI sends no skyhook silo capacity, so a skyhook shows its reagent stock and
 * no percent; a sov hub's bay is run down to hours left from its burn rate.
 * Raid windows come from an hour-old read, so nothing under the corp cache
 * window is ticked down.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/character/severity';
import type { BoardSovereigntySource } from '@/engine/corp/board';
import {
  hubReagentHoursLeft,
  raidHeadline,
  raidState,
  type RaidState,
  type RaidWindow,
} from '@/engine/corp/sovereignty';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { formatCountdown } from '@/lib/duration';
import { formatNumber } from '@/lib/numberLocale';
import { CORP_CACHE_WINDOW_MS } from '../../data/corpCards';
import { blank, corpUnreadable, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { CorpSovereigntyFeed, CorpSovereigntyRow } from './corpFeeds';
import type { TableRowModel, Translate } from './types';

const W = 'overview.widgets.corpSovereignty';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function systemOf(feed: CorpSovereigntyFeed, row: CorpSovereigntyRow): string {
  return (row.systemId === null ? undefined : feed.systemNames.get(row.systemId)) ?? UNKNOWN;
}

function windowOf(row: CorpSovereigntyRow): RaidWindow | null {
  return row.windowStartMs === null || row.windowEndMs === null
    ? null
    : { startMs: row.windowStartMs, endMs: row.windowEndMs };
}

/** Null when the window was not read: unknown, never safe. */
function stateOf(row: CorpSovereigntyRow, now: number): RaidState | null {
  const window = windowOf(row);
  return window === null ? null : raidState(window, now, row.kind);
}

/** Due soon's view of the windows: every one ESI sent both ends of. */
export function toBoardSovereignty(feed: CorpSovereigntyFeed): BoardSovereigntySource[] {
  return feed.rows.flatMap((row) => {
    const window = windowOf(row);
    return window === null
      ? []
      : [{ id: row.key, name: systemOf(feed, row), kind: row.kind, ...window }];
  });
}

/** A countdown that never claims more precision than the hour-old read behind it. */
function untilText(t: Translate, remainingMs: number): string {
  return remainingMs < CORP_CACHE_WINDOW_MS
    ? t('corp.board.underCacheWindow')
    : formatCountdown(remainingMs / 1000);
}

/** An open window (or a hub in overtime) is critical; one opening within a day, a warning. */
function tone(row: CorpSovereigntyRow, now: number): DeadlineSeverity {
  const state = stateOf(row, now);
  if (state === 'open' || state === 'overtime') return 'critical';
  return state === 'upcoming' && (row.windowStartMs ?? Infinity) - now < DAY_MS
    ? 'warning'
    : 'clear';
}

/** Soonest first: open windows, then upcoming; closed or unknown last. */
function sortKey(row: CorpSovereigntyRow, now: number): number {
  const state = stateOf(row, now);
  if (state === null || state === 'closed') return Infinity;
  return Math.max(row.windowStartMs ?? now, now);
}

export const corpSovereignty: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpSovereignty;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  if (!data.readable) return corpUnreadable(null, feed, data.needsReauth, t);

  const rows = [...data.rows].sort(
    (a, b) =>
      sortKey(a, now) - sortKey(b, now) ||
      systemOf(data, a).localeCompare(systemOf(data, b)) ||
      a.key.localeCompare(b.key)
  );
  const skyhooks = rows.filter((row) => row.kind === 'skyhook');
  const headline = raidHeadline(
    skyhooks.flatMap((row) => windowOf(row) ?? []),
    now
  );

  const windowText = (row: CorpSovereigntyRow): string => {
    const window = windowOf(row);
    switch (stateOf(row, now)) {
      case null:
        return UNKNOWN;
      case 'open':
        return t(`${W}.windowOpen`, { duration: untilText(t, window!.endMs - now) });
      case 'upcoming':
        return t(`${W}.windowIn`, { duration: untilText(t, window!.startMs - now) });
      case 'overtime':
        return t(`${W}.windowOvertime`);
      case 'closed':
        return t(`${W}.windowClosed`);
    }
  };
  const reagentText = (row: CorpSovereigntyRow): string => {
    if (row.kind === 'skyhook') return row.stock === null ? UNKNOWN : formatNumber(row.stock);
    const hours = row.hubBay === null ? null : hubReagentHoursLeft(row.hubBay, now);
    return hours === null ? UNKNOWN : t(`${W}.hubHours`, { count: hours });
  };
  const admText = (row: CorpSovereigntyRow): string => {
    const level = row.systemId === null ? undefined : data.development.get(row.systemId);
    return level === undefined
      ? UNKNOWN
      : `${level.military} / ${level.industrial} / ${level.strategic}`;
  };
  const jumpsText = (row: CorpSovereigntyRow): string => {
    const jumps = row.systemId === null ? undefined : data.jumps.get(row.systemId);
    return jumps === undefined ? UNKNOWN : formatNumber(jumps);
  };
  const kindText = (row: CorpSovereigntyRow) => t(`${W}.kind.${row.kind}`);

  const secondary =
    headline.untilMs === null
      ? undefined
      : {
          text:
            headline.untilMs === 0
              ? t(`${W}.openNow`)
              : t(`${W}.opensIn`, { duration: untilText(t, headline.untilMs) }),
        };

  // An open or overtime window is already underway: Next wants the one still ahead.
  const nextWindow = rows.find((row) => stateOf(row, now) === 'upcoming');
  return {
    ...blank(null, statusOf(feed, { isEmpty: rows.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(headline.count),
      unit: t(`${W}.unit`, { count: headline.count }),
      secondary,
      tone: worstSeverity(skyhooks.map((row) => tone(row, now))),
    },
    rows: rows.map((row) => ({
      key: row.key,
      title: systemOf(data, row),
      detail: kindText(row),
      value: windowText(row),
      tone: tone(row, now),
    })),
    table: {
      columns: [
        { key: 'system', label: t(`${W}.col.system`), priority: 0 },
        { key: 'kind', label: t(`${W}.col.kind`), priority: 3, hideNarrow: true },
        { key: 'window', label: t(`${W}.col.window`), align: 'end', priority: 1 },
        { key: 'reagents', label: t(`${W}.col.reagents`), align: 'end', priority: 2 },
        { key: 'adm', label: t(`${W}.col.adm`), align: 'end', priority: 4, hideNarrow: true },
        { key: 'jumps', label: t(`${W}.col.jumps`), align: 'end', priority: 3, hideNarrow: true },
      ],
      rows: rows.map((row): TableRowModel => ({
        key: row.key,
        cells: [
          systemOf(data, row),
          kindText(row),
          windowText(row),
          reagentText(row),
          admText(row),
          jumpsText(row),
        ],
        tone: tone(row, now),
        // The existing safety route to the system, not a new view.
        to: row.systemId === null ? undefined : routeToHref(row.systemId),
      })),
    },
    deadlines:
      nextWindow?.windowStartMs != null
        ? [
            {
              at: nextWindow.windowStartMs,
              note: t(`${W}.deadline`, { subject: systemOf(data, nextWindow) }),
              severity: tone(nextWindow, now),
              to: '/corp',
            },
          ]
        : [],
    summary: t(`${W}.summary`, { count: headline.count, total: rows.length }),
  };
};
