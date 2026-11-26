import { raidState } from '@/engine/corp/sovereignty';
import type { RowDetailModel } from '@/features/overview/widgets/data/types';
import type { Translate } from '@/lib/translate';
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
