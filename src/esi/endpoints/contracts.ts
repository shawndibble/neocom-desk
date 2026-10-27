import { characterPages } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/contracts (esi-contracts.read_character_contracts.v1) ---

export interface Contract {
  contract_id: number;
  issuer_id: number;
  issuer_corporation_id: number;
  assignee_id: number;
  acceptor_id: number;
  type: 'unknown' | 'item_exchange' | 'auction' | 'courier' | 'loan';
  status:
    | 'outstanding'
    | 'in_progress'
    | 'finished_issuer'
    | 'finished_contractor'
    | 'finished'
    | 'cancelled'
    | 'rejected'
    | 'failed'
    | 'deleted'
    | 'reversed';
  for_corporation: boolean;
  availability: 'public' | 'personal' | 'corporation' | 'alliance';
  date_issued: string;
  date_expired: string;
  title?: string;
  price?: number;
  reward?: number;
  collateral?: number;
  buyout?: number;
  volume?: number;
  days_to_complete?: number;
  date_accepted?: string;
  date_completed?: string;
  start_location_id?: number;
  end_location_id?: number;
}

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterContracts(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<Contract>> {
  return characterPages<Contract>('getCharacterContracts', characterId, options);
}

// --- GET /corporations/{corporation_id}/contracts (esi-contracts.read_corporation_contracts.v1) ---

/**
 * Contracts issued by or assigned to the corporation. Paginated (X-Pages), cached 300s. No
 * in-game role is required (`x-required-roles` is absent); the items and bids sub-routes
 * share the scope and are fetched only when a row is opened.
 */
export function getCorporationContracts(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<Contract>> {
  return fetchAllPagesStatus<Contract>(`/corporations/${corporationId}/contracts`, {
    ...options,
    characterId,
    endpointId: 'getCorporationContracts',
  });
}

// --- GET /characters/{character_id}/contracts/{contract_id}/items (esi-contracts.read_character_contracts.v1) ---

export interface ContractItem {
  record_id: number;
  type_id: number;
  quantity: number;
  /** True when the issuer hands this over; false means the acceptor must supply it. */
  is_included: boolean;
  is_singleton: boolean;
  /** -1 is a singleton and, on a blueprint, an original; -2 is a blueprint copy. */
  raw_quantity?: number;
  /** Present on blueprint copies only. */
  runs?: number;
}

/** Not paginated — item_exchange/auction contracts only; courier/loan return an empty list. */
export function getCharacterContractItems(
  characterId: number,
  contractId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<ContractItem[]>> {
  return esiFetch<ContractItem[]>(`/characters/${characterId}/contracts/${contractId}/items`, {
    ...options,
    characterId,
    endpointId: 'getCharacterContractItems',
  });
}

// --- GET /corporations/{corporation_id}/contracts/{contract_id}/items (esi-contracts.read_corporation_contracts.v1) ---

/** One corp contract's item lines; read only when its row is opened. Same shape as the character route's. */
export function getCorporationContractItems(
  characterId: number,
  corporationId: number,
  contractId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<ContractItem[]>> {
  return esiFetch<ContractItem[]>(`/corporations/${corporationId}/contracts/${contractId}/items`, {
    ...options,
    characterId,
    endpointId: 'getCorporationContractItems',
  });
}

// --- GET /contracts/public/items/{contract_id} (public) ---

/**
 * One line on a *public* contract. Deliberately not `ContractItem`: the
 * public route carries the blueprint attributes a buyer shops on
 * (`is_blueprint_copy`, ME/TE, runs) and omits `is_singleton`, so sharing one
 * interface would mean fields that are mandatory on one route and absent on
 * the other.
 */
export interface PublicContractItem {
  record_id: number;
  type_id: number;
  quantity: number;
  /** False means the issuer *wants* this item rather than offering it. */
  is_included: boolean;
  is_blueprint_copy?: boolean;
  item_id?: number;
  material_efficiency?: number;
  time_efficiency?: number;
  /** Present on blueprint copies only. */
  runs?: number;
}

/**
 * Item lines on a public contract — readable with no scope at all, which is
 * what makes a detail view possible for contracts none of the user's
 * characters is party to. The character-scoped route above cannot serve
 * these: it only knows contracts that character is a party to.
 *
 * Paginated at 1,000 lines per page; only the first is read. A contract with
 * more lines than that is not something a buyer browses, and a partial list
 * beats refusing to open the modal.
 */
export function getPublicContractItems(
  contractId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<PublicContractItem[]>> {
  return esiFetch<PublicContractItem[]>(`/contracts/public/items/${contractId}`, {
    ...options,
    endpointId: 'getPublicContractItems',
  });
}
