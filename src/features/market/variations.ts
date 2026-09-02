/**
 * Variations (CONTEXT.md round 6): the selected item's Tech I/II/Faction/
 * Storyline/Officer variation group (src/engine/market/variations.ts),
 * falling back to its Market Group siblings when the item has no variation
 * data — e.g. plain commodities/minerals with no meta variants. Pure and
 * synchronous; the route resolves each row's own price.
 */
import { getVariations, type VariationIndex } from '@/engine/market/variations';
import type { MarketTypeEntry } from '@/sde/marketTypes';

/** Bounds the table so a large variation group or Market Group cannot grow it unusably long. */
export const VARIATIONS_LIMIT = 20;

export interface VariationRow {
  typeId: number;
  name: string;
  /** Abbreviated meta group name (tierLabel), or null for sibling-fallback rows, which carry no meta-group classification. */
  tier: string | null;
}

export interface VariationsResult {
  /** Rows to render, capped at VARIATIONS_LIMIT. */
  rows: readonly VariationRow[];
  /** True row count before the cap. */
  totalCount: number;
  truncated: boolean;
}

/** "Tech I"/"Tech II"/"Tech III" -> "T1"/"T2"/"T3"; every other meta group name passes through unchanged. */
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

function cap(rows: readonly VariationRow[]): VariationsResult {
  const truncated = rows.length > VARIATIONS_LIMIT;
  return {
    rows: truncated ? rows.slice(0, VARIATIONS_LIMIT) : rows,
    totalCount: rows.length,
    truncated,
  };
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
  if (rows.length > 0) return cap(rows);
  return cap(siblingRows(typesByGroup, selected));
}
