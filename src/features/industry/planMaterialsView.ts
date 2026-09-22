/**
 * The pure half of a materials table's owned-stock handling: which material
 * types detection scans, the `OwnedStockDetection` object every row reads,
 * and the "use all" / "use none" bulk rules. `BuildPlanDetail.tsx` (one plan)
 * and `BuildGroupPanel.tsx` (a Build Group's merged table) both call these, so
 * a group and its members can never hold two opinions about what the hangar
 * contains or which rows a bulk action may touch.
 */
import type { BuildPlanRecord } from '@/db';
import {
  bulkOwnedStockSuggestions,
  clearOwnedStockSuggestions,
  filterStockByScope,
  type DetectedOwnedStockMap,
  type OwnedStockSuggestion,
} from '@/engine/industry/ownedStock';
import type { MaterialSourcingMap, OwnedStockScope } from '@/engine/industry/types';
import { toIndustryBlueprint } from './blueprintCatalog';
import { buildPlanTypeIds, type RecipeCatalog } from './recipes';
import { stockLocationLabel, type OwnedStockDetection } from './ownedStockDetection';

type Translate = Parameters<typeof stockLocationLabel>[2];

/**
 * Every distinct type id across `rows`, sorted and joined — the real
 * dependency for owned-stock detection. `detectOwnedStock` scans every
 * Character's whole asset list (tens of thousands of rows), so it must not
 * re-run on a runs/ME/TE keystroke, and the table rows are a fresh array on
 * each of those. This string changes only when the set of materials does
 * (a build toggled, a member added), never when a number beside one is
 * edited — memoize `typeIdsFromKey` on it.
 */
export function materialTypeIdKey(rows: Iterable<{ typeID: number }>): string {
  const ids = new Set<number>();
  for (const row of rows) ids.add(row.typeID);
  return [...ids].sort((a, b) => a - b).join(',');
}

/** @see materialTypeIdKey */
export function typeIdsFromKey(key: string): number[] {
  return key === '' ? [] : key.split(',').map(Number);
}

/**
 * A Build Group's scan set: every type any member's resolved tree can show —
 * `buildPlanTypeIds`, the same price-independent walk the members' price
 * fetch uses — so a mineral only a sub-build introduces is detected at group
 * level exactly as it is on that member's own page. Deliberately not the
 * members' priced tables: those empty out on every price reload and refill
 * one member at a time, and each change of this key rescans every asset
 * list. Scanning a few types no row shows (the product, blueprint ids) costs
 * nothing a row ever reads.
 */
export function groupMaterialTypeIdKey(
  plans: readonly Pick<BuildPlanRecord, 'blueprintTypeID'>[],
  sources: RecipeCatalog
): string {
  const ids: { typeID: number }[] = [];
  for (const plan of plans) {
    const entry = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
    if (!entry) continue;
    for (const typeID of buildPlanTypeIds(toIndustryBlueprint(entry.blueprint), sources)) {
      ids.push({ typeID });
    }
  }
  return materialTypeIdKey(ids);
}

export interface OwnedStockViewInput {
  /** Galaxy-wide detection — the breakdown popover always shows all of it. */
  stock: DetectedOwnedStockMap;
  /** The owned-stock scope (issue #454) "use detected" is narrowed to. */
  scope: OwnedStockScope | undefined;
  characterNames: ReadonlyMap<number, string>;
  locationNames: ReadonlyMap<number, string>;
  incompleteCharacters: readonly string[];
  /**
   * The corp source's name when it is contributing and was itself capped or
   * missing pages — its totals are a floor too. Absent otherwise.
   */
  incompleteCorporation?: string | null;
  /** Labels a corp-owned placement; absent where no corp source can contribute. */
  corporationName?: string | null;
}

export interface OwnedStockView {
  detection: OwnedStockDetection;
  /** `stock` narrowed to the scope — what the bulk "use all" fills from. */
  scopedStock: DetectedOwnedStockMap;
}

export function ownedStockView(input: OwnedStockViewInput, t: Translate): OwnedStockView {
  const scopedStock = filterStockByScope(input.stock, input.scope);
  const incompleteCharacters = input.incompleteCorporation
    ? [...input.incompleteCharacters, input.incompleteCorporation]
    : input.incompleteCharacters;
  const detection: OwnedStockDetection = {
    stockFor: (typeID) => input.stock.get(typeID),
    scopedQuantityFor: (typeID) => scopedStock.get(typeID)?.quantity ?? 0,
    lowerBound: incompleteCharacters.length > 0,
    incompleteCharacters,
    characterNameFor: (characterId) => input.characterNames.get(characterId) ?? t('common.unknown'),
    corporationNameFor: () => input.corporationName ?? t('common.unknown'),
    locationLabelFor: (placement) => stockLocationLabel(placement, input.locationNames, t),
  };
  return { detection, scopedStock };
}

/** Adapts either owned-quantity store (a plan's sourcing, a group's ledger) to the engine's shape. */
function asSourcing(
  rows: readonly { typeID: number }[],
  ownedQuantityFor: (typeID: number) => number | undefined
): MaterialSourcingMap {
  const sourcing: MaterialSourcingMap = {};
  for (const { typeID } of rows) {
    const ownedQuantity = ownedQuantityFor(typeID);
    if (ownedQuantity !== undefined) sourcing[typeID] = { ownedQuantity };
  }
  return sourcing;
}

/**
 * "Use all detected": only rows with nothing typed in them — a hand-entered
 * value, including a deliberate 0, is never clobbered by a bulk action — each
 * filled with its scoped detected stock, capped at what the row needs.
 * Callers pass every row the per-row action can reach, or "use all" silently
 * skips rows the row beside it still offers to fill.
 */
export function bulkUseDetected(
  rows: readonly { typeID: number; quantity: number }[],
  ownedQuantityFor: (typeID: number) => number | undefined,
  scopedStock: DetectedOwnedStockMap
): OwnedStockSuggestion[] {
  return bulkOwnedStockSuggestions(rows, asSourcing(rows, ownedQuantityFor), scopedStock);
}

/**
 * "Use none": the reverse — zeroes every row carrying a non-zero owned
 * quantity, hand-typed or bulk-filled alike (issue #612). A deliberate
 * clobber, not the "untouched rows only" rule above.
 */
export function bulkUseNone(
  rows: readonly { typeID: number }[],
  ownedQuantityFor: (typeID: number) => number | undefined
): OwnedStockSuggestion[] {
  return clearOwnedStockSuggestions(rows, asSourcing(rows, ownedQuantityFor));
}
