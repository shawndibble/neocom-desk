import { esiFetch, type EsiResult } from '../client';
import type { EndpointOptions } from './options';

export function getWarIds(options: EndpointOptions = {}): Promise<EsiResult<number[]>> {
  return esiFetch<number[]>('/wars', { ...options, endpointId: 'getWarIds' });
}

export interface EsiWarParty {
  corporation_id?: number;
  alliance_id?: number;
  isk_destroyed: number;
  ships_killed: number;
}

export interface EsiWar {
  id: number;
  declared: string;
  started?: string;
  finished?: string;
  mutual: boolean;
  open_for_allies: boolean;
  aggressor: EsiWarParty;
  defender: EsiWarParty;
  allies?: { corporation_id?: number; alliance_id?: number }[];
}

export function getWar(warId: number, options: EndpointOptions = {}): Promise<EsiResult<EsiWar>> {
  return esiFetch<EsiWar>(`/wars/${warId}`, { ...options, endpointId: 'getWar' });
}
