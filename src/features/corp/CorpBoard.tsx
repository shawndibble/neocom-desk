/**
 * The corp ops board: one urgency-ordered list mixing every clock.
 *
 * A list of cards rather than a table, at every width. The ordering is the
 * information — a manager reads down until they stop caring — and a table would
 * ask them to compare columns across five kinds of item that share almost no
 * fields. Below `sm` the same cards stack into one column with the countdown
 * still leading; nothing here has a horizontal scroll to lose.
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
  EmptyState,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { marketItemUrl } from '@/engine/market/urlState';
import { writeToClipboard } from '@/lib/clipboard';
import { formatDuration } from '@/lib/duration';
import { structureStateLabel } from './boardSources';
import type { CorpBoardItem, CorpBoardSeverity } from '@/engine/corp/board';

/**
 * Severity to colour. Four levels, the same four `StatChip` and the rest of the
 * app tone with (docs/DESIGN.md §6) — `clear` deliberately takes the dim text
 * colour rather than `success`: a Fortizar with a month of fuel is not an
 * achievement, it is simply not today's problem.
 */
const SEVERITY_TONE: Record<CorpBoardSeverity, string> = {
  critical: 'text-danger',
  warning: 'text-warning',
  watch: 'text-accent',
  clear: 'text-text-dim',
};

const SEVERITY_LABEL: Record<CorpBoardSeverity, string> = {
  critical: 'corp.board.severity.critical',
  warning: 'corp.board.severity.warning',
  watch: 'corp.board.severity.watch',
  clear: 'corp.board.severity.clear',
};

/**
 * Severity to shape (issue #419): colour alone is not a signal a colorblind
 * reader can use, and DESIGN.md §6/§7 say so outright ("color never the sole
 * signal"). `warning` reuses the app's existing `Warn` triangle rather than a
 * fifth glyph; the sr-only label beside each icon (`BoardRow` below) is what
 * actually names the severity for assistive tech — the icon is decorative.
 */
const SEVERITY_ICON: Record<CorpBoardSeverity, typeof Icon.Warn> = {
  critical: Icon.SeverityCritical,
  warning: Icon.Warn,
  watch: Icon.SeverityWatch,
  clear: Icon.SeverityClear,
};

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
      // A real `<button>` rather than a styled span: `Tooltip` reveals on hover
      // *or focus*, and the caveat is the part of this row a keyboard user most
      // needs to reach.
      <Tooltip content={t('corp.board.underCacheWindowHint')}>
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

function BoardRow({
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
        <span className="sr-only">{t(SEVERITY_LABEL[item.severity])}</span>
      </li>
    </BoardRowMenu>
  );
}

interface CorpBoardProps {
  items: readonly CorpBoardItem[];
  onShowInfo: (typeId: number, itemName: string) => void;
}

/**
 * The caller renders this only for a Character who can read at least one of the
 * board's sources, which is what lets the empty state below mean one thing:
 * "read fine, nothing due". "Cannot read" is answered by not rendering the
 * board at all (`routes/Corp.tsx`), never by an empty state standing in for a
 * panel nobody was allowed to ask about.
 */
export function CorpBoard({ items, onShowInfo }: CorpBoardProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <EmptyState title={t('corp.board.empty')} hint={t('corp.board.emptyHint')} />;
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <BoardRow key={item.id} item={item} onShowInfo={onShowInfo} />
      ))}
    </ul>
  );
}
