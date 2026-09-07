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
 * re-derived here.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel } from '@/components/ui';
import type { CharacterBoardItem } from '@/engine/character/board';
import { groupByDay, relativeDayFor } from '@/engine/character/deadlines';
import { CharacterBoardRow } from './CharacterBoardRow';

export interface ComingUpRailProps {
  items: readonly CharacterBoardItem[];
  nowMs: number;
  /** The day the Calendar Map has selected, or null for "everything ahead". */
  selectedDayMs: number | null;
  onClearDay: () => void;
  onSelectEvent: (eventId: number) => void;
  /** True when the pilot has deselected every kind — a different answer from "nothing due". */
  noKindsSelected: boolean;
}

export function ComingUpRail({
  items,
  nowMs,
  selectedDayMs,
  onClearDay,
  onSelectEvent,
  noKindsSelected,
}: ComingUpRailProps) {
  const { t, i18n } = useTranslation();
  const groups = useMemo(() => groupByDay(items), [items]);

  const dayHeading = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return (dayStartMs: number) => {
      const relative = relativeDayFor(dayStartMs, nowMs);
      const date = formatter.format(dayStartMs);
      if (relative === 'today') return t('calendar.day.today', { date });
      if (relative === 'tomorrow') return t('calendar.day.tomorrow', { date });
      return date;
    };
  }, [i18n.language, nowMs, t]);

  return (
    <Panel
      padded={false}
      title={t('calendar.rail.title')}
      meta={
        <span className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('calendar.rail.count', { count: items.length })}
        </span>
      }
      actions={
        selectedDayMs !== null && (
          <button
            type="button"
            onClick={onClearDay}
            className="text-[0.6875rem] font-semibold tracking-widest text-accent uppercase"
          >
            {t('calendar.map.clearDay')}
          </button>
        )
      }
      className="min-w-0 flex-1"
    >
      {noKindsSelected ? (
        // Deliberately distinct from "nothing due": the pilot turned every kind
        // off, and a bare empty list would look like the page had broken.
        <EmptyState title={t('calendar.rail.noKinds')} hint={t('calendar.rail.noKindsHint')} />
      ) : items.length === 0 ? (
        <EmptyState
          title={selectedDayMs === null ? t('calendar.rail.empty') : t('calendar.rail.emptyForDay')}
          hint={selectedDayMs === null ? t('calendar.rail.emptyHint') : undefined}
        />
      ) : (
        <ul aria-label={t('calendar.rail.title')}>
          {groups.map((group) => (
            <li key={group.dayStartMs}>
              <h3 className="sticky top-0 z-10 border-y border-line bg-panel-2 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {dayHeading(group.dayStartMs)}
                <span className="float-right tabular-nums">{group.items.length}</span>
              </h3>
              <ul className="divide-y divide-line">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <CharacterBoardRow item={item} onSelectEvent={onSelectEvent} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
