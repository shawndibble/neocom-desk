import type { PublicContractOfferRow } from './contractOffers';
import { buyoutOf, isUnpricedOffer } from './contractSearch';

export const DEFAULT_ITEM_FLAG_MULTIPLE = 10;

export type ContractFlag =
  | { kind: 'overpriced'; multiple: number; hubSell: number; quantity: number }
  | { kind: 'copy-above-original'; original: number; asking: number; runs?: number };

export interface ContractFlagContext {
  hubSell: number | null;
  threshold: number;
}

function isAuctionWithoutBuyout(row: PublicContractOfferRow): boolean {
  return row.isAuction && buyoutOf(row) === null;
}

export function contractFlagFor(
  row: PublicContractOfferRow,
  { hubSell, threshold }: ContractFlagContext
): ContractFlag | null {
  if (row.lineCount !== 1 || hubSell === null || hubSell <= 0) return null;
  if (row.requestsItems || isUnpricedOffer(row)) return null;
  if (isAuctionWithoutBuyout(row)) return null;
  const asking = buyoutOf(row) ?? row.price;
  if (row.isBlueprintCopy) {
    return asking > hubSell
      ? {
          kind: 'copy-above-original',
          original: hubSell,
          asking,
          ...(row.runs === undefined ? {} : { runs: row.runs }),
        }
      : null;
  }
  const multiple = asking / (hubSell * row.quantity);
  return multiple >= threshold
    ? { kind: 'overpriced', multiple, hubSell, quantity: row.quantity }
    : null;
}

export function contractSavingFor(
  row: PublicContractOfferRow,
  hubSell: number | null
): number | null {
  if (row.lineCount !== 1 || hubSell === null || !(hubSell > 0)) return null;
  if (row.isBlueprintCopy || row.requestsItems || row.requestedPlex) return null;
  if (isUnpricedOffer(row)) return null;
  if (isAuctionWithoutBuyout(row)) return null;
  const asking = buyoutOf(row) ?? row.price;
  const value = hubSell * row.quantity;
  return ((value - asking) / value) * 100;
}

export function splitFlagged<T>(
  rows: readonly T[],
  flagOf: (row: T) => ContractFlag | null
): { kept: T[]; hidden: T[] } {
  const kept: T[] = [];
  const hidden: T[] = [];
  for (const row of rows) (flagOf(row) === null ? kept : hidden).push(row);
  return { kept, hidden };
}

export const BUNDLE_MINORITY_SHARE = 0.5;

export interface BundleSplit {
  mine: number;
  rest: number;
  unpricedLines: number;
}

export function bundleShareOfValue(split: BundleSplit): number | null {
  const total = split.mine + split.rest;
  if (split.unpricedLines > 0 || total <= 0) return null;
  return split.mine / total;
}
