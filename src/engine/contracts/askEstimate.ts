import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { offerUnitPrice } from '@/engine/contracts/contractSearch';
import { median } from '@/engine/math';

export const MIN_ASK_ESTIMATE_CONTRACTS = 5;

export interface ContractAskEstimate {
  typeId: number;
  unitPrice: number;
  contracts: number;
}

function cleanUnitAsk(row: PublicContractOfferRow, now: number): number | undefined {
  if (row.requestsItems || row.isBlueprintCopy || row.me !== undefined) return undefined;
  if (row.dateExpired <= now) return undefined;
  if (row.isAuction && !(row.buyout != null && row.buyout > 0)) return undefined;
  return offerUnitPrice(row, null);
}

export function contractAskEstimates(
  offers: readonly PublicContractOfferRow[],
  now: number = Date.now()
): Map<number, ContractAskEstimate> {
  const asksByType = new Map<number, number[]>();
  for (const row of offers) {
    const ask = cleanUnitAsk(row, now);
    if (ask === undefined) continue;
    const list = asksByType.get(row.typeId);
    if (list) list.push(ask);
    else asksByType.set(row.typeId, [ask]);
  }
  const estimates = new Map<number, ContractAskEstimate>();
  for (const [typeId, asks] of asksByType) {
    if (asks.length < MIN_ASK_ESTIMATE_CONTRACTS) continue;
    estimates.set(typeId, { typeId, unitPrice: median(asks), contracts: asks.length });
  }
  return estimates;
}

export function askEstimateCandidateTypeIds(
  assets: readonly { type_id: number; is_blueprint_copy?: boolean }[],
  priceByTypeId: ReadonlyMap<number, number>,
  isAbyssalType: ((typeId: number) => boolean) | null
): number[] {
  const seen = new Set<number>();
  for (const asset of assets) {
    if (asset.is_blueprint_copy) continue;
    if ((priceByTypeId.get(asset.type_id) ?? 0) > 0) continue;
    if (isAbyssalType?.(asset.type_id)) continue;
    seen.add(asset.type_id);
  }
  return [...seen];
}

export interface AskEstimateSummary {
  stacks: number;
  value: number;
}

export function summarizeAskEstimates(
  assets: readonly { type_id: number; quantity: number; item_id: number }[],
  estimates: ReadonlyMap<number, ContractAskEstimate>,
  itemValueByItemId: ReadonlyMap<number, number>
): AskEstimateSummary {
  let stacks = 0;
  let value = 0;
  for (const asset of assets) {
    const estimate = estimates.get(asset.type_id);
    if (!estimate || itemValueByItemId.has(asset.item_id)) continue;
    stacks += 1;
    value += estimate.unitPrice * asset.quantity;
  }
  return { stacks, value };
}
