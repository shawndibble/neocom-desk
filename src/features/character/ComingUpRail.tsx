import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, EmptyState, LiveStatus, Panel, textActionClassName } from '@/components/ui';
import type { CharacterBoardItem } from '@/engine/character/board';
import { useTimeZone } from '@/lib/timeFormat';
import {
  calendarDaysBefore,
  groupByDay,
  relativeDayFor,
  splitOverdueBeforeToday,
  type DayGroup,
} from '@/engine/character/deadlines';
import { CalendarClocks } from './CalendarClocks';
import { CharacterBoardRow } from './CharacterBoardRow';

export interface ComingUpRailProps {
  items: readonly CharacterBoardItem[];
  nowMs: number;
  selectedDayMs: number | null;
  onClearDay: () => void;
  onSelectEvent: (eventId: number) => void;
  onSelectSkyhook?: (skyhookId: number) => void;
  onSelectSharedPop?: (popId: string) => void;
  noKindsSelected: boolean;
}

export function ComingUpRail({
  items,
  nowMs,
  selectedDayMs,
  onClearDay,
  onSelectEvent,
  onSelectSkyhook,
  onSelectSharedPop,
  noKindsSelected,
}: ComingUpRailProps) {
  const { t, i18n } = useTranslation();
  const zone = useTimeZone();
  const [showBeforeToday, setShowBeforeToday] = useState(false);
  const { beforeToday, rest } = useMemo(
    () =>
      selectedDayMs === null
        ? splitOverdueBeforeToday(items, nowMs, zone)
        : { beforeToday: [], rest: [...items] },
    [items, nowMs, selectedDayMs, zone]
  );
  const soleSharer = useMemo(() => {
    const names = new Set(items.flatMap((i) => (i.sharedBy ? [i.sharedBy.name] : [])));
    return names.size === 1 ? [...names][0] : null;
  }, [items]);
  const groups = useMemo(() => groupByDay(rest, zone), [rest, zone]);
  const beforeTodayGroups = useMemo(() => groupByDay(beforeToday, zone), [beforeToday, zone]);

  const dayHeading = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: zone,
    });
    return (dayStartMs: number) => {
      const relative = relativeDayFor(dayStartMs, nowMs, zone);
      const date = formatter.format(dayStartMs);
      if (relative === 'today') return t('calendar.day.today', { date });
      if (relative === 'tomorrow') return t('calendar.day.tomorrow', { date });
      return date;
    };
  }, [i18n.language, nowMs, t, zone]);

  const dayGroup = (group: DayGroup) => (
    <li key={group.dayStartMs}>
      <h3
        className={cx(
          eyebrowClassName,
          'sticky top-0 z-10 border-y border-line bg-panel-2 px-3 py-1.5'
        )}
      >
        {dayHeading(group.dayStartMs)}
        <span className="float-right tabular-nums">{group.items.length}</span>
      </h3>
      <ul className="divide-y divide-line">
        {group.items.map((item) => (
          <li key={item.id}>
            <CharacterBoardRow
              item={item}
              onSelectEvent={onSelectEvent}
              onSelectSkyhook={onSelectSkyhook}
              onSelectSharedPop={onSelectSharedPop}
              hideSharedBy={soleSharer !== null}
            />
          </li>
        ))}
      </ul>
    </li>
  );

  const content = noKindsSelected ? (
    <EmptyState title={t('calendar.rail.noKinds')} hint={t('calendar.rail.noKindsHint')} />
  ) : items.length > 0 ? (
    <ul aria-label={t('calendar.rail.title')}>
      {beforeToday.length > 0 && (
        <li>
          <Disclosure
            className="border-b border-line"
            label={t('calendar.rail.overdueBeforeToday', {
              count: calendarDaysBefore(
                Math.min(...beforeToday.map((i) => i.deadlineMs)),
                nowMs,
                zone
              ),
            })}
            trailing={beforeToday.length}
            expanded={showBeforeToday}
            onToggle={() => setShowBeforeToday((open) => !open)}
          >
            <ul>{beforeTodayGroups.map(dayGroup)}</ul>
          </Disclosure>
        </li>
      )}
      {groups.map(dayGroup)}
    </ul>
  ) : selectedDayMs === null ? (
    <EmptyState title={t('calendar.rail.empty')} />
  ) : (
    <EmptyState title={t('calendar.rail.emptyForDay')} />
  );

  const status = noKindsSelected
    ? t('calendar.rail.noKinds')
    : items.length === 0
      ? selectedDayMs === null
        ? t('calendar.rail.empty')
        : t('calendar.rail.emptyForDay')
      : selectedDayMs === null
        ? t('calendar.rail.count', { count: items.length })
        : t('calendar.rail.countForDay', { count: items.length });

  return (
    <Panel
      padded={false}
      actions={
        selectedDayMs !== null && (
          <button type="button" onClick={onClearDay} className={textActionClassName()}>
            {t('calendar.map.clearDay')}
          </button>
        )
      }
      className="min-w-0 md:w-[30rem] md:min-w-72 md:max-w-[45%] md:shrink-0"
    >
      <div className="border-b border-line px-3 py-2">
        <CalendarClocks />
        <LiveStatus announceKey={selectedDayMs ?? 'all'}>{status}</LiveStatus>
        {soleSharer !== null && (
          <p className="mt-1 text-xs text-text-dim">
            {t('calendar.rail.sharedBy', { name: soleSharer })}
          </p>
        )}
      </div>
      {content}
    </Panel>
  );
}
