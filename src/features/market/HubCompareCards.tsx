/**
 * Compare Hubs as a card per Trade Hub rather than a row per Trade Hub.
 *
 * The table this replaced answered "what is the spread at each hub" only by
 * reading a number out of a column and holding it against the number two rows
 * down. Five hubs is a fixed, tiny set — it fits across the panel — so each
 * hub gets its own box and the comparison becomes a glance across the row
 * instead of a scan down a column.
 *
 * What that trades away is sorting: `DataTable` gave sortable buy/sell
 * columns and a card grid has no column to sort. `TRADE_HUBS`' own fixed
 * order (Jita, Amarr, Dodixie, Rens, Hek) is the order here, at every width,
 * so a hub is always in the same place on the grid — which is the thing a
 * sort would otherwise destroy.
 */
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { SystemLink } from '@/features/entities';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import type { HubComparisonRow } from './appraisalData';

/** How long the "copied" confirmation stays up before the bubble goes back to the figure. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * A hub total that copies itself. The figure reads as shorthand ("1.3B"), the
 * tooltip carries the exact value, and a click puts that same exact value on
 * the clipboard — the digits the bubble showed, so what is pasted is never a
 * surprise.
 *
 * `IskAmount` is deliberately not reused here: it reveals its exact value on
 * *tap*, and this control's tap belongs to the copy. That is the case
 * `Tooltip` documents as `openOnTap={false}` (its default) — touch-and-hold
 * stays the way to read the bubble, and the tap acts.
 */
function CopyableTotal({
  value,
  copied,
  onCopied,
}: {
  value: number;
  copied: boolean;
  onCopied: () => void;
}) {
  const { t } = useTranslation();
  const exact = t('common.iskExact', { amount: formatIsk(value, 0) });

  async function copy() {
    await writeToClipboard(formatIsk(value, 0));
    onCopied();
  }

  return (
    <Tooltip content={copied ? t('market.appraisal.copiedToClipboard') : exact}>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('market.appraisal.copyTotal', { amount: exact })}
        className={`rounded-xs text-left hover:text-accent ${interactiveClassName} ${focusRingClassName}`}
      >
        {/* Exception: a copy button with its own exact-figure tooltip; IskAmount would nest a second tab stop. */}
        <span aria-hidden="true">{formatIskCompact(value)}</span>
      </button>
    </Tooltip>
  );
}

/**
 * One labelled figure inside a card. Label above value, never beside it: the
 * narrowest track this grid produces is ~120px of content, where a
 * side-by-side label would leave the figure nowhere to sit.
 */
function HubFigure({
  label,
  value,
  copied,
  onCopied,
}: {
  label: string;
  value: number | null;
  copied: boolean;
  onCopied: () => void;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-sm text-text tabular-nums">
        {value === null ? '—' : <CopyableTotal value={value} copied={copied} onCopied={onCopied} />}
      </dd>
    </div>
  );
}

/** Identifies the one figure currently showing its "copied" confirmation. */
type CopiedKey = `${string}:${'sell' | 'buy'}`;

export function HubCompareCards({ rows }: { rows: readonly HubComparisonRow[] }) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const [copied, setCopied] = useState<CopiedKey | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  function announceCopied(key: CopiedKey) {
    setCopied(key);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(null), COPIED_FEEDBACK_MS);
  }

  return (
    <>
      {/*
        Flat rows, not cards: the table below is the page's only box, so a hub
        is a hairline-divided row (name, then sell and buy) on the page ground.
        Rows wrap on a phone rather than breaking.
      */}
      <ul
        aria-label={t('market.appraisal.compareHubsTitle')}
        className="min-w-0 divide-y divide-line border-t border-line"
      >
        {rows.map((row) => (
          <li
            key={row.hub.id}
            className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-0.5 px-3 py-1.5"
          >
            <p className="w-24 shrink-0 truncate text-sm font-semibold">
              <SystemLink systemId={row.hub.systemId}>{row.hub.systemName}</SystemLink>
            </p>
            <dl className="flex flex-wrap gap-x-6 gap-y-0.5">
              <HubFigure
                label={t('market.appraisal.sellTotal')}
                value={row.sell}
                copied={copied === `${row.hub.id}:sell`}
                onCopied={() => announceCopied(`${row.hub.id}:sell`)}
              />
              <HubFigure
                label={t('market.appraisal.buyTotal')}
                value={row.buy}
                copied={copied === `${row.hub.id}:buy`}
                onCopied={() => announceCopied(`${row.hub.id}:buy`)}
              />
            </dl>
            {row.unreachable && (
              <p className="text-[0.6875rem] text-text-dim">{pricesUnavailableLabel}</p>
            )}
          </li>
        ))}
      </ul>
      {/*
        One live region for the whole grid, not one per figure: the tooltip is
        `pointer-events-none` and never announced, so this is the confirmation
        a screen reader hears, and ten of them would be ten places for it to
        come from.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied === null ? '' : t('market.appraisal.copiedToClipboard')}
      </span>
    </>
  );
}
