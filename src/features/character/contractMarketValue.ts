/**
 * Neutral market-value total for a contract's item lines (issue #717): each
 * line's quantity times its sell-order price at a Trade Hub, the same
 * arithmetic `src/engine/market/appraisal.ts`'s `buildAppraisal` already does
 * for a pasted Appraisal pile. Thin fetch glue over that pure engine, mirroring
 * `features/market/appraisalData.ts`'s split between pure math and network
 * access, which `appraisal.ts` may not do itself.
 *
 * Only `sell` is ever populated — this figure is "what it costs to buy this
 * outright right now", not a buy-order value. `buy` stays null on every item,
 * so `AppraisalTotals.unpricedRows` (which flags a row missing *either* side)
 * would always count every row; `unpriced` is derived from each row's
 * `sellTotal` instead, so it reflects only the side this feature prices.
 */
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import type { ContractItem } from '@/esi/endpoints';

export interface ContractMarketValue {
  /** Summed sell value at 100% of market, over lines that priced. */
  total: number;
  /** Lines with no sell-order price at this hub, left out of `total`. */
  unpriced: number;
}

export async function loadContractMarketValue(
  hub: TradeHub,
  items: readonly ContractItem[],
  typeNames: ReadonlyMap<number, string>
): Promise<ContractMarketValue> {
  const prices = await getHubPrices(
    hub,
    items.map((item) => item.type_id)
  );
  const appraisalItems: AppraisalItem[] = items.map((item) => ({
    typeId: item.type_id,
    name: typeNames.get(item.type_id) ?? `#${item.type_id}`,
    quantity: item.quantity,
    buy: null,
    sell: prices.get(item.type_id)?.sellMin ?? null,
  }));
  const { rows, totals } = buildAppraisal(appraisalItems, 100);
  return {
    total: totals.sell,
    unpriced: rows.filter((row) => row.sellTotal === null).length,
  };
}
