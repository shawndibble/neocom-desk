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
import type { PlanVerdict } from './planPricing';
import { ResultsSummary } from './ResultsSummary';
import type { usePlanMaterials } from './usePlanMaterials';

interface PlanCostsPanelProps {
  result: BuildResult;
  expanded: boolean;
  onToggle: () => void;
  onShowBreakdown: () => void;
  pricesReady: boolean;
  pricesUnreachable: boolean;
  pricesLoading: boolean;
  snapshot: MarketSnapshot | null;
  heroFigures: PlanVerdict['figures'];
  heroBasis: ProfitBasis | null;
  sellNow: PlanVerdict['sellNow'];
  productName: string;
  productTypeID: number | null;
  productUnitPrice: number | null;
  productPriceCapped: boolean;
  productQuantity: number | null;
  buildSystem: { id: number; name: string } | null;
  hub: TradeHub;
  activity: IndustryActivity;
  ownedSale: PlanVerdict['ownedSale'];
  saleBasis: LiquidationBasis;
  onSaleBasisChange: (basis: LiquidationBasis) => void;
  cheaperNearby: ReactNode;
  planSeconds: number | undefined;
  totalVolume: ReturnType<typeof usePlanMaterials>['materialVolume'];
}

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
  productPriceCapped,
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
        productPriceCapped={productPriceCapped}
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
