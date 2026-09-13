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
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
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
        className="rounded-xs text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
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
    <div>
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-base text-text tabular-nums">
        {value === null ? '—' : <CopyableTotal value={value} copied={copied} onCopied={onCopied} />}
      </dd>
    </div>
  );
}

/** Identifies the one figure currently showing its "copied" confirmation. */
type CopiedKey = `${string}:${'sell' | 'buy'}`;

export function HubCompareCards({ rows }: { rows: readonly HubComparisonRow[] }) {
  const { t } = useTranslation();
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
        The cards are the panel surfaces here — `bg-panel/85` on a hairline,
        DESIGN.md §1's glass treatment — because there is no outer panel around
        them any more. They sit straight on the page ground, like the result
        `Panel` above them.

        One column on a phone, three from `sm`, all five from `lg` — which is
        also where the paste box becomes a 21rem sidebar, so the results track
        narrows at the same breakpoint the card count grows. Five tracks in
        that ~640px track is ~120px of content each: enough for a compact ISK
        figure, and a label that wraps to two lines at the very bottom of the
        range simply makes the row of cards taller rather than breaking.

        `min-w-0` on the grid and every card: a grid item's default `min-width`
        is its content's intrinsic width, so without it a long figure widens
        its track instead of being contained.
      */}
      <ul
        aria-label={t('market.appraisal.compareHubsTitle')}
        className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {rows.map((row) => (
          <li
            key={row.hub.id}
            className="min-w-0 rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm"
          >
            <p className="truncate text-sm font-semibold text-text">{row.hub.systemName}</p>
            <dl className="mt-2 flex flex-col gap-2">
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
