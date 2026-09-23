/** Ships to offer in the Mastery search box: only ones `masteries.json` actually carries data for. */
import type { MasteryMap, TypeMap } from '@/sde/types';

export interface ShipOption {
  typeID: number;
  name: string;
}

export function buildShipsWithMastery(types: TypeMap, masteries: MasteryMap): ShipOption[] {
  const ships: ShipOption[] = [];
  for (const key of Object.keys(masteries)) {
    const type = types[key];
    if (!type) continue;
    ships.push({ typeID: Number(key), name: type.name });
  }
  return ships.sort((a, b) => a.name.localeCompare(b.name));
}
