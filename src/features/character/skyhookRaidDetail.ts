/**
 * The detail modal's model for a `skyhookRaid` Calendar item: system, the stock
 * at risk, and the window's two ends, plus the system for Set destination. It
 * is the corp Sovereignty widget's `RowDetailModel`, so the same modal draws it
 * (`RowDetailModal`) and the two surfaces cannot drift.
 *
 * ESI sends no silo capacity, so "silo fill" is the unsecured and secured stock
 * in units, never a percentage (see the `calendar.skyhookRaid.note` line).
 */
import { raidState } from '@/engine/corp/sovereignty';
import type { RowDetailModel, Translate } from '@/features/overview/widgets/data/types';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import type { SkyhookRaid } from './calendarBoardSources';

export function skyhookRaidDetail(
  raid: SkyhookRaid,
  nowMs: number,
  t: Translate,
  zone: string | undefined
): RowDetailModel {
  const unknown = t('calendar.skyhookRaid.unknown');
  const units = (count: number | null) =>
    count === null ? unknown : t('calendar.skyhookRaid.units', { count });
  const when = (ms: number | null) =>
    ms === null ? unknown : formatCalendarTimestamp(new Date(ms), zone);

  const open =
    raid.windowStartMs !== null &&
    raid.windowEndMs !== null &&
    raidState({ startMs: raid.windowStartMs, endMs: raid.windowEndMs }, nowMs) === 'open';

  return {
    title: raid.subject,
    status: {
      badge: t(open ? 'calendar.skyhookRaid.state.open' : 'calendar.skyhookRaid.state.upcoming'),
      tone: open ? 'danger' : 'warning',
      note: t('calendar.skyhookRaid.note'),
    },
    facts: [
      { label: t('calendar.skyhookRaid.system'), value: raid.systemName ?? unknown },
      { label: t('calendar.skyhookRaid.unsecured'), value: units(raid.unsecuredUnits) },
      { label: t('calendar.skyhookRaid.secured'), value: units(raid.securedUnits) },
      { label: t('calendar.skyhookRaid.windowOpens'), value: when(raid.windowStartMs) },
      { label: t('calendar.skyhookRaid.windowCloses'), value: when(raid.windowEndMs) },
    ],
    place:
      raid.systemId === null
        ? undefined
        : { systemId: raid.systemId, name: raid.systemName ?? raid.subject },
  };
}
