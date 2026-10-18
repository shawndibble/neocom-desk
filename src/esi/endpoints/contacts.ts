import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/contacts (esi-characters.read_contacts.v1) ---

export interface CharacterContact {
  contact_id: number;
  contact_type: 'character' | 'corporation' | 'alliance' | 'faction';
  standing: number;
  is_blocked?: boolean;
  is_watched?: boolean;
  label_ids?: number[];
}

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterContacts(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CharacterContact>> {
  return fetchAllPagesStatus<CharacterContact>(`/characters/${characterId}/contacts`, {
    ...options,
    characterId,
    endpointId: 'getCharacterContacts',
  });
}

// --- GET /characters/{character_id}/contacts/labels (esi-characters.read_contacts.v1) ---

export interface CharacterContactLabel {
  label_id: number;
  label_name: string;
}

export function getCharacterContactLabels(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterContactLabel[]>> {
  return esiFetch<CharacterContactLabel[]>(`/characters/${characterId}/contacts/labels`, {
    ...options,
    characterId,
    endpointId: 'getCharacterContactLabels',
  });
}

// --- GET /characters/{character_id}/standings/ (esi-characters.read_standings.v1) ---

export interface CharacterStanding {
  from_id: number;
  from_type: 'agent' | 'npc_corp' | 'faction';
  standing: number;
}

export function getCharacterStandings(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterStanding[]>> {
  return esiFetch<CharacterStanding[]>(`/characters/${characterId}/standings/`, {
    ...options,
    characterId,
    endpointId: 'getCharacterStandings',
  });
}

// --- GET /loyalty/stores/{corporation_id}/offers/ (public) ---

export interface LoyaltyStoreRequiredItem {
  quantity: number;
  type_id: number;
}

export interface LoyaltyStoreOffer {
  isk_cost: number;
  lp_cost: number;
  offer_id: number;
  quantity: number;
  required_items: LoyaltyStoreRequiredItem[];
  type_id: number;
}

export function getLoyaltyStoreOffers(
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<LoyaltyStoreOffer[]>> {
  return esiFetch<LoyaltyStoreOffer[]>(`/loyalty/stores/${corporationId}/offers/`, {
    ...options,
    endpointId: 'getLoyaltyStoreOffers',
  });
}
