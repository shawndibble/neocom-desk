/**
 * Pure abyssal valuation (GLOSSARY **Mutated module**, **Abyssal type**; scope
 * decision `*-mutamarket-is-the-abyssal-price-source.md`). A module is worth its
 * own MutaMarket estimate or is unpriced (out of the total, counted), never 0 or
 * a type/base price. Fetching: `market/mutamarket.ts`.
 */
import type { AppraisalUnmatched } from './appraisalMatch';

export interface AbyssalItemRef {
  itemId: number;
  typeId: number;
}

/** An owned item as ESI lists it. */
export interface OwnedItem {
  item_id: number;
  type_id: number;
}

/** How a set of abyssal items stand. All but `priced` are left out of a total. */
export interface AbyssalSummary {
  priced: number;
  /** Answered without a price. */
  unpriced: number;
  /** No answer yet. */
  pending: number;
}

/** The abyssal items among `assets`. */
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

/** Item id -> ISK for each abyssal item with a usable estimate; nothing else. */
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

/** Abyssal items by standing: priced (in `valueByItemId`), answered, or not yet. */
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

/** `priceByTypeId` with every abyssal type removed — the same map when it holds none. */
export function withoutAbyssalTypePrices<P>(
  priceByTypeId: ReadonlyMap<number, P>,
  isAbyssalType: (typeId: number) => boolean
): ReadonlyMap<number, P> {
  if (![...priceByTypeId.keys()].some(isAbyssalType)) return priceByTypeId;
  return new Map([...priceByTypeId].filter(([typeId]) => !isAbyssalType(typeId)));
}

/**
 * Pasted lines naming an abyssal type, split out of an appraisal's unmatched
 * lines: a name can't say which roll it is, so there is nothing to price, but
 * "not an item" would be wrong. `abyssalNames` is lower-case.
 */
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
