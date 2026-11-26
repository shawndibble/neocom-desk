export interface MiningLedgerRow {
  date: string;
  quantity: number;
  solar_system_id: number;
  type_id: number;
}

export interface OreLine {
  typeId: number;
  quantity: number;
}

export interface MiningLedgerEntry {
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: OreLine[];
}

export function entryKey(characterId: number, date: string, solarSystemId: number): string {
  return `${characterId}:${date}:${solarSystemId}`;
}

export interface QuantityDiff {
  typeId: number;
  before: number;
  after: number;
}
