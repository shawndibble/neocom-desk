/**
 * Appraisal "minus owned": what a pasted pile still needs once the stock a
 * pilot already holds at one place is taken off. Pure — the caller fetches
 * the assets. Fittings' Copy multibuy reuses `subtractOwned` (#2829).
 *
 * One rule decides where an asset counts: walk its `location_id` chain (via
 * `item_id`) up to a place — an NPC station (`location_type: 'station'`) or a
 * player structure (a top-level `other` row) — passing only through
 * containers. The walk stops, and the asset counts nowhere, at a ship:
 * fitted slots and cargo/bays all sit under one. Corp hangars and ship cargo
 * are out of scope.
 */
import { isShipBayFlag } from '../assetTree';
import type { AppraisalRow } from './appraisal';

export interface OwnedAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: string;
  location_flag: string;
}

export interface OwnedPlace {
  id: number;
  kind: 'station' | 'structure';
}

/** Bays and holds only a ship has, beyond the fitted slots and Cargo/DroneBay `isShipBayFlag` knows. */
const SHIP_HELD_FLAG_PATTERN =
  /^(ShipHangar|FleetHangar|FighterBay|FighterTube\d+|SubSystemBay|FrigateEscapeBay|[A-Za-z]+Hold|[A-Za-z]+Bay)$/;

function isShipHeld(flag: string): boolean {
  return isShipBayFlag(flag) || SHIP_HELD_FLAG_PATTERN.test(flag);
}

/** The place an asset counts at, or null when a ship, a missing parent or a loop is in the way. */
function placeOf(asset: OwnedAsset, byItemId: ReadonlyMap<number, OwnedAsset>): OwnedPlace | null {
  const seen = new Set<number>();
  let current = asset;
  for (;;) {
    if (isShipHeld(current.location_flag)) return null;
    if (current.location_type === 'station') return { id: current.location_id, kind: 'station' };
    if (current.location_type === 'other') return { id: current.location_id, kind: 'structure' };
    if (current.location_type !== 'item') return null;
    const parent = byItemId.get(current.location_id);
    if (!parent || seen.has(parent.item_id)) return null;
    seen.add(parent.item_id);
    current = parent;
  }
}

function eachPlacedAsset(
  assetLists: readonly (readonly OwnedAsset[])[],
  visit: (asset: OwnedAsset, place: OwnedPlace) => void
): void {
  for (const assets of assetLists) {
    const byItemId = new Map(assets.map((a) => [a.item_id, a]));
    for (const asset of assets) {
      const place = placeOf(asset, byItemId);
      if (place) visit(asset, place);
    }
  }
}

/** Quantity per type id held at `placeId` (station or structure), summed over every Character's asset list. */
export function ownedAtPlace(
  assetLists: readonly (readonly OwnedAsset[])[],
  placeId: number
): Map<number, number> {
  const owned = new Map<number, number>();
  eachPlacedAsset(assetLists, (asset, place) => {
    if (place.id !== placeId) return;
    owned.set(asset.type_id, (owned.get(asset.type_id) ?? 0) + asset.quantity);
  });
  return owned;
}

/**
 * Quantity per type id held at any place, summed over every Character's asset
 * list: the "any location" choice of Minus owned. Fitted modules and ship
 * contents are not stock, so they stay out.
 */
export function ownedAnywhere(assetLists: readonly (readonly OwnedAsset[])[]): Map<number, number> {
  const owned = new Map<number, number>();
  eachPlacedAsset(assetLists, (asset) => {
    owned.set(asset.type_id, (owned.get(asset.type_id) ?? 0) + asset.quantity);
  });
  return owned;
}

/** Every place that holds counted stock, once each, in first-seen order. */
export function ownedPlaces(assetLists: readonly (readonly OwnedAsset[])[]): OwnedPlace[] {
  const places = new Map<number, OwnedPlace>();
  eachPlacedAsset(assetLists, (_asset, place) => {
    if (!places.has(place.id)) places.set(place.id, place);
  });
  return [...places.values()];
}

export type WithOwned<T> = T & {
  /** Held units, capped at `quantity`: the part of the line already covered. */
  owned: number;
  /** Units still to buy; 0 when the line is fully covered. */
  need: number;
};

/** An Appraisal line that carries what the pilot owns only once `subtractOwned` ran. */
export type OwnedRow = AppraisalRow & Partial<Pick<WithOwned<AppraisalRow>, 'owned' | 'need'>>;

export function subtractOwned<T extends { typeId: number; quantity: number }>(
  items: readonly T[],
  owned: ReadonlyMap<number, number>
): WithOwned<T>[] {
  return items.map((item) => {
    const held = Math.min(owned.get(item.typeId) ?? 0, item.quantity);
    return { ...item, owned: held, need: item.quantity - held };
  });
}
