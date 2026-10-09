/**
 * One row of the corp ops board: its countdown and its subject.
 *
 * A row rather than a list. Until #566 this module also owned the flat,
 * urgency-ordered list that was the whole overview; the Kind Cards render the
 * same rows now, so what is left here is the row itself — and it stays one
 * component precisely so the four cards cannot drift into four slightly
 * different countdowns.
 *
 * Ranking, severity and the short-timer judgement all arrive decided from
 * `engine/corp/board.ts`. This file renders them and does no time arithmetic of
 * its own beyond formatting.
 */
import { HintText } from '@/components/ui/HintText';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import * as Icon from '@/components/ui/icons';
import { SEVERITY_ICON, SEVERITY_LABEL, SEVERITY_TEXT } from '@/components/ui/severityTone';
import { formatDuration } from '@/lib/duration';
import { structureStateLabel } from './boardSources';
import type { CorpBoardItem } from '@/engine/corp/board';

/**
 * Severity to colour. Four levels, the same four `StatChip` and the rest of the
 * app tone with (docs/DESIGN.md §6) — `clear` deliberately takes the dim text
 * colour rather than `success`: a Fortizar with a month of fuel is not an
 * achievement, it is simply not today's problem.
 */

/**
 * Severity to shape (issue #419): colour alone is not a signal a colorblind
 * reader can use, and DESIGN.md §6/§7 say so outright ("color never the sole
 * signal"). `warning` reuses the app's existing `Warn` triangle rather than a
 * fifth glyph; the sr-only label beside each icon (`BoardRow` below) is what
 * actually names the severity for assistive tech — the icon is decorative.
 */

type Translate = ReturnType<typeof useTranslation>['t'];

/** What the row says it is about, below the subject. */
function detailText(item: CorpBoardItem, t: Translate): string {
  switch (item.kind) {
    case 'structureFuel':
      return item.timing === 'passed'
        ? t('corp.board.detail.fuelDry')
        : t('corp.board.detail.fuel');
    case 'structureTimer':
      return item.detail === 'unanchoring'
        ? t('corp.board.detail.unanchoring')
        : t('corp.board.detail.stateTimer', { state: structureStateLabel(item.detail) });
    case 'moonExtraction':
      return item.detail === 'decay'
        ? t('corp.board.detail.moonDecay')
        : t('corp.board.detail.moonArrival');
    case 'jobDelivery':
      return t('corp.board.detail.jobReady');
    case 'serviceOffline':
      return t('corp.board.detail.serviceOffline', { service: item.detail });
  }
}

/**
 * The leading countdown — and, for a clock shorter than the refresh window, the
 * refusal to print one.
 *
 * This is the ticket's stated failure mode. A structure coming out of an armor
 * timer in twelve minutes is not something an hour-stale board can be trusted
 * for, and rendering "12m" beside a ticking-looking badge would claim otherwise.
 * The engine has already decided which items those are; here they read as "under
 * an hour" with a tooltip pointing at the game client, which is honest about
 * both what is known and what is not.
 */
function Countdown({ item }: { item: CorpBoardItem }) {
  const { t } = useTranslation();
  const tone = SEVERITY_TEXT[item.severity];
  const SeverityIcon = SEVERITY_ICON[item.severity];
  // `flex items-center gap-1` puts the shape beside the countdown text inside
  // this same element — a fourth row child would reflow the 320px stack this
  // element's own `w-full`/`sm:w-24` split is built for (issue #419).
  const base = 'flex w-full shrink-0 items-center gap-1 text-sm font-semibold tabular-nums sm:w-24';
  // Decorative: the severity's *name* comes from `BoardRow`'s sr-only label,
  // not from this icon (DESIGN.md §5 — icon beside its own visible text is
  // aria-hidden, no separate label needed).
  const icon = <SeverityIcon aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />;

  if (item.timing === 'untimed') {
    return (
      <span className={`${base} ${tone}`}>
        {icon}
        {t('corp.board.noTimer')}
      </span>
    );
  }
  if (item.timing === 'passed') {
    return (
      <span className={`${base} ${tone}`}>
        {icon}
        {t('corp.board.dry')}
      </span>
    );
  }
  if (item.withinStaleWindow) {
    return (
      // `HintText` is focusable, not just hoverable: the caveat is the part of
      // this row a keyboard user most needs to reach.
      <HintText content={t('corp.board.underCacheWindowHint')} className={`${base} ${tone}`}>
        {icon}
        {t('corp.board.underCacheWindow')}
      </HintText>
    );
  }
  const remainingMs = item.remainingMs ?? 0;
  if (remainingMs <= 0) {
    return (
      <span className={`${base} ${tone}`}>
        {icon}
        {t('corp.board.overdueFor', { duration: formatDuration(-remainingMs / 1000) })}
      </span>
    );
  }
  // Clamped only here, at the point of display — the engine keeps the signed
  // value so overdue items stay ordered against each other.
  return (
    <span className={`${base} ${tone}`}>
      {icon}
      {formatDuration(remainingMs / 1000)}
    </span>
  );
}

/**
 * One board row, exported so the Kind Cards (issue #566) render exactly this
 * and not an approximation of it.
 *
 * The countdown's four states, the short-timer refusal, the severity glyph and
 * its screen-reader word all live in here, and a second copy of them in the
 * cards is precisely how one surface ends up quietly printing a figure the
 * other refuses to.
 */
export function CorpBoardRow({ item }: { item: CorpBoardItem }) {
  const { t } = useTranslation();
  const detail = detailText(item, t);
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0">
      <Countdown item={item} />
      <div className="min-w-0 flex-1">
        <Tooltip content={item.subject}>
          <p className="line-clamp-2 text-sm break-words">
            {/* Item rows go to Market (§6c); structures and the rest are plain names. */}
            {item.typeId === null ? (
              item.subject
            ) : (
              <ItemInfoLink typeId={item.typeId}>{item.subject}</ItemInfoLink>
            )}
          </p>
        </Tooltip>
        <Tooltip content={detail}>
          <p className="truncate text-xs text-text-dim">{detail}</p>
        </Tooltip>
      </div>
      {/*
          The severity is already carried by the countdown's colour and shape;
          this is its text equivalent, for anyone who cannot use either.
          `sr-only` rather than a visible badge — a fifth element on every row
          would crowd the one thing the row exists to show.
        */}
      <span className="sr-only">{t(SEVERITY_LABEL[item.severity])}</span>
    </li>
  );
}
