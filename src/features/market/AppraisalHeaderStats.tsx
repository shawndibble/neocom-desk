/**
 * The Appraisal result's header: three plain numbers, Buy, Split and Sell,
 * each with the figure it nets to beneath it (Buy → selling into the buy
 * orders now, Sell → listing it yourself, Split → the spread), then one line of
 * cargo facts. Nothing dropped.
 */
import { fixed2 } from '@/lib/fixedFormat';
import type { ReactNode } from 'react';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { IskAmount, StatChip, StatChips } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import type { AppraisalNetTotals, AppraisalTotals } from '@/engine/market/appraisal';
import { iskToneClass } from '@/features/character/format';
import { AppraisalVolumeChip } from './AppraisalVolumeChip';
import { RefineChipValue } from './RefineChipValue';

/** How long the "copied" bubble stays on the card. */
const COPIED_FEEDBACK_MS = 2000;

interface AppraisalHeaderStatsProps {
  totals: AppraisalTotals;
  net: AppraisalNetTotals | null;
  itemCount: number;
  showRefine: boolean;
  showCheapest: boolean;
  implantBonusPct: number;
  /** The total efficiency the Refine figure was worked out at ("68.3%"), shown beside it so the default is never silent. */
  refineEfficiency?: string | null;
  /** Opens the refine breakdown on the whole pile; absent, the chip has no control. */
  onOpenRefine?: () => void;
  /**
   * The price source could not be reached: the price-derived groups show a
   * placeholder instead of 0 ISK totals. Volume and item count need no price.
   */
  pricesUnavailable?: boolean;
}

/**
 * One of the three headline numbers: label, figure, what it is, and the figure
 * it nets to. The whole card is one copy control: the title is the button and
 * its `::after` stretches over the card, so a press anywhere copies the full
 * digits and the bubble says so on the card.
 */
function PriceCell({
  title,
  hint,
  value,
  emphasis = false,
  below,
}: {
  title: string;
  hint: string;
  value: number;
  emphasis?: boolean;
  below?: ReactNode;
}) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback(COPIED_FEEDBACK_MS);
  const full = formatIsk(value, 0);
  const short = formatIskCompact(value);

  async function copy() {
    try {
      await writeToClipboard(full);
    } catch {
      return;
    }
    flash();
  }

  return (
    <section
      aria-label={title}
      className={cx(
        'relative flex min-w-0 flex-col gap-0.5 rounded-xs border border-line bg-panel px-2.5 py-2 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-accent',
        rowInteractiveClassName
      )}
    >
      <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={t('market.appraisal.copyCardTotal', { title, short, full })}
          className="cursor-copy rounded-xs uppercase tracking-widest after:absolute after:inset-0 focus-visible:outline-none"
        >
          {title}
        </button>
      </h3>
      <span
        className={`text-xl font-semibold tabular-nums ${emphasis ? 'text-accent' : 'text-text'}`}
      >
        {short}
      </span>
      <span className="mb-1 text-[0.6875rem] text-text-dim">{hint}</span>
      {below && (
        <div className="mt-auto border-t border-line pt-1 text-xs text-text-dim">{below}</div>
      )}
      {/* Mounted only while showing, so three cards aren't three empty live regions. */}
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-text normal-case shadow-md"
        >
          {t('market.appraisal.copiedAmount', { amount: t('common.iskExact', { amount: full }) })}
        </span>
      )}
    </section>
  );
}

export function AppraisalHeaderStats({
  totals,
  net,
  itemCount,
  showRefine,
  showCheapest,
  implantBonusPct,
  refineEfficiency = null,
  onOpenRefine,
  pricesUnavailable = false,
}: AppraisalHeaderStatsProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const facts = (
    <StatChips>
      <AppraisalVolumeChip totals={totals} />
      <StatChip label={t('market.appraisal.items')} value={itemCount} />
      {!pricesUnavailable && showRefine && (
        <StatChip
          label={t('market.appraisal.refineTotal')}
          value={
            <RefineChipValue
              amount={<IskAmount value={totals.refine} decimals={0} />}
              efficiency={refineEfficiency}
              onOpen={onOpenRefine}
            />
          }
          tooltip={
            implantBonusPct > 0
              ? `${t('market.appraisal.refineTotalHelp')} ${t('market.appraisal.refineImplantHint', { pct: implantBonusPct })}`
              : t('market.appraisal.refineTotalHelp')
          }
        />
      )}
      {!pricesUnavailable && showCheapest && (
        <StatChip
          label={t('market.appraisal.cheapestBuy')}
          value={<IskAmount value={totals.cheapestBuy} decimals={0} />}
          tone="accent"
          tooltip={t('market.appraisal.cheapestBuyHelp')}
        />
      )}
    </StatChips>
  );
  if (pricesUnavailable) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-dim">{pricesUnavailableLabel}</p>
        {facts}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <PriceCell
          title={t('market.appraisal.summaryBuy')}
          hint={t('market.appraisal.summaryBuyHint')}
          value={totals.buy}
          below={
            net && (
              <>
                <HintText
                  className="relative"
                  content={t('market.appraisal.instantNetHelp', {
                    tax: fixed2(net.salesTaxPct),
                  })}
                >
                  {t('market.appraisal.summaryBuyNet')}
                </HintText>{' '}
                <b className={iskToneClass(net.instantNet)}>
                  <IskAmount value={net.instantNet} decimals={0} />
                </b>
              </>
            )
          }
        />
        <PriceCell
          title={t('market.appraisal.summarySplit')}
          hint={t('market.appraisal.summarySplitHint')}
          value={(totals.buy + totals.sell) / 2}
          emphasis
          below={
            <>
              {t('market.appraisal.spread')}{' '}
              <b className={iskToneClass(totals.spread)}>
                <IskAmount value={totals.spread} decimals={0} />
              </b>
            </>
          }
        />
        <PriceCell
          title={t('market.appraisal.summarySell')}
          hint={t('market.appraisal.summarySellHint')}
          value={totals.sell}
          below={
            net && (
              <>
                <HintText
                  className="relative"
                  content={t('market.appraisal.listNetHelp', {
                    tax: fixed2(net.salesTaxPct),
                    broker: fixed2(net.brokerFeePct),
                  })}
                >
                  {t('market.appraisal.summarySellNet')}
                </HintText>{' '}
                <b className={iskToneClass(net.listNet)}>
                  <IskAmount value={net.listNet} decimals={0} />
                </b>
              </>
            )
          }
        />
      </div>
      {facts}
    </div>
  );
}
