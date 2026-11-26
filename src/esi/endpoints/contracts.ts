import { characterPages } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

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

export function getCharacterContracts(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<Contract>> {
  return characterPages<Contract>('getCharacterContracts', characterId, options);
}

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

export interface ContractItem {
  record_id: number;
  type_id: number;
  quantity: number;
  is_included: boolean;
  is_singleton: boolean;
  raw_quantity?: number;
  runs?: number;
}

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

export interface PublicContractItem {
  record_id: number;
  type_id: number;
  quantity: number;
  is_included: boolean;
  is_blueprint_copy?: boolean;
  item_id?: number;
  material_efficiency?: number;
  time_efficiency?: number;
  runs?: number;
}

export function getPublicContractItems(
  contractId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<PublicContractItem[]>> {
  return esiFetch<PublicContractItem[]>(`/contracts/public/items/${contractId}`, {
    ...options,
    endpointId: 'getPublicContractItems',
  });
}
