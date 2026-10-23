/**
 * Mercenary Dens and their tactical operations (issue #4791). Character routes
 * only: ESI has no corporation den list.
 */
import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/structures/mercenary-dens (esi-structures.read_character.v1) ---

/** The list names each den's planet only; its system needs a planet lookup. */
export function getCharacterMercenaryDens(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<{ mercenary_dens: { id: number; planet_id: number }[] }>> {
  return characterGet('getCharacterMercenaryDens', characterId, options);
}

/** `Unspecified` is the enum's catch-all, as on every Equinox route. */
export type MercenaryDenLevel =
  'Unspecified' | 'Level0' | 'Level1' | 'Level2' | 'Level3' | 'Level4';

export interface MercenaryDenEvolution {
  /** 0–100 within the level. */
  amount: number;
  level: MercenaryDenLevel;
}

export interface CharacterMercenaryDen {
  id: number;
  type_id: number;
  /** `Paused` covers a reinforced den; `Disabled`, a character who lost the skill. */
  state: 'Unspecified' | 'Running' | 'Paused' | 'Disabled';
  infomorphs: { amount: number };
  evolution: { development: MercenaryDenEvolution; anarchy: MercenaryDenEvolution };
  /** Present only while reinforced. */
  reinforcement_timer?: { end: string };
  /** The skyhook it sits on; `corporation_id` is the skyhook's owner, not the den's. */
  skyhook: { id: number; planet_id: number; corporation_id: number };
}

// --- GET /characters/{character_id}/structures/mercenary-dens/{mercenary_den_id} (esi-structures.read_character.v1) ---

export function getCharacterMercenaryDen(
  characterId: number,
  denId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterMercenaryDen>> {
  return esiFetch(`/characters/${characterId}/structures/mercenary-dens/${denId}`, {
    ...options,
    characterId,
    endpointId: 'getCharacterMercenaryDen',
  });
}

// --- GET /characters/{character_id}/mercenary-tactical-operations (esi-activities.read_character.v1) ---

export function getCharacterMercenaryOperations(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<{ operations: { id: string; mercenary_den_id: number }[] }>> {
  return characterGet('getCharacterMercenaryOperations', characterId, options);
}

export interface CharacterMercenaryOperation {
  id: string;
  mercenary_den_id: number;
  state: 'Unspecified' | 'Available' | 'Started' | 'Completed' | 'Expired' | 'Removed';
  dungeon_type_id: number;
  expires: string;
}

// --- GET /characters/{character_id}/mercenary-tactical-operations/{operation_id} (esi-activities.read_character.v1) ---

export function getCharacterMercenaryOperation(
  characterId: number,
  operationId: string,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterMercenaryOperation>> {
  return esiFetch(
    `/characters/${characterId}/mercenary-tactical-operations/${encodeURIComponent(operationId)}`,
    { ...options, characterId, endpointId: 'getCharacterMercenaryOperation' }
  );
}
