/**
 * Narrows the shared Public Contract Offers snapshot down to the blueprint
 * copies BPC Search searches (issues #906, #907).
 *
 * BPC Search used to be fed by its own ingestion pipeline that applied this
 * filter server-side, one snapshot per consumer. #906 generalized that crawl
 * to every item type; #907 retired the blueprint-only pipeline and moved the
 * filter here, so the same twice-hourly snapshot serves both this search and
 * whatever else reads contract offers. The filter is pure and lives in
 * `src/engine` rather than in the Firestore read, so it is testable without
 * touching Firestore and so the read stays a read.
 */
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

/**
 * One row of the shared snapshot: a for-sale line of a public
 * item_exchange/auction contract, any item type. Mirrors
 * `functions/src/publicContracts.ts`'s `PublicContractOfferRow`, which this
 * module never imports (client and Functions are separate packages).
 *
 * ME/TE/runs are blueprint-only columns and are absent — not zero — on a
 * plain item line, so a reader asks for `isBlueprintCopy` rather than
 * inferring copy-ness from `runs`. `isBlueprintCopy` means *copy*
 * specifically: a researched blueprint original carries ME/TE but no flag.
 */
export interface PublicContractOfferRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  quantity: number;
  isBlueprintCopy?: true;
  me?: number;
  te?: number;
  runs?: number;
  /** Epoch ms. */
  dateExpired: number;
}

/**
 * Distinct for-sale type IDs per contract, over every line — not only
 * blueprint copies. A contract's whole price is one indivisible ask
 * (issue #1076): a bundle mixing one blueprint copy with eleven plain
 * modules is still a 12-type bundle, even though only the blueprint line
 * ever reaches `bpcRowsFromContractOffers`'s return value, so the tally has
 * to be built from `offers` before that filter runs, not after.
 */
function distinctTypeCountByContract(
  offers: readonly PublicContractOfferRow[]
): Map<number, number> {
  const typesByContract = new Map<number, Set<number>>();
  for (const offer of offers) {
    const types = typesByContract.get(offer.contractId);
    if (types) types.add(offer.typeId);
    else typesByContract.set(offer.contractId, new Set([offer.typeId]));
  }
  const counts = new Map<number, number>();
  for (const [contractId, types] of typesByContract) counts.set(contractId, types.size);
  return counts;
}

/**
 * The blueprint copies among a batch of offers, as the rows BPC Search's
 * filter and columns already speak.
 *
 * ME/TE/runs fall back to 0 only because the snapshot omits a blank column
 * where the retired blueprint-only join wrote `Number('')` — which is 0, not
 * NaN. The two agree on every copy EVE actually issues (a copy always carries
 * all three); the fallback is what keeps a malformed row a zeroed row rather
 * than a NaN one that silently fails every numeric filter.
 *
 * `offers` must be every line of every contract the caller wants tallied
 * correctly (issue #1076) — a contract split across two calls (e.g. one call
 * per chunk of a chunked snapshot) tallies each half as its own single-type
 * contract, which is wrong whenever a contract's lines straddle that split.
 * Callers reading a chunked snapshot must accumulate every chunk's raw rows
 * first and call this once over the whole thing.
 */
export function bpcRowsFromContractOffers(
  offers: readonly PublicContractOfferRow[]
): BpcContractRow[] {
  const distinctTypeCount = distinctTypeCountByContract(offers);
  const rows: BpcContractRow[] = [];
  for (const offer of offers) {
    if (!offer.isBlueprintCopy) continue;
    rows.push({
      contractId: offer.contractId,
      regionId: offer.regionId,
      locationId: offer.locationId,
      typeId: offer.typeId,
      price: offer.price,
      ...(offer.buyout === undefined ? {} : { buyout: offer.buyout }),
      isAuction: offer.isAuction,
      me: offer.me ?? 0,
      te: offer.te ?? 0,
      runs: offer.runs ?? 0,
      quantity: offer.quantity,
      dateExpired: offer.dateExpired,
      isMultiType: (distinctTypeCount.get(offer.contractId) ?? 1) > 1,
    });
  }
  return rows;
}
