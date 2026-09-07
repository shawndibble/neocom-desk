/**
 * One row of the Coming Up Rail: a countdown, what it is, and what it is about.
 *
 * The countdown is the point. Not one of the three views this replaced showed
 * one — Month put a title in a cell, Week put a time in front of it, Agenda
 * printed an absolute timestamp — so "is this soon?" was arithmetic the pilot
 * did in their head against a clock they had to remember was UTC.
 *
 * Every ordering and severity decision was already made in
 * `engine/character/board.ts`. Nothing here re-derives urgency; it only picks
 * the tone and the words for what the engine already decided.
 */
import { useTranslation } from 'react-i18next';
import type { DeadlineSeverity } from '@/engine/severity';
import type { CharacterBoardItem, CharacterBoardItemKind } from '@/engine/character/board';
import { formatDuration } from '@/lib/duration';
import { formatTimeOfDay } from '@/lib/timestamp';
import * as Icon from '@/components/ui/icons';
import { RESPONSE_KEY, RESPONSE_TEXT_TONE } from './calendarResponseTone';
import { EventContextMenu } from './EventContextMenu';
import { KIND_LABEL } from './calendarKindLabels';

const SEVERITY_TONE: Record<DeadlineSeverity, string> = {
  critical: 'text-danger',
  warning: 'text-warning',
  watch: 'text-accent',
  clear: 'text-text-dim',
};

const SEVERITY_LABEL: Record<DeadlineSeverity, string> = {
  critical: 'corp.board.severity.critical',
  warning: 'corp.board.severity.warning',
  watch: 'corp.board.severity.watch',
  clear: 'corp.board.severity.clear',
};

/** One glyph per kind, from the app's own vocabulary — the same icons those routes carry in the nav. */
const KIND_ICON: Record<CharacterBoardItemKind, typeof Icon.Skills> = {
  calendarEvent: Icon.CalendarEvent,
  skillTraining: Icon.Skills,
  industryJob: Icon.Industry,
  planetExtraction: Icon.Planetary,
  contractExpiry: Icon.Contracts,
  orderExpiry: Icon.Orders,
};

export interface CharacterBoardRowProps {
  item: CharacterBoardItem;
  /** Only calendar events have a detail to open; every other kind renders as a plain row. */
  onSelectEvent?: (eventId: number) => void;
}

export function CharacterBoardRow({ item, onSelectEvent }: CharacterBoardRowProps) {
  const { t } = useTranslation();
  const KindIcon = KIND_ICON[item.kind];
  const overdue = item.remainingMs <= 0;

  // Clamped here and only here: the engine keeps `remainingMs` signed so
  // overdue items order against each other, and a countdown of "-3d 2h" is not
  // a thing anyone reads.
  const countdown = overdue
    ? t('calendar.overdue')
    : t('calendar.due', { duration: formatDuration(item.remainingMs / 1000) });

  const openable = item.kind === 'calendarEvent' && onSelectEvent !== undefined;

  const body = (
    <>
      <KindIcon className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`text-xs font-semibold tabular-nums ${SEVERITY_TONE[item.severity]}`}>
            {countdown}
          </span>
          {/*
            Colour is never the only signal (DESIGN.md §7). The countdown text
            carries the fact, and the severity word carries it again for a
            screen reader, which cannot see the tone at all.
          */}
          <span className="sr-only">{t(SEVERITY_LABEL[item.severity])}</span>
          {item.important && (
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text uppercase">
              {t('calendar.important')}
            </span>
          )}
          {item.response && item.response !== 'accepted' && (
            <span
              className={`ml-auto shrink-0 text-[0.6875rem] font-semibold tracking-widest uppercase ${RESPONSE_TEXT_TONE[item.response]}`}
            >
              {t(RESPONSE_KEY[item.response])}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{item.subject}</span>
        <span className="mt-0.5 block truncate text-xs text-text-dim">
          {formatTimeOfDay(new Date(item.deadlineMs))} · {t(KIND_LABEL[item.kind])}
          {item.detail && ` · ${t(`calendar.detail.${item.kind}.${item.detail}`, item.detail)}`}
        </span>
      </span>
    </>
  );

  if (!openable) {
    return <div className="flex min-h-11 items-start gap-2.5 px-3 py-2">{body}</div>;
  }

  return (
    <EventContextMenu eventId={Number(item.sourceId)}>
      <button
        type="button"
        onClick={() => onSelectEvent(Number(item.sourceId))}
        className="flex min-h-11 w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-panel-2"
      >
        {body}
      </button>
    </EventContextMenu>
  );
}
