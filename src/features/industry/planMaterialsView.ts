/**
 * The pure half of a materials table's owned-stock handling: which material
 * types detection scans, the `OwnedStockDetection` object every row reads,
 * and the two stores' adapters for the owned-stock offer
 * (`src/engine/industry/ownedStockOffer.ts`, which owns "Use assets",
 * "Use all", "Use none" and their Undo). `BuildPlanDetail.tsx` (one plan) and
 * `BuildGroupPanel.tsx` (a Build Group's merged table) both call these, so a
 * group and its members can never hold two opinions about what the hangar
 * contains or which rows a bulk action may touch.
 */
import type { BuildPlanRecord } from '@/db';
import { filterStockByScope, type DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import type { OwnedStockChange } from '@/engine/industry/ownedStockOffer';
import type { OwnedStockScope } from '@/engine/industry/types';
import type { SourcingPatchEntry } from './buildPlanStore';
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
}

export function ownedStockView(input: OwnedStockViewInput, t: Translate): OwnedStockView {
  const scopedStock = filterStockByScope(input.stock, input.scope);
  const incompleteCharacters = input.incompleteCorporation
    ? [...input.incompleteCharacters, input.incompleteCorporation]
    : input.incompleteCharacters;
  const detection: OwnedStockDetection = {
    scopedQuantityFor: (typeID) => scopedStock.get(typeID)?.quantity ?? 0,
    lowerBound: incompleteCharacters.length > 0,
    incompleteCharacters,
    characterNameFor: (characterId) => input.characterNames.get(characterId) ?? t('common.unknown'),
    corporationNameFor: () => input.corporationName ?? t('common.unknown'),
    locationLabelFor: (placement) => stockLocationLabel(placement, input.locationNames, t),
  };
  return { detection };
}

/**
 * The owned-stock offer's plan-sourcing adapter: its changes as the plan's
 * `sourcing` edits. A `to` of `undefined` clears the field (an Undo back to an
 * untouched row); a 0 is stored as 0, which is how a plan has always kept
 * "Use none".
 */
export function planSourcingPatches(changes: readonly OwnedStockChange[]): SourcingPatchEntry[] {
  return changes.map(({ typeID, to }) => ({ typeID, patch: { ownedQuantity: to } }));
}

/**
 * The owned-stock offer's Group Owned Overlay adapter: applies its changes to
 * `ledger` (a copy of the group's `ownedStock`) in place. An empty count — 0 or
 * nothing — removes the entry, the overlay's one rule for it, the same one a
 * typed value commits through.
 */
export function applyToGroupOwnedStock(
  ledger: Record<number, number>,
  changes: readonly Pick<OwnedStockChange, 'typeID' | 'to'>[]
): void {
  for (const { typeID, to } of changes) {
    if (to === undefined || to <= 0) delete ledger[typeID];
    else ledger[typeID] = to;
  }
}

/** The material whose owned count the Build Group's ledger and a member plan disagree on most. */
export interface GroupOwnedDifference {
  typeID: number;
  name: string;
  group: number;
  plan: number;
}

/**
 * Where a member plan's own owned counts and its Build Group's ledger
 * (`ownedStock`) disagree, for the plan's own materials. A missing count is 0
 * on both sides. The largest absolute gap wins, ties to the lowest typeID, so
 * the one-line hint names a stable material. `null` when every count agrees.
 */
export function groupOwnedDifference(
  materials: readonly { typeID: number; name: string }[],
  planOwned: Record<number, { ownedQuantity?: number } | undefined> | undefined,
  groupOwned: Record<number, number> | undefined
): GroupOwnedDifference | null {
  let best: GroupOwnedDifference | null = null;
  for (const { typeID, name } of materials) {
    const plan = Math.max(0, Math.floor(planOwned?.[typeID]?.ownedQuantity ?? 0));
    const group = Math.max(0, Math.floor(groupOwned?.[typeID] ?? 0));
    if (plan === group) continue;
    const gap = Math.abs(plan - group);
    const bestGap = best ? Math.abs(best.plan - best.group) : -1;
    if (gap > bestGap || (gap === bestGap && best && typeID < best.typeID)) {
      best = { typeID, name, group, plan };
    }
  }
  return best;
}
