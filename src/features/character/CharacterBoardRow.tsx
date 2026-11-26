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
  onSelectEvent?: (eventId: number) => void;
  onSelectSkyhook?: (skyhookId: number) => void;
  onSelectSharedPop?: (popId: string) => void;
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
  const tone = item.muted ? 'text-text-dim' : KIND_TEXT[item.kind];
  const overdue = item.remainingMs <= 0;

  const countdown = overdue
    ? t(item.pastLabelKey ?? pastDeadlineLabelKey(item.kind))
    : t('calendar.due', { duration: formatDuration(item.remainingMs / 1000) });

  const openable = item.kind === 'calendarEvent' && onSelectEvent !== undefined;
  const contractHref =
    item.kind === 'contractExpiry' ? highlightHref('/contracts/history', item.sourceId) : null;

  const body = (
    <>
      <KindIcon className={`size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
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
