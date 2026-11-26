import { isShipBayFlag, type EngineAsset } from '../assetTree';
import { corpAssetGroupId } from '../corp/assetDivisions';
import type { OwnedStockHangar, OwnedStockLocation, OwnedStockScope } from './types';

export type { OwnedStockHangar, OwnedStockLocation, OwnedStockScope };

export interface StockAsset extends EngineAsset {
  is_singleton: boolean;
}

export interface OwnedStockSource {
  characterId: number;
  corporationId?: number;
  assets: readonly StockAsset[];
}

export interface OwnedStockPlacement {
  characterId: number;
  corporationId?: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
  quantity: number;
  containers?: OwnedStockContainerHolding[];
  hangars?: OwnedStockHangarHolding[];
}

export interface OwnedStockHangarHolding {
  division: number;
  quantity: number;
}

export interface OwnedStockContainerHolding {
  containerId: number;
  hangar?: number;
  typeId: number;
  quantity: number;
}

export interface DetectedOwnedStock {
  quantity: number;
  placements: OwnedStockPlacement[];
}

export type DetectedOwnedStockMap = Map<number, DetectedOwnedStock>;

export function ownedStockLocationKey(
  location: Pick<
    OwnedStockPlacement,
    'characterId' | 'corporationId' | 'locationId' | 'locationType'
  >
): string {
  return location.corporationId !== undefined
    ? `corp:${location.corporationId}:${location.locationType}:${location.locationId}`
    : `${location.characterId}:${location.locationType}:${location.locationId}`;
}

export function filterStockByScope(
  stock: DetectedOwnedStockMap,
  scope: OwnedStockScope | undefined
): DetectedOwnedStockMap {
  if (!scope || scope.mode === 'everywhere') return stock;

  const allowed = new Set(scope.locations.map(ownedStockLocationKey));
  const excluded = new Set(scope.excludedContainers ?? []);
  const includedContainers = new Set(scope.containers ?? []);
  const hangarsByLocation = new Map<string, Set<number>>();
  for (const h of scope.hangars ?? []) {
    const key = ownedStockLocationKey(h);
    const set = hangarsByLocation.get(key) ?? new Set<number>();
    set.add(h.division);
    hangarsByLocation.set(key, set);
  }
  const filtered: DetectedOwnedStockMap = new Map();
  for (const [typeID, entry] of stock) {
    const placements: OwnedStockPlacement[] = [];
    for (const p of entry.placements) {
      const key = ownedStockLocationKey(p);
      const narrowed = allowed.has(key)
        ? withoutContainers(p, excluded)
        : narrowedTo(p, hangarsByLocation.get(key), includedContainers);
      if (narrowed.quantity > 0) placements.push(narrowed);
    }
    if (placements.length === 0) continue;
    filtered.set(typeID, {
      quantity: placements.reduce((sum, p) => sum + p.quantity, 0),
      placements,
    });
  }
  return filtered;
}

function narrowedTo(
  placement: OwnedStockPlacement,
  divisions: ReadonlySet<number> | undefined,
  includedContainers: ReadonlySet<number>
): OwnedStockPlacement {
  const hangars = (placement.hangars ?? []).filter((h) => divisions?.has(h.division));
  const containers = (placement.containers ?? []).filter(
    (c) =>
      includedContainers.has(c.containerId) || (c.hangar !== undefined && divisions?.has(c.hangar))
  );
  const viaHangars = hangars.reduce((sum, h) => sum + h.quantity, 0);
  const viaContainers = containers
    .filter((c) => c.hangar === undefined || !divisions?.has(c.hangar))
    .reduce((sum, c) => sum + c.quantity, 0);
  const narrowed: OwnedStockPlacement = { ...placement, quantity: viaHangars + viaContainers };
  if (containers.length > 0) narrowed.containers = containers;
  else delete narrowed.containers;
  if (hangars.length > 0) narrowed.hangars = hangars;
  else delete narrowed.hangars;
  return narrowed;
}

function withoutContainers(
  placement: OwnedStockPlacement,
  excluded: ReadonlySet<number>
): OwnedStockPlacement {
  if (excluded.size === 0 || !placement.containers) return placement;
  const kept = placement.containers.filter((c) => !excluded.has(c.containerId));
  const removed = placement.containers.reduce(
    (sum, c) => sum + (excluded.has(c.containerId) ? c.quantity : 0),
    0
  );
  if (removed === 0) return placement;
  const narrowed: OwnedStockPlacement = { ...placement, quantity: placement.quantity - removed };
  if (kept.length > 0) narrowed.containers = kept;
  else delete narrowed.containers;
  return narrowed;
}

export function collectStockLocations(stock: DetectedOwnedStockMap): OwnedStockLocation[] {
  const seen = new Map<string, OwnedStockLocation>();
  for (const entry of stock.values()) {
    for (const p of entry.placements) {
      const key = ownedStockLocationKey(p);
      if (!seen.has(key)) {
        seen.set(key, {
          characterId: p.characterId,
          ...(p.corporationId !== undefined ? { corporationId: p.corporationId } : {}),
          locationId: p.locationId,
          locationType: p.locationType,
        });
      }
    }
  }
  return [...seen.values()];
}

function resolvePlacement(
  asset: StockAsset,
  byItemId: ReadonlyMap<number, StockAsset>
): {
  locationId: number;
  locationType: EngineAsset['location_type'];
  container?: { containerId: number; typeId: number; hangar?: number };
  hangar?: number;
} | null {
  const directParent = asset.location_type === 'item' ? byItemId.get(asset.location_id) : undefined;
  const parentIsContainer =
    directParent !== undefined && directParent.location_flag !== 'OfficeFolder';
  let hangar: number | undefined;
  let current = asset;
  const seen = new Set<number>([asset.item_id]);
  const done = (locationId: number, locationType: EngineAsset['location_type']) => {
    const containerHangar =
      hangar ?? (directParent ? corpHangarOf(directParent.location_flag) : undefined);
    const container =
      directParent && parentIsContainer
        ? {
            container: {
              containerId: directParent.item_id,
              typeId: directParent.type_id,
              ...(containerHangar !== undefined ? { hangar: containerHangar } : {}),
            },
          }
        : {};
    return { locationId, locationType, ...container, ...(hangar !== undefined ? { hangar } : {}) };
  };
  while (current.location_type === 'item') {
    if (isShipHeld(current.location_flag)) return null;
    hangar ??= corpHangarOf(current.location_flag);
    const parent = byItemId.get(current.location_id);
    if (!parent || seen.has(parent.item_id)) return done(current.location_id, 'item');
    seen.add(parent.item_id);
    current = parent;
  }
  hangar ??= corpHangarOf(current.location_flag);
  return done(current.location_id, current.location_type);
}

function corpHangarOf(locationFlag: string): number | undefined {
  const group = corpAssetGroupId(locationFlag);
  return typeof group === 'number' ? group : undefined;
}

const SHIP_HOLD_PATTERN =
  /^(FleetHangar|ShipHangar|SubSystemBay|FighterBay|FighterTube\d+|FrigateEscapeBay|Specialized\w+(Hold|Bay))$/;

function isShipHeld(locationFlag: string): boolean {
  return isShipBayFlag(locationFlag) || SHIP_HOLD_PATTERN.test(locationFlag);
}

function comparePlacements(a: OwnedStockPlacement, b: OwnedStockPlacement): number {
  if (a.quantity !== b.quantity) return b.quantity - a.quantity;
  return ownedStockLocationKey(a).localeCompare(ownedStockLocationKey(b));
}

export function detectOwnedStock(
  sources: readonly OwnedStockSource[],
  typeIDs: ReadonlySet<number>
): DetectedOwnedStockMap {
  const detected: DetectedOwnedStockMap = new Map();
  if (typeIDs.size === 0) return detected;

  for (const { characterId, corporationId, assets } of sources) {
    const byItemId = new Map<number, StockAsset>();
    for (const a of assets) byItemId.set(a.item_id, a);

    const grouped = new Map<number, Map<string, OwnedStockPlacement>>();
    for (const a of assets) {
      if (a.is_singleton || !typeIDs.has(a.type_id)) continue;
      const resolved = resolvePlacement(a, byItemId);
      if (!resolved) continue;
      const { container, hangar, ...where } = resolved;
      const placement: OwnedStockPlacement = {
        characterId,
        ...(corporationId !== undefined ? { corporationId } : {}),
        ...where,
        quantity: a.quantity,
        ...(container ? { containers: [{ ...container, quantity: a.quantity }] } : {}),
        ...(hangar !== undefined ? { hangars: [{ division: hangar, quantity: a.quantity }] } : {}),
      };

      let byLocation = grouped.get(a.type_id);
      if (!byLocation) {
        byLocation = new Map();
        grouped.set(a.type_id, byLocation);
      }
      const key = ownedStockLocationKey(placement);
      const existing = byLocation.get(key);
      if (existing) {
        existing.quantity += a.quantity;
        if (hangar !== undefined) {
          existing.hangars ??= [];
          const line = existing.hangars.find((h) => h.division === hangar);
          if (line) line.quantity += a.quantity;
          else existing.hangars.push({ division: hangar, quantity: a.quantity });
        }
        if (container) {
          existing.containers ??= [];
          const line = existing.containers.find((c) => c.containerId === container.containerId);
          if (line) line.quantity += a.quantity;
          else existing.containers.push({ ...container, quantity: a.quantity });
        }
      } else {
        byLocation.set(key, placement);
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

export function suggestedOwnedQuantity(detectedQuantity: number, requiredQuantity: number): number {
  return Math.min(detectedQuantity, requiredQuantity);
}
