import { useEffect, useMemo, useState } from 'react';
import type { SkillLevels } from '@/engine/industry/types';
import type { ReachableBuyOrder } from '@/engine/market/buyReach';
import { liveHubOrders, reachableBuyOrders } from '@/engine/market/liveBook';
import type { HubOrder } from '@/engine/market/haulingMarket';
import type { ResolvedStandings } from '@/engine/market/standings';
import { priceRedemptions, type RedemptionsResult } from '@/engine/loyalty/redemptions';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { getLiveBook, type LiveBook } from '@/features/market/liveBooks';
import { useBuyJumps } from '@/features/market/useBuyJumps';
import type { TradeHub } from '@/market/hubs';
import type { LoyaltyOfferRow } from './offerRows';
import { buildCostOf, outputUnitsOf, resolveLoyaltyRowItem } from './offerRowDisplay';
import type { PriceBasis } from './priceBasis';

interface Args {
  row: LoyaltyOfferRow;
  catalog: BlueprintCatalog | null;
  hub: TradeHub;
  redemptions: number;
  priceBasis: PriceBasis;
  skills: SkillLevels;
  standing: ResolvedStandings | undefined;
  playerLp: number | null;
}

type Books = ReadonlyMap<string, LiveBook | 'failed'>;

const bookKey = (hub: TradeHub, typeId: number): string => `${hub.stationId}:${typeId}`;

export function useRedemptionPricing({
  row,
  catalog,
  hub,
  redemptions,
  priceBasis,
  skills,
  standing,
  playerLp,
}: Args): { result: RedemptionsResult | null; loading: boolean } {
  const instant = priceBasis === 'buy';
  const outputTypeId = resolveLoyaltyRowItem(row).typeId;
  const typeIdsKey = [
    ...row.requiredItems.map((item) => item.typeId),
    ...(instant && outputTypeId !== null ? [outputTypeId] : []),
  ].join(',');
  const [books, setBooks] = useState<Books>(new Map());
  const jumps = useBuyJumps(redemptions > 1 && instant ? hub.systemId : 0);

  const active = redemptions > 1;
  useEffect(() => {
    if (!active || typeIdsKey === '') return;
    let cancelled = false;
    for (const typeId of typeIdsKey.split(',').map(Number)) {
      getLiveBook({ hub, typeId }).then(
        (book) => {
          if (!cancelled) setBooks((prev) => new Map(prev).set(bookKey(hub, typeId), book));
        },
        () => {
          if (!cancelled) setBooks((prev) => new Map(prev).set(bookKey(hub, typeId), 'failed'));
        }
      );
    }
    return () => {
      cancelled = true;
    };
  }, [active, typeIdsKey, hub]);

  return useMemo(() => {
    if (redemptions <= 1) return { result: null, loading: false };
    const requiredTypeIds = row.requiredItems.map((item) => item.typeId);
    const sellBooks = new Map<number, readonly HubOrder[]>();
    for (const typeId of requiredTypeIds) {
      const book = books.get(bookKey(hub, typeId));
      if (book === undefined || book === 'failed') continue;
      sellBooks.set(typeId, liveHubOrders(book.orders));
    }
    const outputBook =
      instant && outputTypeId !== null ? books.get(bookKey(hub, outputTypeId)) : undefined;
    let buyOrders: ReachableBuyOrder[] | undefined;
    if (outputBook !== undefined && outputBook !== 'failed') {
      const station = { locationId: hub.stationId, systemId: hub.systemId };
      buyOrders = reachableBuyOrders(outputBook.orders, station, jumps);
    }
    const outputUnits = outputUnitsOf(row, catalog);
    const loading =
      requiredTypeIds.some((id) => !books.has(bookKey(hub, id))) ||
      (instant && outputTypeId !== null && !books.has(bookKey(hub, outputTypeId)));
    const result = priceRedemptions({
      redemptions,
      iskCost: row.offer.isk_cost,
      lpCost: row.offer.lp_cost,
      requiredItems: row.requiredItems,
      outputUnits,
      outputTopUnitPrice:
        row.profit.revenue === null || !outputUnits ? null : row.profit.revenue / outputUnits,
      buildCost: buildCostOf(row),
      stationId: hub.stationId,
      sellBooks,
      outputBasis: instant ? 'instant' : 'order',
      buyOrders,
      outputPriceCeiling: row.revenueCheck?.ceiling ?? null,
      liquidationBasis: instant ? 'instant' : 'order',
      skills,
      standing,
      playerLp,
    });
    return { result, loading };
  }, [
    redemptions,
    row,
    catalog,
    hub,
    instant,
    outputTypeId,
    books,
    jumps,
    skills,
    standing,
    playerLp,
  ]);
}
