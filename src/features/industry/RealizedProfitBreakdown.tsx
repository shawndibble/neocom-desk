import { useTranslation } from 'react-i18next';
import { Modal, ValueList, ValueRow } from '@/components/ui';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { RealizedProfitResult } from '@/engine/industry/realizedProfit';
import type { ResolvedStandings } from '@/engine/market/standings';
import { formatIsk } from '@/lib/isk';
import { Section } from './CalculationBreakdown';
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

  const deduction = (amount: number) => (amount > 0 ? `−${formatIsk(amount)}` : formatIsk(0));
  const strong = (text: string) => <span className="font-semibold">{text}</span>;

  return (
    <Modal open={open} onClose={onClose} title={t('industry.realizedBreakdown.title')}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-text-dim">
          {t('industry.realizedBreakdown.intro')}
        </p>

        <ValueList>
          <ValueRow
            label={t('industry.realizedBreakdown.grossRevenue')}
            value={formatIsk(profit.grossRevenue)}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.salesTaxLabel')}
            note={formatPercent(taxPct)}
            value={deduction(profit.salesTax)}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.brokerFeeLabel')}
            note={formatPercent(brokerPct)}
            value={deduction(profit.brokerFee)}
          />
          <ValueRow
            label={strong(t('industry.realizedBreakdown.netRevenue'))}
            value={strong(formatIsk(profit.netRevenue))}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.totalCost')}
            value={deduction(profit.totalCost)}
          />
          <ValueRow
            label={strong(t('industry.realizedBreakdown.profit'))}
            value={strong(formatIsk(profit.profit))}
            tone={profit.profit < 0 ? 'danger' : 'default'}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.margin')}
            note={
              profit.marginPct === null ? t('industry.realizedBreakdown.marginUnknown') : undefined
            }
            value={profit.marginPct === null ? '—' : formatPercent(profit.marginPct)}
          />
          {lostCost !== 0 && (
            <ValueRow
              label={t('industry.realizedBreakdown.lostCost')}
              note={t('industry.realizedBreakdown.lostCostNote')}
              value={formatIsk(-lostCost)}
            />
          )}
        </ValueList>

        <Section title={t('industry.realizedBreakdown.notesTitle')}>
          <p className="text-text-dim">{t('industry.realizedBreakdown.revenue')}</p>
          <p className="text-text-dim">
            {t('industry.realizedBreakdown.salesTax', {
              accounting: accountingLevel,
              pct: formatPercent(taxPct),
            })}
          </p>
          <p className="text-text-dim">
            {t('industry.realizedBreakdown.brokerFee', {
              broker: brokerRelationsLevel,
              pct: formatPercent(brokerPct),
              factionStanding: standing?.factionStanding ?? 0,
              corpStanding: standing?.corpStanding ?? 0,
            })}
          </p>
          {standing?.feeDiscountFactor !== undefined && (
            <p className="text-text-dim">
              {t('industry.realizedBreakdown.feeDiscount', {
                pct: formatPercent((1 - standing.feeDiscountFactor) * 100),
              })}
            </p>
          )}
        </Section>
      </div>
    </Modal>
  );
}
