import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { blueprintLpRate } from '@/engine/loyalty/marketLpValue';
import { lpOfferToSearchRow, type BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { findLpOfferMatches } from '@/features/market/appraisalLpAcquisition';
import { lpOfferRows } from '@/features/industry/blueprintAcquisitionSources';
import { loadLpTurnInPricer } from '@/features/industry/blueprintPurchaseOffers';
import type { TradeHub } from '@/market/hubs';

const NONE: readonly BpcSearchRow[] = [];

export function useLpBlueprintOffers({
  characterId,
  enabled,
  blueprintTypeIds,
  hub,
  lpValue,
}: {
  characterId: number | null;
  enabled: boolean;
  blueprintTypeIds: readonly number[];
  hub: TradeHub;
  lpValue: number;
}): { rows: readonly BpcSearchRow[]; loading: boolean } {
  const key = `${characterId}:${hub.id}:${lpValue}:${blueprintTypeIds.length}`;
  const active = enabled && characterId !== null && blueprintTypeIds.length > 0;

  const load = useCallback(async () => {
    let rows: readonly BpcSearchRow[] = NONE;
    try {
      const { matchesByTypeId } = await findLpOfferMatches(characterId ?? 0, blueprintTypeIds);
      const matches = [...matchesByTypeId.values()].flat();
      if (matches.length > 0) {
        const typeIdByOffer = new Map(
          matches.map((m) => [`${m.corporationId}:${m.offer.offer_id}`, m.offer.type_id])
        );
        const turnIns = await loadLpTurnInPricer(
          hub,
          matches.map((m) => m.offer)
        );
        rows = lpOfferRows(matches, blueprintLpRate(lpValue), turnIns)
          .flatMap((row) => {
            const typeId = typeIdByOffer.get(`${row.corporationId}:${row.offerId}`);
            return row.pickable && typeId !== undefined ? [{ row, typeId }] : [];
          })
          .map(({ row, typeId }) =>
            lpOfferToSearchRow({
              corporationId: row.corporationId,
              offerId: row.offerId,
              corpName: row.corpName,
              typeId,
              quantity: row.quantity,
              price: row.price,
              iskCost: row.iskCost,
              lpCost: row.lpCost,
              lpPriced: row.lpPriced,
            })
          );
      }
    } catch {
      rows = NONE;
    }
    return rows;
  }, [characterId, blueprintTypeIds, hub, lpValue]);
  const loaded = useKeyedLoad(active ? key : null, load);

  if (!active) return { rows: NONE, loading: false };
  return loaded.status === 'ready'
    ? { rows: loaded.data, loading: false }
    : { rows: NONE, loading: true };
}
