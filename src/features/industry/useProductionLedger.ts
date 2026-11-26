import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type ProductionLossRecord,
  type ProductionOrderWatchRecord,
  type ProductionRunRecord,
  type ProductionSaleLinkRecord,
} from '@/db';

const NO_RUNS: ProductionRunRecord[] = [];
const NO_SALE_LINKS: ProductionSaleLinkRecord[] = [];
const NO_ORDER_WATCHES: ProductionOrderWatchRecord[] = [];
const NO_LOSSES: ProductionLossRecord[] = [];

export interface ProductionLedger {
  runs: ProductionRunRecord[];
  saleLinks: ProductionSaleLinkRecord[];
  orderWatches: ProductionOrderWatchRecord[];
  losses: ProductionLossRecord[];
}

export function useProductionLedger(
  characterId: number,
  options: { byPlanId?: string } = {}
): ProductionLedger {
  const { byPlanId } = options;
  const runs =
    useLiveQuery(
      () =>
        byPlanId !== undefined
          ? db.productionRuns.where('buildPlanId').equals(byPlanId).toArray()
          : db.productionRuns.where('characterId').equals(characterId).toArray(),
      [characterId, byPlanId]
    ) ?? NO_RUNS;
  const saleLinks =
    useLiveQuery(
      () => db.productionSaleLinks.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? NO_SALE_LINKS;
  const orderWatches =
    useLiveQuery(
      () => db.productionOrderWatches.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? NO_ORDER_WATCHES;
  const losses =
    useLiveQuery(
      () => db.productionLosses.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? NO_LOSSES;
  return { runs, saleLinks, orderWatches, losses };
}
