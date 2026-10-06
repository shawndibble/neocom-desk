/**
 * BPC Sourcing's LP Store source: every blueprint copy an LP store the pilot
 * holds points with sells (`findLpOfferMatches` — ESI has no "who sells this
 * type" search, so a corporation the pilot holds no LP with is never read),
 * priced the way the Blueprint Acquisition modal prices them: ISK + LP at the
 * pilot's LP Value (else the store's market value) + the turn-ins they would
 * still buy at the hub.
 *
 * Loaded once per character/hub/LP Value, not per search: a corporation's
 * offers are one cached fetch each, so the search only narrows what is shown.
 * An offer that costs LP while nothing prices that LP is left out — its ISK
 * cost alone would sort it as cheap.
 */
import { useEffect, useState } from 'react';
import { lpRate } from '@/engine/loyalty/marketLpValue';
import { lpOfferToSearchRow, type BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { loadMarketLpValues } from '@/features/loyalty/marketLpValue';
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
  /** Every blueprint the SDE knows; stable across renders. */
  blueprintTypeIds: readonly number[];
  hub: TradeHub;
  /** The pilot's own ISK per LP; 0 means "use each store's market value". */
  lpValue: number;
}): { rows: readonly BpcSearchRow[]; loading: boolean } {
  const [state, setState] = useState<{ key: string; rows: readonly BpcSearchRow[] } | null>(null);
  const key = `${characterId}:${hub.id}:${lpValue}:${blueprintTypeIds.length}`;
  const active = enabled && characterId !== null && blueprintTypeIds.length > 0;

  useEffect(() => {
    if (!active || characterId === null) return;
    let cancelled = false;
    void (async () => {
      let rows: readonly BpcSearchRow[] = NONE;
      try {
        const { matchesByTypeId } = await findLpOfferMatches(characterId, blueprintTypeIds);
        const matches = [...matchesByTypeId.values()].flat();
        if (matches.length > 0) {
          const typeIdByOffer = new Map(
            matches.map((m) => [`${m.corporationId}:${m.offer.offer_id}`, m.offer.type_id])
          );
          const corpIds = [...new Set(matches.map((m) => m.corporationId))];
          const [turnIns, marketValues] = await Promise.all([
            loadLpTurnInPricer(
              hub,
              matches.map((m) => m.offer)
            ),
            lpValue > 0
              ? Promise.resolve(new Map<number, number | null>())
              : loadMarketLpValues(corpIds, hub),
          ]);
          rows = lpOfferRows(
            matches,
            (corp) => lpRate(lpValue, marketValues.get(corp) ?? null),
            turnIns
          )
            .filter((row) => row.pickable)
            .map((row) =>
              lpOfferToSearchRow({
                corporationId: row.corporationId,
                offerId: row.offerId,
                corpName: row.corpName,
                typeId: typeIdByOffer.get(`${row.corporationId}:${row.offerId}`) ?? 0,
                quantity: row.quantity,
                price: row.price,
                iskCost: row.iskCost,
                lpCost: row.lpCost,
                lpPriced: row.lpPriced,
              })
            );
        }
      } catch {
        // Best-effort, like Appraisal's LP lookup: no LP scope or no network is no LP rows.
        rows = NONE;
      }
      if (!cancelled) setState({ key, rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, characterId, blueprintTypeIds, hub, lpValue, key]);

  if (!active) return { rows: NONE, loading: false };
  return state?.key === key ? { rows: state.rows, loading: false } : { rows: NONE, loading: true };
}
