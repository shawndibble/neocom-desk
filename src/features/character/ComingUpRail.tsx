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
import { ContextMenuHint, EmptyState, Panel } from '@/components/ui';
import { controlHeightClassName } from '@/components/ui/controlStyles';
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
  ) : selectedDayMs === null ? (
    <EmptyState title={t('calendar.rail.empty')} hint={t('calendar.rail.emptyHint')} />
  ) : (
    <EmptyState title={t('calendar.rail.emptyForDay')} />
  );

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
        <>
          {selectedDayMs !== null && (
            <button
              type="button"
              onClick={onClearDay}
              className={`inline-flex items-center px-2 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase ${controlHeightClassName.sm}`}
            >
              {t('calendar.map.clearDay')}
            </button>
          )}
          {items.length > 0 && <ContextMenuHint label={t('calendar.rail.title')} />}
        </>
      }
      className="min-w-0 flex-1"
    >
      {content}
    </Panel>
  );
}
