import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';

/** What a location id is: a solar system, an NPC station, or an Upwell structure. */
export type PlaceKind = 'solar_system' | 'station' | 'structure';

/**
 * A location to resolve. `kind` is what the caller already knows (an asset's
 * `location_type`, a clone's); leave it off and the id's own block decides.
 * `characterId` is who asks: a structure's name and system are ACL-checked per
 * Character, so the same structure id can resolve for one and not another.
 * Left off, `usePlaceDetails` asks as its own scope Character, so a page's
 * refs never carry a Character that can go stale across a switch.
 */
export interface PlaceRef {
  locationId: number;
  characterId?: number | null;
  kind?: PlaceKind;
}

/**
 * The seam under every Place read: the production adapter is backed by the
 * stations / structures / systemSecurity loaders, a test hands in a map.
 * Each resolves to `null` for a place it cannot name, never throws on one.
 */
export interface PlaceSource {
  stationName(stationId: number): Promise<string | null>;
  stationSystemId(stationId: number): Promise<number | null>;
  structureName(characterId: number, structureId: number): Promise<string | null>;
  structureSystemId(characterId: number, structureId: number): Promise<number | null>;
  systemName(systemId: number): Promise<string | null>;
  systemSecurity(systemId: number): Promise<number | null>;
}

/**
 * One Place as the hook has resolved it so far. Every field is `undefined`
 * while its read is still pending, and `null` once it failed or has no answer
 * (an unplaceable structure, an unknown security) — the two never mix.
 */
export interface PlaceDetail {
  name: string | null | undefined;
  systemId: number | null | undefined;
  security: number | null | undefined;
  jumps: JumpsAwayResult | undefined;
}
