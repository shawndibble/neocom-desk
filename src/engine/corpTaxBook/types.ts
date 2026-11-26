import type { OreLine } from '../miningTax/types';

export type { OreLine };

export interface ObservedRow {
  structureId: number;
  characterId: number;
  recordedCorporationId: number;
  typeId: number;
  date: string;
  quantity: number;
  cachedAt: string;
  solarSystemId?: number;
  moonId?: number;
  extractionId?: string;
  sourceCorporationId?: number;
}

export interface ObservedMiningEntry {
  characterId: number;
  recordedCorporationId: number;
  structureId: number;
  date: string;
  solarSystemId?: number;
  moonId?: number;
  sourceCorporationId?: number;
  cachedAt?: string;
  oreLines: OreLine[];
}
