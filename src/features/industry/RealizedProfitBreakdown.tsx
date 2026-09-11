import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { RealizedProfitResult } from '@/engine/industry/realizedProfit';
import { formatIsk } from '@/lib/isk';
import { Formula, Section } from './CalculationBreakdown';
import { formatPercent } from './format';

interface RealizedProfitBreakdownProps {
  open: boolean;
  onClose: () => void;
  profit: RealizedProfitResult;
  accountingLevel: number;
  brokerRelationsLevel: number;
}

/**
 * The realized counterpart to `CalculationBreakdown` (issue #824): restates a
 * logged Production Run's net profit as a rule plus that rule's own
 * confirmed-sale values, the same "rule then substituted numbers" layout
 * `CalculationBreakdown` uses for a Build Plan's forward estimate. A smaller
 * sibling rather than sharing that component outright — a run has five
 * figures to restate where the forward estimate also carries price bases,
 * job fee and material cost.
 */
export function RealizedProfitBreakdown({
  open,
  onClose,
  profit,
  accountingLevel,
  brokerRelationsLevel,
}: RealizedProfitBreakdownProps) {
  const { t } = useTranslation();
  const taxPct = salesTaxPct(accountingLevel);
  const brokerPct = brokerFeePct(brokerRelationsLevel);

  return (
    <Modal open={open} onClose={onClose} title={t('industry.realizedBreakdown.title')}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-text-dim">
          {t('industry.realizedBreakdown.intro')}
        </p>

        <Section title={t('industry.realizedBreakdown.revenueTitle')}>
          <p>{t('industry.realizedBreakdown.revenue')}</p>
          <Formula>
            {t('industry.realizedBreakdown.revenueFormula', {
              revenue: formatIsk(profit.grossRevenue),
            })}
          </Formula>
        </Section>

        <Section title={t('industry.realizedBreakdown.feesTitle')}>
          <p>
            {t('industry.realizedBreakdown.salesTax', {
              accounting: accountingLevel,
              pct: formatPercent(taxPct),
            })}
          </p>
          <Formula>
            {t('industry.realizedBreakdown.salesTaxFormula', {
              tax: formatIsk(profit.salesTax),
            })}
          </Formula>
          <p>
            {t('industry.realizedBreakdown.brokerFee', {
              broker: brokerRelationsLevel,
              pct: formatPercent(brokerPct),
            })}
          </p>
          <Formula>
            {t('industry.realizedBreakdown.brokerFeeFormula', {
              broker: formatIsk(profit.brokerFee),
            })}
          </Formula>
          <Formula>
            {t('industry.realizedBreakdown.netRevenueFormula', {
              gross: formatIsk(profit.grossRevenue),
              tax: formatIsk(profit.salesTax),
              broker: formatIsk(profit.brokerFee),
              net: formatIsk(profit.netRevenue),
            })}
          </Formula>
        </Section>

        <Section title={t('industry.realizedBreakdown.profitTitle')}>
          <Formula>
            {t('industry.realizedBreakdown.profitFormula', {
              net: formatIsk(profit.netRevenue),
              cost: formatIsk(profit.totalCost),
              profit: formatIsk(profit.profit),
            })}
          </Formula>
          <p>
            {profit.marginPct === null
              ? t('industry.realizedBreakdown.marginUnknown')
              : t('industry.realizedBreakdown.margin', {
                  margin: formatPercent(profit.marginPct),
                })}
          </p>
        </Section>
      </div>
    </Modal>
  );
}
