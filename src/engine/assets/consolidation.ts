/**
 * Consolidation Plan: what each Character would have to move to bring their
 * loose hangar stock to one destination, with the packaged volume to haul.
 *
 * Pure — the caller loads the assets, the per-unit volumes and the saved Cargo
 * Space. The result is a Cargo-Space-based estimate, never a safety verdict.
 */

/** The slice of an ESI asset row this plan reads. */
export interface ConsolidationAsset {
  itemId: number;
  typeId: number;
  quantity: number;
  locationId: number;
  locationType: 'station' | 'solar_system' | 'item' | 'other';
  /** Assembled items (ships, rigged gear) are not cargo. */
  isSingleton: boolean;
}

export interface ConsolidationCharacter {
  characterId: number;
  name: string;
  assets: readonly ConsolidationAsset[];
}

export interface ConsolidationLine {
  typeId: number;
  quantity: number;
  /** `null` when the type's volume is unknown. */
  m3: number | null;
}

export interface ConsolidationCharacterPlan {
  characterId: number;
  name: string;
  /** Largest volume first; unknown-volume lines last. */
  lines: ConsolidationLine[];
  totalM3: number;
  /** Types whose volume is unknown — `totalM3` is then a floor. */
  unknownTypeCount: number;
}

export interface ConsolidationPlan {
  /** Only Characters with something to move. */
  perCharacter: ConsolidationCharacterPlan[];
  totalM3: number;
  /** `ceil(totalM3 / holdsCapacityM3)`; null without a Cargo Space or without volume. */
  trips: number | null;
}

/** Hangar stock only: not assembled, not in a container/ship, not in space. */
export function isHangarStock(a: ConsolidationAsset): boolean {
  return !a.isSingleton && a.locationType !== 'item' && a.locationType !== 'solar_system';
}

/** One line of the plan: `m3` is `null` when the type's volume is unknown. */
export function consolidationLine(
  typeId: number,
  quantity: number,
  unitM3: ReadonlyMap<number, number>
): ConsolidationLine {
  const unit = unitM3.get(typeId);
  return { typeId, quantity, m3: unit === undefined ? null : unit * quantity };
}

/** `ceil(totalM3 / capacityM3)`; null without a usable capacity or without volume. */
export function tripsFor(totalM3: number, capacityM3: number | null): number | null {
  return capacityM3 !== null && capacityM3 > 0 && totalM3 > 0
    ? Math.ceil(totalM3 / capacityM3)
    : null;
}

export function planConsolidation(input: {
  destinationLocationId: number;
  characters: readonly ConsolidationCharacter[];
  /** Per-unit packaged volume (unpackaged where none) by typeID. */
  unitM3: ReadonlyMap<number, number>;
  holdsCapacityM3: number | null;
}): ConsolidationPlan {
  const perCharacter: ConsolidationCharacterPlan[] = [];

  for (const { characterId, name, assets } of input.characters) {
    const quantities = new Map<number, number>();
    for (const a of assets) {
      if (!isHangarStock(a)) continue;
      if (a.locationId === input.destinationLocationId) continue;
      quantities.set(a.typeId, (quantities.get(a.typeId) ?? 0) + a.quantity);
    }
    if (quantities.size === 0) continue;

    const lines = [...quantities].map(([typeId, quantity]) =>
      consolidationLine(typeId, quantity, input.unitM3)
    );
    lines.sort((a, b) => (b.m3 ?? -1) - (a.m3 ?? -1) || a.typeId - b.typeId);

    perCharacter.push({
      characterId,
      name,
      lines,
      totalM3: lines.reduce((sum, l) => sum + (l.m3 ?? 0), 0),
      unknownTypeCount: lines.filter((l) => l.m3 === null).length,
    });
  }

  const totalM3 = perCharacter.reduce((sum, c) => sum + c.totalM3, 0);
  return { perCharacter, totalM3, trips: tripsFor(totalM3, input.holdsCapacityM3) };
}
