import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { RealizedProfitResult } from '@/engine/industry/realizedProfit';
import type { ResolvedStandings } from '@/engine/market/standings';
import { formatIsk } from '@/lib/isk';
import { Formula, Section } from './CalculationBreakdown';
import { formatPercent } from './format';

interface RealizedProfitBreakdownProps {
  open: boolean;
  onClose: () => void;
  profit: RealizedProfitResult;
  accountingLevel: number;
  brokerRelationsLevel: number;
  standing?: ResolvedStandings;
  lostCost?: number;
}

export function RealizedProfitBreakdown({
  open,
  onClose,
  profit,
  accountingLevel,
  brokerRelationsLevel,
  standing,
  lostCost = 0,
}: RealizedProfitBreakdownProps) {
  const { t } = useTranslation();
  const taxPct = salesTaxPct(accountingLevel, standing?.feeDiscountFactor);
  const brokerPct = brokerFeePct(
    brokerRelationsLevel,
    standing?.factionStanding,
    standing?.corpStanding,
    standing?.safetyTaxPct,
    standing?.feeDiscountFactor
  );

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
          {standing?.feeDiscountFactor !== undefined && (
            <p>
              {t('industry.realizedBreakdown.feeDiscount', {
                pct: formatPercent((1 - standing.feeDiscountFactor) * 100),
              })}
            </p>
          )}
          <Formula>
            {t('industry.realizedBreakdown.salesTaxFormula', {
              tax: formatIsk(profit.salesTax),
            })}
          </Formula>
          <p>
            {t('industry.realizedBreakdown.brokerFee', {
              broker: brokerRelationsLevel,
              pct: formatPercent(brokerPct),
              factionStanding: standing?.factionStanding ?? 0,
              corpStanding: standing?.corpStanding ?? 0,
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
          {lostCost !== 0 && (
            <p>{t('industry.realizedBreakdown.lostCost', { loss: formatIsk(-lostCost) })}</p>
          )}
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
