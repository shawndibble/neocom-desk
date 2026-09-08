/**
 * The Appraisal tab's data path: pasted text in, priced rows out.
 *
 * The three steps either side of it are pure and live in `src/engine/market`
 * (`appraisalPaste`, `appraisalMatch`, `appraisal`); this module is the thin
 * layer that reaches the catalogue and the network, which the engine may not.
 *
 * Prices come from `market/prices.ts`'s `getHubPrices`, not `fetchAggregates`
 * directly: it already carries the 15-minute TTL cache and ADR 0002's
 * per-type null fallback when Fuzzwork is unreachable, and a second cache for
 * the same station's prices would only disagree with the first one. Fuzzwork
 * aggregates are per-**station**, which is why an appraisal is quoted at a
 * Trade Hub rather than under the Browser's full Location Mode — a Region
 * appraisal would be one paginated ESI order-book call per pasted item.
 */
import { buildAppraisal, type Appraisal, type AppraisalItem } from '@/engine/market/appraisal';
import {
  matchAppraisalEntries,
  type AppraisalCatalogue,
  type AppraisalUnmatched,
} from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import type { TradeHub } from '@/market/hubs';
import { getHubPrices, invalidateHubPrices } from '@/market/prices';
import { loadMarketTypes } from '@/sde/loadMarketSde';

export interface AppraisalOutcome {
  appraisal: Appraisal;
  unmatched: AppraisalUnmatched[];
  /** Distinct names read out of the paste, matched or not. */
  entryCount: number;
}

/**
 * Built once per session from the same `types.json` the Market Browser's tree
 * reads, so opening Appraisal after browsing costs no second fetch.
 *
 * A duplicate name keeps the *first* type id rather than the last. EVE's
 * market catalogue has a handful of same-named types across groups, and which
 * one a paste means is unknowable from the text alone — being stable about it
 * at least makes the number reproducible.
 */
let cataloguePromise: Promise<AppraisalCatalogue> | null = null;

export function loadAppraisalCatalogue(): Promise<AppraisalCatalogue> {
  cataloguePromise ??= loadMarketTypes()
    .then((types) => {
      const map = new Map<string, { typeId: number; name: string }>();
      for (const type of types) {
        const key = type.name.toLowerCase();
        if (!map.has(key)) map.set(key, { typeId: type.typeId, name: type.name });
      }
      return map as AppraisalCatalogue;
    })
    .catch((error: unknown) => {
      cataloguePromise = null; // allow retry after failure
      throw error;
    });
  return cataloguePromise;
}

/** Test-only: production callers rely on the session-lifetime memo. */
export function clearAppraisalCatalogue(): void {
  cataloguePromise = null;
}

export interface AppraiseOptions {
  /**
   * Drop the cached prices for these types first, so the refresh button is
   * not a silent no-op inside the 15-minute TTL. CONTEXT.md's "Data Age"
   * makes the manual button one of the two things allowed to bypass a TTL.
   */
  force?: boolean;
}

/**
 * Parse, resolve and price a paste at `hub`. Throws only if the catalogue
 * itself cannot be loaded — an unreachable price source degrades to null
 * prices per type, which the table renders as a dash rather than as free.
 */
export async function appraisePaste(
  text: string,
  hub: TradeHub,
  pricePercent: number,
  { force = false }: AppraiseOptions = {}
): Promise<AppraisalOutcome> {
  const entries = parseAppraisalPaste(text);
  const catalogue = await loadAppraisalCatalogue();
  const { matched, unmatched } = matchAppraisalEntries(entries, catalogue);

  const typeIds = matched.map((match) => match.typeId);
  if (force) invalidateHubPrices(hub.stationId, typeIds);
  const prices = await getHubPrices(hub, typeIds);

  const items: AppraisalItem[] = matched.map((match) => {
    const aggregate = prices.get(match.typeId);
    return {
      typeId: match.typeId,
      name: match.name,
      quantity: match.quantity,
      buy: aggregate?.buyMax ?? null,
      sell: aggregate?.sellMin ?? null,
    };
  });

  return {
    appraisal: buildAppraisal(items, pricePercent),
    unmatched,
    entryCount: entries.length,
  };
}
