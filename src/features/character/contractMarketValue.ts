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
 *
 * An abyssal (mutated) module has no market price, so it stays out of the
 * market total and is valued apart, at its own MutaMarket estimate (looked up,
 * never imported) when the line carries an item id.
 */
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { getHubPricesWithStatus } from '@/market/prices';
import { getAbyssalEstimate } from '@/market/mutamarket';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { TradeHub } from '@/market/hubs';

export interface ContractMarketValue {
  /** Summed sell value at 100% of market, over lines that priced. */
  total: number;
  /** Lines with no sell-order price at this hub, left out of `total`. */
  unpriced: number;
  /**
   * The price source could not be reached, so a 0 `total` means "unknown", not
   * "worth nothing": the row shows a placeholder when no line priced.
   */
  unreachable: boolean;
  /** The contract's abyssal modules, never in `total` or `unpriced`. Absent when it has none. */
  abyssal?: AbyssalContractValue;
}

export interface AbyssalContractValue {
  /** ISK: the priced modules' MutaMarket estimates, summed. */
  estimated: number;
  priced: number;
  /** No estimate: no item id on the line, no Character to ask with, or MutaMarket has none. */
  unpriced: number;
  /** Every line is abyssal, so there is no market figure to show. */
  onlyAbyssal: boolean;
}

/**
 * The two fields the arithmetic needs, structurally — not `ContractItem`
 * itself. A public contract's lines (`PublicContractItem`, and the merged
 * lines a detail modal renders) carry the same two under the same names but
 * are a different type, and a bundle is worth the same ISK either way.
 */
export interface PricedContractLine {
  type_id: number;
  quantity: number;
  /** An abyssal module's own item id (public contracts only), for its estimate. */
  item_id?: number;
}

export interface AbyssalPricing {
  isAbyssalType: (typeId: number) => boolean;
  /** The Character whose session reaches MutaMarket; null asks nothing. */
  characterId: number | null;
  /** True once the view closed: lookups not yet started are dropped. */
  isCancelled?: () => boolean;
}

const ABYSSAL_LOOKUP_WORKERS = 4;

async function valueAbyssalLines(
  lines: readonly PricedContractLine[],
  { characterId, isCancelled = () => false }: AbyssalPricing
): Promise<Omit<AbyssalContractValue, 'onlyAbyssal'>> {
  const values: (number | null)[] = lines.map(() => null);
  if (characterId === null) return { estimated: 0, priced: 0, unpriced: lines.length };
  // A few at a time, stopping at the first `unavailable`: the rest would only fail too.
  let unavailable = false;
  await mapWithConcurrencyLimit(
    lines.map((line, index) => ({ line, index })),
    ABYSSAL_LOOKUP_WORKERS,
    async ({ line, index }) => {
      if (unavailable || isCancelled()) return;
      if (line.item_id === undefined) return;
      const estimate = await getAbyssalEstimate(line.type_id, line.item_id, { characterId });
      if (estimate.status === 'unavailable') unavailable = true;
      values[index] = estimate.value;
    }
  );
  const priced = values.filter((value): value is number => value !== null);
  return {
    estimated: priced.reduce((sum, value) => sum + value, 0),
    priced: priced.length,
    unpriced: values.length - priced.length,
  };
}

export interface ContractMarketValueOptions {
  /**
   * Prices a type the hub station never lists — PLEX, which trades only on its
   * own global market — from wherever the caller found it.
   */
  sellOverrides?: ReadonlyMap<number, number>;
  /** Without it no line reads as abyssal. */
  abyssal?: AbyssalPricing;
}

export async function loadContractMarketValue(
  hub: TradeHub,
  items: readonly PricedContractLine[],
  typeNames: ReadonlyMap<number, string>,
  { sellOverrides = new Map(), abyssal }: ContractMarketValueOptions = {}
): Promise<ContractMarketValue> {
  const isAbyssal = (line: PricedContractLine) => abyssal?.isAbyssalType(line.type_id) ?? false;
  const abyssalLines = items.filter(isAbyssal);
  const marketLines = items.filter((line) => !isAbyssal(line));
  const [{ prices, unreachable }, abyssalValue] = await Promise.all([
    marketLines.length === 0
      ? { prices: new Map(), unreachable: false }
      : getHubPricesWithStatus(
          hub,
          marketLines.map((item) => item.type_id)
        ),
    abyssal && abyssalLines.length > 0 ? valueAbyssalLines(abyssalLines, abyssal) : undefined,
  ]);
  const appraisalItems: AppraisalItem[] = marketLines.map((item) => ({
    typeId: item.type_id,
    name: typeNames.get(item.type_id) ?? `#${item.type_id}`,
    quantity: item.quantity,
    buy: null,
    sell: sellOverrides.get(item.type_id) ?? prices.get(item.type_id)?.sellMin ?? null,
  }));
  const { rows, totals } = buildAppraisal(appraisalItems, 100);
  return {
    total: totals.sell,
    unpriced: rows.filter((row) => row.sellTotal === null).length,
    unreachable,
    ...(abyssalValue
      ? { abyssal: { ...abyssalValue, onlyAbyssal: marketLines.length === 0 } }
      : {}),
  };
}
