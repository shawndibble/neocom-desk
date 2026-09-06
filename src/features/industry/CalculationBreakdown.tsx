import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { BuildResult, MaterialPriceBasis } from '@/engine/industry/types';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatCostIndex, formatPercent } from './format';

/**
 * Everything the breakdown needs that a `BuildResult` does not carry: the
 * inputs the numbers were computed from. Passed as one object rather than a
 * dozen props — `ResultsSummary` already takes nine, and every member here
 * exists only to be quoted back at the reader.
 */
export interface BreakdownContext {
  /** Trade Hub the plan prices against, e.g. "Jita". */
  hubName: string;
  /** Which side of the hub's order book materials are costed at. */
  materialPriceBasis: MaterialPriceBasis;
  /** ME the job ran at; ignored for a reaction, which has none. */
  me: number;
  isReaction: boolean;
  accountingLevel: number;
  brokerRelationsLevel: number;
  systemCostIndex: number | null;
  /** Build System the cost index was read for. */
  costIndexSystemName: string;
  productName: string;
  /** Units the job yields; null when the blueprint has no product. */
  productQuantity: number | null;
  /** Product's lowest hub sell per unit; null when unpriced at this hub. */
  productUnitPrice: number | null;
}

interface CalculationBreakdownProps {
  open: boolean;
  onClose: () => void;
  result: BuildResult;
  context: BreakdownContext;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
      </h3>
      <div className="space-y-1.5 text-xs leading-relaxed text-text">{children}</div>
    </section>
  );
}

/** A worked line: the formula with this plan's own numbers substituted in. */
function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="overflow-x-auto rounded-xs border border-line bg-panel-2 px-2 py-1 font-mono text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
      {children}
    </p>
  );
}

/**
 * The long-form answer to "where does each of these numbers come from?" —
 * one section per line of `ResultsSummary`, each stating the rule in plain
 * language and then the same rule with this plan's live values substituted
 * in. The per-row tooltips stay the shallow layer; this is the deep one.
 *
 * Deliberately reads the fee percentages from `engine/industry/fees` rather
 * than from new `BuildResult` fields: same source the result itself was
 * computed from, so the explanation cannot drift from the arithmetic.
 */
export function CalculationBreakdown({
  open,
  onClose,
  result,
  context,
}: CalculationBreakdownProps) {
  const { t } = useTranslation();
  const taxPct = salesTaxPct(context.accountingLevel);
  const brokerPct = brokerFeePct(context.brokerRelationsLevel);
  const feePct = formatPercent(taxPct + brokerPct);

  return (
    <Modal open={open} onClose={onClose} title={t('industry.breakdown.title')}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-text-dim">
          {t('industry.breakdown.intro', { hub: context.hubName })}
        </p>

        <Section title={t('industry.breakdown.pricesTitle')}>
          <p>
            {context.materialPriceBasis === 'buy'
              ? t('industry.breakdown.pricesMaterialsBuy', { hub: context.hubName })
              : t('industry.breakdown.pricesMaterialsSell', { hub: context.hubName })}
          </p>
          <p>{t('industry.breakdown.pricesOre')}</p>
          <p>{t('industry.breakdown.pricesOwned')}</p>
          <p>{t('industry.breakdown.pricesBuilt')}</p>
          <p>
            {t('industry.breakdown.pricesProduct', {
              product: context.productName,
              hub: context.hubName,
            })}
          </p>
        </Section>

        <Section title={t('industry.breakdown.materialsTitle')}>
          <p>
            {context.isReaction
              ? t('industry.breakdown.materialsReaction')
              : t('industry.breakdown.materials', { me: context.me })}
          </p>
          <Formula>
            {t('industry.breakdown.materialsFormula', {
              value: formatIsk(result.materialCost),
            })}
          </Formula>
        </Section>

        <Section title={t('industry.breakdown.jobFeeTitle')}>
          <p>
            {t('industry.breakdown.jobFee', {
              system: context.costIndexSystemName,
              index:
                context.systemCostIndex === null
                  ? t('common.unknown')
                  : formatCostIndex(context.systemCostIndex),
            })}
          </p>
          <Formula>
            {t('industry.breakdown.jobFeeFormula', {
              eiv: formatIsk(result.jobFee.eiv),
              costIndexFee: formatIsk(result.jobFee.grossCost),
              scc: formatIsk(result.jobFee.sccSurcharge),
              facilityTax: formatIsk(result.jobFee.facilityTax),
              total: formatIsk(result.jobFee.total),
            })}
          </Formula>
          <Formula>
            {t('industry.breakdown.totalCostFormula', {
              materials: formatIsk(result.materialCost),
              fee: formatIsk(result.jobFee.total),
              total: formatIsk(result.totalCost),
            })}
          </Formula>
        </Section>

        {result.revenue !== null &&
          result.salesTax !== null &&
          result.brokerFee !== null &&
          context.productQuantity !== null &&
          context.productUnitPrice !== null && (
            <Section title={t('industry.breakdown.revenueTitle')}>
              <p>{t('industry.breakdown.revenue', { hub: context.hubName })}</p>
              <Formula>
                {t('industry.breakdown.revenueFormula', {
                  quantity: context.productQuantity.toLocaleString(),
                  unitPrice: formatIsk(context.productUnitPrice),
                  revenue: formatIsk(result.revenue),
                })}
              </Formula>
              <p>{t('industry.breakdown.revenueAssumption')}</p>
              <p>
                {t('industry.breakdown.fees', {
                  accounting: context.accountingLevel,
                  broker: context.brokerRelationsLevel,
                })}
              </p>
              <Formula>
                {t('industry.breakdown.feesFormula', {
                  taxPct: formatPercent(taxPct),
                  tax: formatIsk(result.salesTax),
                  brokerPct: formatPercent(brokerPct),
                  broker: formatIsk(result.brokerFee),
                })}
              </Formula>
            </Section>
          )}

        <Section title={t('industry.breakdown.profitTitle')}>
          <p>{t('industry.breakdown.profitNet')}</p>
          <p>{t('industry.breakdown.profitGross')}</p>
          <p>
            {t('industry.breakdown.profitIskPerHour', {
              time: formatDuration(result.seconds),
            })}
          </p>
        </Section>

        {result.breakEvenPrice !== null && context.productQuantity !== null && (
          <Section title={t('industry.breakdown.breakEvenTitle')}>
            <p>{t('industry.breakdown.breakEven')}</p>
            <Formula>
              {t('industry.breakdown.breakEvenFormula', {
                total: formatIsk(result.totalCost),
                quantity: context.productQuantity.toLocaleString(),
                feePct,
                breakEven: formatIsk(result.breakEvenPrice),
              })}
            </Formula>
            <p>{t('industry.breakdown.breakEvenFloor')}</p>
          </Section>
        )}

        <Section title={t('industry.breakdown.verdictsTitle')}>
          <p>{t('industry.breakdown.verdictAcquisition', { product: context.productName })}</p>
          <p>{t('industry.breakdown.verdictSale')}</p>
        </Section>
      </div>
    </Modal>
  );
}
