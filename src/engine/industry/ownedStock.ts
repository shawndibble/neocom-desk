/**
 * Owned-stock detection: how much of each Build Plan material a player already
 * has sitting in their hangars, across every Character whose assets the caller
 * hands in.
 *
 * Pure, like every `src/engine` module — the caller does the ESI fetching and
 * the location-name resolution; this only decides what counts and adds it up.
 *
 * What counts is deliberately narrow (issue #181): a row is stock only when it
 * is packaged (`is_singleton === false`) and its ancestor chain does not run
 * through a ship. Fitted modules, cargo and drone-bay contents are gear in
 * use, not build material. Station containers are the opposite case — they
 * *are* how people organize materials, so a stack inside one counts and is
 * attributed to the station holding the container, not to the container.
 *
 * Location is not filtered at all. A Build Plan's facility is abstract and
 * carries no station id to match against, so there is no build site to be
 * "near"; the placement breakdown returned here is what lets the caller show
 * the player where the stock actually is and judge reachability themselves.
 */

import { isShipBayFlag, type EngineAsset } from '../assetTree';
import type { MaterialSourcingMap } from './types';

/** `EngineAsset` plus the packaged/assembled flag this module filters on. */
export interface StockAsset extends EngineAsset {
  /** True for an assembled or otherwise unstackable item — never counted as stock. */
  is_singleton: boolean;
}

/** One Character's asset list. Characters that could not be loaded are simply absent. */
export interface OwnedStockSource {
  characterId: number;
  assets: readonly StockAsset[];
}

/** Owned units of one material held by one Character at one location. */
export interface OwnedStockPlacement {
  characterId: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
  quantity: number;
}

export interface DetectedOwnedStock {
  /** Total owned units across every Character and location. */
  quantity: number;
  /** Largest holding first; ties broken by Character then location so the order is stable. */
  placements: OwnedStockPlacement[];
}

/** Detected stock keyed by material typeID. A material with no stock has no entry. */
export type DetectedOwnedStockMap = Map<number, DetectedOwnedStock>;

/**
 * The station/system this row ultimately sits in, or `null` when the chain
 * runs through a ship.
 *
 * A nested row (`location_type: 'item'`) points at its parent's `item_id`, so
 * resolving where it really is means walking up until a row that is not
 * nested. Two chains never terminate that way and both are real: a parent ESI
 * never returned a row for (a personal-hangar division inside a player-owned
 * structure — `Assets.tsx` resolves these ids through the structures endpoint
 * for exactly this reason), and a cycle. Both attribute the stock to the last
 * id seen rather than dropping it: under-reporting owned stock silently
 * inflates the plan's buy list.
 */
function resolvePlacement(
  asset: StockAsset,
  byItemId: ReadonlyMap<number, StockAsset>
): { locationId: number; locationType: EngineAsset['location_type'] } | null {
  let current = asset;
  const seen = new Set<number>([asset.item_id]);
  while (current.location_type === 'item') {
    if (isShipBayFlag(current.location_flag)) return null;
    const parent = byItemId.get(current.location_id);
    if (!parent || seen.has(parent.item_id)) {
      return { locationId: current.location_id, locationType: 'item' };
    }
    seen.add(parent.item_id);
    current = parent;
  }
  return { locationId: current.location_id, locationType: current.location_type };
}

/** `characterId:locationId` — placements are grouped per Character, so both are part of the key. */
function placementKey(characterId: number, locationId: number): string {
  return `${characterId}:${locationId}`;
}

function comparePlacements(a: OwnedStockPlacement, b: OwnedStockPlacement): number {
  if (a.quantity !== b.quantity) return b.quantity - a.quantity;
  if (a.characterId !== b.characterId) return a.characterId - b.characterId;
  return a.locationId - b.locationId;
}

/**
 * Owned stock per material typeID, summed across every source, with the
 * per-Character-per-location breakdown behind each total.
 *
 * `typeIDs` is the plan's material set: everything else in the asset list — and
 * a Character's list can run to tens of thousands of rows — is skipped before
 * any parent-chain walking happens.
 */
export function detectOwnedStock(
  sources: readonly OwnedStockSource[],
  typeIDs: ReadonlySet<number>
): DetectedOwnedStockMap {
  const detected: DetectedOwnedStockMap = new Map();
  if (typeIDs.size === 0) return detected;

  for (const { characterId, assets } of sources) {
    const byItemId = new Map<number, StockAsset>();
    for (const a of assets) byItemId.set(a.item_id, a);

    // typeID -> "characterId:locationId" -> placement, so repeated stacks of
    // one material at one location collapse into a single breakdown line.
    const grouped = new Map<number, Map<string, OwnedStockPlacement>>();
    for (const a of assets) {
      if (a.is_singleton || !typeIDs.has(a.type_id)) continue;
      const placement = resolvePlacement(a, byItemId);
      if (!placement) continue;

      let byLocation = grouped.get(a.type_id);
      if (!byLocation) {
        byLocation = new Map();
        grouped.set(a.type_id, byLocation);
      }
      const key = placementKey(characterId, placement.locationId);
      const existing = byLocation.get(key);
      if (existing) {
        existing.quantity += a.quantity;
      } else {
        byLocation.set(key, { characterId, ...placement, quantity: a.quantity });
      }
    }

    for (const [typeID, byLocation] of grouped) {
      let entry = detected.get(typeID);
      if (!entry) {
        entry = { quantity: 0, placements: [] };
        detected.set(typeID, entry);
      }
      for (const placement of byLocation.values()) {
        entry.quantity += placement.quantity;
        entry.placements.push(placement);
      }
    }
  }

  for (const entry of detected.values()) entry.placements.sort(comparePlacements);
  return detected;
}

/**
 * What a "use detected" action writes for one material.
 *
 * The stored field means "units of this material this plan draws on" — which
 * is exactly what the sourcing engine's clamp to `[0, required]` already says —
 * not "units owned in New Eden". Writing the raw detected total instead has a
 * real trap: raising `runs` later would silently let an oversized stored number
 * cover the larger requirement, from a detection the player confirmed at a
 * different scale. The breakdown still shows the true total owned.
 */
export function suggestedOwnedQuantity(detectedQuantity: number, requiredQuantity: number): number {
  return Math.min(detectedQuantity, requiredQuantity);
}

export interface OwnedStockSuggestion {
  typeID: number;
  ownedQuantity: number;
}

/**
 * The rows a bulk "use all detected" fills: those with detected stock and no
 * owned quantity stored at all.
 *
 * Bulk never clobbers. A hand-typed value — including a deliberate 0, which is
 * a real statement about a material the player means to buy — is left alone,
 * because a single click covering the whole table can't have meant any one of
 * them specifically. The per-row action is the one that overwrites; clicking it
 * on that row means it.
 */
export function bulkOwnedStockSuggestions(
  materials: readonly { typeID: number; quantity: number }[],
  sourcing: MaterialSourcingMap | undefined,
  stock: DetectedOwnedStockMap
): OwnedStockSuggestion[] {
  const suggestions: OwnedStockSuggestion[] = [];
  for (const material of materials) {
    if (sourcing?.[material.typeID]?.ownedQuantity !== undefined) continue;
    const detected = stock.get(material.typeID);
    if (!detected) continue;
    suggestions.push({
      typeID: material.typeID,
      ownedQuantity: suggestedOwnedQuantity(detected.quantity, material.quantity),
    });
  }
  return suggestions;
}
