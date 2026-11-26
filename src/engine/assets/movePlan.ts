import {
  consolidationLine,
  isHangarStock,
  type ConsolidationCharacter,
  type ConsolidationLine,
} from './consolidation';
import { packHauls, type Haul, type PackHold, type PackLine } from './haulPacking';

export type { Haul, HoldLoad, PackHold } from './haulPacking';

export interface MoveHullOwnedAt {
  systemId: number;
  jumps: number | null;
  characterName: string;
}

export interface MoveHull {
  typeId: number;
  name: string;
  hullClass: string;
  capacityM3: number;
  holds: PackHold[];
  owned: boolean;
  ownedAt?: MoveHullOwnedAt;
  canFly: boolean;
}

export interface MovePickupGroup {
  locationId: number;
  lines: ConsolidationLine[];
  ships: { itemId: number; typeId: number }[];
  packed: { itemId: number; typeId: number }[];
  unknownVolume: { typeId: number; quantity: number }[];
  totalM3: number;
}

export interface MoveCharacterPlan {
  characterId: number;
  name: string;
  pickups: MovePickupGroup[];
  totalM3: number;
}

export interface PickupHauls {
  characterId: number;
  locationId: number;
  hauls: Haul[];
  unfit: PackLine[];
  overLimit: PackLine[];
  tooBigShips: PackLine[];
}

export interface HaulerOption {
  hull: MoveHull;
  trips: number;
  pickups: PickupHauls[];
  unfitCount: number;
  overLimitCount: number;
  tooBigCount: number;
}

export const CUSTOM_HAULER_TYPE_ID = 0;

export const MAX_CUSTOM_HAULS = 10_000;

export function customM3Problem(m3: number, totalM3: number): 'invalid' | 'tooSmall' | null {
  if (!Number.isFinite(m3) || m3 <= 0) return 'invalid';
  return totalM3 / m3 > MAX_CUSTOM_HAULS ? 'tooSmall' : null;
}

export type HaulerOverride = { hullTypeId: number } | { customM3: number };

export interface MovePlan {
  perCharacter: MoveCharacterPlan[];
  totals: {
    stacks: number;
    totalM3: number;
    characters: number;
    shipsToFly: number;
    unknownVolumeCount: number;
    unpricedCount: number;
    trips: number | null;
  };
  suggested: HaulerOption | null;
  active: HaulerOption | null;
  comparison: HaulerOption[];
}

interface PickupAccumulator {
  quantities: Map<number, number>;
  ships: MovePickupGroup['ships'];
  packed: MovePickupGroup['ships'];
}

export function planMove(input: {
  destinationLocationIds: ReadonlySet<number>;
  characters: readonly ConsolidationCharacter[];
  unitM3: ReadonlyMap<number, number>;
  shipTypeIds: ReadonlySet<number>;
  packedShipIds?: ReadonlySet<number>;
  hulls: readonly MoveHull[];
  unitIsk?: ReadonlyMap<number, number>;
  maxIskPerHaul?: number | null;
  haulerOverride?: HaulerOverride;
}): MovePlan {
  const perCharacter: MoveCharacterPlan[] = [];

  for (const { characterId, name, assets } of input.characters) {
    const groups = new Map<number, PickupAccumulator>();
    for (const a of assets) {
      if (a.locationType === 'item' || a.locationType === 'solar_system') continue;
      if (input.destinationLocationIds.has(a.locationId)) continue;
      const isShip = a.isSingleton && input.shipTypeIds.has(a.typeId);
      const packed = isShip && input.packedShipIds?.has(a.itemId) === true;
      if (!isShip && !isHangarStock(a)) continue;
      let group = groups.get(a.locationId);
      if (!group)
        groups.set(a.locationId, (group = { quantities: new Map(), ships: [], packed: [] }));
      if (isShip && !packed) group.ships.push({ itemId: a.itemId, typeId: a.typeId });
      else if (packed) {
        group.packed.push({ itemId: a.itemId, typeId: a.typeId });
        group.quantities.set(a.typeId, (group.quantities.get(a.typeId) ?? 0) + a.quantity);
      } else group.quantities.set(a.typeId, (group.quantities.get(a.typeId) ?? 0) + a.quantity);
    }
    if (groups.size === 0) continue;

    const pickups: MovePickupGroup[] = [];
    for (const [locationId, { quantities, ships, packed }] of groups) {
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
      packed.sort((a, b) => a.itemId - b.itemId);
      pickups.push({
        locationId,
        lines,
        ships,
        packed,
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

  const optionFor = (hull: MoveHull): HaulerOption => {
    const packed = perCharacter.flatMap((c) =>
      c.pickups.map((p): PickupHauls => {
        const lines: PackLine[] = p.lines
          .filter((l) => l.m3 !== null && l.m3 > 0)
          .map((l) => ({
            typeId: l.typeId,
            quantity: l.quantity,
            unitM3: l.m3! / l.quantity,
            ...(input.unitIsk?.has(l.typeId) ? { unitIsk: input.unitIsk.get(l.typeId) } : {}),
          }));
        const { hauls, unfit, overLimit } = packHauls(lines, hull.holds, input.maxIskPerHaul);
        const tooBigShips: PackLine[] = [];
        const stillUnfit: PackLine[] = [];
        for (const u of unfit) {
          const packedHere = p.packed.filter((s) => s.typeId === u.typeId).length;
          const flown = Math.min(u.quantity, packedHere);
          if (flown > 0) tooBigShips.push({ ...u, quantity: flown });
          if (u.quantity > flown) stillUnfit.push({ ...u, quantity: u.quantity - flown });
        }
        return {
          characterId: c.characterId,
          locationId: p.locationId,
          hauls,
          unfit: stillUnfit,
          overLimit,
          tooBigShips,
        };
      })
    );
    return {
      hull,
      pickups: packed.filter(
        (p) =>
          p.hauls.length > 0 ||
          p.unfit.length > 0 ||
          p.overLimit.length > 0 ||
          p.tooBigShips.length > 0
      ),
      trips: packed.reduce((sum, p) => sum + p.hauls.length, 0),
      unfitCount: packed.reduce((sum, p) => sum + p.unfit.length, 0),
      overLimitCount: packed.reduce((sum, p) => sum + p.overLimit.length, 0),
      tooBigCount: packed.reduce(
        (sum, p) => sum + p.tooBigShips.reduce((n, u) => n + u.quantity, 0),
        0
      ),
    };
  };

  const comparison: HaulerOption[] = [];
  if (totalM3 > 0) {
    for (const hull of input.hulls.filter((h) => h.canFly && h.holds.length > 0)) {
      comparison.push(optionFor(hull));
    }
  }
  comparison.sort(
    (a, b) =>
      a.unfitCount - b.unfitCount ||
      a.trips + a.tooBigCount - (b.trips + b.tooBigCount) ||
      a.hull.capacityM3 - b.hull.capacityM3 ||
      a.hull.typeId - b.hull.typeId
  );
  const suggested = comparison[0] ?? null;

  const override = input.haulerOverride;
  let active = suggested;
  if (override && totalM3 > 0) {
    if ('customM3' in override) {
      const m3 = override.customM3;
      if (customM3Problem(m3, totalM3) === null)
        active = optionFor({
          typeId: CUSTOM_HAULER_TYPE_ID,
          name: '',
          hullClass: '',
          capacityM3: m3,
          holds: [{ kind: 'cargo', capacityM3: m3 }],
          owned: false,
          canFly: true,
        });
    } else {
      active = comparison.find((o) => o.hull.typeId === override.hullTypeId) ?? suggested;
    }
  }

  return {
    perCharacter,
    totals: {
      stacks: pickups.reduce((sum, p) => sum + p.lines.length, 0),
      totalM3,
      characters: perCharacter.length,
      shipsToFly: pickups.reduce((sum, p) => sum + p.ships.length, 0),
      unknownVolumeCount: pickups.reduce((sum, p) => sum + p.unknownVolume.length, 0),
      unpricedCount: pickups.reduce(
        (sum, p) => sum + p.lines.filter((l) => !input.unitIsk?.has(l.typeId)).length,
        0
      ),
      trips: active?.trips ?? null,
    },
    suggested,
    active,
    comparison,
  };
}
