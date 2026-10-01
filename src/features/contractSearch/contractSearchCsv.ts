import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { isUnpricedOffer, offerAskingPrice } from '@/engine/contracts/contractSearch';

/** The panel's own spellings, so the export names things the way the table does. */
export interface ContractSearchCsvLookups {
  typeName: (typeId: number) => string;
  regionName: (regionId: number) => string;
  /** `null` for an offer not (yet) placed in a system. */
  systemName: (row: PublicContractOfferRow) => string | null;
  /** `null` when unreachable, unplaced or still resolving. */
  jumps: (row: PublicContractOfferRow) => number | null;
  /** ISK per PLEX, folded into a PLEX-asking row's price; `null` leaves that price blank. */
  plexPrice: number | null;
}

/**
 * CSV columns for Contract Search's items table, in table order. Price is the
 * table's asking price (an auction's buyout when it has one), blank for an
 * unpriced barter — its 0 ISK is the absence of a price, not a price
 * (issue #1080). A PLEX ask is counted into Price at `plexPrice` and also
 * listed raw in its own column, so the figure can be re-derived. The expiry is epoch ms in the row, handed on as an ISO UTC
 * timestamp so it lands as a date.
 */
export function contractSearchCsvColumns(
  t: CsvTranslate,
  lookups: ContractSearchCsvLookups
): CsvColumn<PublicContractOfferRow>[] {
  return [
    { header: t('contractSearch.itemColumn'), value: (row) => lookups.typeName(row.typeId) },
    { header: t('contractSearch.qtyColumn'), value: (row) => row.quantity },
    {
      header: t('contractSearch.priceColumn'),
      value: (row) =>
        isUnpricedOffer(row, lookups.plexPrice) ? null : offerAskingPrice(row, lookups.plexPrice),
    },
    { header: t('contractSearch.plexColumn'), value: (row) => row.requestedPlex ?? null },
    { header: t('contractSearch.systemColumn'), value: (row) => lookups.systemName(row) },
    { header: t('contractSearch.itemsJumpsColumn'), value: (row) => lookups.jumps(row) },
    { header: t('contractSearch.regionColumn'), value: (row) => lookups.regionName(row.regionId) },
    {
      header: t('contractSearch.expiresColumn'),
      value: (row) => new Date(row.dateExpired).toISOString(),
    },
  ];
}
