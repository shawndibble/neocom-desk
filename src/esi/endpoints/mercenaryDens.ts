import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

export function getCharacterMercenaryDens(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<{ mercenary_dens: { id: number; planet_id: number }[] }>> {
  return characterGet('getCharacterMercenaryDens', characterId, options);
}

export type MercenaryDenLevel =
  'Unspecified' | 'Level0' | 'Level1' | 'Level2' | 'Level3' | 'Level4';

export interface MercenaryDenEvolution {
  amount: number;
  level: MercenaryDenLevel;
}

export interface CharacterMercenaryDen {
  id: number;
  type_id: number;
  state: 'Unspecified' | 'Running' | 'Paused' | 'Disabled';
  infomorphs: { amount: number };
  evolution: { development: MercenaryDenEvolution; anarchy: MercenaryDenEvolution };
  reinforcement_timer?: { end: string };
  skyhook: { id: number; planet_id: number; corporation_id: number };
}

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
