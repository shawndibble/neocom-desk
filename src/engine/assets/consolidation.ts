export interface ConsolidationAsset {
  itemId: number;
  typeId: number;
  quantity: number;
  locationId: number;
  locationType: 'station' | 'solar_system' | 'item' | 'other';
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
  m3: number | null;
}

export interface ConsolidationCharacterPlan {
  characterId: number;
  name: string;
  lines: ConsolidationLine[];
  totalM3: number;
  unknownTypeCount: number;
}

export interface ConsolidationPlan {
  perCharacter: ConsolidationCharacterPlan[];
  totalM3: number;
  trips: number | null;
}

export function isHangarStock(a: ConsolidationAsset): boolean {
  return !a.isSingleton && a.locationType !== 'item' && a.locationType !== 'solar_system';
}

export function consolidationLine(
  typeId: number,
  quantity: number,
  unitM3: ReadonlyMap<number, number>
): ConsolidationLine {
  const unit = unitM3.get(typeId);
  return { typeId, quantity, m3: unit === undefined ? null : unit * quantity };
}

export function tripsFor(totalM3: number, capacityM3: number | null): number | null {
  return capacityM3 !== null && capacityM3 > 0 && totalM3 > 0
    ? Math.ceil(totalM3 / capacityM3)
    : null;
}

export function planConsolidation(input: {
  destinationLocationId: number;
  characters: readonly ConsolidationCharacter[];
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
