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

const bold = (text: string) => <span className="font-semibold">{text}</span>;

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

  const margin = profit.marginPct;

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
            value={formatIsk(-profit.salesTax)}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.brokerFeeLabel')}
            note={formatPercent(brokerPct)}
            value={formatIsk(-profit.brokerFee)}
          />
          <ValueRow
            label={bold(t('industry.realizedBreakdown.netRevenue'))}
            value={bold(formatIsk(profit.netRevenue))}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.totalCost')}
            value={formatIsk(-profit.totalCost)}
          />
          <ValueRow
            label={bold(t('industry.realizedBreakdown.profit'))}
            value={bold(formatIsk(profit.profit))}
            tone={profit.profit < 0 ? 'danger' : 'default'}
          />
          <ValueRow
            label={t('industry.realizedBreakdown.margin')}
            note={margin === null ? t('industry.realizedBreakdown.marginUnknown') : undefined}
            value={margin === null ? '—' : formatPercent(margin)}
          />
          {lostCost !== 0 && (
            <ValueRow
              label={t('industry.realizedBreakdown.lostCost')}
              note={t('industry.realizedBreakdown.lostCostNote')}
              value={formatIsk(lostCost)}
            />
          )}
        </ValueList>

        <Section title={t('industry.realizedBreakdown.notesTitle')}>
          <div className="space-y-1.5 text-text-dim">
            <p>{t('industry.realizedBreakdown.revenue')}</p>
            <p>
              {t('industry.realizedBreakdown.salesTax', {
                accounting: accountingLevel,
                pct: formatPercent(taxPct),
              })}
            </p>
            <p>
              {t('industry.realizedBreakdown.brokerFee', {
                broker: brokerRelationsLevel,
                pct: formatPercent(brokerPct),
                factionStanding: standing?.factionStanding ?? 0,
                corpStanding: standing?.corpStanding ?? 0,
              })}
            </p>
            {standing?.feeDiscountFactor !== undefined && (
              <p>
                {t('industry.realizedBreakdown.feeDiscount', {
                  pct: formatPercent((1 - standing.feeDiscountFactor) * 100),
                })}
              </p>
            )}
          </div>
        </Section>
      </div>
    </Modal>
  );
}
