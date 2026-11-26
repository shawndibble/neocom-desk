import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  isUnpricedOffer,
  offerAskingPrice,
  offerUnitPrice,
} from '@/engine/contracts/contractSearch';
import { memoByRow } from '@/lib/memoByRow';
import { auctionKindLabel, flagLabel, flagMultiple, flagReferencePrice } from './contractFlagText';
import type { ContractFlag } from '@/engine/contracts/contractFlags';

export interface ContractSearchCsvLookups {
  typeName: (typeId: number) => string;
  regionName: (regionId: number) => string;
  systemName: (row: PublicContractOfferRow) => string | null;
  jumps: (row: PublicContractOfferRow) => number | null;
  plexPrice: number | null;
  security: (row: PublicContractOfferRow) => number | null;
  flagFor: (row: PublicContractOfferRow) => ContractFlag | null;
}

export function contractSearchCsvColumns(
  t: CsvTranslate,
  lookups: ContractSearchCsvLookups
): CsvColumn<PublicContractOfferRow>[] {
  const flagOf = memoByRow(lookups.flagFor);
  return [
    { header: t('contractSearch.itemColumn'), value: (row) => lookups.typeName(row.typeId) },
    { header: t('contractSearch.qtyColumn'), value: (row) => row.quantity },
    {
      header: t('contractSearch.priceColumn'),
      value: (row) =>
        isUnpricedOffer(row, lookups.plexPrice) ? null : offerAskingPrice(row, lookups.plexPrice),
    },
    { header: t('contractSearch.plexColumn'), value: (row) => row.requestedPlex ?? null },
    {
      header: t('contractSearch.iskPerUnitColumn'),
      value: (row) => offerUnitPrice(row, lookups.plexPrice) ?? null,
    },
    { header: t('contractSearch.systemColumn'), value: (row) => lookups.systemName(row) },
    { header: t('contractSearch.itemsJumpsColumn'), value: (row) => lookups.jumps(row) },
    { header: t('contractSearch.regionColumn'), value: (row) => lookups.regionName(row.regionId) },
    {
      header: t('contractSearch.expiresColumn'),
      value: (row) => new Date(row.dateExpired).toISOString(),
    },
    {
      header: t('contracts.typeAuction'),
      value: (row) => (row.isAuction ? auctionKindLabel(t, row.buyout) : null),
    },
    { header: t('market.securityColumn'), value: (row) => lookups.security(row) },
    {
      header: t('contractSearch.priceFlagColumn'),
      value: (row) => {
        const flag = flagOf(row);
        return flag ? flagLabel(flag, t) : null;
      },
    },
    {
      header: t('contractSearch.priceFlagMultipleColumn'),
      value: (row) => {
        const flag = flagOf(row);
        return flag ? flagMultiple(flag) : null;
      },
    },
    {
      header: t('contractSearch.priceFlagReferenceColumn'),
      value: (row) => {
        const flag = flagOf(row);
        return flag ? flagReferencePrice(flag) : null;
      },
    },
  ];
}
