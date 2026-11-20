/**
 * The Coming Up Rail: every clock the Character can read, in one
 * deadline-ordered list under relative day headings.
 *
 * This is the half of the Calendar page that answers "what happens next". The
 * Calendar Map beside it answers "what shape is the month" — they are two
 * halves of one question, which is why they sit side by side instead of behind
 * a view switcher (see the scope decision).
 *
 * Grouping only; the ordering is `engine/character/board.ts`'s and is never
 * re-derived here. Items overdue for over `LONG_OVERDUE_MS` fold into one
 * summary row at the top ("Overdue over 2 days · oldest 31 days", with the
 * count), which expands in place (§6c's leading caret); a picked day folds
 * nothing.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, EmptyState, LiveStatus, Panel, textActionClassName } from '@/components/ui';
import type { CharacterBoardItem } from '@/engine/character/board';
import { DAY_MS } from '@/lib/age';
import { useTimeZone } from '@/lib/timeFormat';
import {
  groupByDay,
  relativeDayFor,
  splitLongOverdue,
  type DayGroup,
} from '@/engine/character/deadlines';
import { CalendarClocks } from './CalendarClocks';
import { CharacterBoardRow } from './CharacterBoardRow';

/**
 * Overdue for longer than this, an item folds into the rail's one summary row: a month of
 * extractors nobody restarted must not open the agenda above everything current.
 */
export const LONG_OVERDUE_MS = 2 * DAY_MS;

export interface ComingUpRailProps {
  items: readonly CharacterBoardItem[];
  nowMs: number;
  /** The day the Calendar Map has selected, or null for "everything ahead". */
  selectedDayMs: number | null;
  onClearDay: () => void;
  onSelectEvent: (eventId: number) => void;
  onSelectSkyhook?: (skyhookId: number) => void;
  onSelectSharedPop?: (popId: string) => void;
  /** True when the pilot has deselected every kind — a different answer from "nothing due". */
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
  const [showLongOverdue, setShowLongOverdue] = useState(false);
  // A picked day shows all of that day: the pilot asked for it.
  const { longOverdue, rest } = useMemo(
    () =>
      selectedDayMs === null
        ? splitLongOverdue(items, nowMs, LONG_OVERDUE_MS)
        : { longOverdue: [], rest: [...items] },
    [items, nowMs, selectedDayMs]
  );
  // One sharing corporation across the list: name it once in the header, not on every row.
  const soleSharer = useMemo(() => {
    const names = new Set(items.flatMap((i) => (i.sharedBy ? [i.sharedBy.name] : [])));
    return names.size === 1 ? [...names][0] : null;
  }, [items]);
  const groups = useMemo(() => groupByDay(rest, zone), [rest, zone]);
  const longOverdueGroups = useMemo(() => groupByDay(longOverdue, zone), [longOverdue, zone]);

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

  /**
   * Three states, and they are three different sentences.
   *
   * "You turned every kind off" is not "nothing is due", and neither is
   * "nothing is due on the day you picked" — a reader who cannot tell them
   * apart cannot tell a working filter from a broken page.
   */
  const content = noKindsSelected ? (
    <EmptyState title={t('calendar.rail.noKinds')} hint={t('calendar.rail.noKindsHint')} />
  ) : items.length > 0 ? (
    <ul aria-label={t('calendar.rail.title')}>
      {longOverdue.length > 0 && (
        <li>
          <Disclosure
            className="border-b border-line"
            label={t('calendar.rail.longOverdue', {
              count: Math.floor(
                (nowMs - Math.min(...longOverdue.map((i) => i.deadlineMs))) / DAY_MS
              ),
              windowDays: LONG_OVERDUE_MS / DAY_MS,
            })}
            trailing={longOverdue.length}
            expanded={showLongOverdue}
            onToggle={() => setShowLongOverdue((open) => !open)}
          >
            <ul>{longOverdueGroups.map(dayGroup)}</ul>
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

  // The count alone would not change when a day holds the only event, so the
  // status names its scope too, and says so when the list empties.
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
