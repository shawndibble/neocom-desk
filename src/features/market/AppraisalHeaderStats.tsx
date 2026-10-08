/**
 * The Appraisal result's header: eight-plus figures in three titled groups
 * (You get / It's worth / Cargo), one emphasised figure each. Nothing dropped.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, StatChip } from '@/components/ui';
import type { AppraisalNetTotals, AppraisalTotals } from '@/engine/market/appraisal';
import { iskToneClass } from '@/features/character/format';
import { AppraisalVolumeChip } from './AppraisalVolumeChip';
import { FullIskTotal } from './FullIskTotal';

interface AppraisalHeaderStatsProps {
  totals: AppraisalTotals;
  net: AppraisalNetTotals | null;
  itemCount: number;
  showRefine: boolean;
  showCheapest: boolean;
  implantBonusPct: number;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-0.5 rounded-xs border border-line bg-panel-2 px-2.5 py-1.5"
    >
      <h3 className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
      </h3>
      {/* One readout per line, label left and value right (the mockup's shape), so a
          wide value has the column to itself and can't run into a neighbour group. */}
      <div className="flex min-w-0 flex-col [&>span]:w-full [&>span>span:last-child]:ml-auto">
        {children}
      </div>
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
}: AppraisalHeaderStatsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
      {net && (
        <Group title={t('market.appraisal.groupYouGet')}>
          <StatChip
            label={t('market.appraisal.instantNet')}
            className="font-semibold"
            value={
              <span className={iskToneClass(net.instantNet)}>
                <IskAmount value={net.instantNet} decimals={0} />
              </span>
            }
            tooltip={t('market.appraisal.instantNetHelp', { tax: net.salesTaxPct.toFixed(2) })}
          />
          <StatChip
            label={t('market.appraisal.listNet')}
            value={
              <span className={iskToneClass(net.listNet)}>
                <IskAmount value={net.listNet} decimals={0} />
              </span>
            }
            tooltip={t('market.appraisal.listNetHelp', {
              tax: net.salesTaxPct.toFixed(2),
              broker: net.brokerFeePct.toFixed(2),
            })}
          />
        </Group>
      )}
      <Group title={t('market.appraisal.groupWorth')}>
        <StatChip
          label={t('market.appraisal.sellTotal')}
          value={<FullIskTotal value={totals.sell} />}
          tone="accent"
          className="font-semibold"
          tooltip={t('market.appraisal.sellTotalHelp')}
        />
        <StatChip
          label={t('market.appraisal.buyTotal')}
          value={<FullIskTotal value={totals.buy} />}
          tooltip={t('market.appraisal.buyTotalHelp')}
        />
        <StatChip
          label={t('market.appraisal.spread')}
          value={
            <span className={iskToneClass(totals.spread)}>
              <IskAmount value={totals.spread} decimals={0} />
            </span>
          }
        />
        {showCheapest && (
          <StatChip
            label={t('market.appraisal.cheapestBuy')}
            value={<IskAmount value={totals.cheapestBuy} decimals={0} />}
            tone="accent"
            tooltip={t('market.appraisal.cheapestBuyHelp')}
          />
        )}
      </Group>
      <Group title={t('market.appraisal.groupCargo')}>
        <AppraisalVolumeChip totals={totals} />
        <StatChip label={t('market.appraisal.items')} value={itemCount} />
        {showRefine && (
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
      </Group>
    </div>
  );
}
