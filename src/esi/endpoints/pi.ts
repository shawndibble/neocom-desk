import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

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
  expiry_time?: string;
  last_cycle_start?: string;
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
