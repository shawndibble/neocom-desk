import type { AppraisalUnmatched } from './appraisalMatch';

export interface AbyssalItemRef {
  itemId: number;
  typeId: number;
}

export interface OwnedItem {
  item_id: number;
  type_id: number;
}

export interface AbyssalSummary {
  priced: number;
  unpriced: number;
  pending: number;
}

export function abyssalItemRefs(
  assets: readonly OwnedItem[],
  isAbyssalType: (typeId: number) => boolean
): AbyssalItemRef[] {
  return assets
    .filter((asset) => isAbyssalType(asset.type_id))
    .map((asset) => ({ itemId: asset.item_id, typeId: asset.type_id }));
}

function usable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function abyssalItemValues(
  itemIds: readonly number[],
  estimates: ReadonlyMap<number, { value: number | null }>
): Map<number, number> {
  const values = new Map<number, number>();
  for (const itemId of itemIds) {
    const value = estimates.get(itemId)?.value;
    if (usable(value)) values.set(itemId, value);
  }
  return values;
}

export function summarizeAbyssal(
  itemIds: readonly number[],
  valueByItemId: ReadonlyMap<number, number>,
  answered: { has(itemId: number): boolean }
): AbyssalSummary {
  const summary: AbyssalSummary = { priced: 0, unpriced: 0, pending: 0 };
  for (const itemId of itemIds) {
    if (valueByItemId.has(itemId)) summary.priced += 1;
    else summary[answered.has(itemId) ? 'unpriced' : 'pending'] += 1;
  }
  return summary;
}

export function withoutAbyssalTypePrices<P>(
  priceByTypeId: ReadonlyMap<number, P>,
  isAbyssalType: (typeId: number) => boolean
): ReadonlyMap<number, P> {
  if (![...priceByTypeId.keys()].some(isAbyssalType)) return priceByTypeId;
  return new Map([...priceByTypeId].filter(([typeId]) => !isAbyssalType(typeId)));
}

export function splitAbyssalUnmatched(
  unmatched: readonly AppraisalUnmatched[],
  abyssalNames: ReadonlySet<string>
): { abyssal: AppraisalUnmatched[]; unmatched: AppraisalUnmatched[] } {
  const abyssal: AppraisalUnmatched[] = [];
  const rest: AppraisalUnmatched[] = [];
  for (const entry of unmatched) {
    (abyssalNames.has(entry.name.trim().toLowerCase()) ? abyssal : rest).push(entry);
  }
  return { abyssal, unmatched: rest };
}
