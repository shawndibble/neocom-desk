/**
 * "Next 7 days" under the Calendar Map: how many of each clock fall in the coming week.
 * Fills the space below the grid and answers "what kind of week is this" before the
 * pilot reads the rail. Counts honour the hidden-kind filter (the caller passes the
 * filtered board); a quiet week renders nothing.
 */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { KIND_TEXT } from '@/components/ui/kindTone';
import type { CharacterBoardItem } from '@/engine/character/board';
import { DAY_MS } from '@/lib/age';
import { KIND_ICON } from './calendarKindIcons';
import { KIND_LABEL } from './calendarKindLabels';

export function CalendarWeekSummary({
  items,
  nowMs,
  className,
}: {
  items: readonly CharacterBoardItem[];
  nowMs: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const counts = new Map<CharacterBoardItem['kind'], number>();
  for (const item of items) {
    if (item.deadlineMs >= nowMs && item.deadlineMs < nowMs + 7 * DAY_MS)
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return (
    <Panel padded title={t('calendar.week.title')} className={className}>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {[...counts].map(([kind, count]) => {
          const Glyph = KIND_ICON[kind];
          return (
            <li key={kind} className="flex items-center gap-2 text-sm">
              <Glyph aria-hidden="true" className={`size-4 shrink-0 ${KIND_TEXT[kind]}`} />
              <span className="flex-1 truncate">{t(KIND_LABEL[kind])}</span>
              <span className="font-semibold tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
