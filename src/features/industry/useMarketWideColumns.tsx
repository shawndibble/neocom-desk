import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import {
  IskAmount,
  InfoTooltip,
  STAT_CHIP_TONE_TEXT_CLASS,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import { BLUEPRINT_SOURCE_RANK } from '@/engine/industry/blueprintObtainability';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { iskToneClass } from '@/features/character/format';
import { formatDuration } from '@/lib/duration';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import { formatPercent, numericCell } from './format';
import type { MarketWideDayRow, MarketWideResultRow } from './marketWideOpportunities';
import { gateKey } from './marketWideSkillGate';
import type { MarketWideColumnId } from './marketWideColumns';
import { ORDER_DEPTH_RANK } from './opportunityMetrics';
import { SkillGateMarker } from './SkillGateMarker';
import { StartPlanButton } from './StartPlanButton';
import type { useDailySales } from './useDailySales';
import { Vs90dFigure } from './Vs90dFigure';
import { vs90dTooltip } from './vs90d';

const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

/**
 * The columns' sort keys, at module scope: the columns themselves close over
 * render-time state (and `onStartPlan`, which the parent rebuilds every
 * render), but `DataTable` keys its sort memo on the active `sortValue`, so
 * keeping these stable is what stops a re-render from re-sorting every row.
 */
export const SORT_VALUE = {
  product: (row: MarketWideDayRow) => row.productName,
  blueprintSource: (row: MarketWideDayRow) => BLUEPRINT_SOURCE_RANK[row.blueprintSource],
  margin: (row: MarketWideDayRow) => row.marginPct ?? undefined,
  vs90d: (row: MarketWideDayRow) => row.vs90d ?? undefined,
  duration: (row: MarketWideDayRow) => row.seconds,
  iskPerHour: (row: MarketWideDayRow) => row.iskPerHour ?? undefined,
  buildCost: (row: MarketWideDayRow) => row.buildCost,
  orderDepth: (row: MarketWideDayRow) => ORDER_DEPTH_RANK[row.orderDepth],
  iskPerDay: (row: MarketWideDayRow) => row.iskPerDay ?? undefined,
};

/** The ranking table's columns, closed over the panel's render-time state. */
export function useMarketWideColumns({
  catalog,
  characterNames,
  salesShare,
  dailySales,
  skillGateByProductTypeID,
  commonGate,
  isVisible,
  startPlanFor,
}: {
  catalog: BlueprintCatalog | null;
  characterNames: Map<number, string>;
  salesShare: string;
  dailySales: ReturnType<typeof useDailySales>;
  skillGateByProductTypeID: Map<number, SkillGateVerdict>;
  commonGate: string | null;
  isVisible: (id: MarketWideColumnId) => boolean;
  startPlanFor: (row: MarketWideResultRow) => Promise<boolean>;
}): DataTableColumn<MarketWideDayRow>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: SORT_VALUE.product,
      render: (row) => {
        const verdict = skillGateByProductTypeID.get(row.productTypeID);
        return (
          <span className="inline-flex items-center gap-1.5">
            {catalog?.byProductTypeID.has(row.productTypeID) ? (
              <span className={entityLinkClassName()}>{row.productName}</span>
            ) : (
              row.productName
            )}
            {!isVisible('blueprintSource') && row.blueprintSource !== 'market' && (
              <span className="text-[0.6875rem] text-text-dim">
                {t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
              </span>
            )}
            {verdict?.gated && catalog && (
              <SkillGateMarker
                verdict={verdict}
                quiet={commonGate !== null && gateKey(verdict) === commonGate}
                nameForSkill={(typeID) => nameForType(catalog, typeID)}
                nameForCharacter={(id) => characterNames.get(id) ?? t('common.unknown')}
              />
            )}
          </span>
        );
      },
    },
    {
      id: 'blueprintSource',
      header: t('industry.marketOpportunitiesBlueprintSource'),
      sortValue: SORT_VALUE.blueprintSource,
      // The header already names the column, so the cell is just the toned value.
      // The NPC market is nearly every row's source; only an exception is worth a word.
      render: (row) =>
        row.blueprintSource === 'market' ? null : (
          <span
            className={
              STAT_CHIP_TONE_TEXT_CLASS[row.blueprintSource === 'owned' ? 'success' : 'default']
            }
          >
            {t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
          </span>
        ),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.margin,
      render: (row) => numericCell(row.marginPct, formatPercent, t('common.unknown')),
    },
    {
      id: 'vs90d',
      header: t('industry.vs90d'),
      headerTooltip: vs90dTooltip(t),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.vs90d,
      render: (row) => <Vs90dFigure value={row.vs90d} />,
    },
    {
      // The whole tree's TE-0 job time: ISK/hour's denominator, not a wall-clock promise.
      id: 'duration',
      header: t('industry.time'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.duration,
      render: (row) => formatDuration(row.seconds),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerHour,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      // Tap, not long press: the ranking's figures are inert — the row's only
      // actions are the button in its last cell and the row's context menu.
      render: (row) =>
        row.iskPerHour === null ? (
          t('common.unknown')
        ) : (
          <span className="inline-flex items-center justify-end gap-1">
            <IskAmount value={row.iskPerHour} decimals={0} />
            {row.priceCapped && (
              <InfoTooltip
                label={t('industry.marketOpportunitiesPriceCapped')}
                content={t('industry.marketOpportunitiesPriceCapped')}
              />
            )}
          </span>
        ),
    },
    {
      id: 'iskPerDay',
      header: t('industry.iskPerDay'),
      headerTooltip: t('industry.iskPerDayTooltip', { share: salesShare }),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerDay,
      cellClassName: (row) => (row.iskPerDay !== null ? iskToneClass(row.iskPerDay) : undefined),
      render: (row) =>
        row.iskPerDay === null ? (
          // Still reading this product's sales: a blank dash would read as no sales at all.
          dailySales.pending > 0 && !dailySales.sales.has(row.productTypeID) ? (
            <span className="text-text-dim">…</span>
          ) : (
            t('common.unknown')
          )
        ) : (
          <IskAmount value={row.iskPerDay} decimals={0} />
        ),
    },
    {
      id: 'buildCost',
      header: t('industry.buildCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.buildCost,
      render: (row) => <IskAmount value={row.buildCost} decimals={0} />,
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      sortValue: SORT_VALUE.orderDepth,
      render: (row) => (
        <span className={STAT_CHIP_TONE_TEXT_CLASS[ORDER_DEPTH_TONE[row.orderDepth]]}>
          {t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
        </span>
      ),
    },
    {
      id: 'action',
      header: '',
      render: (row) => <StartPlanButton onStart={() => startPlanFor(row)} planKey={row} />,
    },
  ];
}
