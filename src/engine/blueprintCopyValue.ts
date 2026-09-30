/**
 * What an owned blueprint copy is worth on the Assets pages — priced from
 * Public Contract Offers, never the market's average price. A copy shares
 * its original's typeID, and ESI's average price for that typeID is the
 * original's, so a copy library valued that way reads as thousands of
 * originals (a 117M copy stash showed as 2.1T).
 *
 * See `docs/context/decisions/20260930-120122-asset-value-prices-blueprint-copies-from-contract-listings.md`.
 */

import type { BpcContractRow } from './contracts/bpcSearch';

/** One asset row flagged `is_blueprint_copy`, joined to its blueprint record when that is readable. */
export interface OwnedBlueprintCopyAsset {
  itemId: number;
  typeId: number;
  /** Absent when the blueprints endpoint is unreadable (scope or corp role): the copy prices at the ME0/TE0 tier. */
  me?: number;
  te?: number;
  /** Remaining runs; absent alongside `me`/`te`. */
  runs?: number;
}

/** One contract's asking rate for copies of one type at one ME/TE. */
interface CopyRate {
  typeId: number;
  me: number;
  te: number;
  iskPerRun: number;
  iskPerCopy: number;
}

function tierKey(typeId: number, me: number, te: number): string {
  return `${typeId}:${me}:${te}`;
}

/**
 * Folds listing rows into one rate per contract. A contract carrying any
 * other item type is skipped (its price is the bundle's, not this
 * blueprint's), and so is one mixing ME/TE — only a contract of the same
 * blueprint throughout divides its price evenly across the copies it sells.
 * Auctions, PLEX asks and zero-price barters have no price a buyer can pay.
 */
function contractRates(listings: readonly BpcContractRow[]): CopyRate[] {
  const byContract = new Map<number, BpcContractRow[]>();
  for (const row of listings) {
    if (row.runs <= 0 || row.isAuction || row.requestedPlex || row.isMultiType) continue;
    if (!(row.price > 0) || !(row.quantity > 0)) continue;
    const list = byContract.get(row.contractId) ?? [];
    list.push(row);
    byContract.set(row.contractId, list);
  }

  const rates: CopyRate[] = [];
  for (const rows of byContract.values()) {
    const [first] = rows;
    if (!first) continue;
    if (rows.some((r) => r.typeId !== first.typeId || r.me !== first.me || r.te !== first.te))
      continue;
    let copies = 0;
    let runs = 0;
    for (const r of rows) {
      copies += r.quantity;
      runs += r.quantity * r.runs;
    }
    rates.push({
      typeId: first.typeId,
      me: first.me,
      te: first.te,
      iskPerRun: first.price / runs,
      iskPerCopy: first.price / copies,
    });
  }
  return rates;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Each owned copy's value, keyed by `itemId`. Matches the copy's own ME/TE
 * first, then ME0/TE0, then 0 — never the original's price. The median
 * listing sets the rate, so one lowball or troll ask cannot swing a total.
 * A copy with known runs is worth the median ISK/run times its runs; one
 * without is worth the median per-copy ask.
 */
export function blueprintCopyValues(
  copies: readonly OwnedBlueprintCopyAsset[],
  listings: readonly BpcContractRow[]
): Map<number, number> {
  const ratesByTier = new Map<string, CopyRate[]>();
  for (const rate of contractRates(listings)) {
    const key = tierKey(rate.typeId, rate.me, rate.te);
    const list = ratesByTier.get(key) ?? [];
    list.push(rate);
    ratesByTier.set(key, list);
  }

  const values = new Map<number, number>();
  for (const owned of copies) {
    const known = owned.me !== undefined && owned.te !== undefined;
    const rates =
      (known ? ratesByTier.get(tierKey(owned.typeId, owned.me!, owned.te!)) : undefined) ??
      ratesByTier.get(tierKey(owned.typeId, 0, 0));
    if (!rates) {
      values.set(owned.itemId, 0);
      continue;
    }
    const value =
      owned.runs !== undefined && owned.runs > 0
        ? median(rates.map((r) => r.iskPerRun)) * owned.runs
        : median(rates.map((r) => r.iskPerCopy));
    values.set(owned.itemId, value);
  }
  return values;
}
