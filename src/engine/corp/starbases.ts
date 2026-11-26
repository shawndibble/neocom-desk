import { HOUR_MS } from '../../../functions/src/timeConstants';

export const STARBASE_FUEL_WARNING_HOURS = 48;

export const FUEL_BLOCK_TYPE_IDS: ReadonlySet<number> = new Set([4051, 4246, 4247, 4312]);

export const STRONTIUM_TYPE_ID = 16275;

export const TOWER_FUEL_PER_HOUR: ReadonlyMap<number, number> = new Map([
  [12235, 40],
  [12236, 40],
  [16213, 40],
  [16214, 40],
  [20059, 20],
  [20060, 10],
  [20061, 20],
  [20062, 10],
  [20063, 20],
  [20064, 10],
  [20065, 20],
  [20066, 10],
  [27530, 36],
  [27532, 32],
  [27533, 36],
  [27535, 32],
  [27536, 36],
  [27538, 32],
  [27539, 36],
  [27540, 32],
  [27589, 18],
  [27591, 16],
  [27592, 9],
  [27594, 8],
  [27595, 18],
  [27597, 16],
  [27598, 9],
  [27600, 8],
  [27601, 18],
  [27603, 16],
  [27604, 9],
  [27606, 8],
  [27607, 18],
  [27609, 16],
  [27610, 9],
  [27612, 8],
  [27780, 36],
  [27782, 18],
  [27784, 9],
  [27786, 32],
  [27788, 16],
  [27790, 8],
]);

export interface StarbaseBay {
  fuelBlocks: number;
  strontium: number;
}

export function summariseBay(
  fuels: readonly { type_id: number; quantity: number }[] | undefined
): StarbaseBay {
  let fuelBlocks = 0;
  let strontium = 0;
  for (const fuel of fuels ?? []) {
    if (FUEL_BLOCK_TYPE_IDS.has(fuel.type_id)) fuelBlocks += fuel.quantity;
    else if (fuel.type_id === STRONTIUM_TYPE_ID) strontium += fuel.quantity;
  }
  return { fuelBlocks, strontium };
}

export function fuelHoursLeft(towerTypeId: number, fuelBlocks: number): number | null {
  const rate = TOWER_FUEL_PER_HOUR.get(towerTypeId);
  return rate === undefined ? null : fuelBlocks / rate;
}

export function towerFuelExpiresMs(
  tower: { typeId: number; state: string; bay: StarbaseBay | null },
  readAtMs: number
): number | null {
  if (tower.state !== 'online' || tower.bay === null) return null;
  const hours = fuelHoursLeft(tower.typeId, tower.bay.fuelBlocks);
  return hours === null ? null : readAtMs + hours * HOUR_MS;
}

export function towerLabel(typeName: string, systemName: string | undefined): string {
  return systemName === undefined ? typeName : `${typeName} (${systemName})`;
}
