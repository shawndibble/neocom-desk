import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';

export type PlaceKind = 'solar_system' | 'station' | 'structure';

export interface PlaceRef {
  locationId: number;
  characterId?: number | null;
  kind?: PlaceKind;
}

export interface PlaceSource {
  stationName(stationId: number): Promise<string | null>;
  stationSystemId(stationId: number): Promise<number | null>;
  structureName(characterId: number, structureId: number): Promise<string | null>;
  structureSystemId(characterId: number, structureId: number): Promise<number | null>;
  systemName(systemId: number): Promise<string | null>;
  systemSecurity(systemId: number): Promise<number | null>;
}

export interface PlaceDetail {
  name: string | null | undefined;
  systemId: number | null | undefined;
  security: number | null | undefined;
  jumps: JumpsAwayResult | undefined;
}
