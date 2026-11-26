import { characterGet, characterPages } from './characterRequest';
import type { PaginatedResult } from '../paginated';
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

export interface CharacterFittingItem {
  flag: string;
  quantity: number;
  type_id: number;
}

export interface CharacterFitting {
  fitting_id: number;
  name: string;
  description: string;
  ship_type_id: number;
  items: CharacterFittingItem[];
}

export function getCharacterFittings(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterFitting[]>> {
  return characterGet<CharacterFitting[]>('getCharacterFittings', characterId, options);
}

export interface NewCharacterFitting {
  name: string;
  description: string;
  ship_type_id: number;
  items: CharacterFittingItem[];
}

export function postCharacterFitting(
  characterId: number,
  fitting: NewCharacterFitting,
  options: { signal?: AbortSignal } = {}
): Promise<EsiResult<{ fitting_id: number }>> {
  return esiFetch<{ fitting_id: number }>(`/characters/${characterId}/fittings/`, {
    ...options,
    characterId,
    method: 'POST',
    body: fitting,
    endpointId: 'postCharacterFitting',
  });
}

export function deleteCharacterFitting(
  characterId: number,
  fittingId: number,
  options: { signal?: AbortSignal } = {}
): Promise<EsiResult<void>> {
  return esiFetch<void>(`/characters/${characterId}/fittings/${fittingId}/`, {
    ...options,
    characterId,
    method: 'DELETE',
    endpointId: 'deleteCharacterFitting',
  });
}

export interface Killmail {
  killmail_id: number;
  killmail_time?: string;
  solar_system_id?: number;
  victim: KillmailVictim & { character_id?: number; corporation_id?: number };
  attackers?: { final_blow?: boolean; ship_type_id?: number }[];
}

export function getKillmail(
  killmailId: number,
  killmailHash: string,
  options: EndpointOptions = {}
): Promise<EsiResult<Killmail>> {
  return esiFetch<Killmail>(`/killmails/${killmailId}/${killmailHash}`, {
    ...options,
    endpointId: 'getKillmail',
  });
}

export interface CharacterKillmailRef {
  killmail_id: number;
  killmail_hash: string;
}

export function getCharacterKillmailsRecent(
  characterId: number,
  options: EndpointOptions & { maxPages?: number } = {}
): Promise<PaginatedResult<CharacterKillmailRef>> {
  return characterPages<CharacterKillmailRef>('getCharacterKillmailsRecent', characterId, options);
}
