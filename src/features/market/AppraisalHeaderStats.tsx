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
import { IskAmount, StatChip, StatChips } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import type { AppraisalNetTotals, AppraisalTotals } from '@/engine/market/appraisal';
import { iskToneClass } from '@/features/character/format';
import { AppraisalVolumeChip } from './AppraisalVolumeChip';
import { FullIskTotal } from './FullIskTotal';
import { RefiningSetupChips } from '@/features/refining/RefiningSetupChips';

interface AppraisalHeaderStatsProps {
  totals: AppraisalTotals;
  net: AppraisalNetTotals | null;
  itemCount: number;
  showRefine: boolean;
  showCheapest: boolean;
  implantBonusPct: number;
  /**
   * The price source could not be reached: the price-derived groups show a
   * placeholder instead of 0 ISK totals. Volume and item count need no price.
   */
  pricesUnavailable?: boolean;
}

/** One of the three headline numbers: label, figure, what it is, and the figure it nets to. */
function PriceCell({
  title,
  hint,
  emphasis = false,
  children,
  below,
}: {
  title: string;
  hint: string;
  emphasis?: boolean;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-0.5 rounded-xs border border-line bg-panel-2 px-2.5 py-2"
    >
      <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
      </h3>
      <span
        className={`text-xl font-semibold tabular-nums ${emphasis ? 'text-accent' : 'text-text'}`}
      >
        {children}
      </span>
      <span className="mb-1 text-[0.6875rem] text-text-dim">{hint}</span>
      {below && (
        <div className="mt-auto border-t border-line pt-1 text-xs text-text-dim">{below}</div>
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
          value={<IskAmount value={totals.refine} decimals={0} />}
          tooltip={
            implantBonusPct > 0
              ? `${t('market.appraisal.refineTotalHelp')} ${t('market.appraisal.refineImplantHint', { pct: implantBonusPct })}`
              : t('market.appraisal.refineTotalHelp')
          }
        />
      )}
      {!pricesUnavailable && showRefine && <RefiningSetupChips />}
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
          below={
            net && (
              <>
                <HintText
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
        >
          <FullIskTotal value={totals.buy} compact />
        </PriceCell>
        <PriceCell
          title={t('market.appraisal.summarySplit')}
          hint={t('market.appraisal.summarySplitHint')}
          emphasis
          below={
            <>
              {t('market.appraisal.spread')}{' '}
              <b className={iskToneClass(totals.spread)}>
                <IskAmount value={totals.spread} decimals={0} />
              </b>
            </>
          }
        >
          <FullIskTotal value={(totals.buy + totals.sell) / 2} compact />
        </PriceCell>
        <PriceCell
          title={t('market.appraisal.summarySell')}
          hint={t('market.appraisal.summarySellHint')}
          below={
            net && (
              <>
                <HintText
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
        >
          <FullIskTotal value={totals.sell} compact />
        </PriceCell>
      </div>
      {facts}
    </div>
  );
}
