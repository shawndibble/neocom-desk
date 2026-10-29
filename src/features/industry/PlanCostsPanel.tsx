import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';
import type { MarketSnapshot } from './marketData';
import type { OwnedSale, planHeroFigures } from './planHeroFigures';
import { ResultsSummary } from './ResultsSummary';
import type { usePlanMaterials } from './usePlanMaterials';

type HeroFigures = ReturnType<typeof planHeroFigures>;

interface PlanCostsPanelProps {
  result: BuildResult;
  expanded: boolean;
  onToggle: () => void;
  onShowBreakdown: () => void;
  pricesReady: boolean;
  pricesUnreachable: boolean;
  pricesLoading: boolean;
  snapshot: MarketSnapshot | null;
  heroFigures: HeroFigures['heroFigures'];
  heroBasis: ProfitBasis | null;
  sellNow: HeroFigures['sellNow'];
  productName: string;
  productTypeID: number | null;
  productUnitPrice: number | null;
  productQuantity: number | null;
  buildSystem: { id: number; name: string } | null;
  hub: TradeHub;
  activity: IndustryActivity;
  ownedSale: OwnedSale | null;
  saleBasis: LiquidationBasis;
  onSaleBasisChange: (basis: LiquidationBasis) => void;
  cheaperNearby: ReactNode;
  planSeconds: number | undefined;
  totalVolume: ReturnType<typeof usePlanMaterials>['materialVolume'];
}

/** The Costs & revenue ledger: folded, the verdict in three numbers; open, the full `ResultsSummary`. */
export function PlanCostsPanel({
  result,
  expanded,
  onToggle,
  onShowBreakdown,
  pricesReady,
  pricesUnreachable,
  pricesLoading,
  snapshot,
  heroFigures,
  heroBasis,
  sellNow,
  productName,
  productTypeID,
  productUnitPrice,
  productQuantity,
  buildSystem,
  hub,
  activity,
  ownedSale,
  saleBasis,
  onSaleBasisChange,
  cheaperNearby,
  planSeconds,
  totalVolume,
}: PlanCostsPanelProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  return (
    <CollapsiblePanel
      title={t('industry.costsAndRevenue')}
      /*
       * Folded, this panel is the whole verdict in three numbers: what
       * the job costs, what it brings in, and the difference. In the
       * body rather than beside the title — three figures crowd a title
       * that already sits next to two header buttons, and wrapped under
       * them. Total cost alone, which the header used to carry open or
       * closed, answered half the question and repeated a number the
       * open table states anyway.
       */
      /*
       * These three figures stay on `formatIsk` at full precision,
       * deliberately (issue #948): collapsed or open, this panel is the
       * Costs & revenue ledger, and the same number must not read
       * "1.3B" folded and "1,284,500,000" unfolded. The shorthand read
       * of profit lives in `PlanVerdictHero` above.
       */
      collapsedSummary={
        pricesReady ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-text-dim">{t('industry.totalCost')}</dt>
            <dd className="text-right tabular-nums">{formatIsk(result.totalCost)}</dd>
            {result.revenue !== null && (
              <>
                <dt className="text-text-dim">{t('industry.revenue')}</dt>
                <dd className="text-right tabular-nums">{formatIsk(result.revenue)}</dd>
              </>
            )}
            {heroFigures?.profit != null && (
              <>
                {/*
                  The rule is on the row itself rather than an element
                  between the rows: a bare separator child of a `<dl>` is
                  neither a term nor a definition, and a border-top on
                  both cells of the last pair draws the same line across
                  the full width without inventing one.

                  Green or red on the figure, and it is the only coloured
                  thing here: sign is what a reader is actually scanning
                  for, and the `-` in front of it carries the same meaning
                  for anyone who cannot see the difference
                  (docs/DESIGN.md §7).
                */}
                <dt className="border-t border-line pt-1 text-text-dim">{t('industry.profit')}</dt>
                <dd
                  className={cx(
                    'border-t border-line pt-1 text-right tabular-nums',
                    heroFigures.profit < 0 ? 'text-isk-neg' : 'text-isk-pos'
                  )}
                >
                  {formatIsk(heroFigures.profit)}
                </dd>
              </>
            )}
          </dl>
        ) : pricesUnreachable ? (
          <p className="text-xs text-text-dim">{pricesUnavailableLabel}</p>
        ) : null
      }
      expanded={expanded}
      onToggle={onToggle}
      labels={{ show: t('industry.showDetails'), hide: t('industry.hideDetails') }}
      actions={
        <IconButton
          size="sm"
          icon={<Icon.Info />}
          label={t('industry.breakdownTrigger')}
          onClick={onShowBreakdown}
        />
      }
    >
      <ResultsSummary
        result={result}
        pricesReady={pricesReady}
        pricesUnreachable={pricesUnreachable}
        pricesLoading={pricesLoading}
        systemCostIndex={snapshot?.systemCostIndex ?? null}
        productName={productName}
        productTypeID={productTypeID}
        productUnitPrice={productUnitPrice}
        productQuantity={productQuantity}
        costIndexSystemName={buildSystem?.name ?? hub.systemName}
        costIndexSystemId={buildSystem?.id}
        activity={activity}
        ownedSale={ownedSale}
        saleBasis={saleBasis}
        onSaleBasisChange={onSaleBasisChange}
        profitBasis={heroBasis}
        profit={heroFigures?.profit ?? null}
        sellNow={sellNow}
        cheaperNearby={cheaperNearby}
        hubName={hub.systemName}
        planSeconds={planSeconds}
        totalVolume={totalVolume}
      />
    </CollapsiblePanel>
  );
}
