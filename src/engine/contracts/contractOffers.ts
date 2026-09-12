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
 * The blueprint copies among a batch of offers, as the rows BPC Search's
 * filter and columns already speak.
 *
 * ME/TE/runs fall back to 0 only because the snapshot omits a blank column
 * where the retired blueprint-only join wrote `Number('')` — which is 0, not
 * NaN. The two agree on every copy EVE actually issues (a copy always carries
 * all three); the fallback is what keeps a malformed row a zeroed row rather
 * than a NaN one that silently fails every numeric filter.
 */
export function bpcRowsFromContractOffers(
  offers: readonly PublicContractOfferRow[]
): BpcContractRow[] {
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
    });
  }
  return rows;
}
