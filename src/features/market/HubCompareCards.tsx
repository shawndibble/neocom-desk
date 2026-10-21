/**
 * Compare Hubs as a card per Trade Hub. Five hubs is a fixed, tiny set that
 * fits across the page, so the comparison is a glance across the row rather
 * than a scan down a column.
 *
 * A card grid has no column to sort, so `TRADE_HUBS`' own fixed order (Jita,
 * Amarr, Dodixie, Rens, Hek) is the order at every width: a hub is always in
 * the same place on the grid.
 *
 * A card is also the hub picker: clicking one re-quotes the appraisal at that
 * hub, and the hub it is quoted at reads as selected. The system name is the
 * card's title button, not a SystemLink, so the card has one action.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { TradeHub } from '@/market/hubs';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
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
        onClick={(event) => {
          // The card's own click picks the hub; a copy is not a pick.
          event.stopPropagation();
          void copy();
        }}
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
    <div>
      <dt className={eyebrowClassName}>{label}</dt>
      <dd className="text-base text-text tabular-nums">
        {value === null ? '—' : <CopyableTotal value={value} copied={copied} onCopied={onCopied} />}
      </dd>
    </div>
  );
}

/** Identifies the one figure currently showing its "copied" confirmation. */
type CopiedKey = `${string}:${'sell' | 'buy'}`;

export function HubCompareCards({
  rows,
  selectedHubId,
  onSelectHub,
}: {
  rows: readonly HubComparisonRow[];
  selectedHubId: TradeHub['id'];
  onSelectHub: (id: TradeHub['id']) => void;
}) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const { copied, flash: announceCopied } = useCopyFeedback<CopiedKey>(COPIED_FEEDBACK_MS);

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
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {rows.map((row) => {
          const selected = row.hub.id === selectedHubId;
          return (
            // The whole card is the pointer target; the title button is the
            // keyboard and screen-reader one, so the card needs no tab stop of
            // its own (DESIGN.md §6c, phone cards).
            <li
              key={row.hub.id}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelectHub(row.hub.id)}
              className={cx(
                'min-w-0 cursor-pointer rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm',
                rowInteractiveClassName,
                selected && selectedRowClassName
              )}
            >
              <p className="truncate text-sm font-semibold">
                <button
                  type="button"
                  aria-label={t('market.appraisal.appraiseAtHub', { hub: row.hub.systemName })}
                  aria-pressed={selected}
                  className={cx(
                    'max-w-full truncate rounded-xs text-left text-accent',
                    focusRingClassName
                  )}
                >
                  {row.hub.systemName}
                </button>
              </p>
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
              {row.unreachable && (
                <p className="mt-2 text-[0.6875rem] text-text-dim">{pricesUnavailableLabel}</p>
              )}
            </li>
          );
        })}
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
