import { useMemo } from 'react';
import { iskPerDay } from '@/engine/industry/iskPerDay';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import {
  BUILD_COST_CAP_ISK,
  isKnownRarelySold,
  type MarketWideFilterState,
} from './marketWideFilter';
import type { MarketWideDayRow, MarketWideResultRow } from './marketWideOpportunities';
import { commonGateKey } from './marketWideSkillGate';
import { useDailySales } from './useDailySales';
import { priceVsMedianFor, usePriceVsMedian } from './usePriceVsMedian';

/**
 * Turns the scan's ranked rows into what the panel shows: each row's skill-gate
 * verdict, its ISK/day and vs-90d figures, then the rows the filter keeps.
 */
export function useMarketWideRanking({
  rows,
  hasRun,
  hub,
  catalog,
  characterIds,
  filter,
}: {
  rows: MarketWideResultRow[];
  hasRun: boolean;
  hub: TradeHub;
  catalog: BlueprintCatalog | null;
  characterIds: number[];
  filter: MarketWideFilterState;
}) {
  const accountSkills = useAccountSkillLevels(characterIds);

  const skillGateByProductTypeID = useMemo(() => {
    const verdicts = new Map<number, SkillGateVerdict>();
    if (!catalog) return verdicts;
    for (const row of rows) {
      const requirements =
        catalog.byBlueprintTypeID.get(row.blueprintTypeID)?.blueprint.skills ?? [];
      verdicts.set(row.productTypeID, evaluateSkillGate(requirements, accountSkills));
    }
    return verdicts;
  }, [rows, catalog, accountSkills]);

  const commonGate = useMemo(
    () => commonGateKey(skillGateByProductTypeID),
    [skillGateByProductTypeID]
  );

  const hideSkillGated = filter.hideSkillGated;
  const gatedCount = useMemo(
    () => rows.filter((row) => skillGateByProductTypeID.get(row.productTypeID)?.gated).length,
    [rows, skillGateByProductTypeID]
  );
  const maxBuildCostIsk = BUILD_COST_CAP_ISK[filter.maxBuildCost];
  const hideRarelySold = filter.hideRarelySold;
  const rowTypeIds = useMemo(() => rows.map((row) => row.productTypeID), [rows]);
  // Always fetched: ISK/day needs every ranked row's volume, not only the filter's.
  const dailySales = useDailySales(rowTypeIds, hub.regionId, hasRun);
  // Daily sales reads the hub's published volume object, not ESI history, so
  // this is normally the scan's one per-product ESI request.
  const vs90dTargets = useMemo(
    () => (hasRun ? rowTypeIds.map((typeId) => ({ hubId: hub.id, typeId })) : []),
    [hasRun, rowTypeIds, hub.id]
  );
  const priceVsMedian = usePriceVsMedian(vs90dTargets);
  const sharePct = Number(filter.salesShare);
  const dayRows = useMemo<MarketWideDayRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        iskPerDay: iskPerDay({
          unitMargin: row.unitMargin,
          outputQuantity: row.outputQuantity,
          jobSeconds: row.seconds,
          averageDailyVolume: dailySales.sales.get(row.productTypeID),
          sharePct,
        }),
        vs90d: priceVsMedianFor(priceVsMedian, hub.id, row.productTypeID),
      })),
    [rows, dailySales.sales, sharePct, priceVsMedian, hub.id]
  );
  const visibleRows = useMemo(
    () =>
      dayRows.filter(
        (row) =>
          !(hideSkillGated && skillGateByProductTypeID.get(row.productTypeID)?.gated) &&
          (maxBuildCostIsk === null || row.buildCost <= maxBuildCostIsk) &&
          !(hideRarelySold && isKnownRarelySold(dailySales.sales.get(row.productTypeID)))
      ),
    [
      hideSkillGated,
      maxBuildCostIsk,
      hideRarelySold,
      dailySales.sales,
      dayRows,
      skillGateByProductTypeID,
    ]
  );

  return { skillGateByProductTypeID, commonGate, gatedCount, dailySales, visibleRows };
}
