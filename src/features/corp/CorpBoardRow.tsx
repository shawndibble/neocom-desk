/**
 * One row of the corp ops board: its countdown, its subject, and its right-click
 * menu.
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
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  SEVERITY_LABEL_KEY,
  SEVERITY_TONE,
  SeverityIcon,
  Tooltip,
} from '@/components/ui';
import { marketItemUrl } from '@/engine/market/urlState';
import { writeToClipboard } from '@/lib/clipboard';
import { formatDuration } from '@/lib/duration';
import { structureStateLabel } from './boardSources';
import type { CorpBoardItem } from '@/engine/corp/board';

/*
 * Severity's tone, glyph and sr-only label all live in
 * `components/ui/severityTone.ts` now. They were defined here first, back when
 * the corp board was the only thing with a severity ladder; the Overview board
 * tones its cards off the same four rungs, and two copies of "critical is
 * danger and an octagon" is exactly the duplication that lets them drift.
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
  const tone = SEVERITY_TONE[item.severity];
  // `flex items-center gap-1` puts the shape beside the countdown text inside
  // this same element — a fourth row child would reflow the 320px stack this
  // element's own `w-full`/`sm:w-24` split is built for (issue #419).
  const base = 'flex w-full shrink-0 items-center gap-1 text-sm font-semibold tabular-nums sm:w-24';
  // Decorative: the severity's *name* comes from `BoardRow`'s sr-only label,
  // not from this icon (DESIGN.md §5 — icon beside its own visible text is
  // aria-hidden, no separate label needed).
  const icon = <SeverityIcon severity={item.severity} />;

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
      // A real `<button>` rather than a styled span: `Tooltip` reveals on hover
      // *or focus*, and the caveat is the part of this row a keyboard user most
      // needs to reach.
      <Tooltip content={t('corp.board.underCacheWindowHint')} openOnTap>
        <button
          type="button"
          className={`${base} ${tone} cursor-help text-left underline decoration-dotted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
        >
          {icon}
          {t('corp.board.underCacheWindow')}
        </button>
      </Tooltip>
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
 * Right-click menu for one row (issue #419): copy the subject, and — only for
 * a job, the one kind with a market-relevant item of its own (see
 * `CorpBoardItem.typeId`) — check its product in the Market Browser and show
 * its item info. `ContextMenuTrigger asChild` clones the `<li>` itself rather
 * than wrapping it, the same way `VariationsTable.tsx` triggers off a `<tr>`
 * — a wrapper element would break `<ul>` semantics and the row's own layout.
 */
function BoardRowMenu({
  item,
  onShowInfo,
  children,
}: {
  item: CorpBoardItem;
  onShowInfo: (typeId: number, itemName: string) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const typeId = item.typeId;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(item.subject)}>
          {t('corp.board.contextMenu.copyName')}
        </ContextMenuItem>
        {typeId !== null && (
          <>
            <ContextMenuItem onSelect={() => onShowInfo(typeId, item.subject)}>
              {t('corp.board.contextMenu.showInfo')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => navigate(marketItemUrl(typeId, location.search))}>
              {t('corp.board.contextMenu.viewInMarket')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
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
export function CorpBoardRow({
  item,
  onShowInfo,
}: {
  item: CorpBoardItem;
  onShowInfo: (typeId: number, itemName: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <BoardRowMenu item={item} onShowInfo={onShowInfo}>
      <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0">
        <Countdown item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{item.subject}</p>
          <p className="truncate text-xs text-text-dim">{detailText(item, t)}</p>
        </div>
        {/*
          The severity is already carried by the countdown's colour and shape;
          this is its text equivalent, for anyone who cannot use either.
          `sr-only` rather than a visible badge — a fifth element on every row
          would crowd the one thing the row exists to show.
        */}
        <span className="sr-only">{t(SEVERITY_LABEL_KEY[item.severity])}</span>
      </li>
    </BoardRowMenu>
  );
}
