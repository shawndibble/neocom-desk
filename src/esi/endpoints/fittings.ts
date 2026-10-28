import { characterGet, characterPages } from './characterRequest';
import type { PaginatedResult } from '../paginated';
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/fittings (esi-fittings.read_fittings.v1) ---

export interface CharacterFittingItem {
  flag: string;
  quantity: number;
  type_id: number;
}

/** One In-game Fitting (issue #1539) — GLOSSARY.md **In-game Fitting**. */
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

// --- POST /characters/{character_id}/fittings/ (esi-fittings.write_fittings.v1) ---

export interface NewCharacterFitting {
  name: string;
  description: string;
  ship_type_id: number;
  items: CharacterFittingItem[];
}

/** Saves a new In-game Fitting — Save to EVE (#1540) via `saveFittingToEve`. */
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

// --- DELETE /characters/{character_id}/fittings/{fitting_id}/ (esi-fittings.write_fittings.v1) ---

/**
 * Deletes an In-game Fitting. Save to EVE's overwrite path (#1540) calls this
 * only after the replacement `postCharacterFitting` has already succeeded —
 * ESI has no edit endpoint, so overwriting is a create-then-delete, in that
 * order, so a failed create never costs the pilot their original.
 */
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

// --- GET /killmails/{killmail_id}/{killmail_hash} (public) ---

export interface Killmail {
  killmail_id: number;
  /** When it died (ISO). */
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

// --- GET /characters/{character_id}/killmails/recent (esi-killmails.read_killmails.v1) ---

/** One kill or loss the Character was on: the id and hash `getKillmail` takes. */
export interface CharacterKillmailRef {
  killmail_id: number;
  killmail_hash: string;
}

/**
 * The Character's recent killmails, kills and losses alike, newest first. Paginated
 * (X-Pages, 50 a page). Opt-in `killmails` Permission: the SRP page asks for it at the point of need.
 */
export function getCharacterKillmailsRecent(
  characterId: number,
  options: EndpointOptions & { maxPages?: number } = {}
): Promise<PaginatedResult<CharacterKillmailRef>> {
  return characterPages<CharacterKillmailRef>('getCharacterKillmailsRecent', characterId, options);
}
