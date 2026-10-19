import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/planets (esi-planets.manage_planets.v1) ---

/**
 * The eight planet types ESI reports. Named rather than inlined because
 * public/data/pi.json's P0 table is keyed by these same strings (see
 * `PiRawResource` in src/sde/types.ts) — one definition is what lets a
 * character's colony be matched against that table with no translation layer.
 */
export type PlanetType =
  'temperate' | 'barren' | 'oceanic' | 'ice' | 'gas' | 'lava' | 'storm' | 'plasma';

export interface CharacterPlanet {
  solar_system_id: number;
  planet_id: number;
  planet_type: PlanetType;
  owner_id: number;
  last_update: string;
  upgrade_level: number;
  num_pins: number;
}

export function getCharacterPlanets(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterPlanet[]>> {
  return characterGet<CharacterPlanet[]>('getCharacterPlanets', characterId, options);
}

// --- GET /characters/{character_id}/planets/{planet_id} (esi-planets.manage_planets.v1) ---

/**
 * Optionality is aggressive here (spec-verified): `pins[]` requires only
 * `pin_id, type_id, latitude, longitude`; `expiry_time`, `install_time`,
 * `last_cycle_start` and `schematic_id` are all optional, and
 * `extractor_details` itself requires only `heads`. Never assume a field is
 * present — `engine/pi/colonyPins.ts` excludes a pin from the colony-health
 * math rather than substituting a default.
 */
export interface PlanetPinExtractorDetails {
  heads: { head_id: number; latitude: number; longitude: number }[];
  cycle_time?: number;
  head_radius?: number;
  product_type_id?: number;
  qty_per_cycle?: number;
}

export interface PlanetPinFactoryDetails {
  schematic_id: number;
}

export interface PlanetPin {
  pin_id: number;
  type_id: number;
  latitude: number;
  longitude: number;
  schematic_id?: number;
  install_time?: string;
  /** Fixed at install; does not drift without the colony being opened in-client. Trustworthy. */
  expiry_time?: string;
  /** Only recalculated when the colony is opened in-client. Not trustworthy for "is this idle" math. */
  last_cycle_start?: string;
  /** Current stored amount — same in-client-only staleness as last_cycle_start. Not trustworthy. */
  contents?: { type_id: number; amount: number }[];
  extractor_details?: PlanetPinExtractorDetails;
  factory_details?: PlanetPinFactoryDetails;
}

export interface PlanetLink {
  source_pin_id: number;
  destination_pin_id: number;
  link_level: number;
}

export interface PlanetRoute {
  route_id: number;
  source_pin_id: number;
  destination_pin_id: number;
  content_type_id: number;
  quantity: number;
  waypoints?: number[];
}

export interface CharacterPlanetDetail {
  links: PlanetLink[];
  pins: PlanetPin[];
  routes: PlanetRoute[];
}

export function getCharacterPlanet(
  characterId: number,
  planetId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterPlanetDetail>> {
  return esiFetch<CharacterPlanetDetail>(`/characters/${characterId}/planets/${planetId}`, {
    ...options,
    characterId,
    endpointId: 'getCharacterPlanet',
  });
}

// --- GET /universe/planets/{planet_id} (public) ---

export interface UniversePlanet {
  planet_id: number;
  name: string;
  system_id: number;
  type_id: number;
  position: { x: number; y: number; z: number };
}

export function getUniversePlanet(
  planetId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniversePlanet>> {
  return esiFetch<UniversePlanet>(`/universe/planets/${planetId}`, {
    ...options,
    endpointId: 'getUniversePlanet',
  });
}

// --- GET /universe/schematics/{schematic_id} (public) ---

/** Spec-verified: no inputs/outputs/quantities, just the name and cycle time. */
export interface UniverseSchematic {
  schematic_name: string;
  cycle_time: number;
}

export function getUniverseSchematic(
  schematicId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseSchematic>> {
  return esiFetch<UniverseSchematic>(`/universe/schematics/${schematicId}`, {
    ...options,
    endpointId: 'getUniverseSchematic',
  });
}
