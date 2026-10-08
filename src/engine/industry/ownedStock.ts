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
import { corpAssetGroupId } from '../corp/assetDivisions';
import type { OwnedStockHangar, OwnedStockLocation, OwnedStockScope } from './types';

// Re-exported from here too: every existing caller of this module already
// imports its owned-stock types from `./ownedStock`, and the canonical
// definitions live in `./types` alongside `MaterialSourcing`/`RigLevel` etc.
// — the same module `BuildPlanRecord`'s other persisted-field types come
// from (`src/db/index.ts`).
export type { OwnedStockHangar, OwnedStockLocation, OwnedStockScope };

/** `EngineAsset` plus the packaged/assembled flag this module filters on. */
export interface StockAsset extends EngineAsset {
  /** True for an assembled or otherwise unstackable item — never counted as stock. */
  is_singleton: boolean;
}

/**
 * One Character's asset list, or one Corporation's (issue #798) read through
 * a Director's own access. Characters that could not be loaded are simply
 * absent. `characterId` is always the Character whose access produced this
 * source — for a corp source that's the reading Director, kept because
 * structure-name resolution is ACL-checked per Character
 * (`resolveStockLocationNames`) even when the stock itself belongs to the
 * corp. `corporationId` present is what actually marks a source as
 * corp-owned rather than personal.
 */
export interface OwnedStockSource {
  characterId: number;
  corporationId?: number;
  assets: readonly StockAsset[];
}

/**
 * Owned units of one material held by one Character or Corporation
 * (`corporationId` present, issue #798) at one location.
 */
export interface OwnedStockPlacement {
  characterId: number;
  corporationId?: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
  quantity: number;
  /**
   * How much of `quantity` sits inside station containers (issue #2869), by
   * the container directly holding it. Absent when every unit is loose in the
   * hangar. Informational for the scope picker: the placement stays one line
   * per location, so totals and breakdown rows are unchanged.
   */
  containers?: OwnedStockContainerHolding[];
  /**
   * How much of `quantity` sits in each corp hangar division 1-7 (issue
   * #2941), containers inside the division included. Absent when no row
   * carried a hangar flag (personal assets, or a cache that predates the
   * flag): such stock is station-level and only a selected station counts it.
   */
  hangars?: OwnedStockHangarHolding[];
}

export interface OwnedStockHangarHolding {
  division: number;
  quantity: number;
}

export interface OwnedStockContainerHolding {
  containerId: number;
  /** Corp hangar division the container sits in, when known (issue #2941). */
  hangar?: number;
  /** The container's own typeID, for labelling it. */
  typeId: number;
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
 * `characterId:locationType:locationId` — the one identity key every
 * owned-stock-scope operation keys off of, shared by `filterStockByScope`,
 * `collectStockLocations`, and the scope-control UI's own chip identity.
 * Accepts a placement or a bare location: both carry the three fields.
 *
 * A corp-owned location (`corporationId` present, issue #798) keys on the
 * corporation instead, under a distinct `corp:` prefix — never on
 * `characterId`, which for a corp placement is only the Director who
 * happened to read it and must not be part of the identity: switching the
 * active Director must not orphan a plan's saved "selected locations"
 * scope. The `corp:` prefix also keeps this format byte-identical to every
 * pre-existing personal key, so an already-persisted `BuildPlanRecord`'s
 * `ownedStockScope` keeps matching its own placements unchanged.
 */
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

/**
 * Narrows detected stock down to placements within `scope`'s selected
 * locations, re-summing each material's `quantity` from what remains.
 *
 * `scope` absent or `{ mode: 'everywhere' }` returns `stock` itself unchanged
 * — today's galaxy-wide behavior stays the default, byte-identical to before
 * this scope existed.
 */
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

/**
 * The part of a placement inside the chosen hangar divisions or containers
 * (issue #2941), for a station that is not selected as a whole. A container
 * inside a chosen hangar counts once, through the hangar.
 */
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

/**
 * Every distinct Character/location combination holding any of the detected
 * stock, for populating a "selected locations" picker. Order is not
 * meaningful — callers sort for display.
 */
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
): {
  locationId: number;
  locationType: EngineAsset['location_type'];
  container?: { containerId: number; typeId: number; hangar?: number };
  hangar?: number;
} | null {
  const directParent = asset.location_type === 'item' ? byItemId.get(asset.location_id) : undefined;
  // A corp's office folder is the hangars' parent, not a container players organize by.
  const parentIsContainer =
    directParent !== undefined && directParent.location_flag !== 'OfficeFolder';
  let hangar: number | undefined;
  let current = asset;
  const seen = new Set<number>([asset.item_id]);
  const done = (locationId: number, locationType: EngineAsset['location_type']) => {
    const containerHangar = directParent ? corpHangarOf(directParent.location_flag) : undefined;
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

/** The corp hangar division (1-7) a `location_flag` names, or undefined for anything else. */
function corpHangarOf(locationFlag: string): number | undefined {
  const group = corpAssetGroupId(locationFlag);
  return typeof group === 'number' ? group : undefined;
}

/**
 * Ship-only holds beyond the three bays `assetTree` names for rendering. That
 * module only has to decide what to *draw* as a ship, so Cargo/DroneBay/fitting
 * is enough for it; counting stock has to answer "is this in a ship" for every
 * hold a ship has, or minerals in a freighter's fleet hangar would read as
 * station stock while the same minerals in its cargo hold did not.
 */
const SHIP_HOLD_PATTERN =
  /^(FleetHangar|ShipHangar|SubSystemBay|FighterBay|FighterTube\d+|FrigateEscapeBay|Specialized\w+(Hold|Bay))$/;

function isShipHeld(locationFlag: string): boolean {
  return isShipBayFlag(locationFlag) || SHIP_HOLD_PATTERN.test(locationFlag);
}

function comparePlacements(a: OwnedStockPlacement, b: OwnedStockPlacement): number {
  if (a.quantity !== b.quantity) return b.quantity - a.quantity;
  return ownedStockLocationKey(a).localeCompare(ownedStockLocationKey(b));
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

  for (const { characterId, corporationId, assets } of sources) {
    const byItemId = new Map<number, StockAsset>();
    for (const a of assets) byItemId.set(a.item_id, a);

    // typeID -> ownedStockLocationKey -> placement, so repeated stacks of one
    // material at one location collapse into a single breakdown line. Keying
    // on the same identity `ownedStockLocationKey` defines elsewhere (rather
    // than a second, ad-hoc key) is what keeps "which owner does this belong
    // to" answered in exactly one place.
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
