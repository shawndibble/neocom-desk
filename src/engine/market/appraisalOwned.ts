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

const SHIP_HELD_FLAG_PATTERN =
  /^(ShipHangar|FleetHangar|FighterBay|FighterTube\d+|SubSystemBay|FrigateEscapeBay|[A-Za-z]+Hold|[A-Za-z]+Bay)$/;

function isShipHeld(flag: string): boolean {
  return isShipBayFlag(flag) || SHIP_HELD_FLAG_PATTERN.test(flag);
}

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

export function ownedAnywhere(assetLists: readonly (readonly OwnedAsset[])[]): Map<number, number> {
  const owned = new Map<number, number>();
  eachPlacedAsset(assetLists, (asset) => {
    owned.set(asset.type_id, (owned.get(asset.type_id) ?? 0) + asset.quantity);
  });
  return owned;
}

export function ownedPlaces(assetLists: readonly (readonly OwnedAsset[])[]): OwnedPlace[] {
  const places = new Map<number, OwnedPlace>();
  eachPlacedAsset(assetLists, (_asset, place) => {
    if (!places.has(place.id)) places.set(place.id, place);
  });
  return [...places.values()];
}

export type WithOwned<T> = T & {
  owned: number;
  need: number;
};

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
