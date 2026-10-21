import { esiFetch, type EsiResult } from '../client';
import type { EndpointOptions } from './options';

// --- GET /wars (public) ---

/** War ids, newest first, 2,000 to a page. There is no way to filter them. */
export function getWarIds(options: EndpointOptions = {}): Promise<EsiResult<number[]>> {
  return esiFetch<number[]>('/wars', { ...options, endpointId: 'getWarIds' });
}

// --- GET /wars/{war_id} (public) ---

/** One side of a war: a corporation or an alliance, with what it has destroyed. */
export interface EsiWarParty {
  corporation_id?: number;
  alliance_id?: number;
  isk_destroyed: number;
  ships_killed: number;
}

export interface EsiWar {
  id: number;
  /** ISO times. */
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
