/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Run market scan", per the ticket.
 */
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  InfoTooltip,
  IskAmount,
  Panel,
  Spinner,
  StatChip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import { iskToneClass } from '@/features/character/format';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { MarketWideTreeMap } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';

const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

interface MarketWideOpportunitiesPanelProps {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  onStartPlan: (entry: BlueprintCatalogEntry) => void;
}

export function MarketWideOpportunitiesPanel({
  hub,
  trees,
  catalog,
  onStartPlan,
}: MarketWideOpportunitiesPanelProps) {
  const { t } = useTranslation();
  const { rows, loading, hasRun, run } = useMarketWideOpportunities({ hub, trees, catalog });

  const columns: DataTableColumn<MarketWideResultRow>[] = [
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: (row) => row.productName,
      render: (row) => row.productName,
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.iskPerHour ?? undefined,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      // Tap, not long press: the ranking's figures are inert — the row's only
      // action is the button in its last cell.
      render: (row) =>
        row.iskPerHour === null ? (
          t('common.unknown')
        ) : (
          <IskAmount value={row.iskPerHour} revealOn="tap" decimals={0} />
        ),
    },
    {
      id: 'buildCost',
      header: t('industry.buildCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.buildCost,
      render: (row) => <IskAmount value={row.buildCost} revealOn="tap" decimals={0} />,
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      render: (row) => (
        <StatChip
          label={t('industry.opportunitiesOrderDepthLabel')}
          value={t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
          tone={ORDER_DEPTH_TONE[row.orderDepth]}
        />
      ),
    },
    {
      id: 'action',
      header: '',
      render: (row) => (
        <Button
          size="sm"
          onClick={() => {
            const entry = catalog?.byProductTypeID.get(row.productTypeID);
            if (entry) onStartPlan(entry);
          }}
        >
          {t('industry.marketOpportunitiesStartPlan')}
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title={t('industry.marketOpportunitiesTitle')}
      meta={
        <InfoTooltip
          label={t('industry.marketOpportunitiesTitle')}
          content={t('industry.marketOpportunitiesLiquidityTooltip')}
        />
      }
      actions={
        <Button size="sm" onClick={run} disabled={loading || !trees || !catalog}>
          {loading
            ? t('industry.marketOpportunitiesScanning')
            : t('industry.marketOpportunitiesRunScan')}
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('industry.marketOpportunitiesScanning')} />
        </div>
      ) : !hasRun ? (
        <EmptyState
          title={t('industry.marketOpportunitiesEmptyTitle')}
          hint={t('industry.marketOpportunitiesEmptyHint')}
          className="py-8"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('industry.marketOpportunitiesNoResultsTitle')}
          hint={t('industry.marketOpportunitiesNoResultsHint')}
          className="py-8"
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.productTypeID}
            label={t('industry.marketOpportunitiesTitle')}
            defaultSort={{ columnId: 'iskPerHour', direction: 'desc' }}
          />
        </div>
      )}
    </Panel>
  );
}
