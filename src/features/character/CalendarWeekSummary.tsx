import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { KIND_TEXT } from '@/components/ui/kindTone';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItem } from '@/engine/character/board';
import { countsByKind } from '@/engine/character/deadlines';
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
  const counts = countsByKind(
    items.filter((i) => i.deadlineMs >= nowMs && i.deadlineMs < nowMs + 7 * DAY_MS)
  );
  if (counts.size === 0) return null;
  return (
    <Panel padded title={t('calendar.week.title')} className={className}>
      <div className="@container">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4">
          {CHARACTER_BOARD_ITEM_KINDS.filter((kind) => counts.has(kind)).map((kind) => {
            const count = counts.get(kind);
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
      </div>
    </Panel>
  );
}
