import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

export const PLEX_TYPE_ID = 44992;

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
  requestedPlex?: number;
  requestsItems?: true;
  lineCount?: number;
  dateExpired: number;
}

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

export function bpcRowsFromContractOffers(
  offers: readonly PublicContractOfferRow[]
): BpcContractRow[] {
  return blueprintRows(offers, (offer) => offer.isBlueprintCopy === true);
}

export function bpoRowsFromContractOffers(
  offers: readonly PublicContractOfferRow[]
): BpcContractRow[] {
  return blueprintRows(
    offers,
    (offer) => !offer.isBlueprintCopy && offer.me !== undefined && offer.te !== undefined
  ).map((row) => ({ ...row, runs: -1 }));
}

function blueprintRows(
  offers: readonly PublicContractOfferRow[],
  keep: (offer: PublicContractOfferRow) => boolean
): BpcContractRow[] {
  const distinctTypeCount = distinctTypeCountByContract(offers);
  const rows: BpcContractRow[] = [];
  for (const offer of offers) {
    if (!keep(offer)) continue;
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
      ...(offer.requestedPlex === undefined ? {} : { requestedPlex: offer.requestedPlex }),
      dateExpired: offer.dateExpired,
      isMultiType: (distinctTypeCount.get(offer.contractId) ?? 1) > 1,
    });
  }
  return rows;
}
