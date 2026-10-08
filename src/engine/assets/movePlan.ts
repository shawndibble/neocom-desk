/**
 * Move Plan: what to carry from the selected assets to a destination, which
 * hauler hull needs the fewest trips, and which assembled ships to fly.
 *
 * Pure — the caller loads the assets, per-unit volumes and hulls. The hauler
 * suggestion is hull class and ownership only (no pilot skill or fit); trips
 * are a Cargo-Space-based estimate, never a safety verdict. Volume math is
 * shared with `planConsolidation`.
 */
import {
  consolidationLine,
  isHangarStock,
  tripsFor,
  type ConsolidationCharacter,
  type ConsolidationLine,
} from './consolidation';

export interface MoveHull {
  typeId: number;
  name: string;
  /** e.g. "Freighter", "Industrial". */
  hullClass: string;
  capacityM3: number;
  /** Whether any of the user's Characters owns this hull. */
  owned: boolean;
}

export interface MovePickupGroup {
  locationId: number;
  /** Known-volume stacks, largest first. */
  lines: ConsolidationLine[];
  /** Assembled ships to fly out. */
  ships: { itemId: number; typeId: number }[];
  /** Types with no known packaged volume, excluded from every total. */
  unknownVolume: { typeId: number; quantity: number }[];
  totalM3: number;
}

export interface MoveCharacterPlan {
  characterId: number;
  name: string;
  /** Largest volume first. */
  pickups: MovePickupGroup[];
  totalM3: number;
}

export interface HaulerOption {
  hull: MoveHull;
  trips: number;
}

export interface MovePlan {
  perCharacter: MoveCharacterPlan[];
  totals: {
    /** Hold-bound stacks with a known volume (type × pickup location). */
    stacks: number;
    totalM3: number;
    /** Characters with anything to move or fly. */
    characters: number;
    shipsToFly: number;
    /** Stacks left out for want of a packaged volume. */
    unknownVolumeCount: number;
    /** Trips with the suggested hauler; null without a suggestion. */
    trips: number | null;
  };
  /** Fewest trips, then smallest hull; null with nothing to haul or no hulls. */
  suggested: HaulerOption | null;
  /** Every hull, best first, for the "Compare haulers" disclosure. */
  comparison: HaulerOption[];
}

interface PickupAccumulator {
  quantities: Map<number, number>;
  ships: MovePickupGroup['ships'];
}

export function planMove(input: {
  /** Station ids the destination covers (a system is expanded by the caller). */
  destinationLocationIds: ReadonlySet<number>;
  /** The selected assets, per Character. */
  characters: readonly ConsolidationCharacter[];
  /** Per-unit packaged volume (unpackaged where none) by typeID. */
  unitM3: ReadonlyMap<number, number>;
  /** typeIDs that are ships: assembled ones are flown, not hauled. */
  shipTypeIds: ReadonlySet<number>;
  hulls: readonly MoveHull[];
}): MovePlan {
  const perCharacter: MoveCharacterPlan[] = [];

  for (const { characterId, name, assets } of input.characters) {
    const groups = new Map<number, PickupAccumulator>();
    for (const a of assets) {
      if (a.locationType === 'item' || a.locationType === 'solar_system') continue;
      if (input.destinationLocationIds.has(a.locationId)) continue;
      const isShip = a.isSingleton && input.shipTypeIds.has(a.typeId);
      if (!isShip && !isHangarStock(a)) continue;
      let group = groups.get(a.locationId);
      if (!group) groups.set(a.locationId, (group = { quantities: new Map(), ships: [] }));
      if (isShip) group.ships.push({ itemId: a.itemId, typeId: a.typeId });
      else group.quantities.set(a.typeId, (group.quantities.get(a.typeId) ?? 0) + a.quantity);
    }
    if (groups.size === 0) continue;

    const pickups: MovePickupGroup[] = [];
    for (const [locationId, { quantities, ships }] of groups) {
      const all = [...quantities].map(([typeId, quantity]) =>
        consolidationLine(typeId, quantity, input.unitM3)
      );
      const lines = all.filter((l) => l.m3 !== null);
      lines.sort((a, b) => (b.m3 ?? 0) - (a.m3 ?? 0) || a.typeId - b.typeId);
      const unknownVolume = all
        .filter((l) => l.m3 === null)
        .map(({ typeId, quantity }) => ({ typeId, quantity }))
        .sort((a, b) => a.typeId - b.typeId);
      ships.sort((a, b) => a.itemId - b.itemId);
      pickups.push({
        locationId,
        lines,
        ships,
        unknownVolume,
        totalM3: lines.reduce((sum, l) => sum + (l.m3 ?? 0), 0),
      });
    }
    pickups.sort((a, b) => b.totalM3 - a.totalM3 || a.locationId - b.locationId);
    perCharacter.push({
      characterId,
      name,
      pickups,
      totalM3: pickups.reduce((sum, p) => sum + p.totalM3, 0),
    });
  }

  const pickups = perCharacter.flatMap((c) => c.pickups);
  const totalM3 = perCharacter.reduce((sum, c) => sum + c.totalM3, 0);

  const comparison: HaulerOption[] = [];
  for (const hull of input.hulls) {
    const trips = tripsFor(totalM3, hull.capacityM3);
    if (trips !== null) comparison.push({ hull, trips });
  }
  comparison.sort(
    (a, b) =>
      a.trips - b.trips || a.hull.capacityM3 - b.hull.capacityM3 || a.hull.typeId - b.hull.typeId
  );
  const suggested = comparison[0] ?? null;

  return {
    perCharacter,
    totals: {
      stacks: pickups.reduce((sum, p) => sum + p.lines.length, 0),
      totalM3,
      characters: perCharacter.length,
      shipsToFly: pickups.reduce((sum, p) => sum + p.ships.length, 0),
      unknownVolumeCount: pickups.reduce((sum, p) => sum + p.unknownVolume.length, 0),
      trips: suggested?.trips ?? null,
    },
    suggested,
    comparison,
  };
}
