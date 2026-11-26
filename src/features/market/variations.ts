import { getVariations, type VariationIndex } from '@/engine/market/variations';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { priceComparison, type PriceComparison } from '@/engine/market/orderBookDepth';
import type { MarketTypeEntry } from '@/sde/marketTypes';

export interface VariationRow {
  typeId: number;
  name: string;
  tier: string | null;
}

export interface VariationsResult {
  rows: readonly VariationRow[];
}

export function tierLabel(metaGroupName: string): string {
  switch (metaGroupName) {
    case 'Tech I':
      return 'T1';
    case 'Tech II':
      return 'T2';
    case 'Tech III':
      return 'T3';
    default:
      return metaGroupName;
  }
}

function siblingRows(
  typesByGroup: ReadonlyMap<number, readonly MarketTypeEntry[]>,
  selected: MarketTypeEntry
): VariationRow[] {
  const groupItems = typesByGroup.get(selected.marketGroupId) ?? [];
  return groupItems
    .filter((t) => t.typeId !== selected.typeId)
    .map((t) => ({ typeId: t.typeId, name: t.name, tier: null }));
}

export function getVariationRows(
  index: VariationIndex,
  typesByGroup: ReadonlyMap<number, readonly MarketTypeEntry[]>,
  typesById: ReadonlyMap<number, MarketTypeEntry>,
  selected: MarketTypeEntry
): VariationsResult {
  const group = getVariations(index, selected.typeId);
  const rows: VariationRow[] = [];
  for (const member of group.members) {
    if (member.typeId === selected.typeId) continue;
    const type = typesById.get(member.typeId);
    if (!type) continue;
    rows.push({ typeId: type.typeId, name: type.name, tier: tierLabel(member.metaGroupName) });
  }
  if (rows.length > 0) return { rows };
  return { rows: siblingRows(typesByGroup, selected) };
}

export function versusSelf(
  selfSummary: OrderBookSummary | undefined,
  prices: ReadonlyMap<number, OrderBookSummary | undefined>,
  typeId: number
): PriceComparison | null {
  return priceComparison(selfSummary?.bestSell ?? null, prices.get(typeId)?.bestSell ?? null);
}
