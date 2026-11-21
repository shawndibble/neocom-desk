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
 * glance down the rail sorts nine kinds of clock apart.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CharacterBoardItem } from '@/engine/character/board';
import { pastDeadlineLabelKey } from '@/engine/character/board';
import { formatDuration } from '@/lib/duration';
import { formatTimeOfDay } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { highlightHref } from '@/lib/highlightParam';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { RESPONSE_KEY, RESPONSE_TEXT_TONE } from './calendarResponseTone';
import { KIND_LABEL } from './calendarKindLabels';
import { KIND_ICON } from './calendarKindIcons';
import { KIND_TEXT } from '@/components/ui/kindTone';

export interface CharacterBoardRowProps {
  item: CharacterBoardItem;
  /** Only calendar events have a detail to open; every other kind renders as a plain row. */
  onSelectEvent?: (eventId: number) => void;
  /** Skyhook raids open a detail modal of their own; the source id is the skyhook's. */
  onSelectSkyhook?: (skyhookId: number) => void;
  /** Shared Pops open their detail (the Survey start link); the source id is the pop's. */
  onSelectSharedPop?: (popId: string) => void;
  /** The list already says who shares every pop (its header), so the row drops the repeat. */
  hideSharedBy?: boolean;
}

export function CharacterBoardRow({
  item,
  onSelectEvent,
  onSelectSkyhook,
  onSelectSharedPop,
  hideSharedBy = false,
}: CharacterBoardRowProps) {
  const { t } = useTranslation();
  const zone = useTimeZone();
  const KindIcon = KIND_ICON[item.kind];
  // A muted row (a pop's belt expiry) keeps the kind's glyph in grey: an end, not a start.
  const tone = item.muted ? 'text-text-dim' : KIND_TEXT[item.kind];
  const overdue = item.remainingMs <= 0;

  // Clamped here and only here: the engine keeps `remainingMs` signed so
  // overdue items order against each other, and a countdown of "-3d 2h" is not
  // a thing anyone reads.
  // Past its clock means *running* for a kind whose deadline is a start, and
  // *late* for every other — a job sat undelivered, an order lapsed. Which
  // kinds are which is `board.ts`'s to say; this only picks the word.
  const countdown = overdue
    ? t(item.pastLabelKey ?? pastDeadlineLabelKey(item.kind))
    : t('calendar.due', { duration: formatDuration(item.remainingMs / 1000) });

  const openable = item.kind === 'calendarEvent' && onSelectEvent !== undefined;
  /** The one other kind with a fixed destination — no callback needed, unlike a calendar event's modal. */
  const contractHref =
    item.kind === 'contractExpiry' ? highlightHref('/contracts/history', item.sourceId) : null;

  const body = (
    <>
      {/*
        The glyph takes the kind's hue too, so the colour has a shape attached
        to it at the start of every row rather than living only in the
        countdown's four characters.
      */}
      <KindIcon className={`size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {/*
            Colour is never the only signal (DESIGN.md §7) — and here it needs
            no sr-only companion, because what the hue encodes is the kind, and
            the kind is already written out in words on the row's third line.
          */}
          <span className={`text-sm font-bold tabular-nums ${tone}`}>{countdown}</span>
          {item.important && (
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text uppercase">
              {t('calendar.important')}
            </span>
          )}
          {item.response && (
            <span
              className={`ml-auto shrink-0 text-[0.6875rem] font-semibold tracking-widest uppercase ${RESPONSE_TEXT_TONE[item.response]}`}
            >
              {t(RESPONSE_KEY[item.response])}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{item.subject}</span>
        <span className="mt-0.5 block truncate text-xs text-text-dim">
          {formatTimeOfDay(new Date(item.deadlineMs), zone)} · {t(KIND_LABEL[item.kind])}
          {item.detail && ` · ${t(`calendar.detail.${item.kind}.${item.detail}`, item.detail)}`}
          {item.extra &&
            ` · ${t(`calendar.detail.${item.kind}.${item.extra.detail}`, item.extra.detail)}${item.extra.atMs === undefined ? '' : ` ${formatTimeOfDay(new Date(item.extra.atMs), zone)}`}`}
          {item.corporation && ` · ${item.corporation.name}`}
          {item.sharedBy && !hideSharedBy && ` · ${item.sharedBy.name}`}
        </span>
      </span>
    </>
  );

  if (contractHref) {
    return (
      <Link
        to={contractHref}
        className={cx(
          'group flex min-h-9 w-full items-start gap-2.5 px-3 py-2 text-left',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        {body}
        <Icon.Descend
          size={Icon.ICON_SIZE.sm}
          aria-hidden="true"
          className="mt-1 shrink-0 text-text-faint group-hover:text-accent group-focus-visible:text-accent"
        />
      </Link>
    );
  }

  const onSelectDetail =
    item.kind === 'skyhookRaid' && onSelectSkyhook !== undefined
      ? () => onSelectSkyhook(Number(item.sourceId))
      : item.kind === 'sharedMoonPop' && onSelectSharedPop !== undefined
        ? () => onSelectSharedPop(item.detailId ?? item.sourceId)
        : undefined;

  if (onSelectDetail !== undefined) {
    return (
      <button
        type="button"
        onClick={onSelectDetail}
        className={cx(
          'flex min-h-9 w-full items-start gap-2.5 px-3 py-2 text-left',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        {body}
      </button>
    );
  }

  if (!openable) {
    return <div className="flex min-h-9 items-start gap-2.5 px-3 py-2">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelectEvent(Number(item.sourceId))}
      className={cx(
        'flex min-h-9 w-full items-start gap-2.5 px-3 py-2 text-left',
        rowInteractiveClassName,
        focusRingInsetClassName
      )}
    >
      {body}
    </button>
  );
}
