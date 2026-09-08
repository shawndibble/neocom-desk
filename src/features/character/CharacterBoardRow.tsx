/**
 * One row of the Coming Up Rail: a countdown, what it is, and what it is about.
 *
 * The countdown is the point. Not one of the three views this replaced showed
 * one — Month put a title in a cell, Week put a time in front of it, Agenda
 * printed an absolute timestamp — so "is this soon?" was arithmetic the pilot
 * did in their head against a clock they had to remember was UTC.
 *
 * Every ordering decision was already made in `engine/character/board.ts`.
 * Nothing here re-derives urgency; it only picks the words for what the engine
 * already decided.
 *
 * **The colour on the countdown names the kind, not the urgency.** It used to
 * be a severity tone, which meant the loudest thing on the row repeated what
 * the countdown beside it already said in words — and said nothing at all
 * about *what* was ending. The hue now matches the kind's dot in the Calendar
 * Map, its segment in the Day Ticker and its swatch in the filter menu, so one
 * glance down the rail sorts six kinds of clock apart.
 */
import { useTranslation } from 'react-i18next';
import type { CharacterBoardItem, CharacterBoardItemKind } from '@/engine/character/board';
import { runsPastItsDeadline } from '@/engine/character/board';
import { formatDuration } from '@/lib/duration';
import { formatTimeOfDay } from '@/lib/timestamp';
import * as Icon from '@/components/ui/icons';
import { RESPONSE_KEY, RESPONSE_TEXT_TONE } from './calendarResponseTone';
import { EventContextMenu } from './EventContextMenu';
import { KIND_LABEL } from './calendarKindLabels';
import { KIND_TEXT } from '@/components/ui/kindTone';

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
  // Past its clock means *running* for a kind whose deadline is a start, and
  // *late* for every other — a job sat undelivered, an order lapsed. Which
  // kinds are which is `board.ts`'s to say; this only picks the word.
  const countdown = overdue
    ? t(runsPastItsDeadline(item.kind) ? 'calendar.started' : 'calendar.overdue')
    : t('calendar.due', { duration: formatDuration(item.remainingMs / 1000) });

  const openable = item.kind === 'calendarEvent' && onSelectEvent !== undefined;

  const body = (
    <>
      {/*
        The glyph takes the kind's hue too, so the colour has a shape attached
        to it at the start of every row rather than living only in the
        countdown's four characters.
      */}
      <KindIcon className={`size-4 shrink-0 ${KIND_TEXT[item.kind]}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {/*
            Colour is never the only signal (DESIGN.md §7) — and here it needs
            no sr-only companion, because what the hue encodes is the kind, and
            the kind is already written out in words on the row's third line.
          */}
          <span className={`text-xs font-semibold tabular-nums ${KIND_TEXT[item.kind]}`}>
            {countdown}
          </span>
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
