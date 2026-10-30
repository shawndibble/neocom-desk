/**
 * The Offer Detail's "How many" walk (issue #5659): for N > 1 it loads the live
 * book of every required item and, on the instant basis, of the output, then
 * prices N redemptions with `priceRedemptions`. N = 1 loads nothing and returns
 * null: the row's own figures are already that answer.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SkillLevels } from '@/engine/industry/types';
import { buyOrderReaches, type ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import type { ResolvedStandings } from '@/engine/market/standings';
import { priceRedemptions, type RedemptionsResult } from '@/engine/loyalty/redemptions';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { getLiveBook, type LiveBook } from '@/features/market/liveBooks';
import { useBuyJumps } from '@/features/market/useBuyJumps';
import type { TradeHub } from '@/market/hubs';
import type { LoyaltyOfferRow } from './offerRows';
import { resolveLoyaltyRowItem } from './offerRowDisplay';
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

type Books = ReadonlyMap<number, LiveBook | 'failed'>;

/** Units one redemption hands over: the offer's quantity, or a blueprint's product per run. */
function outputUnitsOf(row: LoyaltyOfferRow, catalog: BlueprintCatalog | null): number | null {
  if (!row.isBlueprint) return row.offer.quantity;
  return catalog?.byBlueprintTypeID.get(row.offer.type_id)?.blueprint.products[0]?.quantity ?? null;
}

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

  useEffect(() => {
    if (redemptions <= 1 || typeIdsKey === '') return;
    let cancelled = false;
    for (const typeId of typeIdsKey.split(',').map(Number)) {
      getLiveBook({ hub, typeId }).then(
        (book) => {
          if (!cancelled) setBooks((prev) => new Map(prev).set(typeId, book));
        },
        () => {
          if (!cancelled) setBooks((prev) => new Map(prev).set(typeId, 'failed'));
        }
      );
    }
    return () => {
      cancelled = true;
    };
  }, [redemptions > 1, typeIdsKey, hub]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (redemptions <= 1) return { result: null, loading: false };
    const requiredTypeIds = row.requiredItems.map((item) => item.typeId);
    const sellBooks = new Map<number, readonly HubOrder[]>();
    for (const typeId of requiredTypeIds) {
      const book = books.get(typeId);
      if (book === undefined || book === 'failed') continue;
      sellBooks.set(
        typeId,
        book.orders.map((o) => ({
          price: o.price,
          volume_remain: o.volume_remain ?? 0,
          is_buy_order: o.is_buy_order,
          location_id: o.location_id,
        }))
      );
    }
    const outputBook = instant && outputTypeId !== null ? books.get(outputTypeId) : undefined;
    let buyOrders: ReachableBuyOrder[] | undefined;
    if (outputBook !== undefined && outputBook !== 'failed') {
      const station = { locationId: hub.stationId, systemId: hub.systemId };
      buyOrders = [];
      for (const o of outputBook.orders) {
        if (!o.is_buy_order) continue;
        const candidate: ReachableBuyOrder = {
          price: o.price,
          volumeRemain: o.volume_remain ?? 0,
          minVolume: o.min_volume,
          range: o.range,
          locationId: o.location_id,
          systemId: o.system_id ?? 0,
        };
        if (buyOrderReaches(candidate, station, jumps)) buyOrders.push(candidate);
      }
    }
    const outputUnits = outputUnitsOf(row, catalog);
    const loading =
      requiredTypeIds.some((id) => !books.has(id)) ||
      (instant && outputTypeId !== null && !books.has(outputTypeId));
    const result = priceRedemptions({
      redemptions,
      iskCost: row.offer.isk_cost,
      lpCost: row.offer.lp_cost,
      requiredItems: row.requiredItems,
      outputUnits,
      outputTopUnitPrice:
        row.profit.revenue === null || !outputUnits ? null : row.profit.revenue / outputUnits,
      buildCost: row.build ? row.build.materialCost + row.build.jobFee.total : 0,
      stationId: hub.stationId,
      sellBooks,
      outputBasis: instant ? 'instant' : 'order',
      buyOrders,
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
